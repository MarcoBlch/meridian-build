---
title: "I Swapped Fashn for Gemini and Discovered Vertex AI Can't Return Images"
description: "Replacing OutfitMaker's virtual try-on engine looked like a service-object swap. It turned into a same-day cascade of five fixes, including discovering the Gemini API I was already using can't return images."
pubDate: 2026-06-09
tags: [rails, ai, bugs]
project: outfitmaker
---

The virtual try-on in [OutfitMaker](https://outfitmaker.ai) used to run on Fashn.ai. You'd upload a reference photo of yourself, the app would composite your clothing items onto it — top first, then bottom — and you'd get a try-on image back. It worked. It also covered tops and bottoms only. No shoes, no accessories, no styling.

When I decided to widen what the try-on could show, the answer was a different model entirely: Gemini 2.5 Flash for image generation, dressing a pre-rendered stock model in the full look. Editorial vibe instead of pixel-perfect garment transfer.

I assumed I was swapping one service object for another. That part was true. What I didn't see coming was that the swap forced me off Vertex AI — the Google API the rest of the app already uses for Gemini — onto an entirely different Google API with a different auth model.

## What Fashn was doing

The Fashn pipeline was a sequential chain. `FashnTryOnService` would submit a request to `api.fashn.ai/v1/run`, poll `/status/:id` until the prediction completed, get a URL back, then submit *that* URL as the model image for the next garment. Top first. Bottom over the result. Up to two calls per outfit.

```ruby
service = FashnTryOnService.new
current_image_url = config.reference_photo_url
total_cost = 0.0
cost_per_call = 0.075
# Apply top first ... then apply bottom over the result (sequential calls)
```

Cost in our own accounting — not a billed metric — was about $0.075 per call, so ~$0.15 for a top+bottom outfit. The model image was whatever the user had uploaded as their reference photo, managed by a per-user `VirtualModelConfig`. Tops and bottoms only because that's the Fashn `category` enum.

## The simple version of the swap

`GenerateVirtualTryOnJob` kept its name (legacy — it still kicks off from `OutfitSuggestion`), kept the queue, kept the `try_on_status` state machine, kept the Turbo Stream broadcasts. The only things that changed were the service object it called and what came back from it:

```ruby
# before
service = FashnTryOnService.new
current_image_url = config.reference_photo_url
# ...sequential top → bottom calls...

# after
service = LookPreviewService.new
result = service.generate(
  stock_model: stock_model,
  wardrobe_items: wardrobe_items,
  outfit_context: suggestion.context,
  user_profile: user.user_profile
)
image_url = upload_generated_image(result, suggestion, outfit_index)
```

`StockModel.resolve_for(user)` replaces the per-user reference photo with one of six pre-rendered models. Single multimodal Gemini call instead of a chained pair. That's what I shipped. That's what didn't work.

## Then Vertex AI returned "Multi-modal output is not supported"

The rest of [the wardrobe app I'm building](https://outfitmaker.ai) talks to Gemini via Vertex AI. Service account credentials, `{location}-aiplatform.googleapis.com`, the SDK pattern that handles every other AI call in the app — including the suggestion pipeline I wrote about in [the multimodal-AI post](/blog/multimodal-ai-for-outfit-suggestions/) and the [TOCTOU rate-limiter post](/blog/toctou-in-my-gemini-rate-limiter/).

I built `LookPreviewService` the same way. Sent a multimodal request with `responseModalities: ["IMAGE", "TEXT"]`. Vertex AI replied:

> Multi-modal output is not supported.

Vertex AI does Gemini, but it doesn't do Gemini *image generation*. That's a separate Google API: the Generative Language API, at `generativelanguage.googleapis.com`. Different host. Different auth — API key, not service account. Different SDK ergonomics. In my repo, the fix landed as four separate commits on the same day as the migration:

```
599d034  pivot VTO to editorial Look Preview with stock models
eccc75a  use Vertex AI v1beta1 endpoint for Gemini image generation
2e5e1a6  switch Look Preview to Generative Language API + drop MiniMagick
89b2190  switch Look Preview to Gemini API key auth
085b4cd  use gemini-2.5-flash-image model (2.0-flash-exp was removed)
```

`eccc75a` was the wrong fix — I tried bumping Vertex to `v1beta1`. Still no images. `2e5e1a6` was the right one: leave Vertex behind, go to a different Google product. `89b2190` was the consequence — API key auth via `ENV["GEMINI_API_KEY"]`, separate from the Vertex service-account credentials. `085b4cd` was a separate surprise: the model name I'd lifted from the docs (`gemini-2.0-flash-exp`) had been removed; the current image-capable model was `gemini-2.5-flash-image`. And while I was at it, MiniMagick wasn't in the production Docker image, so the resize-before-base64 step had to come out.

Five fixes on the same day. None of them were design choices. They were all "the happy path doesn't exist; this is the path that does."

## Then Gemini drifted on identity

The day after the swap landed, I shipped one more fix:

```
a2fdcd4  fix: reinforce skin tone/ethnicity in Look Preview prompt
```

Gemini sometimes ignored the reference photo's skin tone and generated someone with a different one. The fix wasn't subtle: alongside the model image, the parts array now includes a separate, emphatic text part asserting the skin tone and gender from the `StockModel` attributes.

```ruby
parts << { text: system_prompt }
parts << { inline_data: { mime_type: model_mime, data: stock_model_b64 } }
parts << { text: "The model has #{stock_model.skin_tone} skin and is #{stock_model.gender}. MUST match." }
parts << { text: "OUTFIT ITEMS — the clothes this person should be wearing:" }
# ...item images + labels...
```

The image alone — even as `inline_data` right there in the call — wasn't enough. Gemini needed the text restatement to lock in.

## What survived

The Fashn-era plumbing all carried over: `GenerateVirtualTryOnJob` (legacy name, unchanged contract), the `try_on_status` state machine on `OutfitSuggestion`, the per-tier quotas (Premium 5/mo, Pro 30/mo, Free 1-lifetime), `WatermarkService`, and the per-item base64 cache (`Rails.cache` key `look_preview_b64:#{item.id}:#{blob.checksum}`, 24h TTL). `FashnTryOnService` itself is still in the repo — deprecated, no callsites, kept around as a fallback that doesn't get wired.

The migration replaced one service object with another. The app around it didn't move.

## The numbers I can't give you

My own accounting puts the Gemini call at $0.03 and the old Fashn outfit at $0.15. Latency claims are ~19s for Fashn quality mode and 10-20s for Gemini. None of these are benchmarks — they're constants in the code and claims in commit messages. I don't have measured before/after data and I'm not going to dress up estimates as numbers I don't have.

## Takeaway

When Google says "Gemini" they don't mean one API. Vertex AI does text and code. The Generative Language API does images. Different host, different auth, different model availability — switching from one to the other is switching products, not endpoints.

That was the part I didn't see coming. The service-object swap was the easy half. The API-surface swap underneath it was the actual work — and if you're building on Gemini and might one day want image output, the cheapest thing you can do today is sketch out what your second Google auth path looks like before you need it. [OutfitMaker.ai](https://outfitmaker.ai) shipped that path the hard way.

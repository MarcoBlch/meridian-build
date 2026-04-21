---
title: "Multimodal AI for Outfit Suggestions"
description: "How sending actual photos to Gemini instead of text descriptions transformed OutfitMaker's suggestions from generic to genuinely useful."
pubDate: 2026-04-09
tags: [ai, gemini, multimodal, rails]
project: outfitmaker
---

For the first two months of OutfitMaker, the AI only read text. Each clothing item had attributes (color, category, season, occasion) and I'd send those to Gemini as a structured prompt. "The user has a navy blazer, white Oxford shirt, khaki chinos, and brown leather shoes. Suggest an outfit for a casual Friday at the office."

The suggestions were correct but lifeless. Like asking someone who's only read the Wikipedia page for "fashion" to dress you. Technically accurate. Completely lacking in taste.

## The problem with text-only

Text descriptions lose everything that makes clothes interesting. "Navy blazer" could be a slim-fit Italian wool blazer with mother-of-pearl buttons or a boxy polyester thing from a department store clearance rack. "White shirt" could be crisp poplin or soft linen. The texture, drape, weight, pattern detail, none of that survives translation to text labels.

My users noticed. The feedback was consistent: "The suggestions are fine but kind of obvious." Of course a navy blazer goes with khaki chinos. You don't need AI for that. You need AI for the subtle stuff: whether that specific shade of navy works with that specific shade of khaki, whether the textures complement each other, whether the overall look reads as "intentional" or "accidental."

## Going multimodal

Gemini's multimodal capabilities let you send images alongside text. Instead of describing clothes in words, I could send the actual photos users had uploaded. The AI could *see* what it was working with.

The API call changed from:

```ruby
response = client.generate_content(
  "Suggest an outfit from these items: #{items_as_text}"
)
```

To:

```ruby
parts = items.map do |item|
  { inline_data: { mime_type: "image/jpeg", data: item.encoded_image } }
end

parts << { text: prompt_text }

response = client.generate_content(parts)
```

The difference in output quality was immediate and dramatic. Instead of "Pair the navy blazer with the white shirt," I got responses like: "The linen texture of your cream shirt complements the structured wool of the navy blazer. The warm undertone in the shirt picks up the caramel notes in your leather belt. Skip the khaki chinos today; your dark wash jeans have a similar formality level but create better contrast with the light shirt."

The AI was actually analyzing fabric, color relationships, and visual harmony. Not just matching labels.

## The cost problem

Sending images to Gemini costs significantly more than sending text. Each clothing item photo is roughly 200-500KB as base64. A typical wardrobe has 30-80 items. Sending all of them for every suggestion would be prohibitively expensive and slow.

My first approach was naive: encode all the user's clothing images fresh for every request. Average response time: 12 seconds. Average cost per suggestion: about $0.03. At scale (if I ever got there), this would bankrupt the project.

## Redis caching for encoded images

The solution was caching the base64-encoded images in Redis. When a user uploads a photo, the background processing pipeline now includes an encoding step:

```ruby
class ProcessClothingImageJob < ApplicationJob
  def perform(clothing_item)
    # Existing: remove background, resize, store
    processed_url = ImageProcessor.process(clothing_item.image)
    clothing_item.update!(processed_image_url: processed_url)

    # New: encode and cache for AI
    encoded = Base64.strict_encode64(
      clothing_item.processed_image.download
    )
    Rails.cache.write(
      "clothing_image_encoded:#{clothing_item.id}",
      encoded,
      expires_in: 7.days
    )
  end
end
```

Now when generating suggestions, I pull pre-encoded images from Redis instead of downloading and encoding on the fly. Cache hit rate: 94%. Average response time dropped from 12 seconds to 4 seconds. Cost per suggestion dropped 60% because I could also be smarter about which images to send.

## Selective image sending

I don't need to send all 60 items in someone's wardrobe for every suggestion. The prompt engineering evolved:

1. **Pre-filter by metadata**: Use text-based filtering first (season, occasion, weather compatibility) to narrow from 60 items to 15-20 candidates.
2. **Send images only for candidates**: The AI sees 15-20 actual photos, not 60.
3. **Include context photos**: Send the weather icon, a photo of the user's office/destination if available.

```ruby
class SuggestionGenerator
  def build_prompt_parts(user, candidates)
    parts = []

    # Weather context
    parts << { text: "Current weather: #{weather_description(user)}" }

    # Occasion context
    parts << { text: "Occasion: #{user.today_occasion || 'casual'}" }

    # Candidate images with labels
    candidates.each do |item|
      encoded = Rails.cache.read("clothing_image_encoded:#{item.id}")
      next unless encoded

      parts << {
        inline_data: { mime_type: "image/jpeg", data: encoded }
      }
      parts << { text: "[#{item.category}: #{item.name}]" }
    end

    # Final instruction
    parts << { text: SUGGESTION_PROMPT }
    parts
  end
end
```

## The prompt engineering

The prompt itself went through twelve iterations. The first version produced responses that were too long, too generic, or formatted inconsistently. The version that works:

```
You are a personal stylist reviewing a client's actual clothing.
You can SEE the items, so analyze fabric, texture, color, and fit.

Create ONE outfit from the items shown. Consider:
- Color harmony (complementary or analogous)
- Texture balance (mix structured and relaxed pieces)
- Weather appropriateness
- Occasion formality level

Format:
- One sentence explaining the overall look
- List each item and why it works in this combination
- One styling tip (tucking, rolling sleeves, accessory suggestion)

Be specific about what you SEE. Reference actual colors, textures,
and details visible in the photos. Never give generic advice.
```

The key instruction is "Be specific about what you SEE." Without it, the model falls back to generic fashion advice. With it, it references the actual leather grain on a belt, the subtle pattern in a shirt fabric, or the specific shade difference between two "navy" items.

## Edge cases and failures

Multimodal isn't magic. Some failure modes I've encountered:

**Similar items**: When a user has five white t-shirts, the AI sometimes confuses them. I mitigate this by including the item name as a text label after each image.

**Poor lighting in photos**: User photos taken in dim lighting produce worse suggestions. The AI can't assess color accurately if the photo is too dark or yellow-tinted. I added a photo quality check during upload that suggests retaking in better lighting.

**Cultural context**: Fashion is cultural. The AI occasionally suggests combinations that work in one context but not another. Adding user location and self-described style (which I capture during onboarding) to the prompt helped significantly.

**Hallucination about items**: Rarely, the AI describes features that aren't in the photo ("the gold buttons on your blazer" when the buttons are black). I haven't fully solved this beyond the "be specific about what you SEE" instruction, which reduced but didn't eliminate the issue.

## The numbers

Before multimodal:
- Suggestion acceptance rate: 23% (user marks outfit as "liked")
- Average session time: 1.2 minutes
- User feedback: "obvious" and "generic"

After multimodal:
- Suggestion acceptance rate: 41%
- Average session time: 3.1 minutes
- User feedback: "surprisingly good" and "it actually gets my style"

The acceptance rate nearly doubled. Users spent more time because the suggestions were worth reading in full. The qualitative feedback shifted from "technically fine" to "genuinely helpful."

## Cost of running this

With Redis caching and selective image sending:
- Average cost per suggestion: $0.012
- Average response time: 4.2 seconds
- Monthly AI spend for current user base: ~$18

At 47 users generating roughly 1 suggestion per day, the economics work. At 10,000 users, I'd need to optimize further, perhaps generating lower-resolution thumbnails specifically for AI consumption, or implementing a tiered system where free users get text-only suggestions and premium users get multimodal ones.

For now, the multimodal approach is the single biggest quality improvement I've shipped. It took OutfitMaker from a novelty ("look, AI picks your clothes") to something genuinely useful: an AI that actually understands what's in your closet.

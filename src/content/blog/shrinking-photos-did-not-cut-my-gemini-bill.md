---
title: "Shrinking My Photos Did Not Cut My Gemini Bill"
description: "Image input was the biggest line on my Google bill, so my first instinct was to resize uploads before sending them to Gemini. It would have saved nothing. One generationConfig field, mediaResolution, cut the prompt tokens by 40%."
pubDate: 2026-11-20
tags: [ai, rails, architecture]
project: outfitmaker
---

Every time someone adds a piece of clothing to their wardrobe in [OutfitMaker](https://outfitmaker.ai), a background job sends the photo to Gemini on Vertex AI. The model returns a small JSON object: category, colour, a description, a few tags, translated labels, and which way the garment is rotated in the photo. That is the whole job. It runs on every upload, so it runs a lot.

On November 20 I read the Google Cloud bill line by line. The top line was image input for that analysis call, about 15 euros over 30 days. Not a disaster, but it was the biggest one, and it grows with every new user who photographs their closet.

## The obvious fix, which does nothing

Phones take large photos. My first idea was the one everybody has: resize the image to something modest before encoding it, send fewer bytes, pay less.

Before writing that code I checked how Gemini counts image tokens. It does not bill by bytes or by pixels in the way I assumed. An image becomes a fixed number of tokens determined by the resolution setting of the request, and the model scales whatever you send to fit that budget. A huge photo and a small photo of the same shirt land on the same token count.

So resizing on my side would have cost CPU on the worker, added a dependency on image processing in a code path that already had [its own share of trouble with missing binaries](https://meridianbuild.dev/blog/my-ai-was-blind-in-production/), and changed nothing on the invoice. Smaller uploads are still nice for storage and bandwidth. They are just not a Gemini cost lever.

## The field that does change the count

The lever is `mediaResolution` in `generationConfig`. It tells the model how much detail to keep from each image, and the token count follows. The values are `MEDIA_RESOLUTION_LOW`, `MEDIA_RESOLUTION_MEDIUM` and `MEDIA_RESOLUTION_HIGH`, and if you do not set it, you get the default.

Lowering detail on an image classifier sounds risky, so I did not pick a value from the docs. I ran the real call in production on 12 garment photos at each setting: default, MEDIUM, LOW. For each photo I compared category, colour and rotation, and read `promptTokenCount` from the response metadata.

| Setting | Prompt tokens | Result vs default |
|---|---|---|
| Default | 1447 | reference |
| MEDIUM | 874 | same category, colour and rotation on all 12 |
| LOW | 611 | one colour wrong |

The prompt token count includes the text of my prompt, which does not change between runs. So the drop on the image part alone is larger than the 40% you see in the table.

LOW was tempting. It is cheaper again, and on 11 of the 12 photos it was right. But colour is the field users notice first. If the app calls a navy sweater black, every outfit built on it inherits the mistake, and the user's trust in the whole wardrobe drops with it. One error in twelve is too many for the field people check with their own eyes. MEDIUM gave identical answers, so MEDIUM it is.

## The change

It is three lines in the service plus a constant, shipped as PR #291 (commit 356dbbc in a private repo):

```ruby
MEDIA_RESOLUTION = "MEDIA_RESOLUTION_MEDIUM"

generationConfig: {
  maxOutputTokens: 2048,
  responseMimeType: "application/json",
  mediaResolution: MEDIA_RESOLUTION
}
```

I left the test results in a comment above the field, with the numbers. The next person tempted to switch to LOW to save a bit more, which will probably be me, should see why I did not.

And one line in an existing test that builds the request body:

```ruby
assert_equal "MEDIA_RESOLUTION_MEDIUM",
  body.dig("generationConfig", "mediaResolution")
```

That assertion looks trivial. It is there because this kind of setting disappears silently. Someone refactors the request builder, the field is dropped, every test still passes because the model answers fine at default resolution, and the bill goes back up without a single error. A test that pins a cost setting is the only alarm you get for that kind of regression.

## What it is worth

My estimate is a saving of around 6 euros a month at the current volume. That is small in absolute terms. It is also free, permanent, and it scales with uploads, which is the one usage pattern I hope keeps growing.

The more useful outcome for me is the habit. Before optimising an AI call, I now check how the provider actually counts the units I pay for. My intuition said bytes. The answer was a setting I had never read, sitting one level below `maxOutputTokens` in the same config hash.

If you send images to Gemini, look at your `generationConfig`. If `mediaResolution` is not there, you are paying for the default on every call. Run your own handful of real inputs at MEDIUM and LOW, compare the fields your users actually look at, and pick the lowest setting that gives the same answers.

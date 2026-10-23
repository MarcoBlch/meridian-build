---
title: "A QA Checklist for a Recurring AI Character"
description: "OutfitMaker's TikTok and Instagram series has a recurring stylist, Dot, generated with an image model. Three rules decide whether an image ships, and the batch I made today failed them six times out of nine."
pubDate: 2026-10-23
tags: [ai, testing, indie-hacker]
project: outfitmaker
---

[OutfitMaker](https://outfitmaker.ai) has a recurring character on TikTok and Instagram. Her name is Dot. She is a stylist with short cropped grey hair, gold hoops, a black fine knit turtleneck and a small terracotta brooch, and she works in a London townhouse atelier with a brass clothing rail and a velvet armchair. Every episode, a client comes in with a closet problem and leaves with three outfits.

Dot does not exist. Every image is generated with Gemini's image model, from reference pictures and a prompt. That makes her cheap to produce and very easy to break.

This post is the checklist I run before anything with Dot in it goes out, and what today's batch of nine images taught me about where image models drift.

## How an image is made

Each shot is one request with three reference photos and a prompt:

```ruby
dot  = { text: "PHOTO A: 'Dot', our recurring stylist (character sheet). Keep her EXACT face, short cropped grey hair, gold hoop earrings, small round terracotta enamel brooch." }
room = { text: "PHOTO B: the atelier. Keep the EXACT room: Georgian London townhouse, tall sash windows, ..." }
refs = [dot, enc.("dot_sheet.png"), room, enc.("place_1.png")]
refs += [{ text: "PHOTO C: the client. Keep her EXACT face, hair, skin tone and body." }, enc.(client_photo)]
```

Photo A is a character sheet of Dot from several angles. Photo B is the room. Photo C is the client, and the client is one of the stock models the app already uses for its own try-on previews, so the series and the product show the same people.

The script runs inside the production container, because that is where the API key and the stock model photos already live, and it writes PNGs to `/tmp`. Nothing touches the database. A slideshow is five slides: a hook, three looks, and an end slide with Dot alone.

## The three rules

All three came from episodes that went wrong before this checklist existed.

**1. The client must not look like Dot.** In one early episode the client was a light skinned woman in her fifties. The model blended her with Dot: same face shape, and her hair got shorter and greyer from one look to the next. Two women who looked like sisters, in a series where one is supposed to be the expert and the other the customer. My reaction when I saw it was one word in French: bizarre.

**2. The client keeps the same face and hair across all looks.** In another episode the second look had a different woman in it. Same outfit brief, different person. Image models do not have a notion of "the same client as in the previous request". Every request is a fresh roll, and only the reference photo holds her identity.

**3. Dot never wears a coat.** Her silhouette is the turtleneck. Once she has a camel coat on, she reads as a different character in a thumbnail, and thumbnails are all TikTok gives you.

These go in the prompt as hard constraints:

```ruby
two = "TWO DIFFERENT WOMEN: the client is the woman from PHOTO C (keep her exact face, skin tone, body and EXACTLY the same hairstyle as in PHOTO C; she looks nothing like Dot); Dot is the short-grey-haired stylist from PHOTO A. "
dotlook = " Dot stands slightly behind on the left wearing ONLY a black fine-knit turtleneck and black slim trousers, NO coat, NO jacket, no outerwear at all, arms relaxed or adjusting a detail of the outfit, closed lips."
```

Putting rules in a prompt is necessary. It is not sufficient. The model follows them most of the time, and "most of the time" across nine images means something will fail.

## Today's batch: nine images, six rejected

I generated two slideshows: "outfits for people with a full closet and nothing to wear" and "the white shirt you never wear, 3 ways". Eight shots with a client, plus the shared end slide. The first pass came back clean on the technical side: nine images, no API errors, no retries.

Then the contact sheet. I tile every image of a batch into one picture with ffmpeg so I can review them side by side, because drift is invisible one image at a time:

```bash
ffmpeg -i s1_0.png -i s1_1.png ... -filter_complex \
  "[0]scale=360:640[v0];[1]scale=360:640[v1];...;\
   [v0][v1]...xstack=inputs=9:layout=0_0|360_0|720_0|..." contact.jpg
```

Here is what failed.

**Dot wore a coat in three images.** Two were the opening "before" shots of each slideshow. Looking at the script, that was my bug, not the model's: the no coat sentence was appended to the three look shots and not to the opening shot, where Dot only appears as a side character. The model gave her a camel coat because nothing said otherwise. The third was the end slide, where my own prompt asked for "her long camel coat over her shoulders". I had written that before the rule existed and never reread it.

**The client of the first slideshow was too close to Dot.** The stock model I had picked has a grey bob. Next to Dot's grey crop, the two women had the same palette from head to shoulders. No blending this time, faces were distinct, but in a 360 pixel thumbnail it failed rule 1 anyway. I swapped her for a different stock model with dark skin and short natural hair. That meant regenerating all four shots of that slideshow, because rule 2 says the client cannot change halfway.

**The end slide had a flat beige band across the top quarter.** This one surprised me. Every prompt ends with a style block that includes "leave calm empty wall space in the top third of the picture", because the hook text goes there. On the shots with two people, the model reads that as composition advice and pulls the camera back. On the end slide, with Dot alone, it painted a literal empty rectangle above the room, like a letterbox. It did it twice in a row.

**Dot smiled with her teeth.** The prompt said "warm closed-lip smile". She smiled with her teeth anyway, on the end slide, both times.

## Fixing the prompt, not the picture

I could have cropped the band out or picked the least bad image. I would rather fix the prompt, because the same prompt will run for the next eight slideshows.

The opening shots got the same constraint as the look shots:

```ruby
dotsolo = " Dot wears ONLY a black fine-knit turtleneck and black slim trousers, NO coat, NO jacket, no outerwear at all, closed lips."
```

The end slide got its own variant of the style block. The "empty space" instruction is replaced by one that describes the room going up to the ceiling, and the smile is described physically instead of with an adjective:

```ruby
if name == "end"
  prompt = prompt.sub("leave calm empty wall space in the top third of the picture",
                      "the room continues naturally up to the ceiling cornice") +
           " Her mouth is fully closed: a soft gentle smile with lips pressed together, absolutely no teeth visible."
end
```

"Closed-lip smile" failed twice. "Lips pressed together, no teeth visible" worked on the first try. Describing what the camera should see beats naming the expression.

I also added one line that is not about the picture at all: the script now prints the list of available stock models before generating, so picking a client is a deliberate choice from the real list and not a key I remember.

## Regenerate only what failed

The script takes an `ONLY` variable, so a rerun touches just the rejected shots and leaves the approved ones alone:

```ruby
only = ENV["ONLY"].to_s.split(",")
shots.each do |name, (client, desc)|
  next if only.any? && !only.include?(name)
  # ...
end
```

Before every rerun I copy the current images to a versioned folder. Image models do not always improve on a second try, and I want to be able to go back.

The final count for two slideshows: 9 images in the first pass, 6 regenerated, 1 regenerated again. Sixteen generations for nine images that ship. That ratio is the real cost of a recurring character, and it is still far cheaper than a photo shoot.

## Text goes on after review

The hook text, the look labels and the end slide are added afterwards with Remotion stills, not by the image model. Image models are getting better at text, but a typo baked into an image means regenerating the image. In Remotion it is a string.

The same component renders both formats: 9:16 for TikTok, and 4:5 for Instagram, where the 9:16 image is fitted by height on a sand background so no head or shoe is ever cropped. Overlays sit in the wall space above the people, which is exactly what that "empty top third" instruction was for when it works.

## The checklist

Before anything with Dot goes out:

1. Build the contact sheet. Never review generated images one at a time.
2. Client vs Dot: different face, different hair, different palette, judged at thumbnail size.
3. Same client, same hair, in every look of a slideshow.
4. Dot: turtleneck, no coat, no jacket, lips closed.
5. Look for composition artifacts: blank bands, extra people, duplicated limbs, text the model invented.
6. Reject, fix the prompt, rerun only the failures, review again.

None of this is clever. It is the same thing as reviewing a pull request: the model writes, a person reads, and the rules that matter are written down so they survive the next batch. If you want the other side of how OutfitMaker uses Gemini, [my AI was blind in production](/blog/my-ai-was-blind-in-production/) is what happens when nobody looks at the images at all.

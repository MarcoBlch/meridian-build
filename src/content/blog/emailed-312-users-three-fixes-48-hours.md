---
title: "I Emailed 312 Users Who Ignored My App. Their Replies Shipped Three Fixes in 48 Hours."
description: "Dashboards told me retention was bad. Three user replies told me why: a deterministic filter, a cutout model eating clothes, and a quiz field nobody ever saved."
pubDate: 2026-09-11
tags: [growth, indie-hacker, rails, ai]
project: outfitmaker
---

Last Wednesday I stared at the worst number my app has ever produced.

3,188 registered users. 59 of them actually come back week after week. That's not a retention problem, that's a rounding error. My cofounder-less brain went where every founder brain goes at that moment: *maybe the product just isn't good enough. Maybe I should stop paying for servers.*

Instead of deciding anything at 11pm, I did the only thing dashboards can't do: I asked the users.

## The setup: 312 emails, 4 languages, zero automation vibes

I segmented two groups straight from the database:

- **53 loyal users**: signed up more than a week ago, still active. Question: *"what makes you come back?"*
- **259 activated-then-gone**: uploaded 10+ wardrobe items (real effort!), then vanished. Question: *"what was missing, or what got in the way?"*

Each email went out in the user's own language (the app runs in five), plain text, signed by me, from a real reply-able address. One question per email. No survey link, no NPS scale, no "we value your feedback" corporate perfume.

Replies started landing within the hour.

## Reply #1: "the outfits always have the same base"

A power user (42 wardrobe items, 20 AI suggestions generated, still on the free plan) wrote back: *"the outfits are very simple and always have the same base, i think they should have more accessories or diversity."*

My first instinct was to blame the LLM. My second instinct was better: read the code that decides *what the LLM even sees*.

Before every suggestion, a filter picks which wardrobe items go into the prompt. It sorted by wear score and took the top N. Deterministic. Same user, same closet, same top N. **The model was being dealt the exact same deck every single time.** Twenty suggestions, twenty times the same twelve garments. The "AI is repetitive" complaint was my `sort_by` call.

Bonus find: for casual contexts, the filter passed exactly **one accessory** to the model, while the prompt cheerfully instructed it to "include 1-2 accessories when available." A choice of one.

The fix (PR #157, `fix/suggestion-diversity`): keep the proven favorites, rotate the long tail, and seed by user + day so retries within a day stay consistent while every morning deals fresh cards.

```ruby
def select_with_rotation(sorted_items, limit, rng)
  return sorted_items.first(limit) if sorted_items.size <= limit

  proven_count = [(limit * 2) / 3, 1].max
  proven = sorted_items.first(proven_count)
  rotating = (sorted_items - proven).sample(limit - proven_count, random: rng)
  proven + rotating
end

# seeded per user + day
rng = Random.new(user.id * 1009 + Date.current.jd)
```

Accessory limits for casual contexts went from 1 to 3, and the prompt gained an explicit rule to vary the base garment across the three outfits. Shipped the same evening. I replied to the user: *"your feedback literally shipped code today."*

## Reply #2: "parts of the pieces just disappeared"

A Swedish user who had uploaded 28 items and then left told me the cutout photos of her clothes "looked quite weird and parts of the pieces just disappeared. I think it would be better to just take the pictures and not cut it out."

The app runs every wardrobe photo through background removal (rembg / U2Net). It's great on jackets and jeans. It *eats* thin straps, lace, and low-contrast fabrics. And here's the design flaw: a mutilated cutout was still attached and displayed proudly, because no code ever asked "did the cutout actually keep the garment?"

She handed me the fix in her own words: when the cutout is bad, the original photo wins. Every view already had a fallback to the original when no cutout exists, so the entire fix (PR #158, `fix/cutout-quality-gate`) is refusing to attach bad cutouts:

```ruby
MIN_ALPHA_COVERAGE = 0.08

def cutout_quality_ok?(path)
  out, _err, st = Open3.capture3(
    "convert", path, "-alpha", "extract", "-format", "%[fx:mean]", "info:"
  )
  return true unless st.success? # measurement failure must not reject work

  out.to_f >= MIN_ALPHA_COVERAGE
end
```

If the mean alpha collapses below 8% of the frame, the garment vanished, so the cutout is discarded and the original shows. I also shipped a rake task that ran a retroactive pass over her closet: one of her 28 cutouts was a ghost (alpha coverage 0.061). It now displays the original photo. I told her that in my reply. Try getting that feeling from a dashboard.

## Reply #3: "the style really wasn't mine"

Same user, different wound, and this one turned out to be the deepest.

The app has an 11-step style quiz. Or had. At some point the onboarding was rewritten down to 4 steps for activation speed (correctly, since a shorter first run is a real win), and two fields quietly fell off the wagon. When I checked the database: **body type had been collected for 0 out of 2,870 completed profiles.** Zero. Fit preference: 4%.

So the AI prompt "personalizing" outfits knew a style word and an age range. No body type, no fit. Of course the suggestions felt generic: *they mathematically were.* "Not my style" wasn't an opinion, it was a bug report. This is the same species of failure I wrote about in [My AI Was Blind in Production](/blog/my-ai-was-blind-in-production/): the code ran clean, nothing crashed, and the model was quietly starved of the one thing it needed.

The fix (PR #159, `feat/progressive-fit-profiling`) respects the thing that killed the field in the first place: activation friction is real, so no new onboarding step. Instead, a two-tap card appears on the suggestion generator, the one place where answering has an obvious immediate payoff: *"2 taps for outfits that actually fit you."* Body type, fit preference, save, gone forever. And the prompt finally carries both.

## What 48 hours of listening actually bought

Three structural fixes, all in production before the weekend:

1. **Deck rotation + accessories**: suggestions vary and dress you fully
2. **Cutout quality gate**: a bad crop never beats the original photo again
3. **Progressive profiling**: the AI finally knows your body and your fit

None of these were on my roadmap on Tuesday. All of them were invisible in my analytics: the dashboards showed *that* users left, never *why*. Three replies from real humans found three root causes that weeks of metric-staring had missed.

## The takeaways I'm keeping

**Ask at the moment of maximum context, answer at the speed of trust.** A churned user who gets a personal reply, with the fix already live, doesn't stay churned in her head. She wrote back that "the sky is the limit." Maybe. But the floor is definitely made of user replies. I felt this same thing back when I [got my first paying customer](/blog/from-zero-to-first-paying-customer/): the leverage was never in the dashboard, it was in the conversation.

**Your LLM is downstream of your queries.** Before blaming the model, read the code that builds its context. My "boring AI" was a deterministic `sort`.

**Silent field death is real.** Every onboarding rewrite should end with a query: which fields stopped being written? `GROUP BY` would have caught my 0/2,870 in ten seconds, any time in the last month. Nobody ran it, because nothing looked broken.

The retention verdict is still ahead of me. I've given myself a dated decision point with hard numbers instead of a permanent cloud of doubt. But whatever those numbers say in two weeks, they'll be measuring a different product than the one my August users quietly walked away from.

If you're staring at your own ugly retention number tonight: don't decide. Email your users first. All of them, in their language, with one question. The answers are cheaper than your doubt.

*The app is [OutfitMaker](https://outfitmaker.ai), an AI wardrobe that suggests outfits from clothes you actually own.*

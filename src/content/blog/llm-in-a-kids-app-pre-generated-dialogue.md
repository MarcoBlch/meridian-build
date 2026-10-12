---
title: "No LLM in My Kids App's Mascot: Pre-Generated Dialogue Instead"
description: "Why Penny, the mascot in my kids' money board game, never calls an LLM at runtime: a pre-generated dialogue bank, a fallback chain, and a one-time batch job."
pubDate: 2026-10-12
tags: [ai, architecture]
project: kidcapital
---

[KidCapital](/projects/kidcapital/) is a board game app I'm building that teaches kids about money: roll the dice, buy businesses, avoid debt, reach "Financial Freedom" when your passive income covers your bills. It has a coach, a piggy bank called Penny, who comments on what just happened. The obvious 2026 move was to put an LLM behind her. I decided against running an LLM in a kids app at all, and shipped pre-generated dialogue instead. This post is about that choice, the code it turned into, and the one part I still haven't gotten right.

## Penny talks a lot

Penny reacts to game moments. In the code those moments are a `PennyTrigger` union with 20 values: `game_start`, `first_roll`, `buy_with_loan`, `cant_buy_debt`, `payday_negative`, `temptation_bought`, `quiz_wrong`, `win`, and so on. The game engine fires them from a couple of places, mostly `TurnManager.ts`:

```ts
ui.showPenny(getPennyPhrase('low_cash'));
```

On top of that, the game has three difficulty bands (`'8-10' | '11-14' | '15-18'`, the player's age range) and five languages (English, French, Spanish, Portuguese, German). Twenty moments, three age bands, five languages. A coach that says the same two lines every payday gets ignored fast, so I wanted variety per moment.

That's the part where an LLM looks perfect. Pass the trigger, the age band, the language and maybe the player's cash, get back a fresh line every time.

## Why not call a model at runtime

I wrote down four reasons, and the first one ended the debate on its own.

1. **Nobody reviews a runtime completion before a kid reads it.** With a live call, the text a child sees was produced a second ago and no human has looked at it. Even with a tight system prompt, I'd be shipping a guarantee I can't check. With a static bank, every line Penny can ever say is sitting in a file in the repo, visible in a PR diff.
2. **Offline.** Kids play in cars, on tablets with no SIM, on planes. A coach that goes silent without a network is a broken feature.
3. **Cost that scales with players.** The premium is a one-time purchase. A per-message API cost against a one-time payment means my most engaged players are the ones costing me money forever. I've been bitten by usage-billed APIs before ([no budget cap on a third-party API](/blog/no-budget-cap-on-a-third-party-api/)) and didn't want a second version of that story.
4. **Latency and failure modes.** A speech bubble that shows up late, or never, in the middle of a dice animation feels worse than a slightly less clever line that appears instantly. And an AI feature that fails quietly is a thing [I've already shipped once](/blog/my-ai-was-blind-in-production/).

So the model still does the writing. It just does it once, ahead of time, and the output goes through git like any other source file.

## Pre-generated dialogue vs a runtime LLM: the bank

The bank is a plain TypeScript object, keyed language, then age band, then trigger:

```ts
export type PennyBank = Partial<
  Record<string, Partial<Record<Difficulty, Partial<Record<PennyTrigger, string[]>>>>>
>;

export const PENNY_BANK: PennyBank = {
  en: {
    '11-14': {
      cant_buy_debt: [
        "Debt is blocking your growth. Pay it off, then the businesses are all yours. 🔓",
        "Money rule: settle what you owe before buying more. Freedom comes debt-free!",
        // ...4 more
      ],
      // ...19 more triggers
    },
  },
  fr: {
    '11-14': {
      first_roll: [
        "Touche le dé et fais ton tout premier pas vers la liberté ! 🎲",
        // ...
```

What's in it today: 5 languages × 20 triggers × 6 lines, for the 11-14 band only. That's 600 lines. To be clear about who wrote them: the file's header says "hand-authored", but the hands were Claude's. The lines were written by an LLM during a coding session, from a brief I gave it (in character, 25 words max, one emoji max, localized natively rather than translated from English). What I own is the brief and the fact that the result lives as reviewable source. That distinction matters for this whole post: the safety property doesn't come from a human typing the words, it comes from the words being fixed before they ship.

## The lookup and the fallback chain

The function the game calls didn't change its signature. It gained an optional `difficulty`, defaulting to the current game's:

```ts
export function getPennyPhrase(trigger: string, difficulty?: Difficulty): string {
  const lang = (i18n.language ?? 'en').split('-')[0];
  const diff = difficulty ?? useGameStore.getState().difficulty;
  const key = trigger as PennyTrigger; // trimmed: the real cast is longer

  const banked =
    PENNY_BANK[lang]?.[diff]?.[key] ?? PENNY_BANK['en']?.[diff]?.[key];
  if (banked && banked.length > 0) {
    return pickRandom(banked);
  }

  // Fallback: embedded English phrases translated via i18n.
  const group = PENNY_PHRASES.find(p => p.trigger === trigger)
    ?? PENNY_PHRASES.find(p => p.trigger === 'generic')!;
  const index = Math.floor(Math.random() * group.messages.length);
  return i18n.t(`penny.${trigger}_${index}`, { defaultValue: group.messages[index] });
}
```

Three levels, each one always available:

1. The bank in the player's language for their age band.
2. The English bank for that band.
3. The original `PENNY_PHRASES` list (two or three lines per trigger, from v1 of the game) run through the i18n translations, with an unknown trigger landing on `generic`.

So a 9-year-old today gets the older, smaller set of lines, because the 8-10 band isn't in the bank yet. That's a worse experience than the 11-14 kids get, but it's never an empty bubble and never a network call. Every call site stayed the same, so the change was invisible to the rest of the engine.

## Filling the other age bands, once

For 8-10 and 15-18 I wrote a generator, `scripts/generate-penny-bank.mjs`, exposed as `npm run generate:penny`. It builds one request per (language, age band, trigger) combination, which is 5 × 3 × 20 = 300 requests, and sends them through the Message Batches API to Haiku 4.5 with a JSON schema for the output. The batch API halves the token price, and nothing here needs an answer in real time, so it's a natural fit.

The rules every line has to follow live in the system prompt:

```js
const SYSTEM = `You are writing lines for "Penny", the friendly piggy-bank money coach...
Rules for every line:
- In character as Penny: warm, upbeat, encouraging, never scary or preachy.
- Maximum 25 words. One or two short sentences.
- Child-safe and age-appropriate. No real brands, no financial advice that sounds
  like a recommendation to a real person, no scary debt talk.
- May include at most ONE relevant emoji.`;
```

Each age band also gets its own tone note ("very simple words" for 8-10, "can reference real financial concepts directly" for 15-18).

My estimate when I opened the PR was about forty cents for the whole run. The script's own header says "a few dollars", which tells you how confident I was in my token math. Either number is paid once, not per player, and it doesn't move when the player count does.

It has never been run. Running it means creating an API key for this project, and I haven't. The 11-14 bank covers the default band, and the fallback covers the rest, so nothing is blocked.

## The part I got wrong

Rereading the generator for this post, I found that it contradicts the reason the bank exists. It writes its output straight into `src/data/penny-bank.ts`, under a "DO NOT edit by hand" banner, and it regenerates all three bands. Run it as-is and it would replace the 600 reviewed 11-14 lines with fresh Haiku output, and the only thing standing between those lines and a kid would be me remembering to read a very large diff.

The fix is small and it has to land before the first run: write to a separate file, merge only the missing bands, and treat the result as a PR to read, not a build artifact. Of everything in this design, the review gate is what I actually care about, so it can't be optional.

## What I'd tell someone adding AI to a kids app

Ask where the model sits in time. Calling it at runtime makes it a dependency: it needs a network, a budget, and your trust on every request. Running it at build time makes it a writing tool, and its output is just content you can diff, translate, and roll back. For a mascot with a finite set of moments, the second option covers almost everything the first one would, and the model's text can't reach a child without going through a review first.

If Penny ever gets a live mode, one that reacts in real time to what happens on the board, the plan is a premium option layered on top of this bank, rate-limited, with the bank as the floor. The bank stays.

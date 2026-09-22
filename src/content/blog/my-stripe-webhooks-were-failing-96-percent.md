---
title: "My Stripe Webhooks Were Failing 96% of the Time"
description: "FastPass moves money through Stripe webhooks. 96 percent of them were silently failing the signature check. The culprit was not Stripe. It was crypto in the edge runtime."
pubDate: 2026-09-22
tags: [architecture, bugs]
project: fastpass
---

FastPass only works if money moves correctly. A sender pays, the money sits in escrow, and a Stripe webhook is the thing that tells my backend the payment actually happened. So when I finally opened the webhook logs one evening, my stomach dropped. Around 96 percent of them were failing. Money was landing in Stripe and my app had no idea.

## The setup

[FastPass](https://fastpass.email) is a pay to reach platform. Someone pays to guarantee a reply from a busy person, the money is held in escrow, and it gets released or refunded based on what happens next. Stripe and Stripe Connect handle the money and the 75/25 split between the recipient and the platform. Every state change, a payment captured, a transfer made, a refund issued, arrives as a Stripe webhook. If the webhooks do not land, the whole machine freezes.

The webhook lives in a Supabase Edge Function, which runs on Deno, not Node. Hold that thought.

## The bug

Every webhook starts by verifying Stripe's signature, so I know the call is really from Stripe and not a forged request. The textbook line looks like this:

```ts
const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
```

That line was fine on my laptop. In production it threw on every real event. Verification failed, so I rejected the event, so the payment update never ran. The dashboard showed green deploys, Stripe showed successful charges, and my database quietly fell behind reality.

## The trap

`constructEvent` verifies the signature with an HMAC. In Node, that HMAC is computed synchronously. But Deno, and every edge runtime (Vercel Edge, Cloudflare Workers, Supabase Functions), only gives you the Web Crypto API, and Web Crypto is asynchronous. The synchronous helper has no synchronous crypto to call, so it simply cannot do the work. It does not warn you. It throws, and you are left blaming your webhook secret.

So "96 percent of my webhooks are invalid" was never a Stripe problem and never a security problem. It was me calling a synchronous function in a place where crypto only exists in async form.

## The fix is one word

```ts
const event = await stripe.webhooks.constructEventAsync(
  body,
  signature,
  webhookSecret
)
```

`constructEventAsync` reaches for the Web Crypto API, awaits it, and returns the verified event. Same inputs, same security, one `await`. The moment it shipped, signature verification went green and the backlog of stuck payments started clearing.

Two things I added while I was in there:

**Idempotency.** Stripe retries webhooks, and now that they were actually being accepted, I did not want the same event processed twice. A double payout is a very direct way to lose money. Before doing anything, I check a `webhook_events` table for the event id and skip if I have seen it:

```ts
const { data: seen } = await supabase
  .from('webhook_events').select('id').eq('event_id', event.id).single()
if (seen) return ok({ skipped: true, reason: 'already_processed' })
```

**Return 200 even on a rejected signature.** Stripe retries anything that is not a 2xx, aggressively. During the incident that meant retry storms piling onto a broken endpoint. Now a bad signature is logged and answered with 200, so Stripe stops hammering while I investigate. It is one of the rare cases where a 200 on a failure is correct, because the alternative is a self inflicted denial of service.

## The takeaway

If you move a webhook, or any signature check, into an edge or Deno runtime and it starts failing for no obvious reason, suspect the crypto before you suspect your secret. Edge runtimes expose Web Crypto, which is async only. SDKs that grew up on Node ship synchronous helpers that quietly do not work there. The fix is almost always the same shape: find the `...Async` variant and await it. Stripe has `constructEventAsync`, and most libraries have an equivalent once you go looking.

The scariest bugs are the ones where nothing crashes. My app was up, Stripe was happy, money was moving, and the only symptom was a number in a log I had not thought to read. I hit the mirror image of this on the same project, [a sitemap that quietly advertised the wrong pages](/blog/sitemap-advertised-11-pages-site-had-56/), where everything returned 200 and was still wrong.

If you want to see what it powers: FastPass lets you [get paid to answer messages](https://fastpass.email/get-paid-to-answer-messages) instead of drowning in a free inbox.

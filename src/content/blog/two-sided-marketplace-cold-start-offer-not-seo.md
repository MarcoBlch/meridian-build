---
title: "My Bottleneck Was the Offer, Not SEO: A Two-Sided Marketplace Cold Start"
description: "I spent months on SEO for FastPass. The real problem was a two-sided marketplace cold start on the creator side. What my own build and database showed, and what I changed."
pubDate: 2026-10-12
tags: [growth, indie-hacker]
project: fastpass
---

For most of this year I treated [FastPass](https://fastpass.email) like an SEO problem. Landing pages, structured data, prerendering, a sitemap fix that took it from [11 URLs to 56](/blog/sitemap-advertised-11-pages-site-had-56/). All of it shipped, all of it is live. Then I ran a few queries against my own database and realized I had been solving the wrong problem. FastPass is a two-sided marketplace, and it was stuck in the oldest trap there is: the cold start. The supply side was too thin for that traffic to land on anything.

This is the honest version of that diagnosis, and what I am doing instead.

## What FastPass is, in one paragraph

FastPass is a pay-to-reach link. Someone who wants your attention pays to send you a message, the money is held in escrow, and you either reply before your deadline (and keep 75 percent) or the sender is automatically refunded. Stripe Connect moves the money, and I have already written about [the webhook bug that nearly froze all of it](/blog/my-stripe-webhooks-were-failing-96-percent/). Two sides: creators who receive messages, senders who pay to reach them. Neither side is worth anything without the other.

## The query that changed my mind

I had two tables I thought of as "the supply side". `profiles` holds the people who can actually receive paid messages. `directory_requests` powers a public directory where visitors can signal demand for someone who is not on FastPass yet ("I would pay $X to reach this person"). The idea was a flywheel: enough demand on a directory page, we invite that person, they claim their profile.

Here is what I found when I looked. Every entry in the directory was a celebrity or a big-name influencer, people I had seeded as a wishlist. None of them had a FastPass profile behind it. And on the profile side, the accounts that existed were mostly early signups and tests, not creators with a public page and an audience.

So the directory was a page of famous people who did not know FastPass existed, and the creator side was not ready to catch anyone. Every SEO win I shipped was sending visitors to a storefront with very little on the shelves.

## The build told me first, and I did not listen

The funny part is that my CI had already said this out loud. I opened a pull request to make each creator's payment page the canonical URL and prerender it for every directory slug. It looked like a clean SEO improvement: one strong page per person instead of two weak ones.

The build broke. My prerender pipeline ends with a smoke test, `scripts/verify-prerender.ts`, which checks that each snapshotted page contains real content and not a loading skeleton. For every directory slug, the payment page asked the backend for a profile, got "Profile not found", rendered an error, and the smoke test exited with code 1. I checked the database: none of the directory slugs had a profile behind them.

I closed the PR. The test was right. I was trying to make Google index payment pages for people who could not be paid.

## Why SEO cannot fix a marketplace cold start

The chicken and egg problem in a marketplace is usually framed as "which side do you build first". For FastPass the answer is unambiguous: the creator side. A sender with nobody to pay is a bounce. A creator with nobody paying still gets something (more on that below).

My old plan had two loops, and both depended on things I did not have:

1. **Top-down celebrity outreach.** Ask famous people to join a product they have never heard of. Their incentive is close to nonexistent, and their inbox is the exact problem FastPass solves, so my email lands in the pile.
2. **Demand-driven invites.** Let visitors vote on directory pages until the demand is big enough to impress the target. That needs real traffic first. I did not have real traffic, and the traffic I did have was landing on pages for people who were not there.

SEO compounds an offer that exists. It does not create one. I had it backwards.

The one data point I trust from that period (from my old Plausible setup, before I moved to Cloudflare Web Analytics) is that the US was my largest country at 38 percent of visits, and that the `/pay` funnel lost 86 percent of the people who entered it. That leak is real, but fixing it now would mean optimizing a funnel before the right people are at the top of it. It goes on the list for later.

## The new plan: the creator is the distribution channel

The reframe that unlocked things: a creator is not just supply. A creator who puts a FastPass link in their bio brings their own audience. One real creator solves both sides at once, which is the only cheap way out of a two-sided cold start I know of.

So the target changed from "famous" to "reachable, and already in pain":

- **English-speaking**, because the US is where my visitors already are.
- **Small to mid audience**, roughly 1k to 50k followers, so a cold message from me actually gets read.
- **Already drowning in "can I pick your brain?" requests.** The pitch is a filter for unpaid advice first and income second. That value exists before the first paid message ever arrives.

The first category I picked is career and job-search coaches. They get the most free-advice requests, most already sell their time, and they live on LinkedIn. I went through about 84 coach profiles and kept 25 verified targets. I have a dedicated page for this angle, [a paid inbox for coaches](https://fastpass.email/paid-inbox-for-coaches), and another for the broader pain of [giving free advice online](https://fastpass.email/stop-free-advice).

## Concierge onboarding, and the step I cannot do for anyone

The plan is concierge onboarding. FastPass profiles already start in a draft state, so I can prepare a coach's whole page myself: name, photo, bio, price. When they say yes, they get a link that is ready to go.

Except for one step. Stripe Connect requires the creator to verify their own identity and enter their own bank details. That is KYC, and it cannot be done on someone else's behalf, nor should it be. Until it is done, their public page does not exist. So my first outreach draft, which promised "no effort at all", was wrong. I rewrote it to say upfront: I set up everything, you spend a few minutes connecting your payout account with Stripe, then you put the link in your bio. Announcing that friction early is better than a creator discovering it halfway through and feeling tricked.

## What winning looks like (and where I am)

I set a deliberately small first target: three creators sharing their link, and one real paid message from a stranger. That would be a repeatable playbook and a first case study, which is worth more to me right now than any ranking.

It is too early for results. The target list is ready and outreach is starting. I am writing this before the outcome on purpose, so I cannot quietly rewrite the hypothesis afterwards.

## The takeaway

If you are building a two-sided marketplace and your growth work feels like it is not compounding, check the supply side in your own database before you ship another landing page. Count the real, active sellers. Check whether the pages you promote point at anyone who can actually transact. My CI caught the gap before I did. Your own tables will probably tell you too, if you ask them the blunt question.

I will report back with the numbers, whatever they turn out to be. In the meantime, the rest of my SEO notes are in [what actually worked for SEO as an indie hacker](/blog/seo-for-indie-hackers-what-actually-worked/).

---
title: "The Failed Payments My Database Invented"
description: "OutfitMaker's subscriptions table was full of `incomplete` rows that looked exactly like broken checkouts losing me money. Stripe had never heard of any of them. The bug wasn't in my payment flow — it was in what I was counting, and it was pointing me at the wrong leak."
pubDate: 2026-08-26
tags: [rails, growth, indie-hacker]
project: outfitmaker
---

I opened the subscriptions table on [OutfitMaker](https://outfitmaker.ai) one evening and felt my stomach drop. A pile of rows sitting at `status: incomplete`, no billing period, no active subscription. To a founder's eye that reads as one thing: **failed payments**. People tried to pay me and something broke. My webhook must be dropping events. I'm losing money and I don't even know how much.

I spent the first ten minutes composing the incident in my head — which Stripe webhook, which signature check, how far back does it go. Then I did the one thing that turned a panic into a five-line cleanup: I checked the source of truth before I touched anything.

## The rows were real. The failures were not.

Here's what those `incomplete` rows actually were. When a user clicks "subscribe," `SubscriptionsController#find_or_create_stripe_customer` inserts a local `Subscription` row **immediately** — before any payment — just to hold the Stripe customer id it's about to need. The row starts life as `incomplete`. If the user completes checkout, the `checkout.session.completed` webhook flips it to `active`. If they don't, the row just... stays. Forever. `incomplete`, no `stripe_subscription_id`, no billing period.

So every person who clicked "subscribe," saw the Stripe checkout page, and then closed the tab left a permanent artifact in my database that is **indistinguishable, at a glance, from a payment that failed**. My schema was conflating two completely different events — "started a checkout" and "tried to pay and failed" — into one status.

Before writing a single line of fix, I queried the Stripe API read-only for each of those customer ids. Every one of them: **zero subscriptions, zero paid invoices.** Nobody was charged. Nobody's payment failed. There was no webhook bug. Nothing was lost. The scary number was pre-payment abandonment wearing the costume of failed revenue.

The lesson I'd tattoo on the inside of my eyelids: **when your own dashboard tells you money is broken, check the payment processor before you check your code.** Stripe is the source of truth for whether money moved. My database is, at best, a hopeful cache of that truth — and in this case it was actively lying to me.

## The cleanup, and why it's paranoid on purpose

Once I knew the rows were noise, I wanted them gone — but a `delete_all` on a subscriptions table is exactly the kind of thing that looks safe at 11pm and isn't. So the scope is deliberately narrow. A row only counts as an abandoned checkout if it is *all four* of these:

```ruby
ABANDONED_CHECKOUT_GRACE = 1.day

scope :abandoned_checkouts, -> {
  where(status: :incomplete)
    .where(stripe_subscription_id: nil)
    .where(current_period_end: nil)
    .where("subscriptions.created_at < ?", ABANDONED_CHECKOUT_GRACE.ago)
}
```

Every clause is a guardrail:

- `status: :incomplete` — never touch an active or trialing subscriber.
- `stripe_subscription_id: nil` — if Stripe knows about a subscription, this row is real; leave it.
- `current_period_end: nil` — no billing period was ever set, so nothing was ever charged.
- `created_at older than one day` — **this is the important one.** Stripe Checkout sessions expire after 24 hours. A row created twenty minutes ago might be a checkout still in flight — the user is on the payment page right now. The grace window guarantees I only ever delete checkouts that Stripe itself has already given up on.

And it ships behind a dry run, because I don't trust myself with `delete_all` and neither should you:

```ruby
task purge_abandoned_checkouts: :environment do
  rows = Subscription.abandoned_checkouts.to_a
  rows.each { |s| puts "  - ##{s.id} user_id=#{s.user_id} created=#{s.created_at.utc}" }

  if ENV["DRY_RUN"].present?
    puts "DRY_RUN set — nothing deleted."
  else
    puts "Deleted #{Subscription.purge_abandoned_checkouts!} row(s)."
  end
end
```

I ran it with `DRY_RUN=1` first, read the list of rows it *would* delete, confirmed each one against Stripe, and only then ran it for real. It was a handful of rows — seven, in my case. Not a revenue leak. A rounding error with good production values.

## The real leak was somewhere else entirely

This is the part that actually mattered, and it's why I'm writing about a seven-row cleanup at all.

The `incomplete` rows had grabbed my attention precisely because they looked like a problem. But they were a **vanity metric in reverse** — a number that looked like failure but measured nothing about money. Chasing them would have been hours spent hardening a webhook that was working fine.

The actual leak in the business isn't at the top of the funnel where people click "subscribe" and wander off. Some tab-closing is normal and always will be. The leak is **downstream**: the checkout-completion rate for people who genuinely intend to pay, and week-one retention for the ones who do. That's where real money is decided, and my schema had been drawing my eye to the wrong end of the pipe.

So the cleanup did two useful things, and only one of them was deleting rows. It removed the noise, and — more importantly — it forced me to define, in code, the difference between "started a checkout" and "became a customer." Once those are distinct, the funnel can finally tell the truth: how many people *start* checkout, how many *finish*, and how many are still around a week later. Those are the numbers worth an incident. `incomplete` never was.

If you're staring at a scary count in your own database right now, ask two questions before you write any code. Does my payment processor agree that something is actually broken? And is this number measuring money, or just measuring a click I happened to write a row for? Half the "bugs" a solo founder finds at 11pm are the schema describing normal human behavior in alarming language.

I've been burned by the mirror-image of this too — [a dashboard that read a flat zero when everything was fine](/blog/why-every-funnel-event-read-zero/) — and I wrote about [the messy road to the first customer who actually paid](/blog/from-zero-to-first-paying-customer/). The through-line: trust the money, instrument the money, and be very suspicious of any other number that makes you feel something.

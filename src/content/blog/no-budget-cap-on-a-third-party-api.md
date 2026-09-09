---
title: "No Budget Cap on a Third-Party API"
description: "RapidAPI emailed me that my Amazon data plan was at 100% of its monthly quota. The plan has overage fees and no way to say 'stop at my budget.' The provider will never cap you — so I put the cap in my own code: a Redis counter, a guard before every call, and a cache TTL bumped from 6 hours to 7 days."
pubDate: 2026-09-09
tags: [rails, architecture]
project: outfitmaker
---

On June 16 I got the email every solo founder on a usage-billed API dreads: my [OutfitMaker](https://outfitmaker.ai) RapidAPI plan — the "Real-Time Amazon Data" endpoint I use to match wardrobe gaps to real products — was **at 100% of its monthly quota**. The BASIC plan doesn't just stop there. It keeps serving requests and bills overage on top. And nowhere in the provider dashboard is there a "cap my spend at X" switch. That's not an oversight; a provider has no incentive to help you spend less.

So the budget cap has to live in *my* code. Here's the guard I built.

## The provider's quota is not a limit — it's a bill

The mental model I had wrong: I treated the plan quota like a rate limit that would fail closed. It isn't. It's a billing threshold that fails *open* — straight onto my card. The only thing standing between my app and an overage invoice is my app.

There's exactly one caller in the codebase, `AmazonProductSource`, so the fix has one home. I started with the constant that names the intent:

```ruby
# RapidAPI BASIC has a hard monthly request quota with overage fees and
# no provider-side budget cap (June 16 "quota at 100%" email). This is
# the code-side cap: live calls stop at the guard, cached results keep
# serving. Sized just under the plan quota so overage never bills.
MONTHLY_CALL_CAP = Integer(ENV.fetch("RAPIDAPI_AMAZON_MONTHLY_CAP", "90"))
```

Env-overridable, so if I upgrade the plan I bump one Railway variable — not a deploy.

## A monthly counter in Redis

The cap needs state that resets every month and survives restarts. Sidekiq already gives me Redis, so the counter is three tiny methods — no new table, no cron to reset it:

```ruby
def budget_key
  "rapidapi:amazon:#{Date.current.strftime('%Y-%m')}"
end

def budget_exhausted?
  Sidekiq.redis { |r| r.get(budget_key).to_i } >= MONTHLY_CALL_CAP
rescue StandardError => e
  Rails.logger.warn("AmazonProductSource: budget check failed (#{e.class}), allowing call")
  false # Redis down must not disable the feature
end

def count_api_call
  Sidekiq.redis do |r|
    n = r.incr(budget_key)
    r.expire(budget_key, 45.days.to_i) if n == 1
  end
rescue StandardError
  nil
end
```

Two decisions in there I'd defend in review:

- **The key is the month.** `rapidapi:amazon:2026-09` rolls over on its own on the 1st — there's no reset job to forget to schedule or to break. The 45-day expiry is a janitor, not the mechanism: it's longer than any month so it never truncates the live window, but it means abandoned keys eventually garbage-collect themselves.
- **`budget_exhausted?` fails open.** If Redis is down, the guard returns `false` and the call proceeds. A cost guard that turns a cache outage into a *feature* outage is a worse bug than the one it's preventing. The cap protects my wallet; it must never become the reason the product breaks.

`count_api_call` runs at the top of `fetch_from_api`, so it counts the live call it's about to make — cache hits never touch the counter.

## Wiring the guard into the read path

The search method now reads as a strict priority list: cache first, then the budget guard, then — only if both let it through — a real network call (wrapped in the circuit breaker I [wrote about here](/blog/circuit-breakers-in-production-rails-patching-the-gem)):

```ruby
response_body = if cached_body
  Rails.logger.info("AmazonProductSource: cache hit for #{query}")
  cached_body
elsif budget_exhausted?
  Rails.logger.warn("AmazonProductSource: monthly call cap (#{MONTHLY_CALL_CAP}) reached — skipping live call for #{query}")
  nil
else
  circuit(:amazon_rapidapi).wrap do
    fetch_from_api(query, marketplace, category_id)
  end.tap do |body|
    # Listings are stable; a long TTL stretches the monthly quota far
    # more than freshness is worth (was 6h during the quota incident).
    Rails.cache.write(cache_key, body, expires_in: 7.days) if body
  end
end
```

When the cap is hit, the branch returns `nil`, the caller returns `[]`, and the product-suggestion UI simply shows no affiliate items for that query — degraded, not broken.

## The cheapest call is the one you cache

The guard stops the bleeding, but the real quota-stretcher was one number: the cache TTL. During the incident it was **6 hours**. Amazon listings for "black wool coat" don't meaningfully change in 6 hours, or in 6 days — so I moved it to **7 days**. Freshness I wasn't using was costing me quota I was paying for. That single change did more to keep me under the cap than the counter did; the counter is the backstop for when the cache misses in bursts.

## The takeaway

If a third-party API bills by usage and offers no spend cap, assume it never will — and treat "the provider will stop me" as a bug in your own reasoning. The pattern that fixed it is small and boring on purpose:

1. **Put the budget in your code**, sized just under the plan so overage never bills, and make it one env var to change.
2. **Fail open.** A cost guard that can cause an outage is a liability, not a safeguard.
3. **Cache like the data is stale-tolerant** — because most of it is. Stretching a TTL is free quota.

The provider's job is to sell you requests. Deciding how many you can afford is yours.

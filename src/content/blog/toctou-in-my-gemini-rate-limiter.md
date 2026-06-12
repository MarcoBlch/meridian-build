---
title: "A TOCTOU Bug in My Gemini Rate Limiter"
description: "A read-then-write pattern in OutfitMaker's rate limiter let concurrent requests bypass the daily Gemini quota. The fix compresses to a single atomic increment, but understanding why takes a minute."
pubDate: 2026-05-21
tags: [rails, ai, bugs]
project: outfitmaker
---

[OutfitMaker](https://outfitmaker.ai)'s free tier gives users one [AI outfit suggestion](/blog/multimodal-ai-for-outfit-suggestions/) per day. Premium gets ten. Pro is unlimited. The math is simple: open the cache, read the count, compare to the user's limit, refuse if they're over.

That's also exactly how I wrote it. And exactly why it didn't work.

## The naive version

Here's what `OutfitSuggestionService` looked like for the first few months:

```ruby
def generate_suggestions(count: 3)
  check_rate_limit!                          # read counter, compare
  parts = build_multimodal_parts(filtered_items)
  response = call_gemini_api(parts)          # 3-8 seconds, costs money
  outfits = parse_and_validate_response(response, wardrobe_items)
  track_usage!                               # increment counter
  outfits.first(count)
rescue => e
  Rails.logger.error("Outfit Suggestion Failed: ...")
end

private

def check_rate_limit!
  return if @user.unlimited_suggestions?
  count = Rails.cache.read(usage_key) || 0
  raise SuggestionError, "Daily limit reached" if count >= @user.ai_suggestions_daily_limit
end

def track_usage!
  count = Rails.cache.read(usage_key) || 0
  Rails.cache.write(usage_key, count + 1, expires_in: 24.hours)
end
```

Read this code looking for ways to call Gemini twice when the limit says you should only call it once.

## The first window: the classic TOCTOU

Time-of-check to time-of-use bugs all look the same: you check a condition, then act on it, but the world can change between those two moments.

Here, the check is `Rails.cache.read(usage_key)`. The use is `call_gemini_api(parts)`, which takes anywhere from three to eight seconds. The write — `count + 1` — only happens *after* Gemini responds.

Two concurrent requests from the same user, a second apart:

1. Request A reads `count = 0`, passes the check.
2. Request B reads `count = 0`, passes the check.
3. Request A sends a Gemini call.
4. Request B sends a Gemini call.
5. Both finish. Both write `count = 1`.

The user has consumed two suggestions and the counter says one. Worse, the read-modify-write inside `track_usage!` itself isn't atomic, so even higher concurrency silently loses increments.

For a free user, that's at most one extra suggestion per opportunity. For a premium user on [the wardrobe app I'm building](https://outfitmaker.ai) opening five browser tabs, it's five extra Gemini calls and a quota that nobody respects.

## The second window: error-path leakage

The other problem is more subtle. `track_usage!` only runs on the happy path. If Gemini errors, if the response fails validation, if the user closes their browser mid-request, execution jumps to the `rescue` block and the counter is never incremented.

That means a free user with one daily suggestion can:

1. Open the app, get a `SuggestionError: response parse failed` — counter stays at 0.
2. Refresh. Get a Gemini timeout — counter stays at 0.
3. Refresh again. Get a real outfit — counter is now 1.

Three Gemini calls, one of them successful, quota burnt: zero. Repeat indefinitely whenever the model coughs up something `parse_and_validate_response` rejects.

I noticed both windows the day I sat down to audit rate limiting end-to-end. The first one is the obvious race condition. The second one is what made the limit a polite suggestion rather than a rule.

## The fix

The whole bug compresses into one change: stop reading-then-writing. Reserve a slot atomically *before* the Gemini call. Roll back if you went over.

```ruby
def reserve_rate_limit_slot!
  return if @user.unlimited_suggestions?

  usage_key = "outfit_suggestions:#{@user.id}:#{Date.current}"
  limit     = @user.ai_suggestions_daily_limit

  new_count = Rails.cache.increment(usage_key, 1, expires_in: 24.hours)
  return if new_count.nil?  # NullStore in tests — rate limit is a no-op

  if new_count > limit
    Rails.cache.decrement(usage_key, 1)
    tier = @user.subscription_tier.presence || "free"
    raise SuggestionError, "Daily limit reached (#{limit} per day, #{tier} tier)"
  end
end
```

`Rails.cache.increment` is the whole point. On Redis it's `INCR`; on a FileStore it's an `flock`; on a MemoryStore it's a mutex. All three are atomic at the level of the store. There is no read-then-write window because there is no read at all — the increment returns the new value, and that value is what you compare against the limit.

The new flow:

1. Reserve the slot (atomic increment, get new count back).
2. If the new count is over the limit, decrement to roll back and refuse.
3. Otherwise, make the Gemini call.

If Gemini fails after step 3, the slot stays consumed. That's deliberate. I'd rather a user lose one suggestion to a bad Gemini response than hand out five free calls every time the model returns malformed JSON. The second window closes by design, not by accident.

## What didn't fit in the diff

Three things shipped alongside the fix that, in hindsight, are part of the same bug.

**Divergent constants.** `OutfitSuggestionService` had its own `MAX_FREE_TIER_DAILY` / `MAX_PREMIUM_TIER_DAILY` constants that disagreed with `User#ai_suggestions_daily_limit`. Premium users were getting roughly twice their allocation because the service used `30` where the model said `15`; pro users were capped at `100` despite being "unlimited" in the model. The fix moved every limit lookup through the `User` model — single source of truth, no constants in the service.

**The unprotected `retry` action.** The controller had `before_action :check_rate_limit, only: [:create]`. The `retry` action — which calls Gemini with the same cost as `create` — was missing from that list. You could exhaust your daily limit, then hit the retry endpoint forever. Adding `:retry` to the filter took one character. Not catching it for two months took longer.

**The FileStore caveat.** `Rails.cache.increment` is atomic per cache store, not per Rails process. My production cache was still the default FileStore on Railway, sharing nothing between dynos. With a single worker the fix held; the moment I scaled to two, the counter forked. A separate PR switched production to `:redis_cache_store`. The atomic increment is correct, but only as atomic as the store underneath it.

## On the test

There's a regression test in `outfit_suggestion_service_rate_limit_test.rb` with five cases, including one named "free user cannot exceed 1 reservation per day." I want to be honest about it: it's sequential. Two service instances in the same thread, called one after the other. That covers the reservation semantics — the part of the bug that's actually about my code — but it doesn't prove behavior under real concurrency. The thing that closes the race is `Rails.cache.increment` being atomic, and that's a property of the cache store, not my code. The test verifies my contract; the cache store's documentation verifies the rest.

## What I didn't measure

I don't know how many times the bug fired before the fix. I don't have a Gemini bill before-and-after to point at. The `api_cost` field on `OutfitSuggestion` is hardcoded to `0.01` — a placeholder I never replaced with a real number. If you came here looking for the dollar figure I saved by shipping this, I don't have one for you.

What I have is a rate limiter that now actually limits on [OutfitMaker.ai](https://outfitmaker.ai), and a clearer rule of thumb: any time you find yourself reading from a counter and writing back to it, that's a TOCTOU waiting for traffic. Reach for an atomic primitive — `INCR`, `UPDATE ... WHERE`, `SELECT FOR UPDATE`, anything — before you reach for `read` then `write`.

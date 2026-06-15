---
title: "I Added Circuit Breakers to a Rails App and Had to Patch the Gem Twice"
description: "Wrapping OutfitMaker's six external API calls in circuit breakers was the easy part. Making breaker_machines actually trip — and actually survive a worker restart — took two monkey patches and a lot of reading the gem's internals."
pubDate: 2026-06-15
tags: [rails, ai, architecture]
project: outfitmaker
---

[OutfitMaker](https://outfitmaker.ai) leans on a lot of external services. Outfit suggestions, wardrobe image analysis, missing-item detection and trip planning all call Gemini through Vertex AI. The "Look Preview" feature calls a *second* Google API for image generation (a whole story on its own — [I wrote about that swap here](/blog/fashn-to-gemini-vertex-ai-cant-return-images/)). Product images come from Replicate. Affiliate suggestions come from Amazon via RapidAPI.

Every one of those is a thing that can go down, get slow, or start rate-limiting me without warning. And when one does, the failure mode in a Rails app is ugly: a Sidekiq job retries, hammers the dead service, ties up a worker, the retry queue backs up, and the failure spreads to features that have nothing to do with the broken provider.

A **circuit breaker** is the standard fix. It's a small state machine that sits in front of an external call. After a set number of failures inside a time window, it "opens" — and while it's open, calls fail instantly instead of waiting on a dead service. After a cooldown it goes "half-open," lets one call through to test the water, and either closes (recovered) or opens again. The point isn't to make failures disappear. It's to make them *cheap and contained* instead of expensive and contagious.

I shipped circuit breakers across all six integrations in two phases in early May 2026 — Vertex services first (`b7f9fd3`, PR #63), then Look Preview, Replicate and Amazon (`b637695`, PR #67). I reached for the [`breaker_machines`](https://rubygems.org/gems/breaker_machines) gem, pinned to `0.10.3`. The DSL is clean and the wiring took an afternoon.

Then I tried to actually make a circuit trip, and the afternoon turned into a week.

## Decision one: separate circuits, not one big Vertex circuit

Four of my services hit Gemini Vertex AI on the same `gemini-2.5-flash` model. The tempting design is a single `:gemini_vertex` circuit they all share, because they genuinely share fate — one Vertex outage breaks all four.

I gave each service its own circuit instead. The reasoning is in a design note in the shared mixin:

```ruby
# DESIGN NOTE — separate Vertex circuits despite shared model
#   1. Per-feature blast radius. The April 23 incident came from
#      ImageAnalysisJob under load. A shared circuit would have opened
#      and silently degraded outfit suggestions and trip planning by
#      contagion — features paid users depend on.
#   2. Per-feature observability. Sentry breadcrumbs and metrics tag by
#      circuit name. Separate circuits = a glance tells you which feature
#      tripped, no log mining.
#   3. Per-feature cost of false positives. A false-positive open on
#      MissingItemDetector returns [] (graceful). A false-positive open on
#      OutfitSuggestionService blocks a paywalled flow.
```

A shared circuit is one fewer thing to configure, but it couples the blast radius of every feature to the noisiest one. The whole reason I was adding breakers was to *stop* one feature's failure from spreading. A shared circuit would have quietly re-introduced exactly that.

To keep four near-identical declarations DRY without coupling them, there's a class-method helper:

```ruby
def gemini_vertex_circuit(circuit_name,
                          service_exception:,
                          network_errors:,
                          failures: 3,
                          within: 1.minute,
                          reset_after_seconds: 30,
                          &block)
  circuit circuit_name do
    threshold failures: failures, within: within
    reset_after reset_after_seconds.seconds, jitter: 0.25
    handle(*network_errors, service_exception)
    instance_exec(&block) if block
  end
end
```

Replicate gets a different template — `failures: 5` within `1.hour` instead of `3` within `1.minute` — because its traffic is roughly one invocation a day right now, so a one-minute window is statistically unreachable, and its published rate limit makes short failure clusters more likely than a real outage. The thresholds describe the service, not a global default.

## Decision two: where circuit state lives

Circuit state has to be shared across processes — my web dynos and Sidekiq workers all need to agree that a circuit is open. So it goes in Redis. The non-obvious part is *which* Redis.

I gave it a dedicated database (`db 1`), separate from `Rails.cache` (`db 0`):

```ruby
# Why a separate Redis DB instead of reusing Rails.cache?
#   1. Rails.cache.clear (and Rack::Attack key churn) wipe everything in db 0.
#      Circuit breaker state must survive cache flushes — losing it during an
#      outage would re-arm the breaker mid-incident and let traffic stampede
#      a service that's already down.
#   2. Namespace ("bm") is a defense in depth, not a substitute for db
#      isolation: ActiveSupport's :redis_cache_store only namespaces keys, it
#      does not isolate the Redis DB.
```

The TTL is 24 hours — long enough to outlast a real multi-hour provider outage, because a short TTL would silently drop circuit state at 3am during a low-traffic night, right before morning traffic resumes. There's also a build-time branch: when assets compile with `SECRET_KEY_BASE_DUMMY` set and no Redis, the store falls back to a `NullStore` so the breaker becomes a no-op. No traffic at build time means no state to track.

All of that is design. None of it is what cost me the week. The week went to discovering that with this exact setup, **the circuit never actually tripped.**

## Bug one: the breaker counted to zero forever

I wrote a test that fired enough failures to cross the threshold and asserted the circuit opened. It didn't. The failure count stayed at zero no matter how many exceptions I threw.

`breaker_machines`' cache adapter counts failures by calling `increment` on the cache store and then reading the value back. With `RedisCacheStore`, `increment` issues a raw Redis `INCR`, which stores a plain string `"3"`. But the read comes back through ActiveSupport's default deserialization path, which tries to un-marshal that string, fails, and returns `nil`. `nil.to_i` is `0`. The counter is structurally incapable of going up.

The fix is four lines — read the counter raw and coerce it:

```ruby
module BreakerMachinesCacheRedisFix
  def get_window_count(key, window_seconds)
    if @cache.respond_to?(:increment)
      @cache.read(key, raw: true).to_i
    else
      super
    end
  end
end

BreakerMachines::Storage::Cache.prepend(BreakerMachinesCacheRedisFix)
```

Finding the four lines took the better part of two days. The patch itself is guarded so it can't rot silently:

```ruby
unless defined?(BreakerMachines::VERSION) && BreakerMachines::VERSION == "0.10.3"
  raise "breaker_machines_cache_patch is pinned to 0.10.3, currently loaded: ..."
end

unless BreakerMachines::Storage::Cache.instance_method(:get_window_count).arity == 2
  raise "BreakerMachines::Storage::Cache#get_window_count signature changed; ..."
end
```

If I ever bump the gem, the app refuses to boot until I've re-checked whether the bug still exists. A monkey patch you forget about is worse than the bug it fixed. (This is the same instinct as the atomic rewrite in my [Gemini rate-limiter post](/blog/toctou-in-my-gemini-rate-limiter/): when a read-then-write straddles a process boundary, the boundary is where the bug hides.)

## Bug two: a fresh worker forgot the circuit was open

With the counter fixed, circuits tripped correctly. Then I tested the scenario that actually matters in production: a worker boots into a world where the circuit is *already* open, set by some other process. It should refuse calls immediately. Instead, its first call sailed straight through to the dead service.

`breaker_machines` does try to handle this. Its `Circuit#initialize` reads the stored status from Redis and assigns `self.status = "open"`. The problem is *ordering*. Right after `initialize` returns, the underlying `state_machines` gem runs its own `initialize_states` lifecycle hook, which resets `@status` back to the initial value — `:closed` — because the manual assignment never tripped the flag that tells `state_machines` "this attribute is already set." The restore happens, then gets quietly overwritten.

The trace, captured in the patch's own documentation:

```
[restore] stored=#<Status status=:open, opened_at=...>
[restore] after assign: status=open
[trace status= called with "closed"] caller=[
  "state_machines/machine/state_methods.rb:88:in `write'",
  "state_machines/machine/state_methods.rb:35:in `initialize_state'",
  "state_machines/machine_collection.rb:36:in `block in initialize_states'"
]
FINAL: closed
```

The fix is to restore *again*, after the lifecycle is done:

```ruby
module BreakerMachinesStateRestoreFix
  def initialize(name, options = {})
    super
    restore_status_from_storage if @storage
  end
end

BreakerMachines::Circuit.prepend(BreakerMachinesStateRestoreFix)
```

`super` runs the full chain — including the `state_machines` reset. Then I re-apply the stored status, this time with nothing left to clobber it. The restore is just a read-and-assign, so calling it twice is harmless.

Why does this matter enough to patch a gem? Because of how the failure scales. Every fresh worker that boots during an outage — and Sidekiq autoscaling spins up *more* workers exactly when things are failing — pays one wasted call to the dead service before its in-memory state catches up. Redeploying to ship a fix during an outage produces a whole fleet of forgetful workers. The cost is small per worker and real in aggregate, and it's worst at the exact moment you most need the breaker to hold. At one worker it's a rounding error; at five workers plus frequent deploys it's the pattern the breakers existed to remove.

Because it's a `Module#prepend` on the base `Circuit` class, the fix applied to all six circuits at once with zero per-service changes — one Railway restart.

## What "open" looks like to a user

A tripped circuit shouldn't show a stack trace. The fallback on the outfit-suggestion circuit distinguishes the two cases the gem lumps together:

```ruby
fallback do |error|
  # The breaker_machines fallback fires on EVERY whitelisted error, not
  # just open-state calls. Two distinct cases:
  #   1. Circuit OPEN — error is BreakerMachines::CircuitOpenError. Replace
  #      with a localized "temporarily unavailable" message, tag Sentry with
  #      the circuit name.
  #   2. Circuit CLOSED but raised an in-whitelist exception — re-raise
  #      unchanged so the controller's existing rescue handles it like before.
  if error.is_a?(BreakerMachines::CircuitOpenError)
    # ... localized message + Sentry tag ...
```

Open circuit means "we already know this is down, here's a calm message." A closed circuit that raised means the real failure should flow through untouched. Collapsing those two into one generic error would have either hidden real bugs or shown scary copy for a known, handled state.

## The numbers I can and can't give you

What I can stand behind, because it's in the repo: the gem is pinned to `0.10.3`, both patches carry version guards that fail the boot on an unverified bump, and the two patch test files are 87 and 163 lines — the state-restore one simulates two processes to prove a fresh circuit sees the stored `open` state. The two bugs are reproducible on `0.10.3`, and I confirmed the counter bug is still present in the `0.10.8` source.

What I can't give you is a clean "incidents prevented" graph. OutfitMaker isn't at the scale where provider outages hit daily, and I'm not going to dress up the breakers' value with numbers I don't have. The honest framing: this was insurance bought before the fire, and most of the work was discovering the policy didn't pay out until I patched it twice.

## Takeaway

A circuit breaker is a small state machine that fails fast and contains the blast radius when an external service goes down — and for an AI-heavy app riding on three different Google and third-party APIs, it's not premature optimization, it's table stakes. But "add the gem" is the 20% of the work. The 80% is the boring, specific reality underneath: your cache store serializes counters in a way the adapter didn't expect, and your circuit state evaporates the instant a worker restarts unless the restore runs *after* the state-machine lifecycle, not during it.

If you're wiring breakers into a multi-process Rails deploy, write the two tests that actually matter before you trust the library: one that proves a circuit *trips* under your real cache store, and one that proves a freshly booted process *sees* a circuit another process already opened. Mine both failed against a popular, well-written gem. The breakers in [OutfitMaker](https://outfitmaker.ai) only do their job because those two tests forced the patches that made them true.

---
title: "My Sidekiq Worker OOM'd Four Times. I Fought It Four Ways Before Buying RAM."
description: "A closet-dump upload burst kept OOM-killing OutfitMaker's Sidekiq worker. I answered with four escalating memory defenses over five days — a semaphore, a downscale, a malloc flag, a concurrency cut — before admitting the real fix was a bigger box. Here's which defenses I kept and which I undid."
pubDate: 2026-08-26
tags: [rails, architecture, bugs]
project: outfitmaker
---

The feature that kept killing my background worker was the feature working exactly as designed.

[OutfitMaker](https://outfitmaker.ai)'s strongest activation loop is what I call the closet dump: a new user photographs their whole wardrobe in one sitting and uploads it in a burst. When it fires, it's great — the app is now clearing something like 500 items a day. But each uploaded garment kicks off an `ImageAnalysisJob`, and each of those does something quietly expensive: it shells out to [`rembg`](https://github.com/danielgatis/rembg) to strip the background, which spawns a Python subprocess that loads a ~170MB U2Net model into memory.

One model load is fine. Five at once, on a small box, is not.

## OOM #1 — the burst that killed the worker

On August 20 the Sidekiq worker OOM-crashed mid-burst. A 70-item upload fanned out into `ImageAnalysisJob`s, Sidekiq ran them at concurrency 5, and five simultaneous U2Net loads was roughly a gigabyte of model weights materializing at the same instant. The Linux OOM killer did what it does, the worker died, and every job in flight died with it — 610 items stranded in `pending`, which I had to re-enqueue by hand in prod.

The tempting fix is "lower the concurrency." I didn't reach for that first, because it would tax *every* job to contain a problem that only *one* job type causes. The other jobs in the queue are network-bound Gemini calls — they sit around waiting on I/O and use almost no memory. Throttling them to protect rembg is collateral damage.

**Defense 1: a Redis semaphore that caps rembg at one concurrent run.** A `SET NX EX` lock (`rembg:exclusive`) means only one background removal executes at a time; the other worker threads keep churning through the Gemini-bound jobs, so throughput barely moves while peak memory drops about 5×. The details that made it safe in production:

- If a job waits past a 90-second budget for the lock, it **skips** background removal. That's fine — rembg has always been best-effort; callers already handle a `nil` result, and `retry_analysis` can add the cutout later.
- If Redis itself is unreachable, the job proceeds *unguarded* rather than blocking analysis on a dead dependency.
- The lock carries a TTL, so a worker that dies holding it doesn't wedge the whole pipeline — the lock just expires.

Twenty-one green test runs, shipped. Peak memory way down. Done, I thought.

## OOM #2 — the single run that was too big by itself

Two days later, August 22, a *different* OOM signature. The semaphore was working — the logs showed lock-busy skips exactly as designed — but now single, serialized rembg runs were being OOM-killed by the container's cgroup. The tell was a `Background Removal Failed:` line with an **empty stderr**, repeating every 30 seconds or so. Empty stderr means the process didn't error; it got killed.

rembg's memory scales with input pixels. A modern phone shoots 12-megapixel photos, and pushing 12MP through U2Net inference spikes to multiple gigabytes — *even one at a time*. Serializing hadn't helped because the problem wasn't concurrency anymore; it was the size of a single input.

**Defense 2: downscale the image to ≤1600px on the long side before handing it to rembg.** U2Net operates on roughly 320px internally — feeding it a 12MP original buys you literally nothing in output quality. Downscaling first caps the memory spike, and as a bonus makes each run faster (which means fewer of those 90-second lock-busy skips). Small images pass through untouched; if the resize fails, it falls back to the original. Best-effort all the way down.

This is the one I'd call a *real* fix, not a workaround — and at the time it felt like the end of it. My own commit note said it out loud: *"the memory-plan upgrade question: NOT needed — 8GB is ample once inputs are sane."*

I was about to be proven half wrong.

## Defense 3 and OOM #4 — the software ladder runs out

There was a quieter third defense in between: setting `MALLOC_ARENA_MAX=2`. Ruby under glibc will happily spin up a memory arena per thread, and the fragmentation adds up on a multi-threaded Sidekiq process. Pinning the arena count is a well-worn Rails-in-production knob that trims baseline bloat for free.

And then, on August 23 at 19:48, OOM #4 — with all three prior defenses live.

The culprit this time was the one structural thing I'd been avoiding. Sidekiq queue *weights* don't cap per-queue concurrency. During an upload burst, nothing stops all the worker threads from running `ImageAnalysisJob` simultaneously, each holding a full-resolution image buffer in Ruby memory (phones are shooting 24MP now) *alongside* the serialized rembg. The downscale protected the Python subprocess; it didn't protect the Ruby heap holding the originals.

**Defense 4: drop Sidekiq concurrency from 5 to 3.** Three threads still clear ~500 items a day comfortably, because the jobs are Gemini-bound — they spend most of their time waiting on the network, not computing. Bursts drain slower, but the worker survives them. I wrote the honest line into the config comment: *if OOM #5 happens past this, the software ladder is exhausted — the Railway Pro upgrade becomes the correct spend.*

That's the sentence that mattered. Four defenses in, I'd stopped pretending the box was big enough.

## The part nobody likes to write: I bought RAM

Here's the thing the concurrency cut exposed. Dropping from 5 to 3 threads slowed burst draining *exactly during activation* — the closet-dump moment, which is the single most important thing a new user does. My memory defenses were now actively degrading the business outcome they existed to protect. A user dumps their whole closet, and my worker politely trickles through it three at a time because I was scared of an OOM.

So on August 25 I moved the service to Railway Pro and verified a 32GB limit on both containers. Then I went back and **undid the survival taxes** — but only those:

- Sidekiq concurrency went **back to 5**.
- The rembg lock became a **2-slot** semaphore instead of one (a per-thread token with a compare-and-delete release via `EVAL`, because `redis-client` has no `eval` sugar).
- The downscale-to-1600px and `MALLOC_ARENA_MAX=2` **stayed**.

That last line is the whole lesson. Speed restored, risk not re-introduced. 423 tests, zero failures.

## What I'd actually take from five days of this

**Separate the correctness fixes from the survival taxes.** Downscaling a 12MP image before a model that works at 320px is just *correct* — it should have been there from day one, and it stays forever. Capping concurrency to survive a too-small box is a *tax*: it works, but it costs you exactly where you can least afford it, and you should undo it the moment you have headroom. When I got more RAM, I kept the first kind and reversed the second. If I'd treated them all as "the fix," I'd have paid the activation tax indefinitely for no reason.

**A ladder of cheap fixes is the right instinct — right up until it isn't.** Each defense was individually correct and individually shippable, and I'd make the same first three calls again. But there's a failure mode where you keep climbing the software ladder past the rung where the honest answer is "the machine is too small." I almost did. The tell was defense #4 starting to hurt the product. Buying RAM isn't an admission of failure; it's a line item, and sometimes it's cheaper than the fifth clever workaround plus the activation you're leaking while you build it.

**ML subprocesses are memory bombs, and your Ruby heap is a second one.** The rembg model got all my attention because it was the loud failure. But OOM #4 was Ruby holding full-resolution image buffers across five threads — a cost that had nothing to do with Python. If you fan out image work in Sidekiq, both sides of the shell-out are spending memory, and only measuring one of them is how you get a fourth OOM after three fixes.

If you want more of these, I've written about [wrapping those same external calls in circuit breakers](/blog/circuit-breakers-in-production-rails-patching-the-gem/) and [the concurrency race hiding in my Gemini rate limiter](/blog/toctou-in-my-gemini-rate-limiter/) — the same worker, different ways to make it hurt.

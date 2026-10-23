---
title: "Rotating Every Secret Without Printing One"
description: "My host told customers that environment variables may have been exposed. Here is the small script I used to rotate OutfitMaker's keys across two services without a single value ever appearing in a terminal, a log or a chat."
pubDate: 2026-10-23
tags: [rails, architecture, indie-hacker]
project: outfitmaker
---

On October 21 my hosting provider published a security notice. Environment variables of some projects may have been read. The advice was the only advice there is in that situation: rotate every secret. A day later every API token on the platform was invalidated, mine included, which is how I found out my deploy tooling was locked out before I had read the email.

[OutfitMaker](https://outfitmaker.ai) is a Rails app with a web service and a Sidekiq worker. Between them they hold keys for Gemini, Stripe, AWS, a try-on API, an image API, OAuth secrets and a mail provider. None of this is exotic. What made the rotation interesting was a constraint I set for myself: no secret value would be printed anywhere. Not in my terminal scrollback, not in a deploy log, and not in the conversation with the AI agent that runs most of my ops.

This post is the tool that came out of that, and the three things it caught.

## Why not just paste keys into the dashboard

You can. For one service and three keys, you should. My problem was the second service.

When I set up the Sidekiq worker months ago, I copied a batch of variables from the web service into it as plain values instead of references. It worked, so I never looked again. During a rotation that is a trap: you update the key on the web service, the site works, and the worker keeps calling Gemini with the old key until the provider revokes it. Then background jobs start failing at 3 a.m. and the web service looks perfectly healthy.

So the first rule of the tool: every key is written to every service that already has it, in the same run.

The second reason was the agent. I do a lot of operations through an AI coding agent on a VPS. Its permission layer refused, quite rightly, to read secret values out of the container or echo them into a command. I could have argued with it. Instead I wrote one narrow script, read it, and allowed only that script. The agent can run it. It cannot see what is inside the file it reads.

## The shape of the script

New values go in one file, mode 600, in a directory only my user can open:

```
GEMINI_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

Multi-line secrets (a Google service account JSON, an Apple `.p8` key) get their own files, because a JSON blob on one line of an env file is how you lose a quote.

The script has six modes: `check`, `apply`, `deploy`, `status`, `verify`, `wipe`. Each does one thing.

`check` reads the file, fetches the current variables of each service through the platform's GraphQL API, and prints a comparison. Names and lengths only:

```
Outfit: GEMINI_API_KEY (53 car.) IDENTIQUE à l'actuelle !
Outfit: STRIPE_SECRET_KEY (107 car.) nouvelle
Outfit: STRIPE_WEBHOOK_SECRET (38 car.) nouvelle
Sidekiq: STRIPE_SECRET_KEY (107 car.) nouvelle
```

(Yes, the output is in French. So am I.)

The length is the cheapest sanity check I know. A Stripe live secret key that shows up as 12 characters is a paste error. "Identical to the current one" means I forgot to roll that key at the provider and copied the old value back.

The core of it is a filter, not a loop over everything:

```python
for name, sid in SERVICES.items():
    cur = existing(sid)  # current variables of that service
    todo = {k: v for k, v in vals.items() if k in cur}
    for k, v in todo.items():
        same = "IDENTIQUE" if cur[k] == v else "nouvelle"
        print(f"{name}: {k} ({len(v)} car.) {same}")
    todo = {k: v for k, v in todo.items() if cur[k] != v}
```

A key is only written to a service that already has it. That rule does two jobs. It catches the worker copies automatically, and it makes a typo in a variable name harmless: an unknown name is listed as ignored instead of being created as a new, useless variable.

There is also an allow list. The script refuses any name it does not know, so the file cannot be used to overwrite `DATABASE_URL` by accident.

## Apply once, deploy once

`apply` writes the changes with the platform's upsert mutation and `skipDeploys: true`. `deploy` then redeploys both services. Separating the two matters more than it looks: without it, every key you change triggers its own deploy, and a rotation of five keys becomes five restarts of production in a row, each with a build queue.

```python
gql("mutation($i:VariableCollectionUpsertInput!){ variableCollectionUpsert(input:$i) }",
    {"i": {"projectId": PROJECT, "environmentId": ENV, "serviceId": sid,
           "variables": todo, "replace": False, "skipDeploys": True}})
```

`replace: False` is the other line worth staring at. With `True`, the mutation replaces the whole variable set of the service with the few keys you sent. That is a very fast way to delete your database URL.

## Verify the key, not the deploy

A green deploy tells you the app booted. It does not tell you the new Gemini key works, because the app only calls Gemini when a user asks for an outfit. So `verify` calls each provider directly with the new key, read only, and prints the HTTP status and nothing else:

| Provider | Call | Why this one |
|---|---|---|
| Gemini | `GET /v1beta/models` | lists models, costs nothing |
| Stripe | `GET /v1/balance` | read only, no customer data |
| Replicate | `GET /v1/account` | identity check |
| AWS S3 | `ListObjectsV2`, `max-keys=1` | proves the key can read the real bucket |

S3 was the only fiddly one. I did not want to install the AWS CLI or boto on the VPS just for this, so the script signs the request itself with SigV4. It is about fifteen lines of standard library:

```python
k = ("AWS4" + secret).encode()
for part in (day, region, "s3", "aws4_request"):
    k = hmac.new(k, part.encode(), hashlib.sha256).digest()
sig = hmac.new(k, string_to_sign.encode(), hashlib.sha256).hexdigest()
```

The value of `verify` showed up on the AWS key. I ran it before `apply`, got a 200 on the production bucket, and only then pushed the key. If the IAM user had been missing a policy, I would have found out from a script on my VPS instead of from users whose photo uploads failed.

## The order of operations

Most of the work of a rotation is not technical. It is knowing which old key can stay alive for a while and which one dies the moment you click.

**Stripe** lets you roll the secret key with an expiry on the old one. I picked 24 hours. Both keys work during that window, so there is no race.

**Stripe webhook secrets** do not overlap. When you roll the signing secret, events are signed with the new one immediately, and the app rejects them until it has the new value. That one I rolled last in the Stripe batch and applied within minutes.

**AWS** lets an IAM user hold two access keys. Create the new one, deploy it, verify, then deactivate the old one, and delete it a day or two later. Deactivating is reversible. Deleting is not.

**AI providers first.** A leaked Gemini or image generation key is the one that turns into a bill, so those went before anything else.

**Social login secrets last.** Resetting an OAuth app secret on some platforms invalidates the old one instantly, with no grace period. That one gets done when everything else is stable and you can watch the logs.

## The secrets that log everyone out

Some secrets are not keys to someone else's API. They are the app's own: `secret_key_base` in Rails signs sessions, cookies and every signed URL. Rotating it is the right call after a leak, and it also logs out every user and breaks every signed link already sitting in an inbox, including unsubscribe links.

That one cannot be handled by a script alone. It needs code. Rails supports rotating cookie secrets, but my app also signs its own tokens for one-click unsubscribe and pass renewal links in emails. The change (PR #246) accepts an optional `OLD_SECRET_KEY_BASE`, and only for those two kinds of links, only until a fixed date:

```ruby
module LegacyTokens
  ENV_KEY = "OLD_SECRET_KEY_BASE"
  # Old-secret links are accepted through Nov 30 2026 (UTC), never after.
  CUTOFF = Time.utc(2026, 12, 1).freeze
```

The cutoff is checked at call time, so the grace period ends on its own without a redeploy. I deliberately did not use Rails' built-in `message_verifiers.rotate`: it is set at boot, cannot expire on a date, and would have applied the old secret to every signed id in the app, not just two harmless purposes.

Sessions, magic sign-in links and Devise never accept the old secret. Someone holding it can unsubscribe a user from emails for a few more weeks. They cannot sign in as anyone. That tradeoff is written down in the runbook so that whoever rotates it knows exactly what breaks.

## Wipe

The last mode shreds the file of new values. The keys live in the platform's variables, where they belong, and in the providers' dashboards. There is no reason for a third copy on a VPS.

```
$ railway_rotate.sh wipe
effacé new-keys.env
```

## What I would do from day one

**Use references, not copies.** If your worker needs the same `GEMINI_API_KEY` as your web service, reference it. My platform supports `${{Outfit.GEMINI_API_KEY}}`. One key, one place, no drift.

**Write the verify calls before you need them.** Each one is a single read-only HTTP request. Having them ready turns "I think it works" into a status code.

**Never print a secret to check it.** Length, prefix shape and a live call answer every question you actually have. The value itself answers none of them.

**Give the agent a tool, not a key.** The permission layer that blocked my AI agent felt like friction for about ten minutes. Then it produced a better design than the one I would have done by hand: a narrow script with fixed modes, readable in one screen, that the agent can run and cannot misuse.

If you want more on how the worker and the web service of this app drift apart, [four memory defenses against a Sidekiq OOM](/blog/four-memory-defenses-against-a-sidekiq-oom/) is the same codebase on a worse day.

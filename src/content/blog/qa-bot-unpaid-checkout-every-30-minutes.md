---
title: "My QA Bot Left a $1.99 Unpaid Checkout Every 30 Minutes"
description: "A temporary production check, added during a security incident, kept opening real payments and never closing them. The noise was harmless on its own. The problem was what it hid in between."
pubDate: 2026-11-15
tags: [stripe, testing, bugs]
project: outfitmaker
---

One morning I opened the Stripe app on my phone and scrolled through the payments of [OutfitMaker](https://outfitmaker.ai). This is what I saw for the night:

| Time | Amount | Status |
|---|---|---|
| 02:00 | $1.99 | Incomplete |
| 02:30 | $1.99 | Incomplete |
| 03:00 | $1.99 | Incomplete |
| 03:30 | $1.99 | Incomplete |
| 03:50 | €7.99 | Failed (subscription update) |
| 04:00 | $1.99 | Incomplete |
| 04:30 | $1.99 | Incomplete |
| ... | ... | ... |

A $1.99 payment every 30 minutes, on the dot, all night. Nobody shops on a clock like that.

## Where it came from

A few weeks earlier, my hosting provider reported a security incident. I rotated every secret, and to catch any breakage quickly, I added a temporary cron job: run the full end to end QA suite against production every 30 minutes instead of once a day.

That suite tests the real purchase flow. One step opens a checkout for the $1.99 weekly pass and stops right before paying. That creates a real payment in Stripe, in the "incomplete" state. Nobody is charged.

The suite had a cleanup step that cancels those test payments at the end of each run. It used an access token. That token was one of the secrets I rotated. The cleanup started failing silently, and the temporary cron was never removed.

Result: 48 orphan payments a day, every day, for as long as nobody looked.

## Why it matters even if nobody was charged

On their own, incomplete payments are harmless. But look at the table again. At 03:50 there is a real failure: the first charge after a free trial, declined by the bank.

That is the line I actually care about. And it was sitting between test rows, looking just like them. A real signal, buried in noise I created myself.

There is also the dashboard itself. "Incomplete" is how Stripe shows a customer who opened checkout and walked away. When half the rows are a bot, your abandoned checkout numbers are fiction.

## The fix

The immediate fix took one minute: back up the crontab, remove the 30 minute line, keep the daily run.

The daily run still leaves one incomplete payment per day until the cleanup is reconnected with a valid token. That is a known, small, documented cost, which is very different from an unknown one.

## What I changed in how I work

**Temporary jobs get an expiry date when they are created.** Not "remove after the incident", which nobody remembers, but a date written next to the line, and a reminder.

**A cleanup that fails must be loud.** The QA suite reported success because the tests passed. The cleanup failure went to a log nobody read. Now a cleanup failure is a QA failure.

**Test traffic in production should be easy to filter out.** Every payment the bot creates should carry a tag in its metadata, so a single filter hides it in reports. Real customers should never share a list with a robot.

**Read the raw list once in a while.** Dashboards summarize. The pattern here was obvious the moment I scrolled through the actual rows: same amount, same status, perfect 30 minute spacing.

The bot did its job. It was me who forgot to tell it when to stop.

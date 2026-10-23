---
title: "Ten Abandoned Checkouts and the One Email I Send Now"
description: "In two weeks, OutfitMaker opened 11 Stripe Checkouts and 10 were abandoned on the Stripe page. My old recovery email only saw one kind of them. How I rebuilt it: a table for every Checkout, a 60 to 180 minute window, one signed link, one email, and a lot of reasons not to send it."
pubDate: 2026-10-23
tags: [rails, growth, indie-hacker]
project: outfitmaker
---

On October 20 I counted the Stripe Checkouts that [OutfitMaker](https://outfitmaker.ai) had opened over the previous 14 days. There were 11. One was paid. The other 10 people reached the Stripe page, looked at it, and left.

Ten is a small number. But each of those people had already decided they wanted something enough to click "pay". They are the warmest leads I have, and I had an email for them. It just didn't see most of them.

This post covers how I rebuilt that email in PR #245. It also covers a small card that shows the cheapest offer earlier, and why I can't tell you yet whether any of it works.

## What the old email could see

The previous version of `SendCheckoutRecoveryJob` looked for abandoned checkouts in the subscriptions table:

```ruby
Subscription.where(status: :incomplete, stripe_subscription_id: nil, current_period_end: nil)
            .where(created_at: 24.hours.ago..3.hours.ago)
```

That query finds people who clicked "start my trial" and never came back from Stripe. It made sense when a subscription was the only thing you could buy.

It isn't anymore. Since then I added a 7-day pass, a one-time payment, and credit packs for Look Previews and resale photos. None of those create a `Subscription` row. So someone who opened the pass checkout and walked away was invisible to the job. The email also linked to the pricing page, which meant the person had to find and choose their offer all over again.

If you have read [the failed payments my database invented](/blog/the-failed-payments-my-database-invented/), the `incomplete` status will look familiar. Using a subscription status to mean "someone opened a checkout" was the same kind of shortcut. It works until the product changes shape.

## A row for every Checkout

The fix starts with a boring table. Every Stripe Checkout session the app opens for a user now gets a row:

```ruby
create_table :checkout_attempts do |t|
  t.references :user, null: false, foreign_key: { on_delete: :cascade }, index: false
  t.string :stripe_session_id, null: false
  t.string :plan, null: false        # week_pass, monthly, yearly, or a CreditPurchase::PACKS key
  t.string :source                   # Stripe metadata source (home_card, recovery_email...)
  t.string :currency
  t.datetime :completed_at           # checkout.session.completed webhook
  t.datetime :recovery_email_sent_at # claimed by the recovery job, once
  t.timestamps
end
```

I could have asked Stripe for the list of expired sessions on every run instead. I didn't want a cron job that depends on paging through an external API to decide who gets an email. A local row is easier to query and easier to test, and it doesn't care what kind of product was in the cart.

The recording happens in one place. All Checkouts already went through a small `StripeCheckout` module, so I split it in two:

```ruby
def create_session(params)
  session = open_session(params)
  CheckoutAttempt.record!(session, params)
  session
end
```

One choke point means no entry point can forget to record. And `record!` never raises. It logs a warning and returns `nil` if the insert fails, because a recovery email is not worth losing the checkout itself.

The `checkout.session.completed` webhook stamps `completed_at`. That covers paid sessions and also payment methods that are still settling. Either way, the person finished on Stripe's side and should not get a "you didn't finish" email.

## One email, and the window

The new job runs every 30 minutes and looks for unfinished Checkouts that were opened between 60 and 180 minutes ago:

```ruby
RECOVERY_AGE = 60.minutes..180.minutes
RECOVERY_COOLDOWN = 7.days

def recoverable(now = Time.current)
  unfinished.where(recovery_email_sent_at: nil)
            .where(created_at: (now - RECOVERY_AGE.end)..(now - RECOVERY_AGE.begin))
end
```

The old window was 3 to 24 hours. I moved it much earlier. An hour is long enough that the person has clearly left and isn't just reading the Stripe page or switching cards. It's still short enough that they remember what they were doing. The cron runs at :20 and :50, which lands about an hour after the abandon and keeps it away from other jobs that fire on the hour and half hour.

There is exactly one email per abandoned session, and at most one per user per 7 days. No sequence. No "last chance" follow up. The subject is "You were one tap away", and the footer says plainly that this is the only reminder.

I went with one email on purpose. These are people who signed up days or minutes ago, and they already get onboarding emails. A recovery sequence on top of that is how a small app ends up in the spam folder. I would rather lose a sale than teach Gmail that my domain sends three emails about the same unfinished payment.

## The link reopens the same offer

The email shows what the person was about to get and has one button. That button doesn't go to the pricing page. It reopens the same offer through a signed one-click link:

```ruby
@cta_url = renew_subscriptions_url(**HOST, token: PassMailer.renewal_token(user), plan: @plan,
                                           source: "recovery_email", utm_source: "email",
                                           utm_medium: "checkout_recovery", utm_content: @plan)
```

The renew endpoint already existed for pass renewals. It verifies the token, so the person doesn't have to log in from their phone, and it opens a fresh Checkout for the plan they picked: the week pass, monthly, yearly, or the exact credit pack. If they were eligible for the free trial week, the email says so, and the button says "Start my free week" instead of "Get Premium".

The new Checkout carries `source: "recovery_email"` in its Stripe metadata. That's the only way I'll ever know if the email works.

There is no countdown, no discount, and no deadline in the email. The offer is simply still there. I don't want to train people to abandon a checkout to get a coupon.

## Most of the code is reasons not to send

The query that finds candidates is three lines. The rules that stop the email take up most of the job:

```ruby
def recover?(attempt, now)
  user = attempt.user
  return false unless user && self.class.recoverable_user?(user)
  return false if user.checkout_attempts.where("created_at > ?", attempt.created_at).exists?
  return false if CheckoutAttempt.recovery_sent_recently?(user, now)
  return false if paid_since?(user, attempt.created_at)

  !LifecycleEmailGuard.sent_today?(user)
end
```

In plain words, no email if:

- **They came back.** A newer Checkout means they returned on their own, so only the latest one counts.
- **They paid some other way.** That could be a pass or a pack bought in another session, or with the express payment sheet. `paid_since?` looks for purchases created after this Checkout opened. An older purchase doesn't count.
- **They are already Premium.** This covers a live trial, an active subscription or a pass.
- **The inbox isn't confirmed**, or they turned off lifecycle emails. The daily outfit email has its own switch, and turning that one off doesn't block this email. The recovery email is closer to marketing, so it follows the marketing switch.
- **It's an internal account.** My own account, QA accounts and demo accounts are all excluded, from both emails and conversion stats.
- **They already got an email today.** OutfitMaker allows one lifecycle email per user per day. If the daily outfit or an activation email already went out, the recovery waits. While a recovery email is pending, the softer emails stand down for it.

Then there's the lock. Two runs of the job, or a retry, must never send twice. So the row itself is the lock:

```ruby
def claim!(attempt, now)
  CheckoutAttempt.where(id: attempt.id, recovery_email_sent_at: nil)
                 .update_all(recovery_email_sent_at: now, updated_at: now) == 1
end
```

Only the run that flips `recovery_email_sent_at` from `nil` gets to send. It's the same conditional update pattern I'd use for anything that must happen once, and it doesn't need Redis. The old version kept its "already sent" flag in the Rails cache, which a flush could erase.

The tests read like that list: "timing: nothing before an hour, nothing after three", "only the latest checkout of a user counts", "an older purchase does not count as paying for this checkout", "skips internal and QA accounts".

## Showing the pass earlier

The second half of the PR is about the other end of the funnel. The cheapest offer is the 7-day pass, and almost nobody was seeing it.

Over those same 14 days, there were about 1,700 signups. Only about 100 of them reached the paywall that appears after the first free Look Preview. That's the moment where the pass was offered. Everyone else never saw a price.

So free users with at least 3 real pieces in their closet (sample items don't count) now see a small card on the home page: 7 days of Premium, one payment, nothing renews. One tap opens the week pass Checkout. A "Hide for a week" button sets a cookie and the card goes away for 7 days. The d1 and d3 activation emails got a one-line mention of the pass too.

I track the card as its own experiment label, `home_pass_card`, with a single arm. It isn't an A/B test. I only wanted its views, taps and purchases to go through the same report as the main paywall without mixing into that paywall's numbers. A view is recorded once per user, however many times the home page renders. A tap is recorded on the server, inside the checkout request, and only for a user who was shown the card.

## What I don't know yet

This shipped on October 20. As I write this, it's too early to measure anything. Ten abandoned Checkouts in two weeks means I'll need weeks of data before a recovered sale means anything. I don't have a before/after number, and I'm not going to invent one.

What I do have is the instrumentation to find out. Every Checkout now has a row with a source. A recovered sale will come back tagged `recovery_email` and a pass bought from the card will come back tagged `home_card`. If neither moves, that's an answer too.

The broader lesson is the same one from [the week my payment screens promised things my code didn't do](/blog/payment-screens-promised-what-the-code-did-not-do/). The product changed shape, from one subscription to a pass and packs, and the code around payments kept assuming the old shape. The recovery email didn't break. It quietly kept doing exactly what it was written for, for a product that no longer existed.

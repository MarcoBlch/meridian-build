---
title: "My Payment Screens Promised Things My Code Didn't Do"
description: "OutfitMaker's pricing page, upgrade modal and FAQ were still selling a retired plan, quoting the wrong limits and showing dollars to euro visitors. How the copy drifted from the code, and the tests I now use to keep them in sync."
pubDate: 2026-10-20
tags: [rails, bugs, indie-hacker]
project: outfitmaker
---

On September 24 I retired the Pro plan at [OutfitMaker](https://outfitmaker.ai). One paid plan, Premium, plus a free tier. I changed the checkout, I changed Stripe, and I moved on.

In October I sat down and read every public page and every payment screen as if I were a new visitor. Not the code. The words. What I found was a second version of my product, living in YAML files and ERB templates, that had kept its own rules while the real ones moved.

This post is about that gap, the PRs it took to close it, and why I now treat copy as code that needs tests.

## What the pages were saying

A partial list, all from lines I deleted.

**The FAQ still sold Pro.** In all five languages (English, French, Spanish, German, Portuguese), the plan section listed a Pro tier with "Unlimited AI suggestions", "30 virtual try-ons per month" and "24/7 dedicated support". You could not buy any of it.

**Premium was described with the wrong limits.** The FAQ capped Premium at "150 wardrobe items" and "5 virtual try-ons per month". In the code, wardrobe storage is unlimited on every plan and Premium includes 30 Look Previews a month.

**The free plan had two different quotas depending on the page.** The FAQ's structured data said "3 AI outfit suggestions per day". The comparison table on the pricing page said `1/day`. A help paragraph about weather said "1 for Free, 10 for Premium, Unlimited for Pro". The code gives free accounts 3.

**The Portuguese copy had its own prices.** `pt.yml` hardcoded `R$ 39,90` for Premium and `R$ 74,90` for Pro. Made-up numbers, not what Stripe charges. Everywhere else, prices come from a variable.

**The pricing page showed `$0` to everyone.** The free tier's price was a literal string. A visitor in London or Paris saw dollars right next to a Premium price in their own currency. The upgrade modal had a hardcoded `$14.99/mo` for Pro, and a few other strings had a hardcoded `$7.99/mo` for Premium.

**The home page still had a Pro pricing card** with a "Get started" button linking to `plan=pro`.

**A 30-day money-back guarantee** sat in the pricing page footer: "All plans include 30-day money-back guarantee". I removed it. That was a founder decision, not a bug fix, but it belongs here because nothing in the code implemented it.

**An SEO page about "wardrobe management software"** still listed Pro pricing and an "Early adopter offer, active until June 30, 2026". This was October.

None of these were typos. Each one was true at some point. The code changed and the words didn't.

## The bugs that weren't just words

Some of the drift went deeper than copy.

### A batch upload that said "your wardrobe is full"

Batch upload accepts 10 photos at a time. If you dropped 12, the extra 2 were skipped, and the controller reported it like this:

```ruby
msg += " #{skipped} skipped (wardrobe limit reached)." if skipped > 0

if skipped > 0 && current_user.free_tier?
  redirect_to wardrobe_items_path,
    flash: { notice: msg, show_upgrade: "wardrobe_limit", analytics_event: "batch_upload_chosen" }
```

`show_upgrade: "wardrobe_limit"` opened a modal that said "Your wardrobe is full! Free accounts can store up to 25 items. Upgrade to Premium for 150 items." Every part of that was false. Storage is unlimited, and the photos were only skipped because of the per-upload cap. This was a regression from an earlier PR that changed the batch logic.

So a free user doing exactly what I want new users to do (adding a lot of clothes on day one) got told their closet was full and asked to pay. The fix is a message that says what actually happened:

```yaml
over_batch: "%{count} more photos were not uploaded: %{max} photos per upload. Add them in a second upload."
```

No upgrade modal. The test asserts `flash[:show_upgrade]` is nil and that "limit reached" never appears.

### An upgrade modal that never opened

While I was rewriting the modal copy, I found that the modal itself never showed up. The template set `data-modal-open-on-load-value="true"`, but the Stimulus controller reads a value called `auto-open`. There was also no `panel` target for the fade-in. So every `show_upgrade` flash in the app rendered a modal that stayed invisible.

So the false "wardrobe full" modal was probably less visible than I feared. Two bugs partly cancelling each other out is not a strategy.

The fixed modal uses the right value and a panel target, and its button skips a page. It used to link to the pricing page with `plan: 'premium_trial'`. Now it posts straight to checkout:

```erb
<%= button_to subscriptions_path,
    params: { tier: "premium", billing: "monthly" },
    method: :post,
    form: { data: { turbo: false } } do %>
  <%= trial_eligible ? cta : t("modals.upgrade.cta_no_trial") %>
<% end %>
```

### "No credit card required"

One modal context still said "No credit card required" under the trial button. The current trial takes a card up front. The new copy says it plainly: "7 days free, card required. Cancel before day 7 and you pay nothing. We email you the day before it ends."

The worse case was promising a trial to people who wouldn't get one. Checkout already had a rule: you get the 7-day trial only if you never really subscribed (no subscription, or only abandoned `incomplete` checkouts). But that rule was written inline in the controller, twice, and copied again into the service that picks who gets trial emails. The pricing page just said "7-day free trial" to everyone.

So I moved the rule to the model and made the copy ask the same question:

```ruby
# The 7-day Premium trial goes to anyone who never really subscribed: no
# subscription, or only abandoned checkouts (incomplete records). Ex-paying
# subscribers don't get a second trial. Shared by checkout and the copy that
# promises the trial, so the promise never outruns the behaviour.
def premium_trial_eligible?
  sub = subscription
  sub.nil? || %w[incomplete incomplete_expired].include?(sub.status.to_s)
end
```

The pricing page, the modal, the checkout and the email audience now all call `premium_trial_eligible?`. A former subscriber sees "Get Premium" and "cancel anytime", not a trial they can't have.

### A button in pounds, a charge in euros

1-click credit packs showed a localized price on the button. The PaymentIntent behind it was created like this:

```ruby
amount: info[:amount_cents],
currency: "eur",
```

A UK buyer saw £4.29 on the button, got a payment sheet asking for €4.99, and left. Hosted Checkout was fine because it uses the price's `currency_options`. The 1-click path didn't. Now it charges in `Current.currency` through the same `PriceBook` that renders the button, and a test asserts that a visitor with `en-GB` gets a `gbp` intent for 429.

### "1 suggestions left today"

The suggestion page badge could read "1 suggestions". It's now a real i18n plural in every locale, and the client-side countdown gets the localized `one`/`other` forms instead of writing a bare number.

## While I was in there: the money states

The same audit found places where a payment's outcome and the app's state could disagree. Those went into their own PR:

- A dispute now takes back what the payment bought: unspent credits from a pack, or the subscription is cancelled. Before, a disputed payment kept its credits or kept a Premium that renewed on the disputed card.
- A full refund of a subscription payment cancels the subscription. A partial refund changes nothing.
- Checkout refuses to open over a live Stripe subscription. Two tabs (or the back button) could complete two checkouts, and the first subscription kept billing while the app only tracked the second.
- If a duplicate still slips through, the newcomer is cancelled, the original kept, and Sentry gets a warning to refund it by hand.
- An `incomplete` subscription (SEPA pending, 3DS abandoned) no longer unlocks Premium. It waits for `subscription.updated`.
- The landing page's JSON-LD still listed a Pro offer at 14.99 EUR. Removed.

If you have read [the failed payments my database invented](/blog/the-failed-payments-my-database-invented/), the `incomplete` status will look familiar. It keeps coming back.

## Why the copy drifted

Pricing copy is a second implementation of your business rules, written in a language with no compiler. When I changed `ai_suggestions_daily_limit` or retired a tier, nothing failed. The YAML kept saying what it said.

Five languages made it five implementations. The BRL prices are the clearest example: someone (me) once localized a string by hand, and from then on it lived outside the system.

## What I do now

Every one of these PRs added tests aimed at the words, not the logic.

The comparison table test reads the limits from the model:

```ruby
premium = build(:user, :premium)
assert_includes I18n.t("subscriptions_page.comparison.row_suggestions_premium"),
                premium.ai_suggestions_daily_limit.to_s
assert_includes I18n.t("subscriptions_page.comparison.row_vto_premium"),
                premium.try_on_monthly_limit.to_s
```

If I change the limit and forget the table, CI fails.

Other tests are blunt regex bans over the payment-related locale scopes in all five languages: no `\bPro\b`, no "5 virtual try-ons" or "5 Look Previews" and their translations, no "unlimited suggestions" in English, no money-back guarantee in any language, no `R$ 39,90` back in `pt.yml`, no `plan=pro` on the home page, no `$0` for a euro or pound visitor. Labels describing an existing grandfathered Pro account are exempt by key.

They are not elegant. They are cheap, they catch exactly the kind of thing I shipped, and they stop the same strings from coming back.

One process note. The first PR in this series was supposed to rewrite the wardrobe software page, but it only shipped the deletion of the old view, so the page returned a 204 until the follow-up merged six minutes later. The rewrite uses the same `SeoLanding` template as my other intent pages, with copy that matches the free plan: unlimited pieces, 3 suggestions a day. Fixing promises is also a good way to break a page.

## The takeaway

When you change a rule in code, grep the copy for it. All the languages. The landing page, the FAQ, the modals, the emails, the structured data.

Better, make the copy depend on the code. A view that calls `premium_trial_eligible?` can't promise a trial the checkout won't give. A price that goes through `PriceBook` can't be in the wrong currency. Anything you can't wire up that way deserves a test that reads the real value and compares.

My users don't read my controllers. They read the button. For a while the button and the controller disagreed, and the button was the one people believed.

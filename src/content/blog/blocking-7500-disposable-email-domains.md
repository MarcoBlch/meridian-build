---
title: "Blocking 7,500 Disposable Email Domains"
description: "The day after I finally got my conversion rate to be trustworthy, it lied to me again — not a bug this time, but a wave of throwaway-email signups inflating the top of the funnel. The fix was a blocklist, a memoized Set, and one word in a validator: on: :create."
pubDate: 2026-06-22
tags: [rails, growth, indie-hacker]
project: outfitmaker
---

I'd just spent two PRs teaching my analytics to tell the truth. Every funnel event in [OutfitMaker](https://outfitmaker.ai) had [been reading a flat zero](/blog/why-every-funnel-event-read-zero/), and once I'd fixed that, I finally had a conversion rate I believed. For about a day.

Then a wave of signups rolled in and my freshly-trustworthy numbers started lying again — only this time nothing was broken. The signups were real rows in the database. They were just real *garbage*: accounts on throwaway email domains, zero clothes uploaded, zero intent. The funnel I'd worked so hard to be able to measure was now measuring spam.

A metric you can't trust because it's unplugged is one problem. A metric you can't trust because someone is *padding the denominator* is a different one, and it doesn't show up as a zero. It shows up as a conversion rate that quietly sags.

## What the wave actually looked like

The spam had a clear signature. Every junk account came through the **email/password** signup path, on domains like `web-library.net`, `wshu.net`, and `sharklasers.com` — disposable inboxes you spin up in one click and abandon in two. None of them uploaded a single item.

The tell that made the fix obvious: **the OAuth signups were all real.** You can't bulk-register `sharklasers.com` accounts through Google — Google already did the identity work for me. So this wasn't a "stop all bots" problem needing a captcha wall on every door. It was a narrow one: one specific path was accepting one specific class of address. That scopes the fix way down.

This matters for conversion math. If 1 of 2 real signups subscribes, that's 50%. Bury those 2 real signups under 10 throwaway ones and the same paying customer now reads as a ~8% conversion rate. Nothing about the *product* changed; the denominator got poisoned. For a small product where every number is already low-N, that kind of distortion isn't cosmetic — it's the difference between "the checkout works" and "the checkout is broken," and you can waste a week chasing the wrong one.

## Why a blocklist, not a captcha

The instinct is to reach for a captcha or a rate limiter. I didn't, for two reasons.

First, the attack vector was *specifically* disposable domains — not high volume, not credential stuffing, just throwaway addresses. The cheapest fix that targets the actual vector beats a heavyweight one that taxes every legitimate user. A captcha makes every real signup do unpaid work to prove they're human; a domain check makes the *spammer's* choice of address the thing that fails.

Second, there's a canonical, community-maintained, public-domain list of disposable email domains — about 7,500 of them — that already includes the exact domains I was seeing in the wild. I didn't need to invent a heuristic. I needed to ship a list and check membership.

So that's what PR #89 (`7084232`) does: it vendors the blocklist at `config/disposable_email_domains.txt` (7,557 lines) and adds a validator that rejects any signup whose email domain is on it.

## The validator

The only interesting performance question is: you don't want to read and parse a 7,500-line file on every signup. So load it once per process and memoize it as a `Set` for O(1) membership checks:

```ruby
class DisposableEmailValidator < ActiveModel::EachValidator
  DEFAULT_MESSAGE =
    "is not accepted — please sign up with a permanent email address.".freeze

  def self.blocklist
    @blocklist ||= load_blocklist
  end

  def self.load_blocklist
    path = Rails.root.join("config", "disposable_email_domains.txt")
    return Set.new unless File.exist?(path)

    File.readlines(path, chomp: true)
        .map { |line| line.strip.downcase }
        .reject { |line| line.empty? || line.start_with?("#") }
        .to_set
  end

  def validate_each(record, attribute, value)
    return if value.blank?

    domain = value.to_s.downcase.strip.split("@").last
    return if domain.blank?

    if self.class.blocklist.include?(domain)
      record.errors.add(attribute, options[:message] || DEFAULT_MESSAGE)
    end
  end
end
```

The `@blocklist ||=` on the class object means the file is read the first time any signup is validated and never again for the life of the process. A `Set` of 7,500 short strings is nothing to hold in memory, and `include?` is constant-time. Lowercasing both the file and the incoming domain means casing tricks don't slip through.

## The one word that mattered: `on: :create`

Wiring it into the model is a single line:

```ruby
# Block throwaway/disposable email domains at sign-up only (see
# DisposableEmailValidator). `on: :create` keeps existing accounts editable.
validates :email, disposable_email: true, on: :create
```

The `on: :create` is the part I want to defend, because it's the kind of thing that's easy to leave off and expensive to discover later.

By the time I shipped this, **some existing accounts were already on disposable domains** — a few from the wave, maybe others from before I was watching. If I validated on every save, none of those users could ever update their profile again: every `save` would re-run the email validation, fail, and block an edit that has nothing to do with their email. I'd be punishing existing users for a rule I added after they signed up. `on: :create` scopes the check to brand-new records only. The door is locked going forward; nobody already inside gets trapped.

I pinned that behaviour with a test, because it's the subtle requirement most likely to get "simplified" away by a future me:

```ruby
test "is create-only: existing accounts keep editing even on a disposable domain" do
  user = create(:user, email: "normal@gmail.com")
  user.update_column(:email, "legacy@mailinator.com") # planted, bypassing validation
  user.reload

  user.valid? # persisted record → :update context, disposable check must not run
  assert_not_includes user.errors[:email], MSG,
    "the disposable check must not fire on updates of existing accounts"
end
```

The rest of the suite is the obvious pair — the known-bad domains from the actual wave get rejected, a normal `gmail.com` passes:

```ruby
test "blocks disposable email domains at signup" do
  %w[
    spammer@mailinator.com
    junk@web-library.net
    junk@wshu.net
    junk@sharklasers.com
  ].each do |email|
    user = build(:user, email: email)
    user.valid?
    assert_includes user.errors[:email], MSG, "#{email} should be blocked"
  end
end
```

Those aren't decorative example domains. They're the literal addresses I pulled out of the signup table, asserted back into the test so the regression I'm fixing can't quietly return.

One more detail: the validator also covers the OAuth `from_omniauth` create path, not just the email/password form. A real Google email will never match the blocklist, so in practice it does nothing there — but "this rule applies to *every* way a user can be created" is a cheaper invariant to hold than "this rule applies to the path I happened to be worried about in June." That second framing is exactly the assumption that produced the [Signup-event blindness](/blog/why-every-funnel-event-read-zero/) I'd just finished cleaning up. I'd rather not relearn that lesson.

As usual I couldn't run the suite on the machine I write these from — no Ruby on the box, it [validates on deploy](/blog/rails-8-migration-on-a-live-product/) — so the tests carry more weight than they would in a normal local loop. Writing the assertion *is* the verification.

## Did it work?

The honest version: I deployed the blocklist on June 21, and I checked the next cohort myself rather than assume.

Every signup since the block went live is on a real consumer or institutional domain — `gmail.com`, `icloud.com`, `yahoo.com`, a university student address. Zero disposable domains in the set. And consistent with the original diagnosis, the overwhelming majority came through Google OAuth, the path that was never the problem.

I'm not going to dress this up with a percentage. The counts are small — this is an indie product, not a growth-hack case study — and a clean cohort over a couple of days isn't proof the spam is gone forever; it's proof the specific domains I saw can't get back in, and that I'm now watching. The win isn't a number going up. It's that the number I report next can be **about the product again** instead of about whoever found my signup form.

## The takeaway

For a solo founder, your metrics aren't a dashboard — they're your steering wheel. You don't have a growth team running experiments; you have a handful of numbers and the decisions you make because of them. Which means **data hygiene is a growth discipline, not a chore.** A signup table full of throwaway accounts doesn't just look untidy; it sends you off to fix a checkout that was never broken while the real lever sits untouched. The cleanup *is* the growth work, because it's what lets the next decision be the right one.

Two things I'd tell my past self:

1. **Match the fix to the vector.** The spam came through one path, as one class of address. A 7,500-line blocklist and an O(1) `Set` lookup beat a captcha that taxes every honest user — because it makes the *spammer's* choice fail, not the real user's patience.
2. **Add new validations with `on: :create`.** A rule you invent today shouldn't retroactively trap the users who signed up yesterday. Lock the door going forward; don't brick the people already inside.

I spent two PRs earning a conversion rate I could believe. Defending it from junk that pads the denominator turned out to be the same job, just from the other end — and a number you can defend is worth a lot more than one you merely collected.

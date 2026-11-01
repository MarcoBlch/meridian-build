---
title: "My Black Friday Dry Run Would Have Billed 3,334 Users in the Wrong Currency"
description: "Preparing a Black Friday offer on OutfitMaker, a dry run showed that 3,334 of 3,691 accounts had no stored currency and would have been priced in euros, Americans included. How I inferred a currency from the time zone, backfilled it safely, and set up one Stripe coupon that charges an exact amount in three currencies."
pubDate: 2026-11-01
tags: [rails, stripe, saas]
project: outfitmaker
---

On October 30 I set up the Black Friday offer for [OutfitMaker](https://outfitmaker.ai): Premium annual for 39 € / $39 / £35 for the first year, instead of 59.99 / 59.99 / 49.99. It runs from November 25 to November 30, with two emails, a banner and a one-click checkout link.

Before writing any copy, I ran the email audience as a dry run. Not "send to myself". I asked the code: for every user who would receive this email, which price would they see and which currency would Stripe charge?

The answer was that 3,334 of the 3,691 accounts would be priced in euros. Most of my users are in the US.

## Where the euros came from

OutfitMaker sells in EUR, USD and GBP. On the website, the currency comes from the request: the visitor's location and language. That part was fine and had been fine since early October.

Outside a web request, there's no visitor. An email, a background job or a signed checkout link has to decide from the database. I added a `currency` column to `users` on October 12, set every time someone visits the site. Accounts created before that, or people who hadn't come back since, had an empty column.

And empty meant the default, which is EUR. That's 3,334 people, so 90 % of the list.

In practice, an American would have opened an email saying "39 €", clicked the link and landed on a Stripe Checkout in euros. Some might have paid anyway. I suspect most would have closed the tab. Nothing would have crashed, and no error would have shown up in a log. It would just have been a worse Black Friday, and I would probably have blamed the offer.

## A currency from the time zone

I didn't have a country for those accounts. But I had something almost as good: their time zone, which the app already stores to work out local times.

A time zone isn't a country, but it's close enough to pick between three currencies:

```ruby
def currency_for_time_zone(zone)
  zone = iana_zone(zone)
  return nil unless zone
  return "GBP" if GBP_ZONES.include?(zone)
  return "EUR" if zone.start_with?("Europe/") || EURO_ZONES.include?(zone)

  "USD"
end
```

`iana_zone` does the tedious part. Rails stores friendly names like `"Eastern Time (US & Canada)"`, so they get mapped back to IANA names (`America/New_York`). Old aliases get normalized. And `UTC`, `Etc/*` and blank values return `nil`, because they say nothing about where someone lives.

When the time zone is useless, the language decides: English reads as an American account, which matches most of my traffic, and French, German, Spanish, Portuguese and Italian read as euros. Only when both are missing does the old default apply.

The order of trust is now explicit, in one method on `User`:

```ruby
def effective_currency
  return currency if PriceBook::CURRENCIES.include?(currency)

  PriceBook.currency_for_time_zone(time_zone) ||
    PriceBook.currency_for_locale(locale) ||
    PriceBook::DEFAULT
end
```

First the currency the person was actually shown on the site, then the time zone, then the language, then EUR. Every email, job and checkout link calls this, and none of them read the raw column any more.

## Backfilling without overwriting anyone

I also wanted the column filled in, so the site, the emails and the checkout agree from now on. The backfill is a one-off rake task, and it has three rules:

- It only touches users whose currency is blank.
- The write checks again that the column is still blank. If someone visits the site between the read and the write, their real currency wins.
- It runs as a dry run by default and returns the counts per currency.

```ruby
def run(dry_run: true)
  ids_by_currency = Hash.new { |h, k| h[k] = [] }
  scope.select(:id, :currency, :time_zone, :locale).find_each do |user|
    ids_by_currency[user.effective_currency] << user.id
  end

  unless dry_run
    ids_by_currency.each do |currency, ids|
      ids.each_slice(1_000) { |slice| scope.where(id: slice).update_all(currency: currency) }
    end
  end

  ids_by_currency.transform_values(&:size).sort.to_h
end
```

`scope` is `User.where(currency: [nil, ""])`, and it's reapplied inside the `update_all`. That's what makes it idempotent and safe to rerun.

After the fix, the full user base splits into 2,192 USD, 1,317 EUR and 182 GBP. That looks like my traffic, which is the sanity check I care about.

## One coupon, three exact amounts

The second trap was on the Stripe side. My annual Premium price is a single Stripe Price in EUR with `currency_options` for USD and GBP. I didn't want a separate Black Friday price, because then renewals would need special handling.

So the discount is a coupon on the normal price. It has `duration: "once"`, so only the first invoice is discounted and the renewal is the normal annual amount. And it uses an `amount_off` per currency, through the coupon's own `currency_options`:

- EUR: 59.99 minus 39.00 = 20.99 off (on the coupon itself)
- USD: 59.99 minus 39.00 = 20.99 off
- GBP: 49.99 minus 35.00 = 14.99 off

A percentage coupon would have been simpler, but it would give £34.99 instead of £35 and 39.00 only by luck of rounding. With `amount_off` per currency, the first invoice is exactly the number in the email.

The code creates the coupon the first time it's needed and checks it on every use. If the amounts on Stripe ever drift from the ones in the code, because someone edited the coupon in the dashboard or because of a bad deploy, the checkout refuses to open. I'd rather lose one sale than charge a price I never announced.

## The window is in New York time

The last detail is the clock. The offer ends at the end of November 30 in New York, which is 05:59 on December 1 in Paris. The window is defined once, in `America/New_York`, and the code switches itself on and off. There's nothing to deploy on the day.

## Takeaways

- Before sending any email that shows a price, dry-run the audience and count which price each person would see. It takes a minute and it found 3,334 wrong prices.
- "Default currency" is a decision, not a fallback. If most of your users aren't in the default, the default is a bug waiting for an email.
- A time zone is a decent proxy for a country when you only need to choose between a few currencies. Treat `UTC` and blanks as unknown, not as a location.
- Backfills should only fill blanks, check again at write time, and dry-run by default.
- For a discount in several currencies, use `amount_off` per currency in `currency_options` on a `once` coupon, and refuse the checkout if the coupon drifts.

The offer starts November 25. At least now everyone will see it in their own money.

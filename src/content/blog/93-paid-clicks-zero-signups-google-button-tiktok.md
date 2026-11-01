---
title: "93 Paid Clicks, Zero Signups: My Google Button Doesn't Work Inside TikTok"
description: "A small TikTok ad sent 93 visitors to OutfitMaker and not one signed up, on a site where about one visitor in five does. The likely cause was the first button on the page: Google refuses to sign people in from inside TikTok's browser. How I detect in-app browsers in Rails and what the sign-up page shows them now."
pubDate: 2026-11-01
tags: [rails, growth, indie-hacker]
project: outfitmaker
---

On October 30 I looked at the results of a small TikTok ad for [OutfitMaker](https://outfitmaker.ai). It had cost 21 € and brought 93 visits, so about 0.23 € per visit. 73 % of those visitors were in the US and 97 % were women, which is the audience I asked for.

Signups from those 93 visits: zero.

That would be a normal result for a bad ad. But over the same 7 days, the site as a whole turned 5,252 visits into 1,042 signups. That's 19.8 %, roughly one visitor in five. At that rate, 93 visitors should give somewhere around 18 signups. Zero is not bad luck. Something was broken, and only for those visitors.

## What the TikTok visitors had in common

The ad audience was not perfect. The age targeting didn't hold: 63 % of the visitors were 18 to 24, which is my weakest age group for payments. But that age group signs up fine. It just doesn't pay. Age could explain zero sales. It could not explain zero accounts.

The thing every one of those 93 people shared was the browser. When you tap a link in a TikTok ad, the page doesn't open in Safari or Chrome. It opens inside TikTok, in an embedded webview. Instagram and Facebook do the same.

And the first button on my sign-up page was "Continue with Google".

## Google says no to webviews

Google's sign-in refuses to run inside embedded webviews. If you start a Google OAuth flow from one, you don't get the account picker. You get an error page: `Error 403: disallowed_useragent`. Google's reason is security: an app that hosts a webview can see everything typed into it, including a password.

So from inside TikTok, my funnel was:

1. See the ad, tap it.
2. Land on a page whose biggest button is Google.
3. Tap it, get a Google error page in English talking about user agents.
4. Leave.

The email form was right below the button, and it works fine in a webview. But a person who just hit an error page doesn't scroll down to try plan B. They close the page and go back to their feed.

I can't prove that this was the cause for all 93 visits. I didn't have tracking on in-app sign-up views at the time, which is exactly the problem I fixed next. But it's the one thing that was different for those visitors, it was the first thing they'd tap, and it fails 100 % of the time in that browser. I shipped the fix the same day.

## Detecting the in-app browser

There's no API for "am I in a webview". The only signal is the User-Agent, and each app adds its own token. Here is the module, more or less as it is in production:

```ruby
module InAppBrowser
  RULES = [
    [:tiktok, /musical_ly|BytedanceWebview|TikTok/],
    [:instagram, /Instagram/],
    [:facebook, /FBAN|FBAV|FB_IAB/],
    [:snapchat, /Snapchat/],
    [:linkedin, /LinkedInApp/],
    [:other_webview, /; wv\)/]
  ].freeze

  module_function

  def detect(user_agent)
    return nil if user_agent.blank?

    RULES.each { |app, pattern| return app if pattern.match?(user_agent) }
    nil
  end
end
```

The order matters. On Android, the Instagram and Facebook User-Agents also contain `; wv)`, the generic Android WebView marker. If the generic rule came first, every Instagram visitor would be labelled "other webview". It goes last as a catch-all.

User-Agent sniffing is fragile, and I know it. Apps change their strings. But the failure mode here is gentle. If detection misses a webview, the visitor sees the old page, which is what everyone saw before. If it wrongly flags a real browser, that visitor loses the Google button but still has a working email form. Neither mistake locks anyone out.

## What the page does now

A concern exposes the result to the Devise sign-up and sign-in views:

```ruby
module InAppBrowserDetection
  extend ActiveSupport::Concern

  included do
    helper_method :in_app_browser, :in_app_android?
  end

  private

  def in_app_browser
    return @in_app_browser if defined?(@in_app_browser)

    @in_app_browser = InAppBrowser.detect(request.user_agent)
  end
end
```

Inside TikTok, Instagram or Facebook, the page changes in three ways:

- **Google is hidden.** A button that can only produce an error page is worse than no button.
- **Email goes first.** The form that works is the first thing you see.
- **A short tip explains how to get Google back**: open the page in your real browser. On Android, there's a one-tap link that uses a Chrome intent URL (`intent://...;package=com.android.chrome;end`) to reopen the same page in Chrome. iOS has no reliable equivalent, so iOS visitors only get the text.

The tip can be dismissed, and the dismissal is remembered, so it doesn't nag.

## Measuring it this time

The other half of the fix is that I can now see this funnel. Each sign-up page view inside a webview fires an `in_app_signup_view` event with the app name. Each signup made inside a webview carries an `in_app` property on the existing `Signup` event. Those two numbers give me a conversion rate for each app, which is what I was missing on October 30. I only had a total of zero.

That's the lesson I'd keep even without the webview part: **when you pay for traffic, check that the page works in the browser that traffic actually uses.** I tested my sign-up page in Chrome, Safari and Firefox, on desktop and on a phone. I never opened it from inside the app that I was paying to send people from.

## Takeaways

- If your traffic comes from TikTok, Instagram or Facebook, your page opens in their webview. Test it there, by tapping your own link inside the app.
- Google OAuth doesn't work in those webviews. If Google is your first or only sign-in option, those visitors hit an error page.
- Detect the webview from the User-Agent, put the generic Android `; wv)` rule last, and make sure a wrong guess fails gently.
- Measure the in-app funnel separately. A blended conversion rate of 19.8 % hid a channel that was converting at zero.

21 € is cheap tuition. The expensive version of this story is the one where you scale the ad first.

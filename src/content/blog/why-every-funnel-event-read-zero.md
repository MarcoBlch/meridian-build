---
title: "Why Every Funnel Event in My Analytics Read Zero"
description: "Pageviews tracked fine, but every funnel milestone in OutfitMaker — Signup, Activation, First Item Uploaded — sat at a flat zero. Three compounding bugs, then a fourth, all hiding behind a dashboard that looked merely quiet instead of broken."
pubDate: 2026-06-21
tags: [rails, frontend, bugs]
project: outfitmaker
---

The worst kind of broken instrumentation is the kind that reports a number. A blank dashboard makes you check the wiring. A dashboard full of zeros makes you think your product is just quiet.

For as long as I'd had funnel tracking in [OutfitMaker](https://outfitmaker.ai), every custom event I cared about read zero. Signup: 0. Activation: 0. First Item Uploaded: 0. The onboarding-choice events: 0. Meanwhile pageviews ticked up normally and real people were clearly signing up, uploading clothes, and getting outfit suggestions. I'd half-convinced myself the funnel was just thin. It wasn't thin. It was lying.

Here's the teardown. It took two PRs and turned out to be four separate bugs stacked on top of each other.

## How the events were supposed to fire

OutfitMaker runs [Kaunta](https://outfitmaker.ai), a self-hosted, privacy-friendly analytics script, loaded once per page. Automatic pageviews work out of the box. For funnel milestones I used a server-driven pattern: a controller sets `flash[:analytics_event] = "Signup"`, and the layout turns that flash into a `kaunta.track()` call on the next page.

The layout snippet looked like this — and it had been copy-pasted into three layouts:

```erb
<script src="<%= kaunta_script_url %>"
  data-website-id="<%= kaunta_website_id %>"
  async defer></script>

<% if flash[:analytics_event].present? %>
<script>
  document.addEventListener('DOMContentLoaded', function() {
    if (window.kaunta) {
      window.kaunta.track('<%= flash[:analytics_event] %>', { locale: '<%= I18n.locale %>' });
    }
  });
</script>
<% end %>
```

It reads fine. It is also wrong in three independent ways, each one enough on its own to zero out the event.

## Bug 1: Turbo never re-fires DOMContentLoaded

Every one of these milestones arrives on a page reached by a `redirect_to` after a form POST. You submit the signup form, the server creates the user, sets the flash, and redirects you to the next page. In a [Hotwire app](/blog/hotwire-over-react-for-a-solo-dev/) that redirect is a **Turbo visit**, not a full document load.

`DOMContentLoaded` fires exactly once, on a cold load. Turbo swaps the `<body>` and does **not** re-evaluate `<head>` scripts on navigation. So on the page that actually carried the flash, the listener was being registered after the event it was waiting for had already passed — and then never ran again. The `track()` call was real, reachable code that simply never executed.

This is the same family of silent Turbo failure I [wrote about with duplicate frame ids](/blog/duplicate-turbo-frame-bug-broke-three-features/): nothing throws, the HTTP response is a clean 200, and the gap is a layer of intent the framework doesn't share with you.

## Bug 2: the async race

Suppose the page *did* cold-load — a direct visit, say. The Kaunta loader is `async defer`, so `window.kaunta` is usually still undefined when `DOMContentLoaded` runs. The guard:

```javascript
if (window.kaunta) { /* track */ }
```

is a coin flip you lose most of the time. When the script wasn't ready, the event was dropped on the floor with no retry. No error, no queue, nothing. So even the rare cold-load path was unreliable.

## Bug 3: the layout the funnel actually lands on

The snippet lived in the `application`, `landing`, and `blog` layouts. But a successful signup redirects to `onboarding_path`, which renders under the **`onboarding` layout** — and that layout had no Kaunta at all. Not the loader, not the trigger.

So for the single most important event in the whole funnel, `Signup`, all three bugs were academic. The page it landed on couldn't have tracked anything even if the script and the timing had been perfect. `Signup` wasn't unreliable. It was structurally impossible.

## The fix: fire from Stimulus, share one partial

The repair (`9dec828`, PR #85) moves the trigger out of the `<head>` and into a Stimulus controller that runs from the `<body>`. Stimulus `connect()` runs on **every** Turbo navigation, which kills Bug 1. And instead of a one-shot guard, it polls for `window.kaunta`, which kills Bug 2:

```javascript
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = {
    name: String,
    props: { type: Object, default: {} },
  }

  connect() {
    if (!this.nameValue) return
    // Skip Turbo's cached *preview* render so a snapshot that still
    // contains this element doesn't double-fire on the preview pass.
    if (document.documentElement.hasAttribute("data-turbo-preview")) return
    if (this.fired) return
    this.waitForKaunta(25) // ~5s max (25 × 200ms)
  }

  waitForKaunta(attemptsLeft) {
    if (this.fired) return
    if (window.kaunta && typeof window.kaunta.track === "function") {
      this.fired = true
      window.kaunta.track(this.nameValue, this.propsValue)
    } else if (attemptsLeft > 0) {
      this.pollTimer = setTimeout(() => this.waitForKaunta(attemptsLeft - 1), 200)
    }
  }
}
```

The `data-turbo-preview` check is the kind of detail you only learn by getting it wrong: Turbo renders a cached preview of a page before the fresh version arrives, and if your tracking element is in that snapshot it'll fire on the preview too. Bail on the preview pass; fire on the real render.

The flash is surfaced by a tiny partial that just mounts the controller:

```erb
<% if flash[:analytics_event].present? %>
  <div hidden
       data-controller="kaunta-event"
       data-kaunta-event-name-value="<%= flash[:analytics_event] %>"
       data-kaunta-event-props-value="<%= { locale: I18n.locale }.to_json %>"></div>
<% end %>
```

Bug 3 gets fixed by construction: the loader and the trigger become two shared partials (`shared/_kaunta_head` and `shared/_kaunta_event`), rendered in **all four** user-facing layouts — `application`, `landing`, `blog`, and the previously-naked `onboarding`. That deletes the three-way copy-paste and closes the gap in the same move. Three layouts each lost ~30 lines.

I can't run the suite on the box I write these from (no Ruby, no Node — it [validates on deploy](/blog/rails-8-migration-on-a-live-product/)), so I locked the server side of the contract with an integration test instead of trusting the browser behaviour to a comment:

```ruby
test "first item upload emits the kaunta-event trigger with the event name" do
  post wardrobe_items_path, params: { wardrobe_item: { image: image } }
  follow_redirect!

  assert_select "[data-controller='kaunta-event']", count: 1
  assert_select "[data-kaunta-event-name-value='First Item Uploaded']", count: 1

  # Regression guard: the old, broken inline tracker must be gone.
  assert_no_match(/addEventListener\(['"]DOMContentLoaded['"]/, response.body,
    "flash analytics event must not be tracked via a DOMContentLoaded script")
end
```

The `assert_no_match` is the part I care about most. It's not testing what the page does; it's testing that the broken pattern can never come back through a careless copy-paste.

## Bug 4: Signup was still zero

I deployed, watched `First Item Uploaded` and the onboarding-choice events start landing — events that had **never** been anything but zero — and felt good about it. Then I looked again the next day. `Signup` was still zero.

The first three bugs were dead. This was a fourth one wearing their clothes.

The cause: **100% of OutfitMaker's signups come through Google OAuth.** Nobody uses the email/password form. And the `Signup` event was only ever set in `RegistrationsController#create` — the email/password path. The OAuth path, `OmniauthCallbacksController`, set no event and, it turned out, sent no admin notification either. Which also explained a separate mystery: I never got an email when someone signed up. I'd been blind to my own new users because I'd only instrumented the door nobody walks through.

The fix (`dca116a`, PR #88) pulls the side effects into a shared concern both controllers include:

```ruby
module SignupSideEffects
  extend ActiveSupport::Concern

  private

  def handle_new_signup(user)
    user.update_column(:locale, I18n.locale.to_s)
    flash[:analytics_event] = "Signup"
    return if Rails.env.test?

    UserMailer.welcome_email(user).deliver_later
    AdminMailer.new_user_signup(user).deliver_later unless user.admin?
  end
end
```

Two subtleties in the OAuth side made this more than a one-liner.

**Telling a new signup from a returning login.** `from_omniauth` both creates new users and logs in existing ones, and it'll also link OAuth to an existing email account. Only a genuinely new record should fire `Signup`. Rails 7's `previously_new_record?` is exactly that signal — true only on the request that created the row:

```ruby
if @user.previously_new_record?
  handle_new_signup(@user)
  sign_in(@user, event: :authentication)
  redirect_to onboarding_path(step: 1)
else
  flash[:notice] = t("flash.omniauth.success", provider: provider)
  sign_in_and_redirect @user, event: :authentication
end
```

**Flash survives exactly one redirect.** Devise's `sign_in_and_redirect` would send a new user to root, which then redirects to onboarding — two hops. `flash[:analytics_event]` only survives one. The second redirect would silently eat it, and I'd be right back to a zeroed `Signup` for a subtly different reason. So the new-signup branch redirects **straight** to onboarding in a single hop, and the flash lives long enough for the Stimulus trigger to fire.

I covered the new-vs-returning logic at the model level too, because it's the load-bearing assumption — a brand-new user, a returning user, and an OAuth-linked existing account each get their own test asserting whether `previously_new_record?` is set.

## The result

After the second deploy, Kaunta started showing real signups where there had only ever been a flat line — and the rest of the chain (Activation, the post-wow upgrade prompts) lit up with it. OutfitMaker is small enough that these are modest counts, but the point isn't the magnitude. It's that the dashboard finally describes the product instead of contradicting it.

## The takeaway

Instrumentation that silently reports zero is worse than none, because you act on it. I spent real time wondering why my "funnel was thin" when the funnel was fine and the funnel *meter* was unplugged. Two rules I'd hand my past self:

1. **In a Turbo app, never fire analytics from a `<head>` `DOMContentLoaded` script.** Your most important events arrive on Turbo visits, where that listener is already too late. Fire from a Stimulus `connect()` and wait for your script to be ready instead of guarding once and giving up.
2. **A funnel's top must cover every path into it.** I instrumented the signup flow I wrote first and assumed it was *the* signup flow. The one my users actually used was untouched. Count the doors before you trust the turnstile.

The quiet bugs are the expensive ones. A crash gets fixed the same day. A zero that should be a number can sit there for as long as you're willing to believe your product is just quiet.

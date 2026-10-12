---
title: "Turbo Stream Broadcasts Lost on Mobile: My Result Was Ready, the Screen Never Knew"
description: "Turbo Stream broadcast not received on mobile? Phones drop the Action Cable websocket when you switch apps. How I added cheap Stimulus pollers as a safety net."
pubDate: 2026-10-12
tags: [rails, frontend, bugs]
project: outfitmaker
---

On October 10 I tested my own app on my phone, the way a user would. I asked [OutfitMaker](https://outfitmaker.ai) to generate a resale photo of one of my jackets, worn by a model, ready for a Vinted listing. While it worked, I switched to another app for a few seconds, like everybody does.

The server logs say the photo was ready in 13 seconds. My screen said "about 20 seconds" and kept saying it. The card only updated when I closed the item popup and opened it again.

Nothing crashed. The job succeeded, the broadcast went out, Sentry stayed quiet. This is the classic case of a Turbo Stream broadcast not received on mobile, and once I understood it I found the same hole in four places.

## How the result was supposed to arrive

The flow is [textbook Hotwire](/blog/hotwire-over-react-for-a-solo-dev/). The item page subscribes to a per-user stream:

```erb
<%= turbo_stream_from "resale_#{current_user.id}" %>
```

The user clicks, the controller renders a loading card and enqueues a Sidekiq job. When the job finishes, it pushes the result over Action Cable:

```ruby
def broadcast(photo, partial)
  html = ApplicationController.render(
    partial: partial,
    locals: { resale_photo: photo, wardrobe_item: photo.wardrobe_item, user: photo.user }
  )
  Turbo::StreamsChannel.broadcast_replace_to(
    "resale_#{photo.user_id}",
    target: "resale-photo-#{photo.wardrobe_item_id}",
    html: html
  )
end
```

On a desktop with the tab in front, this is lovely. No polling, no client state, the card swaps itself.

## Why the broadcast vanished

The logs showed the phone dropping the websocket right after the click. It came back about 10 seconds later. The result was broadcast in between.

That is the whole bug. A broadcast is fire and forget. Action Cable sends it to whoever is subscribed at that exact moment and keeps no history. When the socket reconnects, Turbo resubscribes to the stream, but nothing replays the messages that went out while it was gone. My loading card had no other way to learn the outcome, so it waited forever.

On mobile this is not an edge case. Switch apps, lock the screen, walk into a lift: the browser suspends the page and the socket goes with it. And the features where it hurts most are the slow ones (AI generation, image analysis), which are exactly the ones where people leave the tab while they wait.

I had already been bitten by the other half of this. The job wraps the broadcast in a `rescue` that reports to Sentry, because a broadcast that raised in September left users on a spinner. But a broadcast that succeeds into an empty room raises nothing. There is no error to catch. Like the [silent production failure where my AI was blind](/blog/my-ai-was-blind-in-production/), everything "worked".

## The fix: let the waiting element ask for itself

I kept the broadcasts (they are still the fast path when the socket is alive) and added a safety net: the loading element polls its own state.

First, a read-only endpoint that returns the card as it is now, scoped to the owner. This was PR #218:

```ruby
# GET /resale_photos/:id (turbo stream): the card's current state, read
# only. The loading card polls it in case the job's broadcast was lost.
def show
  photo = current_user.resale_photos.find_by(id: params[:id])
  return head :not_found unless photo

  partial = if photo.completed? then "resale_photos/result"
            elsif photo.failed? then "resale_photos/error"
            else "resale_photos/loading"
            end
  replace_with(partial, resale_photo: photo, wardrobe_item: photo.wardrobe_item)
end
```

It renders the same partials the job broadcasts, so there is one source of truth for every state. `current_user.resale_photos.find_by` means another user's id is a plain 404.

Then the loading partial attaches a Stimulus controller, only when there is a persisted photo to ask about:

```erb
<div id="resale-photo-<%= wardrobe_item.id %>"
     <% if local_assigns[:resale_photo]&.persisted? %>data-controller="resale-poller" data-resale-poller-url-value="<%= resale_photo_path(resale_photo) %>"<% end %>
     ...>
```

And the controller, trimmed:

```js
connect() {
  this.attempts = 0
  this.timer = setInterval(() => this.poll(), 4000)
  this.onVisible = () => { if (document.visibilityState === "visible") this.poll() }
  document.addEventListener("visibilitychange", this.onVisible)
}

async poll() {
  if (++this.attempts > 60) return clearInterval(this.timer) // ~4 minutes
  try {
    const response = await fetch(this.urlValue, { headers: { Accept: "text/vnd.turbo-stream.html" } })
    if (!response.ok) return
    const html = await response.text()
    if (html.includes('data-controller="resale-poller"')) return // still generating
    Turbo.renderStreamMessage(html)
  } catch (e) {
    // offline for a moment: the next tick or the return to the tab retries
  }
}
```

Two details I like here. The `visibilitychange` listener is the real fix for the phone case: the moment you come back to the tab, the card asks, without waiting for the next tick. And the "still loading?" check needs no JSON protocol. If the response still contains the poller's own `data-controller`, the server rendered the loading partial again, so the client ignores it. Otherwise it applies the stream and the poller disappears with the element it lived on.

The same PR fixed a side effect: reopening an item during a generation used to show the "generate" button again. The section partial now looks for an in-flight photo and renders the waiting card, poller included.

## The same hole, three more times

Once I knew the pattern, I went looking for every screen that waited on a broadcast.

**Wardrobe cards (PR #219).** After an upload, each card shows "analysing" until a job broadcasts the identified item. Same failure, same fix: `GET /wardrobe_items/:id/card` returns the card as a turbo-stream replace. Because a batch upload can mount ten pollers at once, the interval is jittered:

```js
this.timer = setInterval(() => this.poll(), 5000 + Math.floor(Math.random() * 2000))
```

The endpoint returns `head :not_found` instead of going through the app's shared not-found handler, because that handler closes the open modal and flashes "item removed". Fine for a click, terrible on every poll.

**Giving up too early (PR #223).** My first pollers stopped completely after their attempt budget. But the analysis job can retry for longer than five minutes, so a slow result could still be missed. The fix splits the timer from the check: the interval stops, the tab-return check never does.

```js
tick() {
  if (++this.attempts > 60) return clearInterval(this.timer)
  this.poll()
}
```

The same PR gave the look preview poller its missing `visibilitychange` check, and removes a card when the poll gets a 404 (the analysis deletes photos that are not clothing), instead of spinning on it forever.

**A dropped POST (PR #224).** Outfit suggestions are not broadcast at all: they run inside the POST, about 30 seconds. A phone that leaves the app drops that request too. The server still finished and spent the user's daily quota, but the screen said "network error". Now, on a network error or the 90 second safety timeout, the page asks a recovery endpoint before giving up:

```ruby
# GET /outfit_suggestions/latest?since=<ms>
def latest
  since = Time.zone.at(params[:since].to_i / 1000.0) - 10.seconds
  suggestion = current_user.outfit_suggestions.where("created_at >= ?", since).order(created_at: :desc).first
  return head :no_content unless suggestion
  return head :accepted if suggestion.status == "pending" && suggestion.created_at > 5.minutes.ago
  return head :no_content unless suggestion.status == "completed"
  # 200: render the results as turbo streams
end
```

The client retries every 4 seconds for about a minute: 200 renders the results, 202 means keep waiting, anything else shows the original error.

## What I don't know yet

I have no number for how many users hit this before. A lost broadcast leaves no trace in the logs, which is the whole problem. What I can say is that I hit it on my first real test, on the most ordinary phone behaviour there is.

## The takeaway

Treat a websocket broadcast as a nice-to-have notification, not as the delivery mechanism. If a screen is waiting for a result, that screen should be able to fetch the result itself, through a read-only endpoint that renders the same partial the broadcast would. Poll slowly, stop the timer eventually, and always re-check on `visibilitychange`. It costs one action and a 35 line Stimulus controller per feature.

It is the same lesson as the [duplicate Turbo Frame bug](/blog/duplicate-turbo-frame-bug-broke-three-features/): Hotwire fails quietly. Test it on a phone, in your pocket, not in a desktop tab you never leave.

---
title: "A Duplicate Turbo Frame Bug That Broke Three Features Silently"
description: "Two turbo-frame elements with the same id, one HTTP response, three dead features in OutfitMaker. No exception, no Honeybadger hit, no console error. Just a click that did nothing."
pubDate: 2026-06-05
tags: [rails, frontend, bugs]
project: outfitmaker
---

Three things broke at once in [OutfitMaker](https://outfitmaker.ai) one morning: the **+** button to add a wardrobe item, click-to-see-details on any item, and the "move to another closet" button. All silent. No flash, no console exception, no Honeybadger hit. Click, nothing.

Local testing had been clean. The modals had opened fine in production an hour earlier. Then they didn't.

## The problem with two #modal frames

The application layout has this near the bottom:

```erb
<%= render "shared/navbar" %>
<div id="flash_messages">
  <%= render "shared/flash" %>
</div>

<%= turbo_frame_tag "modal" %>
```

An empty placeholder. Modals render into it via Turbo Frame requests. Standard Hotwire.

The wardrobe item views start like this:

```erb
<%= turbo_frame_tag "modal" do %>
  <%= render "shared/modal" do %>
    ...
```

Also standard. The view *is* the modal — a frame with the same id as the placeholder it targets.

The bug: I'd forgotten to skip the layout for frame requests. So the response to `GET /wardrobe_items/new` came back containing **both** frames in the same document — the layout's empty `<turbo-frame id="modal">` and the view's filled one.

Turbo matched the first. It found the empty placeholder, swapped it into the live modal, and you got nothing. No exception, because from Turbo's point of view nothing went wrong: it found a frame with the matching id and used it. That it was the wrong one is a layer of intent Turbo doesn't have.

## The fix

One line per controller action:

```ruby
def new
  @wardrobe_item = WardrobeItem.new
  render layout: !turbo_frame_request?
end

def show
  @closets = current_user.closets.ordered
  respond_to do |format|
    format.html { render layout: !turbo_frame_request? }
    format.json { render json: @wardrobe_item }
  end
end
```

Same in `UserProfilesController#edit`. When Turbo asks for a frame, skip the layout — only the filled frame goes back. Direct browser navigation still gets the full page. This pattern was already in `OutfitSuggestionsController#index`; I'd just forgotten to apply it everywhere else.

## What the silence costs

Error tracking caught none of this. The response was a 200. The Turbo body was valid. Three features in [the wardrobe app I'm building](https://outfitmaker.ai) were dead and the only signal was a user opening a support thread.

I have no count of affected users — the PR description just says "fixes silent breakage in production." It shipped because I'd tested the **+** button locally with a flow that didn't exercise the full layout markup. Production was different. Production is always different.

## The cousin bug

Skipping the layout for frame requests means a direct visit to `/user_profiles/edit` now renders a frame with no surrounding page. Blank.

The original close handler papered over this by calling `Turbo.visit('/')` on every modal close, which solved the blank-page case but threw users out of whatever list they were working through. That redirect was removed two weeks later. The current handler clears `src` and removes the modal element, leaving the underlying page intact:

```javascript
close() {
  // ...fade out...
  setTimeout(() => {
    this.containerTarget.classList.add("hidden")
    const frame = this.element.parentElement
    if (frame?.tagName === "TURBO-FRAME") {
      frame.removeAttribute("src")
      this.element.remove()
    }
  }, 300)
}
```

The blank-page-on-direct-visit case is still there for those routes. It's a real issue — but it's not the close handler's job to fix.

## The takeaway

If a Hotwire feature breaks silently in production after passing local tests, the first thing I check now is whether the response contains more than one `<turbo-frame>` with the target id. Two frames with the same id is not an error to Turbo. It's just an instruction it follows the wrong way.

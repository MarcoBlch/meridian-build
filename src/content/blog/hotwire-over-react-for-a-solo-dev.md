---
title: "Hotwire Over React for a Solo Dev"
description: "Real-time features without a JavaScript framework. How Turbo Streams and Stimulus gave OutfitMaker everything it needed with a fraction of the complexity."
pubDate: 2026-04-11
tags: [rails, hotwire, turbo, stimulus, frontend]
project: outfitmaker
---

When I started OutfitMaker, the question wasn't "should I use React?" It was "how do I build real-time features?" Outfit suggestions stream in from an AI that takes 3-5 seconds to respond. Product recommendations update when you add new clothing. Wardrobe stats recalculate on the fly. The app needs to feel alive.

The standard 2024 answer would be: Rails API + React SPA. Separate frontend. State management library. Build tooling. Two deployment targets. One developer.

I went with Hotwire instead. Eighteen months later, I haven't regretted it once.

## What Hotwire actually is

For anyone coming from the React world: Hotwire is Rails' answer to SPAs. It consists of three pieces:

**Turbo Drive** replaces full page loads with fetch + DOM swap. Every link click and form submission becomes an AJAX request that replaces the `<body>`. Your app feels like an SPA without writing JavaScript.

**Turbo Frames** let you decompose pages into independently-updating sections. Click a link inside a frame, and only that frame updates. Like React components, but rendered server-side.

**Turbo Streams** push HTML updates over WebSocket. The server broadcasts a chunk of HTML with an instruction (append, replace, remove), and the client applies it. Real-time updates without writing a single line of client-side state management.

**Stimulus** is a minimal JavaScript framework for behavior. Click handlers, toggle visibility, form validation. Think jQuery but organized into reusable controllers.

## Real-time outfit suggestions

Here's the concrete example that convinced me. When a user requests an outfit suggestion, the flow is:

1. User clicks "Generate outfit"
2. A background job starts calling Gemini
3. The page shows a loading state
4. When the AI responds, the suggestion appears without page reload

In React, this would involve: an API endpoint, a fetch call, local state for loading/error/success, WebSocket connection for real-time updates, re-render logic.

In Hotwire:

```erb
<!-- suggestions/show.html.erb -->
<%= turbo_stream_from current_user, "suggestions" %>

<div id="suggestion-area">
  <%= render @suggestion || "suggestions/empty" %>
</div>
```

```ruby
# After Gemini responds in the background job
class GenerateSuggestionJob < ApplicationJob
  def perform(suggestion)
    result = GeminiClient.generate(suggestion.prompt_parts)
    suggestion.update!(body: result, status: :completed)

    Turbo::StreamsChannel.broadcast_replace_to(
      suggestion.user, "suggestions",
      target: "suggestion-area",
      partial: "suggestions/card",
      locals: { suggestion: suggestion }
    )
  end
end
```

That's it. When the job completes, the server broadcasts new HTML to the user's browser. The DOM updates. No client-side state. No JavaScript to write, debug, or maintain.

## The loading state

"But what about showing a spinner while it loads?" Stimulus:

```javascript
// suggestion_controller.js
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["button", "spinner"]

  generate() {
    this.buttonTarget.disabled = true
    this.spinnerTarget.classList.remove("hidden")
  }
}
```

```erb
<div data-controller="suggestion">
  <button data-action="click->suggestion#generate"
          data-suggestion-target="button">
    Generate Outfit
  </button>
  <div data-suggestion-target="spinner" class="hidden">
    Generating your outfit...
  </div>
</div>
```

Eight lines of JavaScript. The Turbo Stream broadcast automatically replaces the whole area (spinner included) when the suggestion arrives.

## What this means for bundle size

OutfitMaker's total JavaScript: 47KB gzipped. That includes Turbo, Stimulus, and all my controllers.

A comparable React app with routing, state management, and a UI library? 150-300KB minimum. For a fashion app where first-load performance directly impacts whether someone installs the PWA, this matters.

## The product recommendations case

When a user adds a new clothing item, OutfitMaker suggests complementary products. This happens asynchronously; the recommendation engine takes a second or two to process. Turbo Frames handle this perfectly:

```erb
<!-- After user adds a new item -->
<turbo-frame id="recommendations" src="/recommendations?item_id=<%= @item.id %>" loading="lazy">
  <p>Finding complementary items...</p>
</turbo-frame>
```

The frame loads independently. Shows placeholder text immediately. When the server responds, the content swaps in. No JavaScript. No loading state management. No error boundaries.

## Where Stimulus shines

Not everything is a server round-trip. Some interactions need to be instant:

- Toggling between grid/list view in the wardrobe
- Expanding/collapsing outfit details
- Image zoom on clothing photos
- Form validation before submission
- Drag-and-drop outfit arrangement

These are all Stimulus controllers. Simple, focused, well-contained. No component trees. No prop drilling. No state management library.

My `wardrobe_controller.js` handles view toggling:

```javascript
import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["grid", "list", "gridButton", "listButton"]

  showGrid() {
    this.gridTarget.classList.remove("hidden")
    this.listTarget.classList.add("hidden")
    this.gridButtonTarget.classList.add("active")
    this.listButtonTarget.classList.remove("active")
  }

  showList() {
    this.listTarget.classList.remove("hidden")
    this.gridTarget.classList.add("hidden")
    this.listButtonTarget.classList.add("active")
    this.gridButtonTarget.classList.remove("active")
  }
}
```

Could this be more elegant? Sure. But it's obvious, debuggable, and requires zero build tooling beyond what Rails provides.

## What you give up

I'm not going to pretend Hotwire has no trade-offs.

**Complex client-side state.** If I needed a drag-and-drop outfit builder with undo/redo, or a rich text editor, or real-time collaborative editing, React would be better. Hotwire doesn't give you a client-side state management paradigm. It gives you server-rendered HTML pushed to the client.

**Ecosystem.** The React ecosystem is vast. Need a date picker? A chart library? An animation framework? There are dozens of options with active maintenance. Hotwire's ecosystem is smaller. You'll write more custom code for rich interactions.

**Hiring.** If I were building a team, finding React developers would be easier than finding Hotwire developers. Though any competent developer can learn Stimulus in an afternoon; it's deliberately simple.

**Offline capability.** React with proper service workers and local state can work offline. Hotwire is fundamentally server-dependent. For a PWA like OutfitMaker, this means I can't offer offline outfit browsing (though I cache previously-viewed suggestions with service workers).

## Why it's enough for 90% of use cases

Most web applications are CRUD with occasional real-time updates. That's exactly what Hotwire excels at. Forms, lists, detail views, notifications, live updates, all of this works beautifully with Turbo Frames, Turbo Streams, and a sprinkle of Stimulus.

The 10% where you genuinely need React: collaborative real-time editing, complex data visualization dashboards, games, rich media editing tools. If your app is primarily one of those, use React. If your app is primarily "users interact with data and see updates," Hotwire is enough.

## The solo developer advantage

Here's what matters most for me: one codebase, one language (mostly), one mental model.

When a bug appears in OutfitMaker's real-time suggestion feature, I open one file: the controller or the job. The rendering logic is in the ERB partial. The broadcast is in the model callback. Everything is Ruby, everything is in the Rails app, everything follows Rails conventions.

With React, that same bug could be in: the API serializer, the frontend fetch logic, the state management reducer, the WebSocket connection handler, the component render method, or the CSS module. Six files across two codebases in two languages.

For a solo developer shipping a product, the complexity budget is tight. Hotwire lets me spend that budget on product features (better AI suggestions, smoother onboarding, more languages) instead of on frontend infrastructure. That trade-off was right for me and right for this project.

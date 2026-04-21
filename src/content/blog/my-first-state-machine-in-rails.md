---
title: "My First State Machine in Rails"
description: "How OutfitMaker's outfit suggestion flow evolved from nested if/else into a proper state machine. The gem, the gotchas, and why it clarified everything."
pubDate: 2026-04-03
tags: [rails, state-machines, architecture]
project: outfitmaker
---

Three months into building OutfitMaker, my outfit suggestion code looked like this:

```ruby
def generate_suggestion(user)
  return if user.generating?
  return if user.last_suggestion_at && user.last_suggestion_at > 1.hour.ago

  user.update(generating: true)

  begin
    items = user.clothing_items.where(season: current_season)
    return user.update(generating: false) if items.empty?

    prompt = build_prompt(user, items)
    response = GeminiClient.call(prompt)

    if response.success?
      suggestion = user.suggestions.create!(body: response.body, status: 'completed')
      user.update(generating: false, last_suggestion_at: Time.current)
    else
      user.update(generating: false, last_error: response.error)
    end
  rescue => e
    user.update(generating: false, last_error: e.message)
  end
end
```

Boolean flags. Rescue blocks. Early returns scattered like landmines. The method worked, but every time I needed to add a feature (retry logic, timeout handling, rate limiting), I had to trace through the entire control flow to figure out which state the suggestion was in.

## The turning point

I wanted to add a simple feature: show users a "generating..." indicator while their outfit was being created. Sounds trivial. But the `generating` boolean wasn't enough. I needed to distinguish between "waiting in queue," "actively calling the AI," and "processing the response." Three states, one boolean. The boolean had to go.

## Enter AASM

I chose [AASM](https://github.com/aasm/aasm) (Acts As State Machine) because it's the most established state machine gem in the Rails ecosystem. Alternatives exist (`statesman`, `state_machines-activerecord`) but AASM had the clearest documentation and worked well with ActiveRecord out of the box.

Here's what the suggestion model became:

```ruby
class Suggestion < ApplicationRecord
  include AASM

  belongs_to :user

  aasm column: :status do
    state :pending, initial: true
    state :generating
    state :completed
    state :failed

    event :start_generation do
      transitions from: :pending, to: :generating
      after do
        GenerateSuggestionJob.perform_later(self)
      end
    end

    event :complete do
      transitions from: :generating, to: :completed
      after do
        update(completed_at: Time.current)
        broadcast_replace_to(user, target: "suggestion_#{id}")
      end
    end

    event :fail do
      transitions from: :generating, to: :failed
      after do |error_message|
        update(error: error_message)
        broadcast_replace_to(user, target: "suggestion_#{id}")
      end
    end
  end
end
```

The state diagram was now explicit. `pending → generating → completed` or `pending → generating → failed`. No other paths possible. No boolean that could get stuck in the wrong state.

## What this gave me immediately

**Visual clarity.** I drew the state diagram on a Post-it note. Four circles, four arrows. Anyone looking at this model can understand the lifecycle in ten seconds.

**Guard rails.** Try calling `suggestion.complete!` when it's in `pending` state? AASM raises `InvalidTransition`. The model literally cannot enter an illegal state. No more "generating is true but last_error is also set" contradictions.

**Callbacks on transitions.** The `after` blocks on each event replaced scattered callback logic. When a suggestion completes, it broadcasts via Turbo Stream. When it fails, it records the error. The logic lives where the state change happens, not in some distant service object.

**Database-backed.** The `status` column is a string. I can query `Suggestion.where(status: :generating)` to find stuck suggestions. I can add a cron job that fails any suggestion stuck in `generating` for more than 5 minutes, and timeout handling became a three-line method.

## The gotchas

### Gotcha 1: Column naming

AASM defaults to a column called `aasm_state`. I wanted `status`. Easy enough to configure with `aasm column: :status`, but I forgot this in the migration and had to add a rename migration. Small thing, but read the docs before generating your migration.

### Gotcha 2: Validation timing

AASM transitions happen *before* `save` by default. If you have `after` callbacks that update the record, you get double saves. I switched to `aasm column: :status, whiny_persistence: true` which wraps transitions in a transaction and raises if the save fails.

### Gotcha 3: Testing transitions

You can't just set `suggestion.status = 'completed'` in tests. AASM will complain. You need to walk through the states:

```ruby
test "completing a suggestion records the timestamp" do
  suggestion = create(:suggestion, status: :pending)
  suggestion.start_generation!
  suggestion.complete!

  assert_not_nil suggestion.completed_at
end
```

This felt verbose at first, but it's actually better: your tests prove the state machine works correctly, not just that the final state looks right.

### Gotcha 4: Background jobs and race conditions

The `after` callback on `start_generation` enqueues a background job. If the job picks up before the transaction commits, it might find the suggestion still in `pending` state. Solution: use `after_commit` or enqueue with a slight delay. I went with `after_commit`:

```ruby
event :start_generation do
  transitions from: :pending, to: :generating
  after_commit do
    GenerateSuggestionJob.perform_later(self)
  end
end
```

## The background job simplified

With the state machine handling transitions, the job itself became almost trivial:

```ruby
class GenerateSuggestionJob < ApplicationJob
  def perform(suggestion)
    return unless suggestion.generating?

    response = GeminiClient.generate_outfit(suggestion.user)

    if response.success?
      suggestion.update!(body: response.body)
      suggestion.complete!
    else
      suggestion.fail!(response.error)
    end
  rescue => e
    suggestion.fail!(e.message)
  end
end
```

The guard clause `return unless suggestion.generating?` handles duplicate job execution. The rescue triggers the `fail` transition. No boolean flags to manage. No manual state cleanup.

## When state machines are overkill

Not everything needs a state machine. My `ClothingItem` model has a `processing` boolean for background removal; it's either processing or it's not. Two states, one transition, no complex lifecycle. A boolean is fine there.

The signal that you need a state machine:

- More than two states
- Transitions that should only happen in certain orders
- Business logic that depends on "where" an object is in its lifecycle
- Bugs caused by objects getting stuck in impossible states

## The refactor ripple

Adding the state machine to `Suggestion` made me rethink how I was handling other flows. User onboarding now has states: `registered → profile_created → wardrobe_started → active`. The subscription flow uses states too. Not everything needs AASM; sometimes a simple enum with validation is enough, but thinking in states instead of booleans made the entire codebase more predictable.

The pattern costs maybe 30 minutes of setup per model. In return, you get code that's easier to debug, test, extend, and explain. For a solo developer who has to context-switch constantly between features, that clarity is worth more than cleverness.

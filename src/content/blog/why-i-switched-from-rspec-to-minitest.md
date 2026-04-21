---
title: "Why I Switched from RSpec to Minitest"
description: "RSpec felt like too much ceremony for a solo project. Here's how I migrated 341 tests, what broke, and why simpler was better."
pubDate: 2026-04-01
tags: [rails, testing, minitest, rspec]
project: outfitmaker
---

I loved RSpec. The DSL reads like English, the matchers are expressive, the community is enormous. For three years, every Rails project I touched used RSpec. It was the obvious choice.

Then I spent a Saturday afternoon writing a test for a simple service object in OutfitMaker, something that takes a user's wardrobe and filters it by season. The test file ended up at 87 lines. The implementation was 23 lines. Something felt wrong.

## The ceremony problem

Here's what a typical RSpec test looked like in my codebase:

```ruby
RSpec.describe Wardrobe::SeasonFilter do
  subject(:filter) { described_class.new(user: user, season: season) }

  let(:user) { create(:user) }
  let(:season) { :summer }

  describe '#call' do
    context 'when user has summer clothes' do
      let!(:summer_dress) { create(:clothing_item, user: user, seasons: [:summer]) }
      let!(:winter_coat) { create(:clothing_item, user: user, seasons: [:winter]) }

      it 'returns only summer items' do
        expect(filter.call).to contain_exactly(summer_dress)
      end
    end

    context 'when user has no clothes for the season' do
      let!(:winter_coat) { create(:clothing_item, user: user, seasons: [:winter]) }

      it 'returns an empty collection' do
        expect(filter.call).to be_empty
      end
    end
  end
end
```

And here's the Minitest equivalent I ended up with:

```ruby
class Wardrobe::SeasonFilterTest < ActiveSupport::TestCase
  setup do
    @user = create(:user)
  end

  test "returns only items matching the season" do
    summer_dress = create(:clothing_item, user: @user, seasons: [:summer])
    create(:clothing_item, user: @user, seasons: [:winter])

    result = Wardrobe::SeasonFilter.new(user: @user, season: :summer).call
    assert_equal [summer_dress], result
  end

  test "returns empty when no items match" do
    create(:clothing_item, user: @user, seasons: [:winter])

    result = Wardrobe::SeasonFilter.new(user: @user, season: :summer).call
    assert_empty result
  end
end
```

Same coverage. Half the lines. No mental overhead about `let` vs `let!`, no `subject`, no nested `context` blocks three levels deep.

## The breaking point

The real trigger wasn't aesthetics; it was speed. My RSpec suite had grown to 341 tests. Running them took 48 seconds. Not terrible for a large app, but this was a solo project with maybe 30 models. Something was wrong.

I dug in. The culprits were `let!` statements creating database records I wasn't using, shared contexts that set up half the application state for every single test, and factory chains that built associated records three levels deep.

RSpec doesn't cause this. But it enables it. The DSL makes it so easy to add "just one more context" that you end up with test files that read like a novel but run like molasses.

## The migration

I didn't use any automated tool. I did it manually over four days, about 80 tests per day. The process:

1. Start with models (simplest, fewest dependencies)
2. Move to service objects
3. Then controllers
4. System tests last

Day one: 103 failures before I'd even started converting. These were pre-existing failures I'd been ignoring because RSpec's output made them easy to scroll past. Minitest's stark `F` characters were harder to ignore. I fixed those first.

The actual conversion was mechanical. `describe` becomes a class. `it` becomes `test`. `let` becomes instance variables in `setup`. `expect(x).to eq(y)` becomes `assert_equal y, x` (note the argument order swap, which tripped me up for the first 50 tests).

## What Minitest gives you

**Clarity about what's actually happening.** No magic. `setup` runs before each test. Instance variables are instance variables. Methods are methods. When something fails, the stack trace points to real lines of real code, not DSL internals.

**Speed.** My suite went from 48 seconds to 31 seconds without any other changes. Same tests, same database setup, just less framework overhead. After I cleaned up the test data strategy (a necessary step the migration forced), it dropped to 19 seconds.

**Rails alignment.** Minitest is what Rails ships with. The generators produce Minitest files. The documentation examples use Minitest. The guides assume Minitest. Fighting this default was creating friction I didn't need.

**Less decision fatigue.** With RSpec, every test involves micro-decisions: `let` or `let!`? `before` or `around`? `shared_context` or `shared_examples`? Custom matchers or built-in ones? Minitest has assertions. You use them. Done.

## What you lose

I won't pretend there's no trade-off.

**Readable output.** RSpec's documentation formatter produces beautiful output. Minitest gives you dots and letters. I miss the formatted output when showing test results to non-developers.

**Custom matchers.** Writing `expect(response).to have_http_status(:ok)` reads better than `assert_response :ok`. But Rails provides its own test assertions that cover 90% of what you need.

**The ecosystem.** `shoulda-matchers`, `vcr`, `webmock`, they all work with Minitest, but the documentation and examples are RSpec-first. You'll spend more time adapting examples.

**Community.** Most blog posts, most tutorials, most Stack Overflow answers assume RSpec. If you're learning Rails, this matters. For me, working solo on a product I already understand, it doesn't.

## Six months later

My test suite is at 412 tests now (71 more than when I started). It runs in 22 seconds. Every single test is explicit about what it creates, what it calls, and what it asserts. No shared state leaking between tests, no mystery failures from `let!` evaluation order.

The biggest win isn't speed or line count; it's that I actually run my tests more often. When your suite is fast and the output is clear, you run it after every change. When it's slow and noisy, you run it before commits and hope for the best.

For a solo developer building a product, that difference matters more than any DSL elegance.

Would I use RSpec on a team project with junior developers who need the readable output? Probably. Would I use it again on a solo project? No. Minitest does everything I need with less between me and my code.

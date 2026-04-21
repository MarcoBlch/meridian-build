---
title: "Rails 8 Migration on a Live Product"
description: "Upgrading from Rails 7.1.5 to 8.1 with paying users. The strategy, the gotchas, and why I fixed 103 test failures before touching the Gemfile."
pubDate: 2026-04-14
tags: [rails, upgrade, migration, testing]
project: outfitmaker
---

OutfitMaker had been running Rails 7.1.5 since its first commit. For four months, I'd been adding features, fixing bugs, and accumulating technical debt without touching the framework version. Rails 8.0 came out. Then 8.1. The gap was widening.

I had paying users now (well, one). I couldn't afford a broken deploy. I also couldn't afford to fall further behind. Rails 8 brought real improvements I wanted (Solid Queue replacing Sidekiq, built-in authentication generator, better Turbo integration). The upgrade was overdue.

Here's how I did it without breaking anything.

## The state of things before

- Rails 7.1.5
- Ruby 3.3.0
- 341 tests (Minitest)
- 103 tests failing (yes, really)
- PostgreSQL 16 with pgvector extension
- Deployed on Railway
- One paying customer

Those 103 failing tests haunt me as I type this. I'd been ignoring them for weeks. Some were outdated after feature changes. Some had flaky factory setups. Some were testing code that no longer existed. I ran the suite rarely enough that the failures had accumulated without pressure to fix them.

## Step 1: Fix the tests first

This might sound backwards. "Fix tests before upgrading" means doing two things instead of one. But it's actually doing one thing (establishing a reliable safety net) before doing the dangerous thing.

If your tests are broken before the upgrade, you can't distinguish "this broke because of Rails 8" from "this was already broken." You'll chase ghosts.

I spent three days fixing 103 failures:

- 34 failures: Tests for features I'd removed or rewritten. **Deleted.**
- 28 failures: Factory associations that had drifted from the schema. **Updated factories.**
- 22 failures: Flaky tests depending on database ordering. **Added explicit `.order()` calls.**
- 11 failures: Assertions using old API responses after I changed serializers. **Updated assertions.**
- 8 failures: Genuinely broken code that tests correctly identified. **Fixed the code.**

Those last 8 were real bugs. In production. That paying users could hit. The test suite was trying to tell me about them for weeks, and I'd been ignoring the signal because it was drowned in noise.

After three days: 341 tests, 0 failures, 0 errors. Green suite. Now I could upgrade.

## Step 2: The Gemfile change

The actual upgrade started small:

```ruby
# Before
gem "rails", "~> 7.1.5"

# After
gem "rails", "~> 8.1"
```

Then `bundle update rails`. This pulled in new versions of every railties component: actionpack, activerecord, activestorage, all of them.

First attempt: bundle failed. `pg` gem version conflict. Updated `pg` to `~> 1.5`. Bundle succeeded.

## Step 3: Run `rails app:update`

This interactive command walks you through config file updates. For each changed file, it asks whether to overwrite or skip. My approach:

- **`config/application.rb`**: Keep mine, manually add new config options
- **`config/environments/*.rb`**: Accept the new defaults, then re-apply my customizations
- **`config/initializers/*.rb`**: Case by case. Mostly kept mine.
- **`bin/*`**: Accept all new versions
- **`config/routes.rb`**: Never overwrite (obviously)

The key files that changed meaningfully in Rails 8:

- `config/environments/production.rb` (new caching defaults)
- `config/initializers/new_framework_defaults_8_0.rb` (opt-in to new behaviors one at a time)
- `config/database.yml` (new connection pool settings)

## Step 4: The new framework defaults file

Rails generates a `new_framework_defaults_8_0.rb` file that lets you opt into breaking changes incrementally. Each line enables one new behavior. I went through them one by one:

```ruby
# Uncommented one at a time, ran tests after each
Rails.application.config.active_record.default_column_serializer = JSON
Rails.application.config.active_record.run_after_transaction_callbacks_in_order_defined = true
Rails.application.config.active_support.to_time_preserves_timezone = :zone
```

Three of these broke tests. Each time: fix the test (or the code), re-run, continue. Took about two hours.

## The pgvector gotcha

This was the only real problem. OutfitMaker uses pgvector for clothing item embeddings (used for "find similar items" search). After upgrading, my migration that creates the vector column started failing:

```
PG::UndefinedObject: ERROR: type "vector" does not exist
```

The issue: Rails 8 changed how it handles custom PostgreSQL types during schema load. The `enable_extension "vector"` in my schema needed to be `enable_extension "pgvector"` with newer versions of the pgvector extension. Additionally, the extension loading order changed.

The fix was a two-line change in `db/schema.rb`:

```ruby
# Before
enable_extension "vector"

# After  
enable_extension "pgvector"
```

And ensuring the extension is enabled before any table that uses vector columns. This took me 45 minutes to debug because the error message didn't clearly indicate it was an extension naming issue.

## Step 5: Run the test suite

After all framework defaults were enabled and pgvector was fixed:

```
341 tests, 0 failures, 0 errors
```

Green. Every single test passed. The three days I'd spent fixing tests before the upgrade paid for themselves here. I had absolute confidence that the upgrade didn't break anything.

## Step 6: Test manually

Tests don't catch everything. I spent an hour manually testing:

- User registration and login
- Photo upload and AI processing
- Outfit generation (the critical path)
- Stripe subscription flow
- PWA installation
- Mobile layout

Everything worked. One visual regression in the mobile menu (a CSS class name change in a Turbo Frame) that took 5 minutes to fix.

## Step 7: Deploy

Railway deploys from a git push. I pushed to a staging branch first, ran through the manual test suite again on the deployed version, then merged to main.

Total downtime: zero. Railway does rolling deploys, and since this was just a framework version bump with no database migrations, the new version slotted in seamlessly.

## What Rails 8 gives me

Now that I'm on 8.1, I can progressively adopt:

**Solid Queue**: Replace Sidekiq (and its Redis dependency) with a database-backed job queue. One fewer infrastructure component. I haven't migrated yet, but it's next.

**Built-in authentication**: I'm using Devise currently. Rails 8's built-in auth generator is simpler and has no gem dependency. Future consideration for new projects.

**Kamal 2**: Better deployment tooling if I move away from Railway.

**Improved Turbo**: Better morphing, smoother page transitions, fewer full-page reloads.

## The lessons

**Fix your tests before major changes.** It's not wasted time; it's building the foundation for confidence. Those three days weren't "test maintenance." They were "upgrade insurance."

**Go incremental.** The `new_framework_defaults` file exists for a reason. Enable things one at a time. Run tests after each. Don't flip everything at once and then try to debug 15 failures simultaneously.

**Custom extensions are the risk.** Standard Rails upgrades are smooth. It's the non-standard stuff (pgvector, custom database types, unusual gem combinations) that creates friction. Know your non-standard dependencies before starting.

**Staging environments matter.** I almost deployed directly to production. The mobile menu bug would have been embarrassing (not catastrophic, but embarrassing). Testing on a staging deployment caught it.

**One paying customer changes your risk calculus.** When the app was free with 40 casual users, I'd have YOLO'd the upgrade directly to main. With revenue on the line, I went careful. That carefulness (fix tests first, incremental defaults, staging deploy) should have been my approach from the start.

The whole upgrade took five days: three for test fixes, one for the upgrade itself, one for testing and deployment. If my tests had been green from the start, it would have been two days. The Rails upgrade framework is well-designed for incremental adoption. The hard part isn't the framework; it's the state of your own codebase.

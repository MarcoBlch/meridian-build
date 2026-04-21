---
title: "Building in Public While Still Learning"
description: "The tension between sharing your work and not feeling like an expert. How one Reddit post brought 40 users in 24 hours."
pubDate: 2026-04-05
tags: [indie-hacker, building-in-public, mindset]
---

I almost didn't post it.

The app had been live for two weeks. Forty-seven tests, maybe twelve features that actually worked, a UI that looked like a developer designed it (because a developer designed it). I'd been lurking on r/rails for months, absorbing knowledge, never contributing. The idea of posting my own work there felt presumptuous.

But I'd seen other people share early-stage projects. Some got roasted. Most got ignored. A few got genuine, useful feedback. The worst case scenario was silence, and silence was already my default.

So I wrote a post: "I built an AI wardrobe app with Rails 8 + Hotwire. Here's what I learned."

## What happened next

Within an hour: 5 upvotes, 2 comments asking about the AI integration. Within six hours: 12 upvotes, a detailed comment from someone who'd built something similar and had suggestions about my image processing pipeline. Within 24 hours: 29 upvotes, 12,000 views, and 40 new user signups.

Forty users. From one Reddit post. I'd spent three weeks before that trying to get traffic through SEO articles that generated maybe 2 clicks per day. One authentic post about what I'd built and learned did more in a day than all that content marketing combined.

## The tension

Here's what nobody tells you about building in public: the hardest part isn't the public part. It's the building part happening simultaneously with the learning part happening simultaneously with the sharing part.

When you're a solo developer learning as you go, every post feels like a confession. "Here's how I solved X" carries an implicit "...and I'm not sure it's the right way." You're not an authority. You're a student with a blog.

I've read the advice: "Share your journey, not your expertise." "People connect with honesty." "Your beginner perspective is valuable to other beginners." All true. All easier to believe in theory than in practice when you're staring at the submit button.

## What I've learned about sharing

**People respond to specifics, not generalities.** "I built an app" gets ignored. "I built an AI wardrobe app that uses Gemini's multimodal API to analyze fabric texture, and here's the prompt that worked after twelve iterations" gets engagement. The more specific and technical you are, the more useful the post is, and the less it feels like self-promotion.

**Honesty about failures outperforms polished success stories.** My most-engaged posts aren't about features I shipped. They're about bugs that took me three days to find, architectural decisions I reversed, and marketing strategies that completely flopped. People are drowning in "10x your growth" content. They're hungry for "here's what actually happened."

**Timing matters less than you think.** I agonized over whether my project was "ready" to share. It wasn't. It never would be. The r/rails post happened when the app was frankly embarrassing: no onboarding flow, broken mobile layout, placeholder copy everywhere. Nobody cared. They cared about the technical decisions and the honest reflection.

**The feedback loop is real.** Those 40 users from Reddit didn't just validate the product; they validated the direction. Three of them sent detailed feature requests. One found a critical bug in my image processing that I'd missed for weeks. Another suggested the PWA approach that I ended up implementing. Building in public isn't just marketing; it's free product management.

## The uncomfortable part

Not everything was positive. One commenter pointed out (correctly) that my database schema was inefficient. Another said the UI "looked like a homework assignment." A third questioned whether anyone would actually pay for this.

These stung. But they were also right, or at least partially right. The schema comment led me to add proper indexes that cut query time by 60%. The UI criticism pushed me to hire a designer for the logo and color scheme. The payment skepticism motivated me to launch the premium tier sooner rather than waiting for "perfection."

The key insight: public criticism of a public project is different from rejection of you as a person. It took me a few weeks to internalize this, but once I did, negative feedback became as useful as positive feedback. More useful, actually, because positive feedback doesn't tell you what to fix.

## The rhythm I've settled into

I post roughly once a week. Sometimes it's a technical deep-dive (these do best on r/rails and Hacker News). Sometimes it's a numbers update (these do best on Twitter/X and indie hacker communities). Sometimes it's a meta-reflection like this one (these do best on my own blog where people come for the voice, not the topic).

I don't have a content calendar. I don't schedule posts. I don't optimize for engagement. I write about whatever I learned that week that surprised me or changed my approach. If nothing surprised me, I don't post. Consistency matters less than quality, especially at my scale.

## The compounding effect

Six months of building in public has produced something I didn't expect: a body of work that speaks for itself. When I reach out to potential collaborators, I can point to months of consistent, honest documentation of my process. When users find OutfitMaker through a blog post, they arrive with context about who built it and why. When I'm stuck on a problem, I can reference my own earlier posts to see how I solved similar issues.

This isn't a "10x growth hack." My blog gets maybe 200 readers per post. My Twitter has 340 followers. These aren't impressive numbers by any metric. But they're real people who know what I'm building, why I'm building it, and what I've learned along the way. That's worth more than 10,000 followers who've never read past a headline.

## Advice I'd give myself six months ago

Start before you're ready. Post before you're confident. Share before you're successful. The worst that happens is silence, and silence was your starting point anyway. The best that happens is you find your people, the ones who are building similar things, facing similar problems, and willing to help you get better.

You don't need to be an expert to build in public. You just need to be honest about where you are.

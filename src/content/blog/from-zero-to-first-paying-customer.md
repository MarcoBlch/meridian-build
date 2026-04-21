---
title: "From Zero to First Paying Customer"
description: "First commit to first €7.99. The timeline, the numbers, what worked and what didn't on the path to revenue."
pubDate: 2026-04-12
tags: [indie-hacker, revenue, saas, building-in-public]
project: outfitmaker
---

On March 14th, 2026, someone in Lisbon paid €7.99 for a Premium subscription to OutfitMaker.ai. I was in bed, half-asleep, when the Stripe notification lit up my phone. I stared at it for a full minute, convinced it was a test transaction I'd forgotten about.

It wasn't. Someone I'd never met, in a country I'd never been to, decided my product was worth paying for. After four months of building, three of those with the app live and free, the number in Stripe was no longer €0.00.

This is the story of that journey. Not a growth playbook; the numbers are too small for that. Just an honest accounting of what happened between the first commit and the first euro.

## The timeline

**November 2025**: First commit. Basic Rails app, user auth, clothing item CRUD. No AI yet. I was just trying to build a digital closet.

**December 2025**: Added AI outfit suggestions using text-only Gemini prompts. The results were mediocre but functional. Showed it to three friends. Two said "cool" and never used it again. One said "the suggestions are kind of obvious." He was right.

**January 2026**: Launched on a free hosting tier. Shared on r/rails. Got 40 users in 24 hours (the Reddit post). Most signed up, uploaded 2-3 items, and never came back. Retention was terrible.

**February 2026**: Shipped multimodal AI (actual photos to Gemini), PWA support, and a proper onboarding flow. Quality improved dramatically. Started seeing users come back daily.

**March 2026**: Added multilingual support (5 languages), Premium tier with Stripe, and started writing SEO content seriously. Paid directories, comparison articles, how-to guides.

**March 14, 2026**: First paying customer.

## The numbers at first payment

- Total users: 47
- Weekly active users: 12
- Daily active users: 4-6
- Google Search impressions: 1,024
- Google Search clicks: 31
- Blog posts published: 8
- Total development time: ~400 hours
- Revenue to date: €7.99

Not exactly a rocketship. But real.

## What worked

### Reddit (r/rails, r/webdev)

My single biggest acquisition channel. One post on r/rails brought 40 users. A follow-up comment in an r/webdev thread about AI apps brought 5 more. The pattern: share something technically interesting, include a link to the live product. Don't hard-sell. Let curiosity drive clicks.

Total users from Reddit: ~45 (95% of my user base came from two posts).

### SEO comparison articles

I wrote "OutfitMaker vs. Cladwell vs. Acloset," a genuine comparison of AI wardrobe apps. It ranks on page 2 for several long-tail keywords and generates 2-3 clicks per day. Small, but consistent and growing. The article was honest about competitors' strengths, which I think Google (and users) rewarded.

### The free tier being genuinely useful

My free tier isn't a crippled demo. Users get real wardrobe management, real AI suggestions (limited to 3/day), real value. The paying customer from Lisbon used the free tier for three weeks before upgrading. She hit the daily limit, found it frustrating, and paid. That's the conversion path I designed for: provide value first, create natural friction second.

### GEO / AI referrals

15-25 visits per week from ChatGPT, Copilot, and Perplexity. Small numbers, but with a 12% conversion rate to signups. These users arrive with high intent; they've already described their need to an AI, and the AI sent them to me.

## What didn't work

### Paid directories

I submitted OutfitMaker to 15+ product directories (Product Hunt alternatives, SaaS directories, AI tool aggregators). Total traffic from all of them combined: 7 visits. Cost: 3 hours of submission work plus $49 for "featured" placement on one directory.

Return on investment: essentially zero. These directories have tiny audiences and the traffic they send doesn't convert. I'd have been better off spending those 3 hours writing one blog post.

### Social media posting (Twitter/X)

I posted 3-4 times per week about OutfitMaker on Twitter. Impressions ranged from 50 to 200. Clicks: 0-2 per post. I have 340 followers, mostly indie hackers who follow back as a courtesy. The audience isn't there yet, and building a Twitter audience from zero takes months of consistent presence.

I haven't abandoned Twitter; the compounding effect is real if you stick with it, but as a short-term acquisition channel for a brand new account, it's near-zero ROI.

### Google AdSense experiment

I ran €20 worth of search ads targeting "AI wardrobe app" and related keywords. Cost per click: €1.80. Clicks: 11. Signups from those clicks: 1. Cost per acquisition: €20 for one free user who never came back.

At this scale, paid acquisition doesn't make mathematical sense. My product costs €7.99/month. Even with perfect retention, I'd need 3 months to recoup one acquired user. The economics only work at scale with high retention, neither of which I have yet.

## What I'd do differently

**Launch the paid tier earlier.** I waited three months to add Premium because I wanted the free product to be "good enough" first. But I could have launched payments in month two. The user who eventually paid had been ready to pay for weeks. I just hadn't given her the option.

**Focus on one acquisition channel.** I scattered effort across Reddit, Twitter, SEO, directories, and ads. Reddit worked. Everything else was noise at this stage. I should have doubled down on what worked (community engagement, technical content) and ignored the rest until I had more users to learn from.

**Build in public from day one.** My first Reddit post was at month three. If I'd been sharing from the start (weekly updates, technical learnings, honest numbers), I'd have built an audience alongside the product. The two compound each other.

## What one paying customer means

€7.99/month won't pay my rent. It barely covers the Gemini API costs for that one user. Economically, it's insignificant.

But psychologically, it changes everything. Before: "I'm building a side project." After: "I'm running a product that people pay for." The difference sounds trivial. It isn't.

One paying customer proves:
- The problem is real (someone has it and will pay to solve it)
- The product works (it delivers enough value to justify €7.99)
- The funnel works (someone found it, tried it, loved it, paid)
- The pricing works (€7.99 isn't too high for the value delivered)

Each of these was an assumption before March 14th. Now they're validated. Not at scale. Not with statistical significance. But validated enough to keep going.

## What's next

The path from 1 to 10 paying customers is probably different from the path from 0 to 1. I need:
- Better retention (more reasons to open the app daily)
- More users at the top of the funnel (SEO is the long game)
- A sharper free-to-paid conversion trigger
- Social proof (testimonials, case studies)

But those are tomorrow's problems. Today, I'm a solo developer with one customer in Lisbon who thinks my product is worth €7.99 per month. That's enough to keep building.

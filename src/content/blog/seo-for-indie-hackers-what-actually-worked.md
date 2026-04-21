---
title: "SEO for Indie Hackers: What Actually Worked"
description: "Real data from 4 months of SEO effort on OutfitMaker. The strategies that moved the needle and the ones that wasted my time."
pubDate: 2026-04-16
tags: [seo, marketing, indie-hacker, growth]
project: outfitmaker
---

I'll spare you the theory. Every indie hacker blog regurgitates the same SEO advice: "write quality content," "target long-tail keywords," "build backlinks." Here's what actually happened when I tried to get OutfitMaker visible on Google.

## The starting point

Four months ago, OutfitMaker had zero organic traffic. Domain registered in November 2025. Domain authority: 0. Indexed pages: 3 (homepage, login, signup). Google impressions: 0.

Today: 1,024 monthly impressions, 31 clicks, 55 indexed pages, ranking for 47 keywords. Still small. But real growth from a standing start.

## What worked: Comparison articles

My single highest-performing piece of content:

**"OutfitMaker vs Cladwell vs Acloset: AI Wardrobe Apps Compared"**

This one article generates 563 impressions per month. That's 55% of my total impressions from one page.

Why it works:
- People search for "[Product A] vs [Product B]" when they're ready to buy
- There were no good comparison articles for AI wardrobe apps
- I was genuinely honest about competitors' strengths
- The article is 2,400 words with feature tables, pricing comparison, and screenshots

I didn't stuff keywords or write thin affiliate-style content. I wrote the article I wished existed when I was researching the space. Google rewarded that.

Key learning: comparison content for niche categories is vastly underserved. If your product has 2-3 competitors, write the definitive comparison. You'll own that SERP.

## What worked: How-to guides tied to the product

My second-best content category:

- "How to organize your closet with AI" (89 impressions/month)
- "How to build a capsule wardrobe" (67 impressions/month)
- "How to dress well without buying new clothes" (45 impressions/month)

These aren't product marketing. They're genuine guides that happen to link to OutfitMaker as one solution. The reader gets value whether or not they sign up. But 3-4% of readers do click through.

Pattern: solve the user's problem in the article, then mention your product as the tool that automates the solution. Not "use our app!" More like "if you want to automate this process, here's a tool that does it."

## What worked: Multilingual content

OutfitMaker supports 5 languages. I wrote versions of my top articles in French, Spanish, German, and Portuguese. The logic: less competition in non-English SERPs, and my product actually serves those markets.

Results:
- French articles: 112 impressions/month (from ~zero French organic competitors)
- Spanish articles: 78 impressions/month
- German: 43 impressions/month
- Portuguese: 29 impressions/month

Combined non-English impressions: 262/month. That's 25% of my total, from markets where I'm often the only relevant result.

**The canonical tag disaster**: I initially set all translated articles' canonical URLs pointing to the English version. This told Google "these are duplicates of the English page" and suppressed them from non-English results. It took me three weeks to notice. When I fixed the canonical tags (each language version points to itself, with proper `hreflang` attributes), impressions tripled overnight.

This was my most expensive SEO mistake. Three weeks of multilingual content getting zero visibility because of one wrong meta tag.

## What worked: FAQ schema

Adding FAQPage structured data to my main landing pages increased click-through rate noticeably. Google shows FAQ snippets in search results: expandable Q&A sections that take up more SERP real estate.

Before FAQ schema: average CTR 2.1%
After FAQ schema: average CTR 3.4%

The questions I used are genuine user questions from my support inbox and Reddit comments. "Does OutfitMaker work with any phone camera?" "Can I use it offline?" "How is my wardrobe data stored?" Real questions, real answers.

## What didn't work: Programmatic SEO

I tried generating location-based pages: "Best wardrobe app in [City]" for 50 cities. The content was thin (mostly the same with city names swapped), and Google rightfully ignored them. None indexed. None ranked.

Lesson: programmatic SEO works for genuinely location-specific content (restaurant listings, real estate). It doesn't work for products that have nothing to do with location. Don't force it.

## What didn't work: Guest posting

I emailed 12 fashion and lifestyle blogs offering to write guest posts about AI in fashion. Response rate: 0%. Zero replies.

I emailed 8 tech blogs offering to write about Rails development and AI integration. Response rate: 2 replies, both asking for $200-500 for a "sponsored post."

At my scale, the ROI isn't there. One comparison article on my own domain generated more traffic than any guest post could have, and I didn't need anyone's permission to publish it.

## What didn't work: Keyword stuffing blog posts

Early on, I wrote a few posts that were clearly "for SEO" rather than for readers. Titles like "AI Wardrobe App - Best AI Clothing Organizer and Outfit Generator 2026." These ranked briefly for very low-traffic keywords and had terrible engagement metrics (95% bounce rate, 10-second average session).

Google seems to have deprioritized these pages over time. My genuine, reader-first content consistently outperforms the keyword-optimized content. The lesson everyone preaches and few practice: write for humans.

## The position 14 problem

For my primary keyword "AI wardrobe app," OutfitMaker sits at position 14 (second page). So close. One page away from meaningful traffic.

What's ahead of me:
- Positions 1-3: Articles from Vogue, GQ, and Wired about AI fashion technology
- Positions 4-7: Established apps (Cladwell, Cher, the fictional app from Clueless that actually ranks)
- Positions 8-13: Tech review sites, listicles, Reddit threads

What would move me to page 1:
- More backlinks (domain authority is the bottleneck)
- More user engagement signals (longer sessions, return visits)
- More content depth (becoming the definitive resource on the topic)
- Time (newer domains inherently rank lower; this resolves over 12-18 months)

I'm not going to shortcut this. No PBNs, no link farms, no grey-hat tactics. The domain will age, the content will accumulate, and the rankings will improve. Or they won't, and I'll find other channels. SEO is a long game for solo developers.

## The content production system

I publish 2-3 articles per week. Here's the system:

1. **Monday**: Check Google Search Console for queries where OutfitMaker appears but doesn't rank well. These are content opportunities.
2. **Tuesday-Wednesday**: Write one article targeting a gap.
3. **Thursday**: Write one article in a non-English language (translation + localization of a previous English article).
4. **Friday**: Technical blog post about something I built that week (this goes on the Meridian Build blog, linking back to OutfitMaker).

Total time: about 5-6 hours/week on content. It's a significant investment for a solo developer. But organic traffic is free traffic, and free traffic is the only traffic I can afford.

## Four-month summary

| Metric | Month 1 | Month 4 |
|--------|---------|---------|
| Indexed pages | 3 | 55 |
| Monthly impressions | 0 | 1,024 |
| Monthly clicks | 0 | 31 |
| Keywords ranking | 0 | 47 |
| Average position | - | 34.2 |
| CTR | - | 3.0% |

Is this impressive? No. Not by any established site's standards. But it's monotonically increasing, which means the strategy is working. SEO compounds. Month 8 should look significantly better than month 4, and month 12 better than month 8.

The indie hacker SEO game isn't about going viral. It's about building a slow, steady stream of high-intent traffic that compounds over time. One comparison article generating 563 impressions per month will generate those impressions next month too, and the month after that, without any additional work. That's the real value.

Patience. Consistency. Genuine usefulness. That's the whole strategy.

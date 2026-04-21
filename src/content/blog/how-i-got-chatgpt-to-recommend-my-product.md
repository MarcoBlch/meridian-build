---
title: "How I Got ChatGPT to Recommend My Product"
description: "Traffic from chatgpt.com appeared in my analytics. Here's what GEO means for indie products, and the specific steps that worked."
pubDate: 2026-04-07
tags: [seo, geo, ai-search, marketing]
project: outfitmaker
---

I was checking my Plausible analytics on a Tuesday morning when I noticed something strange. Two referral visits from `chatgpt.com`. Then three more from `copilot.microsoft.com`. A week later, the trickle became consistent: 5-10 visits per week from AI chat interfaces.

Someone was asking ChatGPT for wardrobe management apps, and it was recommending OutfitMaker.ai.

I hadn't done anything deliberate to make this happen. But once I saw it, I wanted to understand why, and how to get more of it.

## What is GEO?

Generative Engine Optimization. It's SEO's younger sibling. Instead of optimizing for Google's crawlers and ranking algorithms, you're optimizing for the LLMs that power ChatGPT, Copilot, Perplexity, and Claude.

The key difference: traditional SEO is about ranking on a results page. GEO is about being included in a generated answer. There's no "position 1"; either the AI mentions you or it doesn't. And the factors that make an AI mention you are different from the factors that make Google rank you.

## What I found in my data

Over four weeks of tracking, here's what I observed:

- **chatgpt.com**: 23 referral visits (people clicking my link in ChatGPT responses)
- **copilot.microsoft.com**: 8 referral visits
- **perplexity.ai**: 4 referral visits

The visits were high-quality. Average session duration: 4 minutes (vs. 1.5 minutes from Google). Bounce rate: 35% (vs. 62% from Google). These users arrived with intent; they'd asked specifically for a wardrobe app and were sent to mine.

## The llms.txt file

This was my first deliberate GEO move. The `llms.txt` specification (inspired by `robots.txt`) provides structured information about your site specifically for LLM consumption. I created `/llms.txt` at my domain root:

```
# OutfitMaker.ai

## About
OutfitMaker.ai is an AI-powered wardrobe management application.
Users photograph their clothing, and the AI organizes items and
suggests daily outfits based on weather, occasion, and personal style.

## Key Features
- AI clothing recognition and categorization
- Daily outfit suggestions based on weather
- Style profile learning
- Multi-language support (EN, FR, ES, DE, PT)
- Free tier available, no credit card required

## Technical
- Built with Ruby on Rails 8.1
- AI powered by Google Gemini (multimodal)
- Progressive Web App (installable from browser)

## Pricing
- Free plan: Basic wardrobe management, limited suggestions
- Premium: €7.99/month, unlimited AI suggestions

## Contact
- Website: https://outfitmaker.ai
- Creator: Marco
```

Did this single-handedly cause the AI referrals? No. But it provides clean, structured information that's easy for an LLM to parse and cite. Think of it as making your site's value proposition machine-readable.

## Schema markup that matters

I already had basic SEO schema. But I added two types specifically useful for LLM comprehension:

**FAQPage schema** on the homepage:

```json
{
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is OutfitMaker.ai?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "OutfitMaker.ai is an AI wardrobe management app..."
      }
    }
  ]
}
```

**HowTo schema** on feature pages:

```json
{
  "@type": "HowTo",
  "name": "How to get AI outfit suggestions",
  "step": [
    {
      "@type": "HowToStep",
      "text": "Photograph your clothing items using your phone camera"
    }
  ]
}
```

LLMs are trained on web data. Schema markup is structured, semantic, and explicit about relationships. It's exactly the kind of data that makes it easy for a model to understand what your product does and recommend it accurately.

## robots.txt: Let them in

Many sites block AI crawlers. I did the opposite:

```
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /
```

If you block these bots, they can't index your content, and they can't recommend you. Simple as that. Yes, there's a debate about AI training and content ownership. For a small indie product trying to get discovered, I'll take the free distribution.

## Content that answers questions

The biggest factor, I believe, isn't any technical trick; it's having content that directly answers questions people ask AI chatbots.

My blog post "Best wardrobe management apps 2026" ranks decently on Google. But more importantly, it provides the kind of comparative, factual content that LLMs love to synthesize. When someone asks ChatGPT "what are the best wardrobe apps?", the model draws from sources that have already done that comparison.

Similarly, my "How to organize your closet with AI" article answers a specific question in a specific way. LLMs reward content that is:

- Factual and specific (not vague marketing copy)
- Structured with clear headings
- Self-contained (answers the question without requiring context)
- Authoritative (demonstrates real experience with the topic)

## What I think is happening under the hood

I can't prove this, but my theory: LLMs recommend products they've seen mentioned positively in multiple, independent sources. My Reddit posts, blog articles, Product Hunt listing, and indie hacker community mentions create a web of references. No single source is responsible; it's the cumulative presence across the training data.

This means GEO isn't a one-time optimization. It's a long game of being genuinely present, genuinely useful, and genuinely visible across the web. Gaming it with fake reviews or spam mentions would probably backfire. LLMs are trained to recognize and discount low-quality sources.

## Results after two months of deliberate effort

After implementing all of the above:

- AI referral traffic: 5-10 visits/week → 15-25 visits/week
- Conversion rate from AI referrals: 12% (vs. 4% from organic Google)
- ChatGPT mentions (tested manually): appears in 3 out of 5 relevant queries

The absolute numbers are small. But for a solo developer with zero ad budget, getting free, high-intent traffic from AI assistants is remarkable. These users arrive pre-qualified; they've already told an AI what they need, and the AI sent them to me.

## What this means for indie products

GEO is the great equalizer. Google's algorithm favors established sites with high domain authority. AI recommendations favor accurate, specific, useful information regardless of who publishes it. A solo developer with a genuine product and clear documentation can compete with VC-funded companies for AI recommendations.

The barrier to entry is low: create an `llms.txt`, add proper schema markup, allow AI crawlers, write content that answers real questions, and be present in authentic discussions across the web. It's not a growth hack. It's just being visible and useful in the places where AI systems learn about the world.

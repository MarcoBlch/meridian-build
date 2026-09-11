---
title: "1,791 Pages, Zero Indexed"
description: "A canonical mistake collapsed my tool site from ~1,800 indexed pages to 2. The code was fine. The real fix was not more pages, it was authority."
pubDate: 2026-09-11
tags: [architecture, growth, indie-hacker]
project: tools4free
---

[Tools4Free](https://tools4free.site) is a site of free online tools: calculators, converters, generators. It runs on Next.js with about 1,791 statically generated pages, each targeting a specific long-tail query like "100 mph to km/h" or "what is 7 percent of 100." I opened Search Console expecting slow, steady growth. Instead I got a number that stops you cold: 1,791 URLs submitted in the sitemap, **0 indexed**.

Zero. Not "growing slowly." Not "a few hundred." None.

## The collapse I did to myself

The sitemap had no errors. The pages returned 200. So my first instinct was wrong: this was not a technical break waiting to be found. It was history.

Back in April, I had shipped what I thought was a clever canonical strategy. Every programmatic variant (say `/percent/what-is-10-percent-of-100`) pointed its canonical tag at the parent calculator (`/percentage-calculator`). The idea was to concentrate ranking signals on a few strong pages. What Google actually heard was simpler: "do not index these 1,800 variants, only the parent." Over about six weeks, my indexed pages fell from roughly 1,800 to 2.

I caught it and shipped a fix in May: every programmatic page now declares itself as its own canonical. I verified it in production, view-source, the real HTML: self-referential canonical, no noindex, clean 200. Textbook.

Three months later, still zero.

## Reading the crawl dates, not the code

This is where I stopped staring at my own source and started asking Google what it saw. The URL Inspection API gives you a per-page verdict plus the date of the last crawl, and those dates told the whole story.

The homepage: crawled recently, verdict "Submitted and indexed." Good. A deep converter page: last crawled in July, canonical correct, verdict "Crawled, currently not indexed." A page Google had visited before the fix: still holding the stale pre-fix data, because Google had not come back.

That is the real diagnosis. The fix works everywhere Google actually re-crawled. The problem is that Google mostly stopped re-crawling the site. After I taught it that 1,800 pages were not worth indexing, it quietly deprioritized the crawl budget for the whole domain. And with no backlinks pointing in, nothing was giving it a reason to reconsider. "Crawled, currently not indexed" on a technically clean page is Google's polite way of saying the page is fine but the domain has not earned the shelf space.

## What I changed, and what I stopped believing

I cleaned up the mess I could reach. There were 11 junk sitemap entries lingering in Search Console from an old broken submission; I deleted them and resubmitted the one clean sitemap. Housekeeping, not a cure.

The change I actually believe in is about authority, and it started with the embed widget. The site offers embeddable calculators, and the copy-paste snippet was a bare `<iframe>`. An iframe passes no link equity to the host page, so every embed was pure charity: I gave away a tool and got nothing a search engine could read. So I changed the snippet to ship a visible credit link alongside the frame:

```html
<iframe src="https://tools4free.site/embed/percentage-calculator" ...></iframe>
<p><a href="https://tools4free.site/percentage-calculator" rel="noopener">Percentage Calculator</a> by <a href="https://tools4free.site" rel="noopener">Tools4Free</a></p>
```

Now every site that embeds a tool emits a real, followed link to the canonical page. That is the thing the domain has been missing.

## The takeaway

Two lessons, both paid for in indexed pages.

First: a canonical tag is an instruction, not a suggestion, and pointing thousands of pages away from themselves is a fast way to tell Google to forget you exist. If you run programmatic pages, each one is its own canonical, full stop.

Second, and this is the one that actually matters: for a young programmatic site, the bottleneck is almost never more pages. It is authority. I had 1,791 well-built pages and no reason for anyone, human or crawler, to trust them. The fix for that is not in the codebase, it is off it, in the links and mentions that tell Google the domain is worth the crawl. I wrote more about that reality in [what actually moved the needle on SEO](/blog/seo-for-indie-hackers-what-actually-worked/).

I would love to end this with a recovery chart. I can't yet. The junk is cleared, the sitemap is clean, the first real backlinks are going in, and now it is a waiting game on the crawler. The honest status is: I understand exactly why it broke, I have stopped digging, and I am rebuilding trust one link at a time.

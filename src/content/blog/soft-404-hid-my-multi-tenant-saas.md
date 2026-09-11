---
title: "The Soft 404 That Hid My Multi-Tenant SaaS From Google"
description: "Search Console flagged Soft 404s across all three domains of my church-website SaaS. The culprit was a tenant page that returned 200 with a 'not found' message. The fix was one line in the right file."
pubDate: 2026-09-11
tags: [frontend, architecture, bugs]
project: eglise
---

Google Search Console has a category that sounds harmless and is not: "Soft 404." It means Google fetched a page, got an HTTP 200, and then decided the content looks like an error anyway. So it quietly refuses to index it. I opened GSC one morning for [Eglise en Ligne](https://egliseenligne.fr), my church-website SaaS, and found the report filling up with them across all three of my domains.

## The setup: one codebase, many faces

Eglise en Ligne is multi-tenant and multi-domain. Each church gets its own public site on a subdomain (`demo.egliseenligne.fr`), and the marketing site runs on three country domains: [egliseenligne.fr](https://egliseenligne.fr) for France, [iglesiaenlinea.es](https://iglesiaenlinea.es) for Spain, and [igrejaemlinha.pt](https://igrejaemlinha.pt) for Portugal. It is a Next.js App Router project, and a middleware decides, per request, whether a hostname is a tenant church or a marketing domain, injecting `x-church-*` headers when it is a tenant.

The tenant public pages live under a `[locale]` route group. On a real church subdomain the middleware sets a church context, and the page renders that church. So far so good.

## The bug: a 200 that means "nothing here"

The problem showed up when Google crawled tenant-shaped URLs on the marketing domain, like `egliseenligne.fr/fr` or `egliseenligne.fr/blog`. Those paths match the `[locale]` route, but there is no church context on a marketing domain. Here is what the page did in that case:

```tsx
const church = await getChurchContext();
if (!church) return <div>Church not found</div>;
```

Read that closely. When there is no church, it returns a div. A div is a successful render, so the response is HTTP 200. To a visitor it says "Church not found." To Googlebot it says "200 OK, here is your content," and the content is a bare error message. That is the textbook recipe for a Soft 404, and it was happening on every locale path, on all three ccTLDs at once.

Worse, these pages carried `robots: index, follow`, so I was actively inviting Google to crawl pages that were pure noise. Crawl budget I did not have to spare was going to `/fr`, `/es`, `/blog`, `/fr/events`, and friends.

## The fix: return a real 404

The honest signal for "this page does not exist" is a 404 status, not a 200 with sad text. Next.js gives you exactly that with `notFound()` from `next/navigation`. The trick was choosing where to put it. Instead of patching every tenant page, I put one guard in the `[locale]` layout, which wraps all of them:

```tsx
import { notFound } from 'next/navigation';

const church = await getChurchContext();
// No church context means a tenant route was hit on the marketing domain.
// Return a real 404 instead of a 200 "not found" page.
if (!church) notFound();
```

One line, one file, every tenant sub-page covered at once. Real church subdomains are untouched, because the middleware still injects their church context, so `getChurchContext()` returns a church and the guard never fires. After deploy I checked all three domains, and `/fr` now returns a clean 404 on each, while the marketing pages keep their 200. This is the same "fix it at the layer that owns the concern" instinct I wrote about in [why every funnel event read zero](/blog/why-every-funnel-event-read-zero/): the bug repeated across many files, so the fix belonged above all of them, not inside each one.

## The takeaway

A 200 is a promise. It tells crawlers "this is a real page worth keeping." If your code can render an empty or error state, make sure that state carries the status code that matches the truth. On a multi-tenant app the trap is sneaky, because the exact same route is a real page on one hostname and nothing on another. Guard it once, at the boundary, and let the framework send the right signal.

Two days after shipping this, the Soft 404 count in Search Console started draining on its own. The pages were finally telling Google the truth.

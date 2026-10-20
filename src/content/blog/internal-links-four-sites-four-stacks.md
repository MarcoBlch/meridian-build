---
title: "Contextual Internal Links on Four Sites, Four Stacks, One Day"
description: "One old SEO tip, applied to a Rails app, an Astro blog, a prerendered Vite SPA and a multilingual Next.js site. Same idea every time, a different trap in each stack."
pubDate: 2026-10-20
tags: [seo, architecture, indie-hacker]
---

There is an SEO tip that gets repeated so often it sounds like folklore. Search Google for `site:yourdomain.com "keyword"`. Every page that comes back mentions the keyword. Go into those pages and turn the mention into a link, with the keyword as anchor text, pointing at the page that is supposed to rank for it.

I had read it a dozen times and never done it properly. My internal links lived where most indie sites keep them: footers, "related tools" cards, a grid on the home page. On October 17 I finally sat down and did it on all four of my sites in one day. They run on four different stacks, so the idea stayed the same but the implementation changed every time, and each stack had its own trap.

## Why bother

The trigger was [OutfitMaker](https://outfitmaker.ai). I had built a set of intent pages, one per query: `/outfit-builder`, `/outfit-planner`, `/what-should-i-wear-today`, `/wardrobe-management-software` and so on. Search Console told me two things. Most of them sat in "Discovered, currently not indexed", and 96% of my clicks landed on the home page. Google was answering "outfit builder" with my home page because nothing on the site told it a better page existed. The only links pointing at those pages were in places Google treats as navigation boilerplate.

A link inside a sentence is a different signal. It says "this paragraph is about X, and that page is where X lives." So the rules I set for all four sites were simple:

- Only link from text that already talks about the target topic. No new paragraphs written to host a link.
- Use the exact keyword as anchor once per target, natural variants everywhere else. Fifty identical anchors look like what they are.
- No footers, no "related" blocks. Inside the copy or nothing.

## Rails: OutfitMaker

The copy for the landings, the comparison pages and the style guides lives in Ruby hashes and YAML. I did not want HTML in YAML, and I did not want `html_safe` anywhere near user-facing strings. So I borrowed the Markdown link shape and parse it at render time:

```ruby
module InlineLinks
  PATTERN = %r{\[([^\[\]]+)\]\((/(?!/)[^\s()]*)\)}

  module_function

  def strip(text)
    text.to_s.gsub(PATTERN, '\1')
  end
end
```

The regex only matches paths that start with a single slash. `//evil.com` or `https://...` never become links; they stay as plain text. Then the helper:

```ruby
def inline_links(text)
  text = text.to_s
  parts = []
  last = 0
  text.scan(InlineLinks::PATTERN) do
    match = Regexp.last_match
    parts << text[last...match.begin(0)]
    parts << link_to(match[1], match[2], class: INLINE_LINK_CLASS)
    last = match.end(0)
  end
  parts << text[last..]
  safe_join(parts)
end
```

This is the part I care about most. `safe_join` escapes every plain string segment, and `link_to` escapes the anchor text. Nothing is ever marked safe by hand, so a stray `<script>` in the copy renders as text. The copy itself now reads like this:

```ruby
"Save the outfits you like and [come back to them on the day](/outfit-planner)."
```

`InlineLinks.strip` exists because some places must not get markup: the FAQ JSON-LD and image `alt` attributes get the plain sentence.

Two details took longer than the code. First, the target pages exist in English only, so only `en.yml` got links. A test checks that the French, Spanish, Portuguese and German copy has no link markup at all, and another checks that every linked path resolves to a real English page.

Second, the blog. OutfitMaker's blog posts live in the database, not in files, so I could not just edit Markdown in the repo. I wrote a small service with 18 entries, each one "find this exact sentence fragment, wrap this phrase in a link", plus a rake task:

```ruby
Link.new(find: "Let the app build combinations from existing pieces.",
         anchor: "build combinations from existing pieces",
         path: "/outfit-builder")
```

Posts are matched by body text, not by slug. I had already been burned by FriendlyID rewriting seeded slugs from the title, so slugs in my seed files are not trustworthy. The task only touches `body`, never the title, so slugs stay put. It is idempotent: a fragment that is already linked is skipped, a post that already links the target is skipped, and a fragment that changed since the seed is reported as `not_found` instead of forced. I ran it with `DRY_RUN=1` first, then for real on production. All 18 fragments went in.

In total: 67 contextual links toward 11 intent pages, from the home page, the style guides, the comparison pages, the landings themselves and 18 blog posts.

## Astro: this blog

The blog you are reading was the easy one. Posts are Markdown files, so a contextual link is just a Markdown link. No component, no parser.

The work here was choosing targets, not writing code. I gave priority to posts that had zero or one inbound links. That produced 28 new links. For example, my post about [a canonical mistake that deindexed 1,791 pages](/blog/1791-pages-zero-indexed/) now links to the soft 404 post from the sentence "The pages returned 200", because that is exactly the bug the other post is about.

One small thing to watch: trailing slashes. My post URLs end with a slash, `/blog/slug/`, and I found an older link written without it. I fixed it so every internal link matches the canonical URL exactly.

## React and Vite: FastPass

[FastPass](https://fastpass.email) is a Vite SPA with a prerender step. Here a link is a JSX element, so I made a tiny component to keep every in-text link styled the same, light and dark mode included:

```tsx
const InlineLink = ({ to, children }: InlineLinkProps) => (
  <Link to={to} className="text-green-600 dark:text-green-400 underline ...">
    {children}
  </Link>
);
```

And in the page:

```tsx
Someone who pays to reach you has thought about{' '}
<InlineLink to="/get-paid-to-answer-questions">what they want to ask</InlineLink>
{' '}and how to ask it.
```

The trap in this stack was not the link. While adding them, I noticed that seven of the landing pages I was linking from were not in the prerender list at all. They only existed after JavaScript ran. Links inside a page that a crawler may only see as an empty shell are worth a lot less. So the same PR added those seven routes to `vite.config.ts` and to the build sitemap script:

```ts
'/paid-inbox',
'/monetize-your-dms',
'/freelancer-inbox-monetization',
// ...four more
```

If this sounds familiar, it is the same class of bug I wrote about when [my sitemap advertised 11 pages and the site had 56](/blog/sitemap-advertised-11-pages-site-had-56/): two lists that are supposed to describe the same site, quietly drifting apart. After the fix the build emitted the seven landings as static HTML with their links in it, and the build sitemap went to 66 URLs.

## Next.js, three languages: Église en Ligne

[Église en Ligne](https://egliseenligne.fr) builds websites for churches and runs in French, Spanish and Portuguese, each language on its own domain and with its own slugs. The parish website guide is `/site-internet-paroisse` in French, `/pagina-web-parroquia` in Spanish and `/site-paroquia` in Portuguese.

A hardcoded `/site-internet-paroisse` in the copy would send Spanish readers to a French URL. The site already had a route map used by the sitemap and hreflang:

```ts
parishGuide: { fr: '/site-internet-paroisse', es: '/pagina-web-parroquia', pt: '/site-paroquia' },
```

So the copy points at a route key instead of a path, and the href is resolved per market:

```ts
const INLINE_LINK = /\[([^\]]+)\]\(route:([A-Za-z]+)\)/g

// inside parseInlineLinks(text, market)
const route = MARKETING_ROUTES[key]
segments.push(route ? { text: anchor, href: route[market] } : anchor)
```

A string in Spanish looks like `Junta [la información básica](route:parishGuide): horarios de culto, dirección...` and can never link to the wrong language. An unknown key degrades to plain text instead of a broken link. Each language got five links to its guide, from the home page, features, pricing and the "create a church website" guide, plus one to the features page from the hero.

The real surprise was the FAQ. It was an accordion, and the answers were rendered like this:

```tsx
{isOpen && (
  <div>...</div>
)}
```

Collapsed answers were not in the server HTML at all. Not the text, and not the links I was adding to them. The fix keeps them in the DOM and hides them:

```tsx
<div className="px-5 pb-5 pt-0" hidden={!isOpen}>
  <p><InlineLinks text={item.answer} market={market} /></p>
</div>
```

Same behavior for the visitor, but the answers are now in the HTML a crawler receives. As on the Rails side, a `stripInlineLinks` function feeds the FAQ JSON-LD so structured data gets plain sentences without markup. I checked the rendered HTML on each of the three domains before merging.

## What the four have in common

Looking at the four PRs side by side, the pattern is clearer than any single one:

1. **Keep links in the copy as data, not HTML.** `[anchor](/path)` in Rails, `[anchor](route:key)` in Next.js. Content stays readable and the renderer decides what is safe.
2. **Always have a strip function.** JSON-LD, alt text and meta tags want the sentence, not the markup. I needed it in both stacks that parse links.
3. **Check what the crawler actually receives.** Two of the four sites had content that was invisible to a plain HTML fetch: unprerendered routes in one, unmounted FAQ answers in the other. The links would have been useless there without the fix, and I only found both because I was adding links.
4. **Vary the anchors.** One exact match per target, then natural phrases.

## Early signal, with caveats

On October 9, I inspected five OutfitMaker intent pages in Search Console's URL Inspection tool and only one was indexed. On October 20, three days after the links went live, I inspected twelve and ten came back "Submitted and indexed".

I would love to say the links did it. I can't, at least not yet. It is a correlation over a short window, and it is not a clean experiment: around the first check I also rewrote the thin landings, shipped new intent pages and resubmitted the sitemap. Any of those could be doing the work, and it is most likely a mix. Indexed also does not mean ranking. What I actually care about is clicks going to the right page instead of the home page, and I will measure that in early November once there is enough data to be worth reading.

What I can say is that it was one day of work across four codebases, nothing in it was clever, and two of the four sites had a crawlability problem I would not have found otherwise. That alone made the `site:` search worth running.

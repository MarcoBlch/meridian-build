# Meridian Build

Portfolio site and technical blog for Meridian Build, an indie dev studio run by Marco. Built with Astro, deployed on Cloudflare Pages.

**Live at:** https://meridianbuild.dev

## Quick start

```bash
npm install
npm run dev      # Start dev server at localhost:4321
npm run build    # Build static site to ./dist
npm run preview  # Preview production build locally
```

## Deploy to Cloudflare Pages

1. Push this repo to GitHub
2. Go to [Cloudflare Pages](https://pages.cloudflare.com)
3. Create a new project, connect your GitHub repo
4. Build settings:
   - Framework preset: Astro
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Deploy

Cloudflare Pages will auto-deploy on every push to `main`.

## Adding a new blog post

Create a file in `src/content/blog/`:

```markdown
---
title: "Your Post Title"
description: "Used as meta description and in post cards"
pubDate: 2026-05-01
tags: [rails, testing]
draft: false
project: outfitmaker  # optional — links to a project slug
hero: "/images/post-hero.jpg"  # optional
updatedDate: 2026-05-02  # optional
---

Your markdown content here...
```

### Frontmatter fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | yes | Post title |
| description | string | yes | Meta description, shown in cards |
| pubDate | date | yes | Publication date |
| tags | string[] | yes | Tags for filtering |
| draft | boolean | no | If true, excluded from build |
| project | string | no | Related project slug |
| hero | string | no | Hero image path |
| updatedDate | date | no | Last updated date |

## Adding a new project

Create a file in `src/content/projects/`:

```markdown
---
name: "Project Name"
tagline: "One-liner description"
description: "Longer description for meta tags"
url: "https://project.com"
status: "live"  # live | beta | building | paused
stack: ["Rails", "TypeScript", "PostgreSQL"]
featured: true  # show on homepage
order: 1  # sort order on projects page
logo: "/images/project-logo.svg"  # optional
hero: "/images/project-hero.jpg"  # optional
---

Full markdown description of the project...
```

### Frontmatter fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Project display name |
| tagline | string | yes | Short one-liner |
| description | string | yes | Meta description |
| url | string | yes | Link to live product (use "#" if not live) |
| status | enum | yes | live, beta, building, or paused |
| stack | string[] | yes | Tech stack tags |
| featured | boolean | no | Show on homepage (default: false) |
| order | number | no | Sort order (default: 0) |
| logo | string | no | Path to logo |
| hero | string | no | Path to hero image |

## How drafts work

Set `draft: true` in a blog post's frontmatter. The post will:
- Not appear in the blog index
- Not appear in tag pages
- Not be included in the RSS feed
- Not generate a static page during build

## How tags work

Tags are defined in each post's `tags` array. Tag pages are generated automatically at `/blog/tags/[tag]`. The blog index shows all available tags as filters.

## RSS feed

Available at `/rss.xml`. Includes all non-draft blog posts sorted by date. Auto-discovered via `<link rel="alternate">` in the HTML head.

## Project structure

```
src/
├── content/
│   ├── blog/          # Blog posts (markdown)
│   └── projects/      # Project entries (markdown)
├── content.config.ts  # Collection schemas
├── layouts/
│   └── BaseLayout.astro
├── components/
│   ├── Header.astro
│   ├── Footer.astro
│   ├── PostCard.astro
│   ├── ProjectCard.astro
│   ├── StatusBadge.astro
│   ├── PostMeta.astro
│   └── SchemaArticle.astro
├── pages/
│   ├── index.astro
│   ├── about.astro
│   ├── contact.astro
│   ├── rss.xml.ts
│   ├── projects/
│   │   ├── index.astro
│   │   └── [...slug].astro
│   └── blog/
│       ├── index.astro
│       ├── [...slug].astro
│       └── tags/
│           └── [tag].astro
└── styles/
    └── global.css
```

## Tech stack

- [Astro](https://astro.build) — static site generator
- [@astrojs/sitemap](https://docs.astro.build/en/guides/integrations-guide/sitemap/) — sitemap.xml generation
- [@astrojs/rss](https://docs.astro.build/en/guides/rss/) — RSS feed generation
- [Shiki](https://shiki.matsu.io/) — syntax highlighting (built into Astro)
- Cloudflare Pages — hosting (free tier)

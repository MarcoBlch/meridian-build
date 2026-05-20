import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Tag pages with fewer than 2 posts are noindexed and excluded from the sitemap
// to avoid thin-content signals. Update when a tag crosses the 2-post threshold.
const THIN_TAGS = ['bugs'];

export default defineConfig({
  site: 'https://meridianbuild.dev',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) =>
        !THIN_TAGS.some((tag) => page.includes(`/blog/tags/${tag}`)),
    }),
  ],
  markdown: {
    shikiConfig: {
      theme: 'github-light',
    },
  },
});

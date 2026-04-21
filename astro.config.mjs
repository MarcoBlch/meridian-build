import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: 'https://meridianbuild.dev',
  integrations: [sitemap()],

  markdown: {
    shikiConfig: {
      theme: 'github-light',
    },
  },

  adapter: cloudflare()
});
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://corporateregistryservices.ca',
  output: 'hybrid',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  trailingSlash: 'never',
  build: {
    format: 'directory',
  },
  experimental: {
    contentLayer: true,
  },
});

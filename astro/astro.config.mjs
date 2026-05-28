import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://corporateregistryservices.ca',
  output: 'hybrid',
  adapter: node({ mode: 'standalone' }),
  trailingSlash: 'never',
  build: {
    format: 'directory',
  },
  experimental: {
    contentLayer: true,
  },
});

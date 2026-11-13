// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// SSR: los datos se leen de la Google Sheet en cada request,
// nunca al momento del build.
export default defineConfig({
  output: 'server',
  adapter: vercel(),
});

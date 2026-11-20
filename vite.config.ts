import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { thirdPartyNotices } from './build/notices';

const root = decodeURIComponent(new URL('.', import.meta.url).pathname);
const stub = decodeURIComponent(new URL('./build/optional-stub.js', import.meta.url).pathname);

export default defineConfig({
  base: './',
  plugins: [svelte(), thirdPartyNotices(root, 'Brick Stitch')],
  resolve: {
    alias: { html2canvas: stub, dompurify: stub, canvg: stub },
  },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    css: { include: [/app\.css/] },
  },
});

import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'node:fs';

export default defineConfig({
  root: './',
  base: './',
  server: {
    port: 5502,
    open: true
  },
  plugins: [
    {
      name: 'copy-production-assets',
      closeBundle() {
        if (fs.existsSync('locales')) {
          fs.cpSync('locales', 'dist/locales', { recursive: true });
        }
        if (fs.existsSync('favicons')) {
          fs.cpSync('favicons', 'dist/favicons', { recursive: true });
        }
      }
    }
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        telemetry: resolve(import.meta.dirname, 'telemetry.html'),
        weekComparison: resolve(import.meta.dirname, 'week-comparison.html'),
        faq: resolve(import.meta.dirname, 'faq.html')
      }
    }
  }
});


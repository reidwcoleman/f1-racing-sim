import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',
  base: './',
  publicDir: 'public',
  build: {
    outDir: '../dist',
    assetsDir: 'assets',
    emptyOutDir: true
  }
});

import { defineConfig } from 'vite'

export default defineConfig({
  // Current GitHub Pages repo:
  // https://hplgames-rgb.github.io/ball-drop-poc/
  base: '/ball-drop-poc/',
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})

import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  // GitHub Pages serves a project repo from /<repo>/, so built asset URLs need
  // that prefix. The dev server keeps '/' so local links stay simple.
  base: command === 'build' ? '/flyway/' : '/',
  server: {
    port: Number(process.env.PORT) || 5199,
    strictPort: true,
  },
  build: {
    // Phaser is a single large dependency; splitting it out lets the browser
    // cache the engine across deploys while the game code changes.
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
}))

import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://neode.adamcowley.co.uk',
  // The playground runs entirely client-side; everything is static.
  output: 'static',
  build: {
    inlineStylesheets: 'auto',
  },
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark-default',
      },
      wrap: true,
    },
  },
})

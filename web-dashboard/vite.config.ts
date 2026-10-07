import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// base fica '/' em dev e no build local; o workflow de deploy (GitHub Pages)
// sobrescreve via --base para servir sob /<nome-do-repo>/.
// Duas páginas: o painel da frota (index.html) e o app web do motorista (driver.html).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        driver: resolve(__dirname, 'driver.html'),
      },
    },
  },
})

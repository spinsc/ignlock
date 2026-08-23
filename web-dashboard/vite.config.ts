import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base fica '/' em dev e no build local; o workflow de deploy (GitHub Pages)
// sobrescreve via --base para servir sob /<nome-do-repo>/.
export default defineConfig({
  plugins: [react()],
})

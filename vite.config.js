import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Using a custom domain (playnext.com) pointed at GitHub Pages, so base stays '/'.
// If you instead deploy to username.github.io/repo-name (no custom domain),
// change base to '/repo-name/'.
export default defineConfig({
  plugins: [react()],
  base: '/',
})

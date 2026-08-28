import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/mermaid_to_png/' : '/',
  plugins: [vue()],
}))

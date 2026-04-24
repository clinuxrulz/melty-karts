import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  base: "./",
  plugins: [solidPlugin()],
  server: {
    port: 3002,
  },
  build: {
    target: 'esnext',
  },
});
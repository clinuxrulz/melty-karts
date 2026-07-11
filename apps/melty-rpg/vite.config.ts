import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  base: "./",
  build: {
    target: 'esnext'
  },
  plugins: [
    solid({ ssr: false }),
    wasm(),
    topLevelAwait(),
  ],
  optimizeDeps: {
    include: ["@solidjs/signals"],
  },
});

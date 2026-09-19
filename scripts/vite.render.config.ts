import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "scripts/render-chatgpt-verification.ts",
    outDir: "tmp/render-chatgpt-build",
    emptyOutDir: true,
    rollupOptions: { output: { format: "es" } },
  },
});

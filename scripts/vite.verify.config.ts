import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "scripts/verify-chatgpt-extraction.ts",
    outDir: "tmp/verify-chatgpt",
    emptyOutDir: true,
    rollupOptions: { output: { format: "es" } },
  },
});

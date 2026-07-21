import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig(({ command }) => ({
  base: "./",
  plugins: [react()],
  test: {
    setupFiles: ["./vitest.setup.ts"],
    alias: {
      "core/ajax": resolve(__dirname, "frontend/src/test-support/core-ajax.ts"),
    },
  },
  ...(command === "build"
    ? {
        define: {
          // LMS adapter bundles do not have an HTML entry to carry environment
          // replacement. Keep React's CJS branch selection static.
          "process.env.NODE_ENV": JSON.stringify("production"),
        },
      }
    : {}),
  build: {
    outDir: "scaffold/public",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    rollupOptions: {
      preserveEntrySignatures: "exports-only",
      input: {
        "moodle-ui": resolve(__dirname, "frontend/src/moodle-entry.tsx"),
        "moodle-inner": resolve(__dirname, "moodle-inner.html"),
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === "moodle-ui" ? "[name].js" : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const assetName = assetInfo.name ?? "";
          if (assetName.endsWith(".css")) return "scaffold-moodle.css";
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
}));

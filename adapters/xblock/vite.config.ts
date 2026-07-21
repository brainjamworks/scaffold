import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, type PluginOption } from "vite";

const bundleAnalyzeEnabled = process.env.SCAFFOLD_BUNDLE_ANALYZE === "1";
const bundleAnalysisDir = resolve(__dirname, ".bundle-analysis");

export default defineConfig({
  base: "./",
  plugins: [react(), ...createBundleAnalysisPlugins()],
  define: {
    // LMS adapter bundles do not have an HTML entry to carry environment
    // replacement. Keep React's CJS branch selection static.
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "scaffold_xblock/public",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    rollupOptions: {
      preserveEntrySignatures: "exports-only",
      input: {
        "studio-ui": resolve(__dirname, "frontend/src/studio-entry.ts"),
        "student-ui": resolve(__dirname, "frontend/src/student-entry.ts"),
        "studio-inner": resolve(__dirname, "studio-inner.html"),
        "student-inner": resolve(__dirname, "student-inner.html"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "studio-ui" || chunkInfo.name === "student-ui") {
            return "[name].js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});

function createBundleAnalysisPlugins(): PluginOption[] {
  if (!bundleAnalyzeEnabled) return [];

  return [
    visualizer({
      filename: resolve(bundleAnalysisDir, "xblock-stats.html"),
      title: "Scaffold XBlock bundle analysis",
      template: "treemap",
      gzipSize: true,
      brotliSize: true,
    }) as PluginOption,
    visualizer({
      filename: resolve(bundleAnalysisDir, "xblock-stats.raw-data.json"),
      title: "Scaffold XBlock bundle raw data",
      template: "raw-data",
      gzipSize: true,
      brotliSize: true,
    }) as PluginOption,
  ];
}

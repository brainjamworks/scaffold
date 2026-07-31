import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

const singletonDependencies = ["react", "react-dom", "@tiptap/core", "@tiptap/react"];

export default defineConfig(() => ({
  plugins: [react()],
  test: {
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    dedupe: singletonDependencies,
  },
  server: {
    port: 5848,
  },
}));

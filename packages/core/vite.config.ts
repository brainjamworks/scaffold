import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  pack: {
    entry: {
      runtime: "src/entrypoints/runtime.ts",
      authoring: "src/entrypoints/authoring.ts",
      "agent-host": "src/entrypoints/agent-host.ts",
      format: "src/entrypoints/format.ts",
      ports: "src/entrypoints/ports.ts",
      "media-policy": "src/entrypoints/media-policy.ts",
      extensions: "src/entrypoints/extensions.ts",
    },
    alias: {
      "@": resolve(__dirname, "src"),
    },
    platform: "browser",
    target: "es2022",
    format: "esm",
    dts: true,
    deps: {
      skipNodeModulesBundle: true,
    },
    css: {
      fileName: "core.css",
      inject: true,
    },
    copy: [
      { from: "src/styles/globals.css", rename: "styles.css" },
      { from: "src/styles/fonts/Satoshi-Variable.woff2", rename: "fonts/Satoshi-Variable.woff2" },
      {
        from: "src/styles/fonts/Satoshi-VariableItalic.woff2",
        rename: "fonts/Satoshi-VariableItalic.woff2",
      },
    ],
  },
  run: {
    tasks: {
      build: {
        command: "vp pack",
        dependsOn: [{ task: "build", from: "dependencies" }],
        input: [{ auto: true }, "!dist/**"],
        output: ["dist/**"],
      },
    },
  },
  test: {
    env: { SCAFFOLD_DRAG_PERF: process.env["SCAFFOLD_DRAG_PERF"] ?? "" },
    setupFiles: ["./vitest.setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.browser.test.{ts,tsx}"],
          maxWorkers: 2,
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        optimizeDeps: {
          include: ["vite-plus > vitest > expect-type"],
        },
        test: {
          name: "browser",
          fileParallelism: false,
          include: ["src/**/*.browser.test.{ts,tsx}"],
          sequence: { groupOrder: 1 },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            screenshotDirectory: ".tmp/vitest-failure-screenshots",
            screenshotFailures: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});

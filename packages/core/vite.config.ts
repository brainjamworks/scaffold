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
    copy: [{ from: "src/styles/globals.css", rename: "styles.css" }],
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
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          exclude: ["**/node_modules/**", "**/dist/**", "src/**/*.browser.test.{ts,tsx}"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.{ts,tsx}"],
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

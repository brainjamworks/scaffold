import { describe, expect, it } from "vite-plus/test";
import type { ConfigEnv, UserConfig } from "vite";

import playgroundConfig from "./apps/playground/vite.config";
import config from "./vite.config";

describe("typed lint configuration", () => {
  it("treats the node:test registrar as a known-safe promise call", () => {
    expect(config.lint?.rules?.["typescript/no-floating-promises"]).toEqual([
      "warn",
      {
        allowForKnownSafeCalls: [
          {
            from: "package",
            name: "test",
            package: "node:test",
          },
        ],
      },
    ]);
  });

  it("enforces App, Course, and neutral UI ownership boundaries", () => {
    expect(config.lint?.overrides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          files: ["packages/core/src/ui/components/app/**/*.{ts,tsx}"],
          rules: expect.objectContaining({
            "no-restricted-imports": expect.arrayContaining([
              expect.objectContaining({
                patterns: expect.arrayContaining([
                  expect.objectContaining({
                    regex:
                      "^(?:@/ui/components/course|@/theme/course|(?:\\.\\./)+course|(?:\\.\\./)+theme/course)(?:/|$)",
                  }),
                ]),
              }),
            ]),
          }),
        }),
        expect.objectContaining({
          files: ["packages/core/src/ui/components/course/**/*.{ts,tsx}"],
          rules: expect.objectContaining({
            "no-restricted-imports": expect.arrayContaining([
              expect.objectContaining({
                patterns: expect.arrayContaining([
                  expect.objectContaining({
                    regex:
                      "^(?:@/ui/components/app|@/theme/app|(?:\\.\\./)+app|(?:\\.\\./)+theme/app)(?:/|$)",
                  }),
                ]),
              }),
            ]),
          }),
        }),
        expect.objectContaining({
          files: [
            "packages/core/src/ui/accessibility/**/*.{ts,tsx}",
            "packages/core/src/ui/icons/**/*.{ts,tsx}",
            "packages/core/src/ui/overlays/**/*.{ts,tsx}",
          ],
          rules: expect.objectContaining({
            "no-restricted-imports": expect.arrayContaining([
              expect.objectContaining({
                patterns: expect.arrayContaining([
                  expect.objectContaining({
                    regex:
                      "^(?:@/ui/components/(?:app|course)|@/theme/(?:app|course)|(?:\\.\\./)+(?:components/(?:app|course)|theme/(?:app|course)))(?:/|$)",
                  }),
                  expect.objectContaining({
                    group: ["@radix-ui/themes", "@radix-ui/themes/**"],
                  }),
                ]),
              }),
            ]),
          }),
        }),
      ]),
    );
  });
});

function resolvePlaygroundConfig(command: "build" | "serve", mode: string) {
  expect(typeof playgroundConfig).toBe("function");

  if (typeof playgroundConfig !== "function") {
    throw new TypeError("Expected the playground config to vary by command and mode");
  }

  const environment: ConfigEnv = {
    command,
    mode,
    isPreview: false,
    isSsrBuild: false,
  };

  return playgroundConfig(environment) as UserConfig;
}

describe("playground development task graph", () => {
  it("starts the playground and its workspace dependency watchers", () => {
    expect(config.run?.tasks?.["dev:playground"]).toEqual({
      command:
        "vp run --filter @scaffold/core... --filter @scaffold/grading... build && vp run -t --parallel @scaffold/playground#dev",
      cache: false,
    });
  });

  it.each([
    ["serve", "development"],
    ["build", "production"],
    ["serve", "production"],
  ] as const)("keeps public package resolution for %s in %s mode", (command, mode) => {
    const resolvedConfig = resolvePlaygroundConfig(command, mode);

    expect(resolvedConfig.resolve?.alias).toBeUndefined();
    expect(resolvedConfig.resolve?.dedupe).toEqual(
      expect.arrayContaining(["react", "react-dom", "@tiptap/core", "@tiptap/react", "yjs"]),
    );
  });
});

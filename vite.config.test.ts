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
  it("starts only the playground Vite server", () => {
    expect(config.run?.tasks?.["dev:playground"]).toEqual({
      command: "vp dev apps/playground",
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

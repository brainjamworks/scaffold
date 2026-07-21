// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  createFrame: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("./outer/create-isolated-scaffold-frame", () => ({
  createIsolatedScaffoldFrame: mocks.createFrame,
}));

import { mountMoodle } from "./moodle-entry";
import type { MoodleOuterBootstrapConfig } from "./types";

const config: MoodleOuterBootstrapConfig = {
  cmid: 42,
  scaffoldid: 7,
  surface: "learner",
  bundleUrl: "https://moodle.example/mod/scaffold/public/moodle-ui.js",
  innerUrl: "https://moodle.example/mod/scaffold/public/moodle-inner.html",
  wwwroot: "https://moodle.example",
  sesskey: "sesskey",
};

beforeEach(() => {
  mocks.createFrame.mockImplementation(({ container }: { container: HTMLElement }) => {
    const iframe = document.createElement("iframe");
    container.replaceChildren(iframe);
    return {
      iframe,
      destroy() {
        mocks.destroy();
        iframe.remove();
      },
    };
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("mountMoodle", () => {
  it("registers the outer mount API for Moodle's AMD bootstrap", () => {
    expect(
      (window as typeof window & { ScaffoldMoodle?: { mountMoodle?: unknown } }).ScaffoldMoodle
        ?.mountMoodle,
    ).toBe(mountMoodle);
  });

  it("delegates the root, outer config, and Moodle caller to one isolated frame", () => {
    const root = document.createElement("div");
    const callMoodle = vi.fn();
    document.body.append(root);

    mountMoodle(root, config, callMoodle);

    expect(mocks.createFrame).toHaveBeenCalledWith({ container: root, config, callMoodle });
    expect(root.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("destroys the previous frame before mounting again into the same root", () => {
    const root = document.createElement("div");
    document.body.append(root);

    mountMoodle(root, config, vi.fn());
    mountMoodle(root, config, vi.fn());

    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(root.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("renders an accessible error if the frame cannot be created", () => {
    const root = document.createElement("div");
    document.body.append(root);
    mocks.createFrame.mockImplementation(() => {
      throw new Error("Frame setup failed");
    });

    mountMoodle(root, config, vi.fn());

    expect(root.querySelector('[role="alert"]')?.textContent).toContain("Frame setup failed");
  });
});

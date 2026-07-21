// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ScaffoldRuntimePorts } from "@scaffold/core/runtime";

const mocks = vi.hoisted(() => ({
  createMoodleRuntimePorts: vi.fn(),
  rootRender: vi.fn(),
  suppliedPorts: [] as unknown[],
}));

vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: mocks.rootRender }),
}));

vi.mock("@scaffold/core/runtime", async () => {
  const { cloneElement } = await import("react");

  return {
    ScaffoldServicesProvider: ({
      children,
      ports,
    }: {
      children: ReactElement<{ observedPorts?: unknown }>;
      ports: ScaffoldRuntimePorts;
    }) => cloneElement(children, { observedPorts: ports }),
  };
});

vi.mock("./MoodleApp", async () => {
  const { createElement, useState } = await import("react");

  return {
    MoodleApp: ({ observedPorts }: { observedPorts?: unknown }) => {
      mocks.suppliedPorts.push(observedPorts);
      const [rerenders, setRerenders] = useState(0);
      return createElement(
        "button",
        { onClick: () => setRerenders((current) => current + 1) },
        `Rerenders: ${rerenders}`,
      );
    },
  };
});

vi.mock("./ports", () => ({
  createMoodleRuntimePorts: mocks.createMoodleRuntimePorts,
}));

import { mountMoodle } from "./mount";

afterEach(() => {
  cleanup();
  mocks.suppliedPorts.length = 0;
  vi.clearAllMocks();
});

describe("mountMoodle learner runtime ownership", () => {
  it("supplies one stable port bundle and learner port across MoodleApp rerenders", async () => {
    const user = userEvent.setup();
    const learnerActivity = {
      load: vi.fn(),
      save: vi.fn(),
    };
    const ports = { learnerActivity } as ScaffoldRuntimePorts;
    mocks.createMoodleRuntimePorts.mockReturnValue(ports);
    const container = document.createElement("div");

    mountMoodle(container, {
      cmid: 42,
      scaffoldid: 7,
      surface: "learner",
      wwwroot: "https://moodle.example",
      sesskey: "session-key",
    });

    expect(mocks.createMoodleRuntimePorts).toHaveBeenCalledOnce();
    expect(mocks.createMoodleRuntimePorts).toHaveBeenCalledWith(42);
    const mountedTree = mocks.rootRender.mock.calls[0]?.[0] as ReactElement;
    render(mountedTree);

    await user.click(screen.getByRole("button", { name: "Rerenders: 0" }));

    expect(screen.getByRole("button", { name: "Rerenders: 1" })).toBeInTheDocument();
    expect(mocks.suppliedPorts.length).toBeGreaterThanOrEqual(2);
    for (const supplied of mocks.suppliedPorts) {
      expect(supplied).toBe(ports);
      expect((supplied as ScaffoldRuntimePorts).learnerActivity).toBe(learnerActivity);
    }
    expect(mocks.createMoodleRuntimePorts).toHaveBeenCalledOnce();
  });
});

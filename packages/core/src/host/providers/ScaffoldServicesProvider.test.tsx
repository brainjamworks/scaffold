// @vitest-environment happy-dom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useEffect } from "react";

import type { LearningEventPort } from "../ports/learning-events";

import { ScaffoldServicesProvider, useLearningEventPort } from "./ScaffoldServicesProvider";

afterEach(cleanup);

function LearningEventPortProbe({ onPort }: { onPort?: (port: LearningEventPort | null) => void }) {
  const port = useLearningEventPort();
  useEffect(() => {
    onPort?.(port);
  }, [onPort, port]);
  return <output data-testid="learning-event-port">{port?.rootActivityId ?? "none"}</output>;
}

describe("ScaffoldServicesProvider Learning Event capability", () => {
  it("normalizes an absent Learning Event port to null", () => {
    render(
      <ScaffoldServicesProvider ports={{}}>
        <LearningEventPortProbe />
      </ScaffoldServicesProvider>,
    );

    expect(screen.getByTestId("learning-event-port").textContent).toBe("none");
  });

  it("retains and replaces the injected port by identity without calling it", () => {
    const observations: Array<LearningEventPort | null> = [];
    const onPort = (port: LearningEventPort | null) => observations.push(port);
    const first = {
      rootActivityId: "https://learning.example.test/artifacts/artifact-1",
      accept: vi.fn(async () => undefined),
    } satisfies LearningEventPort;
    const second = {
      rootActivityId: "https://learning.example.test/artifacts/artifact-2",
      accept: vi.fn(async () => undefined),
    } satisfies LearningEventPort;
    const { rerender } = render(
      <ScaffoldServicesProvider ports={{ learningEvents: first }}>
        <LearningEventPortProbe onPort={onPort} />
      </ScaffoldServicesProvider>,
    );

    expect(observations).toStrictEqual([first]);
    rerender(
      <ScaffoldServicesProvider ports={{ learningEvents: second }}>
        <LearningEventPortProbe onPort={onPort} />
      </ScaffoldServicesProvider>,
    );

    expect(observations).toStrictEqual([first, second]);
    expect(first.accept).not.toHaveBeenCalled();
    expect(second.accept).not.toHaveBeenCalled();
  });
});

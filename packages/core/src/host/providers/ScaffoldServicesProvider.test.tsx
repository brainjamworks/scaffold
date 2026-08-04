// @vitest-environment happy-dom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useEffect } from "react";

import type { XapiPort } from "../ports";
import type { LearningEventPort } from "../ports/learning-events";

import {
  ScaffoldServicesProvider,
  useLearningEventPort,
  useXapiPort,
} from "./ScaffoldServicesProvider";

afterEach(cleanup);

function XapiPortProbe() {
  const port = useXapiPort();
  return <output data-testid="xapi-port">{port?.activityId ?? "none"}</output>;
}

function LearningEventPortProbe({ onPort }: { onPort?: (port: LearningEventPort | null) => void }) {
  const port = useLearningEventPort();
  useEffect(() => {
    onPort?.(port);
  }, [onPort, port]);
  return <output data-testid="learning-event-port">{port?.rootActivityId ?? "none"}</output>;
}

describe("ScaffoldServicesProvider xAPI capability", () => {
  it("normalizes an absent xAPI port to null", () => {
    render(
      <ScaffoldServicesProvider ports={{}}>
        <XapiPortProbe />
      </ScaffoldServicesProvider>,
    );

    expect(screen.getByTestId("xapi-port").textContent).toBe("none");
  });

  it("retains an injected xAPI port without calling it", () => {
    const port = {
      activityId: "https://learning.example.test/courses/course-1",
      send: vi.fn(async () => undefined),
    } satisfies XapiPort;

    render(
      <ScaffoldServicesProvider ports={{ xapi: port }}>
        <XapiPortProbe />
      </ScaffoldServicesProvider>,
    );

    expect(screen.getByTestId("xapi-port").textContent).toBe(port.activityId);
    expect(port.send).not.toHaveBeenCalled();
  });
});

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

  it("disables both migration capabilities when old and new ports conflict", () => {
    const learningEvents = {
      rootActivityId: "https://learning.example.test/artifacts/artifact-1",
      accept: vi.fn(async () => undefined),
    } satisfies LearningEventPort;
    const xapi = {
      activityId: learningEvents.rootActivityId,
      send: vi.fn(async () => undefined),
    } satisfies XapiPort;

    render(
      <ScaffoldServicesProvider ports={{ learningEvents, xapi }}>
        <LearningEventPortProbe />
        <XapiPortProbe />
      </ScaffoldServicesProvider>,
    );

    expect(screen.getByTestId("learning-event-port").textContent).toBe("none");
    expect(screen.getByTestId("xapi-port").textContent).toBe("none");
  });
});

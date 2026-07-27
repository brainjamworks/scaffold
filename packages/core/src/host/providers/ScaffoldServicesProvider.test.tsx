// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { XapiPort } from "@/host/ports";

import { ScaffoldServicesProvider, useXapiPort } from "./ScaffoldServicesProvider";

afterEach(cleanup);

function XapiPortProbe() {
  const port = useXapiPort();
  return <output data-testid="xapi-port">{port?.activityId ?? "none"}</output>;
}

describe("ScaffoldServicesProvider xAPI capability", () => {
  it("normalizes an absent xAPI port to null", () => {
    render(
      <ScaffoldServicesProvider ports={{}}>
        <XapiPortProbe />
      </ScaffoldServicesProvider>,
    );

    expect(screen.getByTestId("xapi-port")).toHaveTextContent("none");
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

    expect(screen.getByTestId("xapi-port")).toHaveTextContent(port.activityId);
    expect(port.send).not.toHaveBeenCalled();
  });
});

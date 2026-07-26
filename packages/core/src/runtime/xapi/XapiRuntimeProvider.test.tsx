// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { XapiPort, XapiStatementTemplate } from "@/host/ports";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";

import {
  XapiRuntimeProvider,
  useXapiSession,
  useXapiSessionAccessor,
  type XapiSession,
  type XapiSessionAccessor,
} from "./index";

afterEach(cleanup);

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

function createPort(activityId = "https://learning.example.test/courses/course-1"): XapiPort & {
  send: ReturnType<typeof vi.fn<(statement: XapiStatementTemplate) => Promise<void>>>;
} {
  return {
    activityId,
    send: vi.fn(async () => undefined),
  };
}

interface XapiObservation {
  readonly session: XapiSession | null;
  readonly getSession: XapiSessionAccessor;
}

function SessionProbe({
  autoStart = false,
  onObservation,
}: {
  autoStart?: boolean;
  onObservation: (observation: XapiObservation) => void;
}) {
  const session = useXapiSession();
  const getSession = useXapiSessionAccessor();

  useEffect(() => {
    onObservation({ session, getSession });
    if (autoStart) session?.start();
  }, [autoStart, getSession, onObservation, session]);

  return null;
}

function RuntimeRoot({
  artifactId,
  autoStart,
  courseTitle = "Course One",
  onObservation,
  port,
}: {
  artifactId: string | null;
  autoStart?: boolean;
  courseTitle?: string | null;
  onObservation: (observation: XapiObservation) => void;
  port: XapiPort | null;
}) {
  return (
    <ScaffoldServicesProvider ports={{ xapi: port }}>
      <ScaffoldArtifactIdentityProvider artifactId={artifactId}>
        <XapiRuntimeProvider courseTitle={courseTitle}>
          <SessionProbe
            onObservation={onObservation}
            {...(autoStart === undefined ? {} : { autoStart })}
          />
        </XapiRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>
    </ScaffoldServicesProvider>
  );
}

describe("XapiRuntimeProvider", () => {
  it.each([
    { artifactId: null, port: createPort(), label: "unsafe artifact identity" },
    { artifactId: "course-one", port: null, label: "absent port" },
    {
      artifactId: "course-one",
      port: createPort("not an absolute IRI"),
      label: "invalid Activity IRI",
    },
  ])("makes recording unavailable for $label", async ({ artifactId, port }) => {
    const observations: XapiObservation[] = [];

    render(
      <RuntimeRoot
        artifactId={artifactId}
        port={port}
        onObservation={(nextObservation) => {
          observations.push(nextObservation);
        }}
      />,
    );

    await waitFor(() => expect(observations).toHaveLength(1));
    const observation = observations[0];
    if (!observation) throw new Error("expected an xAPI observation");
    expect(observation.session).toBeNull();
    expect(observation.getSession()).toBeNull();
    if (port) expect(port.send).not.toHaveBeenCalled();
  });

  it("retains one session and accessor for a stable tuple, including title changes", async () => {
    const port = createPort();
    const observations: XapiObservation[] = [];
    const onObservation = (observation: XapiObservation) => {
      observations.push(observation);
    };
    const { rerender } = render(
      <RuntimeRoot
        artifactId=" course-one "
        courseTitle="Course One"
        port={port}
        onObservation={onObservation}
      />,
    );

    await waitFor(() => expect(observations).toHaveLength(1));
    const first = observations[0];
    if (!first?.session) throw new Error("expected an xAPI session");

    rerender(
      <RuntimeRoot
        artifactId="course-one"
        courseTitle="Renamed Course"
        port={port}
        onObservation={onObservation}
      />,
    );

    expect(observations).toHaveLength(1);
    expect(first.getSession()).toBe(first.session);
    expect(first.session.getState()).toEqual({ status: "dormant" });
  });

  it.each(["artifact", "port"] as const)(
    "replaces the session when the %s identity changes and keeps one accessor",
    async (replacement) => {
      const firstPort = createPort("https://learning.example.test/courses/course-1");
      const secondPort =
        replacement === "port"
          ? createPort("https://learning.example.test/courses/course-2")
          : firstPort;
      const observations: XapiObservation[] = [];
      const onObservation = (observation: XapiObservation) => {
        observations.push(observation);
      };
      const { rerender } = render(
        <RuntimeRoot artifactId="course-one" port={firstPort} onObservation={onObservation} />,
      );

      await waitFor(() => expect(observations).toHaveLength(1));
      const first = observations[0];
      if (!first?.session) throw new Error("expected the first xAPI session");

      rerender(
        <RuntimeRoot
          artifactId={replacement === "artifact" ? "course-two" : "course-one"}
          port={secondPort}
          onObservation={onObservation}
        />,
      );

      await waitFor(() => expect(observations).toHaveLength(2));
      await flushPromises();
      const second = observations[1];
      if (!second?.session) throw new Error("expected the replacement xAPI session");

      expect(second.session).not.toBe(first.session);
      expect(second.getSession).toBe(first.getSession);
      expect(second.getSession()).toBe(second.session);
      expect(first.session.getState()).toEqual({
        status: "terminated",
        startedAt: null,
        delivery: "not-started",
      });
      expect(second.session.getState()).toEqual({ status: "dormant" });
    },
  );

  it("creates isolated sessions for simultaneous provider roots", async () => {
    const port = createPort();
    const observations: Array<XapiObservation | null> = [null, null];

    render(
      <>
        <RuntimeRoot
          artifactId="shared-course"
          port={port}
          onObservation={(observation) => {
            observations[0] = observation;
          }}
        />
        <RuntimeRoot
          artifactId="shared-course"
          port={port}
          onObservation={(observation) => {
            observations[1] = observation;
          }}
        />
      </>,
    );

    await waitFor(() => expect(observations[0]?.session).not.toBeNull());
    await waitFor(() => expect(observations[1]?.session).not.toBeNull());
    expect(observations[0]?.session).not.toBe(observations[1]?.session);
    expect(observations[0]?.getSession).not.toBe(observations[1]?.getSession);
  });

  it("terminates a started session on real unmount", async () => {
    const port = createPort();
    const observations: XapiObservation[] = [];
    const root = render(
      <RuntimeRoot
        artifactId="course-one"
        autoStart
        port={port}
        onObservation={(nextObservation) => {
          observations.push(nextObservation);
        }}
      />,
    );

    await waitFor(() => expect(port.send).toHaveBeenCalledTimes(1));
    const session = observations[0]?.session;
    if (!session) throw new Error("expected a started xAPI session");

    root.unmount();
    await waitFor(() => expect(port.send).toHaveBeenCalledTimes(2));

    expect(port.send.mock.calls.map(([statement]) => statement.verb.display.en)).toEqual([
      "initialized",
      "terminated",
    ]);
    expect(session.getState()).toMatchObject({
      status: "terminated",
      delivery: "accepted",
    });
  });

  it("does not terminate during StrictMode effect replay", async () => {
    const port = createPort();
    const sessions: XapiSession[] = [];
    const root = render(
      <StrictMode>
        <RuntimeRoot
          artifactId="course-one"
          autoStart
          port={port}
          onObservation={(observation) => {
            if (observation.session && !sessions.includes(observation.session)) {
              sessions.push(observation.session);
            }
          }}
        />
      </StrictMode>,
    );

    await waitFor(() => expect(port.send).toHaveBeenCalledTimes(1));
    await flushPromises();
    expect(port.send).toHaveBeenCalledTimes(1);
    expect(sessions.at(-1)?.getState()).toMatchObject({ status: "active" });

    root.unmount();
    await waitFor(() => expect(port.send).toHaveBeenCalledTimes(2));
    expect(port.send.mock.calls[1]?.[0].verb.display.en).toBe("terminated");
  });
});

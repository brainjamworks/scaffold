// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ScaffoldRuntimePorts } from "../../host/ports";
import type { LearningEvent, LearningEventPort } from "../../host/ports/learning-events";
import { ScaffoldArtifactIdentityProvider } from "../../host/providers/ScaffoldArtifactIdentityProvider";
import { ScaffoldServicesProvider } from "../../host/providers/ScaffoldServicesProvider";
import { useLearningEventReporter } from "../../entrypoints/extensions";

import {
  LearningEventRuntimeProvider,
  useLearningEventSession,
  useLearningEventSessionAccessor,
  type LearningEventSessionAccessor,
} from "./LearningEventRuntimeProvider";
import type { LearningEventReporter } from "./LearningEventRuntimeProvider";
import type { LearningEventSession } from "./session";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

function createPort(
  rootActivityId = "https://learning.example.test/courses/course-1",
): LearningEventPort & {
  accept: ReturnType<typeof vi.fn<(event: LearningEvent) => Promise<void>>>;
} {
  return {
    rootActivityId,
    accept: vi.fn(async () => undefined),
  };
}

function createUnrelatedPorts(): Pick<
  ScaffoldRuntimePorts,
  "assessment" | "learnerActivity" | "media"
> {
  return {
    assessment: {
      type: "runtime",
      submit: vi.fn(async () => {
        throw new Error("not used");
      }),
    },
    learnerActivity: {
      load: vi.fn(async () => null),
      save: vi.fn(async () => {
        throw new Error("not used");
      }),
    },
    media: {
      resolve: vi.fn(async () => "https://media.example.test/file"),
      upload: vi.fn(async () => {
        throw new Error("not used");
      }),
    },
  };
}

interface LearningEventObservation {
  readonly session: LearningEventSession | null;
  readonly getSession: LearningEventSessionAccessor;
}

function SessionProbe({
  autoStart = false,
  onObservation,
}: {
  autoStart?: boolean;
  onObservation: (observation: LearningEventObservation) => void;
}) {
  const session = useLearningEventSession();
  const getSession = useLearningEventSessionAccessor();

  useEffect(() => {
    onObservation({ session, getSession });
    if (autoStart) session?.start();
  }, [autoStart, getSession, onObservation, session]);

  return null;
}

function RuntimeRoot({
  artifactId,
  autoStart,
  artefactTitle = "Course One",
  onObservation,
  port,
}: {
  artifactId: string | null;
  autoStart?: boolean;
  artefactTitle?: string | null;
  onObservation: (observation: LearningEventObservation) => void;
  port: LearningEventPort | null;
}) {
  return (
    <ScaffoldServicesProvider ports={{ learningEvents: port }}>
      <ScaffoldArtifactIdentityProvider artifactId={artifactId}>
        <LearningEventRuntimeProvider artefactTitle={artefactTitle}>
          <SessionProbe
            onObservation={onObservation}
            {...(autoStart === undefined ? {} : { autoStart })}
          />
        </LearningEventRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>
    </ScaffoldServicesProvider>
  );
}

function ReporterProbe({ onReporter }: { onReporter: (reporter: LearningEventReporter) => void }) {
  const reporter = useLearningEventReporter();

  useEffect(() => {
    onReporter(reporter);
  }, [onReporter, reporter]);

  return null;
}

interface ReportingBoundaryObservation {
  readonly reporter: LearningEventReporter;
  readonly session: LearningEventSession | null;
}

function ReportingBoundaryProbe({
  onObservation,
}: {
  onObservation: (observation: ReportingBoundaryObservation) => void;
}) {
  const reporter = useLearningEventReporter();
  const session = useLearningEventSession();

  useEffect(() => {
    onObservation({ reporter, session });
  }, [onObservation, reporter, session]);

  return null;
}

function invokePublicReporter(reporter: LearningEventReporter, input: unknown): unknown {
  return (reporter.report as (input: unknown) => void)(input);
}

describe("LearningEventRuntimeProvider", () => {
  it("retains one started session when unrelated service identities change", async () => {
    const port = {
      rootActivityId: "https://learning.example.test/artifacts/artifact-one",
      accept: vi.fn<LearningEventPort["accept"]>(async () => undefined),
    } satisfies LearningEventPort;
    const observations: LearningEventObservation[] = [];
    const onObservation = (observation: LearningEventObservation) => observations.push(observation);
    const firstServices = createUnrelatedPorts();
    const root = (
      services: Pick<ScaffoldRuntimePorts, "assessment" | "learnerActivity" | "media">,
    ) => (
      <ScaffoldServicesProvider ports={{ ...services, learningEvents: port }}>
        <ScaffoldArtifactIdentityProvider artifactId="artifact-one">
          <LearningEventRuntimeProvider artefactTitle="Artefact One">
            <SessionProbe autoStart onObservation={onObservation} />
          </LearningEventRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>
      </ScaffoldServicesProvider>
    );
    const { rerender } = render(root(firstServices));

    await waitFor(() => expect(port.accept).toHaveBeenCalledTimes(1));
    const session = observations[0]?.session;
    if (!session) throw new Error("expected a started Learning Event session");

    const secondServices = createUnrelatedPorts();
    rerender(root({ ...firstServices, assessment: secondServices.assessment }));
    rerender(root({ ...firstServices, learnerActivity: secondServices.learnerActivity }));
    rerender(root({ ...firstServices, media: secondServices.media }));
    await flushPromises();

    expect(observations.at(-1)?.session).toBe(session);
    expect(session.getState()).toMatchObject({ status: "active" });
    expect(port.accept).toHaveBeenCalledTimes(1);
  });

  it("returns one stable no-op reporter when reporting is absent", async () => {
    const reporters: LearningEventReporter[] = [];
    const onReporter = (reporter: LearningEventReporter) => reporters.push(reporter);
    const { rerender } = render(
      <ScaffoldServicesProvider ports={{ learningEvents: null }}>
        <ScaffoldArtifactIdentityProvider artifactId="artifact-one">
          <LearningEventRuntimeProvider artefactTitle="Artefact One">
            <ReporterProbe onReporter={onReporter} />
          </LearningEventRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(reporters).toHaveLength(1));
    expect(() =>
      reporters[0]?.report({
        type: "surface.experienced",
        surfaceId: "surface-1",
        surfaceKind: "page",
        position: 1,
        count: 1,
      }),
    ).not.toThrow();

    rerender(
      <ScaffoldServicesProvider ports={{ learningEvents: null }}>
        <ScaffoldArtifactIdentityProvider artifactId="artifact-one">
          <LearningEventRuntimeProvider artefactTitle="Renamed">
            <ReporterProbe onReporter={onReporter} />
          </LearningEventRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>
      </ScaffoldServicesProvider>,
    );
    expect(reporters).toHaveLength(1);
  });

  it("reports only closed block-safe inputs without exposing acceptance", async () => {
    const port = createPort();
    const reporters: LearningEventReporter[] = [];

    render(
      <ScaffoldServicesProvider ports={{ learningEvents: port }}>
        <ScaffoldArtifactIdentityProvider artifactId="artifact-one">
          <LearningEventRuntimeProvider artefactTitle="Artefact One">
            <ReporterProbe onReporter={(value) => reporters.push(value)} />
          </LearningEventRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(reporters).toHaveLength(1));
    const result = reporters[0]?.report({
      type: "surface.experienced",
      surfaceId: "surface-1",
      surfaceKind: "page",
      position: 1,
      count: 1,
    });

    expect(result).toBeUndefined();
    await waitFor(() => expect(port.accept).toHaveBeenCalledTimes(2));
    expect(port.accept.mock.calls.map(([event]) => event.verb.display.en)).toStrictEqual([
      "initialized",
      "experienced",
    ]);
  });

  it.each([
    {
      family: "assessment",
      input: { type: "assessment.hint-interacted", targetId: "question-1", hintNumber: 1 },
    },
    {
      family: "learner activity",
      input: {
        type: "learner-activity.interacted",
        blockId: "flashcards-1",
        activityKind: "flashcard",
      },
    },
    {
      family: "quiz",
      input: { type: "quiz.attempted", quizId: "quiz-1", attemptId: "attempt-1" },
    },
    {
      family: "artefact outcome",
      input: { type: "artefact.completed", completion: true },
    },
    {
      family: "session lifecycle",
      input: { type: "session.initialized" },
    },
  ])("rejects the Core-only $family family before initialization", async ({ input }) => {
    const port = createPort();
    const observations: ReportingBoundaryObservation[] = [];

    render(
      <ScaffoldServicesProvider ports={{ learningEvents: port }}>
        <ScaffoldArtifactIdentityProvider artifactId="artifact-one">
          <LearningEventRuntimeProvider artefactTitle="Artefact One">
            <ReportingBoundaryProbe onObservation={(value) => observations.push(value)} />
          </LearningEventRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(observations).toHaveLength(1));
    const observation = observations[0];
    if (!observation?.session) throw new Error("expected a Learning Event session");
    let result: unknown;
    expect(() => {
      result = invokePublicReporter(observation.reporter, input);
    }).not.toThrow();
    expect(result).toBeUndefined();
    await flushPromises();

    expect(port.accept).not.toHaveBeenCalled();
    expect(observation.session.getState()).toEqual({
      status: "terminated",
      startedAt: null,
      acceptance: "failed",
    });
    invokePublicReporter(observation.reporter, {
      type: "surface.experienced",
      surfaceId: "surface-1",
      surfaceKind: "page",
      position: 1,
      count: 1,
    });
    await flushPromises();
    expect(port.accept).not.toHaveBeenCalled();
  });

  it.each([
    { label: "null", input: null },
    { label: "an unknown discriminant", input: { type: "not.registered" } },
    {
      label: "a malformed block input",
      input: { type: "surface.experienced", surfaceId: "surface-1" },
    },
  ])("contains $label and fail-stops the public reporter", async ({ input }) => {
    const port = createPort();
    const observations: ReportingBoundaryObservation[] = [];

    render(
      <ScaffoldServicesProvider ports={{ learningEvents: port }}>
        <ScaffoldArtifactIdentityProvider artifactId="artifact-one">
          <LearningEventRuntimeProvider artefactTitle="Artefact One">
            <ReportingBoundaryProbe onObservation={(value) => observations.push(value)} />
          </LearningEventRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(observations).toHaveLength(1));
    const observation = observations[0];
    if (!observation?.session) throw new Error("expected a Learning Event session");
    expect(() => invokePublicReporter(observation.reporter, input)).not.toThrow();
    await flushPromises();

    expect(port.accept).not.toHaveBeenCalled();
    expect(observation.session.getState()).toEqual({
      status: "terminated",
      startedAt: null,
      acceptance: "failed",
    });
  });

  it.each([
    {
      label: "a throwing getter",
      input: Object.defineProperty({}, "type", {
        enumerable: true,
        get: () => {
          throw new Error("hostile getter");
        },
      }),
    },
    {
      label: "a hostile proxy",
      input: new Proxy(
        {},
        {
          get: () => {
            throw new Error("hostile proxy");
          },
        },
      ),
    },
  ])("contains parser exceptions from $label", async ({ input }) => {
    const port = createPort();
    const observations: ReportingBoundaryObservation[] = [];

    render(
      <ScaffoldServicesProvider ports={{ learningEvents: port }}>
        <ScaffoldArtifactIdentityProvider artifactId="artifact-one">
          <LearningEventRuntimeProvider artefactTitle="Artefact One">
            <ReportingBoundaryProbe onObservation={(value) => observations.push(value)} />
          </LearningEventRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(observations).toHaveLength(1));
    const observation = observations[0];
    if (!observation?.session) throw new Error("expected a Learning Event session");
    expect(() => invokePublicReporter(observation.reporter, input)).not.toThrow();
    await flushPromises();

    expect(port.accept).not.toHaveBeenCalled();
    expect(observation.session.getState()).toEqual({
      status: "terminated",
      startedAt: null,
      acceptance: "failed",
    });
    expect(() =>
      invokePublicReporter(observation.reporter, {
        type: "resource.launched",
        resourceId: "resource-1",
        resourceKind: "article",
      }),
    ).not.toThrow();
    await flushPromises();
    expect(port.accept).not.toHaveBeenCalled();
  });

  it("creates UUIDs from secure random bytes when randomUUID is unavailable", async () => {
    const getRandomValues = vi.fn(<T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint8Array) {
        array.set([
          0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee,
          0xff,
        ]);
      }
      return array;
    });
    vi.stubGlobal("crypto", { getRandomValues });
    const port = createPort();

    render(
      <RuntimeRoot artifactId="course-one" autoStart port={port} onObservation={() => undefined} />,
    );

    await waitFor(() => expect(port.accept).toHaveBeenCalledTimes(1));
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(port.accept.mock.calls[0]?.[0].id).toBe("00112233-4455-4677-8899-aabbccddeeff");
  });

  it.each([
    { artifactId: null, port: createPort(), label: "unsafe artifact identity" },
    { artifactId: "course-one", port: null, label: "absent port" },
    {
      artifactId: "course-one",
      port: createPort("not an absolute IRI"),
      label: "invalid Activity IRI",
    },
  ])("makes recording unavailable for $label", async ({ artifactId, port }) => {
    const observations: LearningEventObservation[] = [];

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
    if (!observation) throw new Error("expected an Learning Event observation");
    expect(observation.session).toBeNull();
    expect(observation.getSession()).toBeNull();
    if (port) expect(port.accept).not.toHaveBeenCalled();
  });

  it("retains one session and accessor for a stable tuple, including title changes", async () => {
    const port = createPort();
    const observations: LearningEventObservation[] = [];
    const onObservation = (observation: LearningEventObservation) => {
      observations.push(observation);
    };
    const { rerender } = render(
      <RuntimeRoot
        artifactId=" course-one "
        artefactTitle="Course One"
        port={port}
        onObservation={onObservation}
      />,
    );

    await waitFor(() => expect(observations).toHaveLength(1));
    const first = observations[0];
    if (!first?.session) throw new Error("expected an Learning Event session");

    rerender(
      <RuntimeRoot
        artifactId="course-one"
        artefactTitle="Renamed Course"
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
      const rootActivityId = "https://learning.example.test/courses/course-1";
      const firstPort = createPort(rootActivityId);
      const secondPort =
        replacement === "port"
          ? createPort(rootActivityId)
          : firstPort;
      const observations: LearningEventObservation[] = [];
      const onObservation = (observation: LearningEventObservation) => {
        observations.push(observation);
      };
      const { rerender } = render(
        <RuntimeRoot
          artifactId="course-one"
          autoStart
          port={firstPort}
          onObservation={onObservation}
        />,
      );

      await waitFor(() => expect(observations).toHaveLength(1));
      await waitFor(() => expect(firstPort.accept).toHaveBeenCalledTimes(1));
      const first = observations[0];
      if (!first?.session) throw new Error("expected the first Learning Event session");

      rerender(
        <RuntimeRoot
          artifactId={replacement === "artifact" ? "course-two" : "course-one"}
          autoStart
          port={secondPort}
          onObservation={onObservation}
        />,
      );

      await waitFor(() => expect(observations).toHaveLength(2));
      await flushPromises();
      const second = observations[1];
      if (!second?.session) throw new Error("expected the replacement Learning Event session");

      expect(second.session).not.toBe(first.session);
      expect(second.getSession).toBe(first.getSession);
      expect(second.getSession()).toBe(second.session);
      expect(first.session.getState()).toEqual({
        status: "terminated",
        startedAt: expect.any(String),
        acceptance: "accepted",
      });
      expect(second.session.getState()).toMatchObject({ status: "active" });
      if (replacement === "artifact") {
        const verbs = firstPort.accept.mock.calls.map(([event]) => event.verb.display.en);
        expect(verbs.filter((verb) => verb === "initialized")).toHaveLength(2);
        expect(verbs.filter((verb) => verb === "terminated")).toHaveLength(1);
      } else {
        expect(firstPort.accept.mock.calls.map(([event]) => event.verb.display.en)).toEqual([
          "initialized",
          "terminated",
        ]);
        expect(secondPort.accept.mock.calls.map(([event]) => event.verb.display.en)).toEqual([
          "initialized",
        ]);
      }
    },
  );

  it("creates isolated sessions for simultaneous provider roots", async () => {
    const port = createPort();
    const observations: Array<LearningEventObservation | null> = [null, null];

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
    const observations: LearningEventObservation[] = [];
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

    await waitFor(() => expect(port.accept).toHaveBeenCalledTimes(1));
    const session = observations[0]?.session;
    if (!session) throw new Error("expected a started Learning Event session");

    root.unmount();
    await waitFor(() => expect(port.accept).toHaveBeenCalledTimes(2));

    expect(port.accept.mock.calls.map(([event]) => event.verb.display.en)).toEqual([
      "initialized",
      "terminated",
    ]);
    expect(session.getState()).toMatchObject({
      status: "terminated",
      acceptance: "accepted",
    });
  });

  it("does not terminate during StrictMode effect replay", async () => {
    const port = createPort();
    const sessions: LearningEventSession[] = [];
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

    await waitFor(() => expect(port.accept).toHaveBeenCalledTimes(1));
    await flushPromises();
    expect(port.accept).toHaveBeenCalledTimes(1);
    expect(sessions.at(-1)?.getState()).toMatchObject({ status: "active" });

    root.unmount();
    await waitFor(() => expect(port.accept).toHaveBeenCalledTimes(2));
    expect(port.accept.mock.calls[1]?.[0].verb.display.en).toBe("terminated");
  });
});

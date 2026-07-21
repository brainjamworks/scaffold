// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type { AssessmentPort, LearnerActivityPort } from "@/host/ports";
import { createScaffoldDocumentContent } from "@/format/artifact";

import { ContentRuntimeHost } from "../app/ContentRuntimeHost";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import type { AssessmentStoreApi } from "../assessment/types";
import type { LearnerActivityStoreApi } from "./types";

const capturedStores = vi.hoisted(() => ({
  assessment: new Map<string, unknown>(),
  learnerActivity: new Map<string, unknown>(),
}));

vi.mock("../players/page/PagePlayer", async () => {
  const { useEffect } = await import("react");
  const { useAssessmentStoreApi } = await import("../assessment/AssessmentRuntimeProvider");
  const { useScopedLearnerActivityApi } = await import("./LearnerActivityRuntimeProvider");

  return {
    PagePlayer({ surfaceId }: { surfaceId: string }) {
      const assessmentStore = useAssessmentStoreApi();
      const learnerActivityStore = useScopedLearnerActivityApi();

      useEffect(() => {
        capturedStores.assessment.set(surfaceId, assessmentStore);
        capturedStores.learnerActivity.set(surfaceId, learnerActivityStore);
      }, [assessmentStore, learnerActivityStore, surfaceId]);

      return <div data-testid={`composition-player-${surfaceId}`} />;
    },
  };
});

afterEach(() => {
  cleanup();
  capturedStores.assessment.clear();
  capturedStores.learnerActivity.clear();
  vi.restoreAllMocks();
});

function runtimeContent(surfaceId: string): JSONContent {
  return createScaffoldDocumentContent({ mode: "page", surfaceId });
}

function storesFor(surfaceId: string) {
  const assessment = capturedStores.assessment.get(surfaceId) as AssessmentStoreApi | undefined;
  const learnerActivity = capturedStores.learnerActivity.get(surfaceId) as
    | LearnerActivityStoreApi
    | undefined;

  if (!assessment || !learnerActivity) {
    throw new Error(`runtime stores were not captured for ${surfaceId}`);
  }

  return { assessment, learnerActivity };
}

function registerAssessment(store: AssessmentStoreApi, problemId: string) {
  const identity = {
    problemId,
    targetId: `${problemId}-target`,
    interactionKind: "single-select" as const,
  };

  store.getState().register({
    ...identity,
    response: {
      schema: z.object({ choice: z.string().nullable() }),
      toContractResponse: (response) => ({
        kind: "single-select",
        optionId:
          typeof response === "object" &&
          response !== null &&
          "choice" in response &&
          typeof response.choice === "string"
            ? response.choice
            : null,
      }),
      fromContractResponse: (response) => ({
        choice: response.kind === "single-select" ? response.optionId : null,
      }),
      hasResponse: (response) =>
        typeof response === "object" &&
        response !== null &&
        "choice" in response &&
        typeof response.choice === "string",
    },
    config: {
      experience: {
        submit: true,
        attempts: true,
        hints: false,
        showAnswer: false,
        summaryFeedback: true,
        perItemFeedback: true,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: false,
        points: 1,
        maxAttempts: null,
      },
      hintsTotal: 0,
    },
  });

  return identity;
}

function ensureChecklist(store: LearnerActivityStoreApi, blockId: string) {
  store.getState().ensureActivity({
    blockId,
    activityKind: "checklist",
    initial: { data: { checked: false }, completed: false },
  });
}

describe("learner activity runtime composition", () => {
  it("keeps no-port learner activity local and independent from assessment", async () => {
    const mounted = render(
      <ScaffoldServicesProvider ports={{}}>
        <ContentRuntimeHost
          artifactId="artifact-one"
          initialContent={runtimeContent("surface-no-port")}
        />
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(capturedStores.assessment.size).toBe(1));
    const { assessment, learnerActivity } = storesFor("surface-no-port");

    ensureChecklist(learnerActivity, "checklist-one");
    learnerActivity.getState().setCompleted("checklist-one", true);

    expect(learnerActivity.getState().activities["checklist-one"]?.completed).toBe(true);
    expect(learnerActivity.getState().saves["checklist-one"]).toMatchObject({
      status: "unavailable",
      error: null,
    });
    expect(assessment.getState().durable).toEqual({ problems: {}, quizzes: {} });

    const assessmentIdentity = registerAssessment(assessment, "problem-one");
    assessment.getState().setLocalResponse(assessmentIdentity, { choice: "option-one" });

    expect(assessment.getState().durable.problems).not.toEqual({});
    expect(learnerActivity.getState().activities["checklist-one"]?.completed).toBe(true);
    expect(assessment.getState()).not.toHaveProperty("progress");
    expect(learnerActivity.getState()).not.toHaveProperty("progress");

    mounted.unmount();
    expect(assessment.getState().durable.problems).not.toEqual({});
    expect(learnerActivity.getState().activities["checklist-one"]?.completed).toBe(true);
  });

  it("contains persistence failures within their owning sibling domain", async () => {
    const learnerActivityPort: LearnerActivityPort = {
      load: vi.fn(async () => null),
      save: vi.fn(async () => Promise.reject(new Error("activity save denied"))),
    };
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: vi.fn(async () => Promise.reject(new Error("assessment submit denied"))),
    };

    render(
      <ScaffoldServicesProvider
        ports={{ assessment: assessmentPort, learnerActivity: learnerActivityPort }}
      >
        <ContentRuntimeHost
          artifactId="artifact-one"
          initialContent={runtimeContent("surface-failures")}
        />
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(capturedStores.assessment.size).toBe(1));
    const { assessment, learnerActivity } = storesFor("surface-failures");

    ensureChecklist(learnerActivity, "checklist-one");
    await waitFor(() =>
      expect(learnerActivity.getState().saves["checklist-one"]?.status).toBe("error"),
    );
    expect(assessment.getState().durable).toEqual({ problems: {}, quizzes: {} });

    const assessmentIdentity = registerAssessment(assessment, "problem-one");
    assessment.getState().setLocalResponse(assessmentIdentity, { choice: "option-one" });
    await expect(assessment.getState().submit(assessmentIdentity)).resolves.toBeNull();

    const requests = assessment.getState().requests;
    expect(requests[assessmentIdentity.problemId as keyof typeof requests]).toBeUndefined();
    expect(Object.values(assessment.getState().requests)[0]).toMatchObject({
      status: "error",
      error: "assessment submit denied",
    });
    expect(learnerActivity.getState().activities["checklist-one"]?.data).toEqual({
      checked: false,
    });
    expect(learnerActivity.getState().saves["checklist-one"]?.error).toBe("activity save denied");
  });

  it("unmounts one same-artifact root without changing the surviving stores", async () => {
    const first = render(
      <ScaffoldServicesProvider ports={{}}>
        <ContentRuntimeHost
          artifactId="shared-artifact"
          initialContent={runtimeContent("surface-first")}
        />
      </ScaffoldServicesProvider>,
    );
    render(
      <ScaffoldServicesProvider ports={{}}>
        <ContentRuntimeHost
          artifactId="shared-artifact"
          initialContent={runtimeContent("surface-second")}
        />
      </ScaffoldServicesProvider>,
    );

    await waitFor(() => expect(capturedStores.assessment.size).toBe(2));
    const firstStores = storesFor("surface-first");
    const secondStores = storesFor("surface-second");

    expect(firstStores.assessment).not.toBe(secondStores.assessment);
    expect(firstStores.learnerActivity).not.toBe(secondStores.learnerActivity);

    ensureChecklist(firstStores.learnerActivity, "shared-checklist");
    registerAssessment(firstStores.assessment, "shared-problem");
    expect(secondStores.learnerActivity.getState().activities).toEqual({});
    expect(secondStores.assessment.getState().registrations).toEqual({});

    first.unmount();
    expect(firstStores.learnerActivity.getState().activities["shared-checklist"]).toBeDefined();
    expect(firstStores.assessment.getState().registrations).not.toEqual({});
    expect(secondStores.learnerActivity.getState().activities).toEqual({});
    expect(secondStores.assessment.getState().registrations).toEqual({});

    ensureChecklist(secondStores.learnerActivity, "shared-checklist");
    registerAssessment(secondStores.assessment, "shared-problem");
    expect(secondStores.learnerActivity.getState().activities["shared-checklist"]).toBeDefined();
    expect(secondStores.assessment.getState().registrations).not.toEqual({});
    expect(firstStores.learnerActivity.getState().activities["shared-checklist"]).toBeDefined();
    expect(firstStores.assessment.getState().registrations).not.toEqual({});
  });
});

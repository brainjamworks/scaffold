// @vitest-environment happy-dom

import { render, waitFor } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import type { AssessmentProblemSnapshot, AssessmentResult } from "@scaffold/contracts";
import type { AssessmentPort } from "../../host/ports/assessment";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import {
  AssessmentRuntimeProvider,
  useAssessmentStoreApi,
  useAssessmentStoreSelector,
} from "./AssessmentRuntimeProvider";
import type { AssessmentStoreApi } from "./types";
import { scopeAssessmentProblemId } from "./assessment-store";

function createAssessmentPort(): AssessmentPort {
  return {
    type: "runtime",
    submit: vi.fn(),
  };
}

function assessmentResult(): AssessmentResult {
  return {
    isCorrect: true,
    score: 1,
    maxScore: 1,
    feedback: null,
    items: {},
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function registerResponse(store: AssessmentStoreApi) {
  const identity = {
    problemId: "block-one",
    targetId: "target-one",
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
  store.getState().setLocalResponse(identity, { choice: "option-one" });

  return identity;
}

function StoreProbe({ onStore }: { onStore: (store: AssessmentStoreApi | null) => void }) {
  const store = useAssessmentStoreApi();

  useEffect(() => {
    onStore(store);
  }, [onStore, store]);

  return null;
}

function ArtifactSelectorProbe() {
  const artifactId = useAssessmentStoreSelector((state) => state.artifactId);

  return <p data-testid="assessment-artifact-id">{artifactId}</p>;
}

function RuntimeRoot({
  artifactId,
  assessmentPort,
  onStore,
}: {
  artifactId: string | null;
  assessmentPort: AssessmentPort | null;
  onStore: (store: AssessmentStoreApi | null) => void;
}) {
  return (
    <ScaffoldServicesProvider ports={{ assessment: assessmentPort }}>
      <ScaffoldArtifactIdentityProvider artifactId={artifactId}>
        <AssessmentRuntimeProvider>
          <StoreProbe onStore={onStore} />
        </AssessmentRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>
    </ScaffoldServicesProvider>
  );
}

describe("AssessmentRuntimeProvider", () => {
  it("keeps its store live through StrictMode effect replay", async () => {
    const stores: AssessmentStoreApi[] = [];

    render(
      <StrictMode>
        <RuntimeRoot
          artifactId="artifact-one"
          assessmentPort={createAssessmentPort()}
          onStore={(nextStore) => {
            if (nextStore && !stores.includes(nextStore)) stores.push(nextStore);
          }}
        />
      </StrictMode>,
    );

    await waitFor(() => expect(stores).toHaveLength(1));
    await Promise.resolve();
    const store = stores[0];
    if (!store) throw new Error("expected an assessment store");

    const identity = registerResponse(store);
    expect(
      store.getState().durable.problems[
        scopeAssessmentProblemId("artifact-one", identity.problemId)
      ],
    ).toBeDefined();
  });

  it("retains one store when artifact and port identities stay stable", async () => {
    const assessmentPort = createAssessmentPort();
    const stores: AssessmentStoreApi[] = [];
    const onStore = (store: AssessmentStoreApi | null) => {
      if (store) stores.push(store);
    };
    const { rerender } = render(
      <RuntimeRoot artifactId="artifact-one" assessmentPort={assessmentPort} onStore={onStore} />,
    );

    await waitFor(() => expect(stores).toHaveLength(1));

    rerender(
      <RuntimeRoot artifactId="artifact-one" assessmentPort={assessmentPort} onStore={onStore} />,
    );

    expect(stores).toHaveLength(1);
    expect(stores[0]?.getState().artifactId).toBe("artifact-one");
  });

  it("creates an isolated fresh store when artifact identity changes", async () => {
    const assessmentPort = createAssessmentPort();
    const stores: AssessmentStoreApi[] = [];
    const onStore = (store: AssessmentStoreApi | null) => {
      if (store) stores.push(store);
    };
    const { rerender } = render(
      <RuntimeRoot artifactId="artifact-one" assessmentPort={assessmentPort} onStore={onStore} />,
    );

    await waitFor(() => expect(stores).toHaveLength(1));
    const firstStore = stores[0];
    if (!firstStore) throw new Error("expected the first assessment store");
    registerResponse(firstStore);

    rerender(
      <RuntimeRoot artifactId="artifact-two" assessmentPort={assessmentPort} onStore={onStore} />,
    );

    await waitFor(() => expect(stores).toHaveLength(2));
    expect(stores[1]).not.toBe(firstStore);
    expect(stores[1]?.getState().artifactId).toBe("artifact-two");
    expect(stores[1]?.getState().durable).toEqual({ problems: {}, quizzes: {} });
  });

  it("creates an isolated fresh store when port identity changes", async () => {
    const stores: AssessmentStoreApi[] = [];
    const onStore = (store: AssessmentStoreApi | null) => {
      if (store) stores.push(store);
    };
    const { rerender } = render(
      <RuntimeRoot
        artifactId="artifact-one"
        assessmentPort={createAssessmentPort()}
        onStore={onStore}
      />,
    );

    await waitFor(() => expect(stores).toHaveLength(1));
    const firstStore = stores[0];
    if (!firstStore) throw new Error("expected the first assessment store");
    registerResponse(firstStore);

    rerender(
      <RuntimeRoot
        artifactId="artifact-one"
        assessmentPort={createAssessmentPort()}
        onStore={onStore}
      />,
    );

    await waitFor(() => expect(stores).toHaveLength(2));
    expect(stores[1]).not.toBe(firstStore);
    expect(stores[1]?.getState().durable).toEqual({ problems: {}, quizzes: {} });
  });

  it("creates different stores for simultaneous roots with the same artifact", async () => {
    const assessmentPort = createAssessmentPort();
    const stores: Array<AssessmentStoreApi | null> = [null, null];

    render(
      <>
        <RuntimeRoot
          artifactId="shared-artifact"
          assessmentPort={assessmentPort}
          onStore={(store) => {
            stores[0] = store;
          }}
        />
        <RuntimeRoot
          artifactId="shared-artifact"
          assessmentPort={assessmentPort}
          onStore={(store) => {
            stores[1] = store;
          }}
        />
      </>,
    );

    await waitFor(() => expect(stores[0]).not.toBeNull());
    await waitFor(() => expect(stores[1]).not.toBeNull());
    expect(stores[0]).not.toBe(stores[1]);
    expect(stores[0]?.getState().artifactId).toBe("shared-artifact");
    expect(stores[1]?.getState().artifactId).toBe("shared-artifact");
  });

  it("unmounts one root without clearing or disabling a sibling root", async () => {
    const stores: Array<AssessmentStoreApi | null> = [null, null];
    const first = render(
      <RuntimeRoot
        artifactId="shared-artifact"
        assessmentPort={createAssessmentPort()}
        onStore={(store) => {
          stores[0] = store;
        }}
      />,
    );
    render(
      <RuntimeRoot
        artifactId="shared-artifact"
        assessmentPort={createAssessmentPort()}
        onStore={(store) => {
          stores[1] = store;
        }}
      />,
    );

    await waitFor(() => expect(stores[0]).not.toBeNull());
    await waitFor(() => expect(stores[1]).not.toBeNull());
    const firstStore = stores[0];
    const siblingStore = stores[1];
    if (!firstStore || !siblingStore) throw new Error("expected both assessment stores");
    const firstIdentity = registerResponse(firstStore);
    first.unmount();

    expect(
      firstStore.getState().durable.problems[
        scopeAssessmentProblemId("shared-artifact", firstIdentity.problemId)
      ],
    ).toBeDefined();
    const siblingIdentity = registerResponse(siblingStore);
    expect(
      siblingStore.getState().durable.problems[
        scopeAssessmentProblemId("shared-artifact", siblingIdentity.problemId)
      ],
    ).toBeDefined();
  });

  it("keeps a pending completion isolated from a replacement scope", async () => {
    const pending = deferred<{ problem: AssessmentProblemSnapshot }>();
    const stores: AssessmentStoreApi[] = [];
    const assessmentPort: AssessmentPort = { type: "runtime", submit: () => pending.promise };
    const mounted = render(
      <RuntimeRoot
        artifactId="artifact-one"
        assessmentPort={assessmentPort}
        onStore={(nextStore) => {
          if (nextStore) stores.push(nextStore);
        }}
      />,
    );

    await waitFor(() => expect(stores).toHaveLength(1));
    const store = stores[0];
    if (!store) throw new Error("expected an assessment store");
    const identity = registerResponse(store);
    const submission = store.getState().submit(identity);

    mounted.rerender(
      <RuntimeRoot
        artifactId="artifact-two"
        assessmentPort={assessmentPort}
        onStore={(nextStore) => {
          if (nextStore) stores.push(nextStore);
        }}
      />,
    );
    await waitFor(() => expect(stores).toHaveLength(2));
    const replacementStore = stores[1];
    if (!replacementStore) throw new Error("expected a replacement assessment store");

    pending.resolve({
      problem: {
        response: { kind: "single-select", optionId: "option-b" },
        attemptNumber: 1,
        hintsShown: 0,
        checkResult: assessmentResult(),
        submitted: true,
        submissionResult: assessmentResult(),
      },
    });

    await expect(submission).resolves.toEqual(assessmentResult());
    expect(replacementStore.getState().durable).toEqual({ problems: {}, quizzes: {} });
    expect(replacementStore.getState().requests).toEqual({});
  });

  it("creates an isolated fail-closed store when the assessment port is null", async () => {
    const stores: AssessmentStoreApi[] = [];

    render(
      <RuntimeRoot
        artifactId="artifact-one"
        assessmentPort={null}
        onStore={(nextStore) => {
          if (nextStore) stores.push(nextStore);
        }}
      />,
    );

    await waitFor(() => expect(stores).toHaveLength(1));
    const store = stores[0];
    if (!store) throw new Error("expected an assessment store");
    const identity = registerResponse(store);
    const problemId = scopeAssessmentProblemId("artifact-one", "block-one");

    await expect(store.getState().submit(identity)).resolves.toBeNull();
    expect(store.getState().requests[problemId]).toMatchObject({
      status: "error",
      error: "Assessment submission is unavailable",
    });
    expect(store.getState().durable.problems[problemId]).toMatchObject({
      attemptNumber: 0,
      submitted: false,
      submissionResult: null,
    });
  });

  it("provides null without creating a store when artifact identity is invalid", async () => {
    const stores: Array<AssessmentStoreApi | null> = [];

    render(
      <RuntimeRoot
        artifactId=" "
        assessmentPort={createAssessmentPort()}
        onStore={(store) => stores.push(store)}
      />,
    );

    await waitFor(() => expect(stores).toEqual([null]));
  });

  it("reports hook use outside the provider explicitly", () => {
    expect(() => render(<StoreProbe onStore={() => {}} />)).toThrow(
      "Assessment store hooks must be used inside an AssessmentRuntimeProvider.",
    );
  });

  it("selects runtime state through the provider store", () => {
    render(
      <ScaffoldServicesProvider ports={{ assessment: createAssessmentPort() }}>
        <ScaffoldArtifactIdentityProvider artifactId="artifact-one">
          <AssessmentRuntimeProvider>
            <ArtifactSelectorProbe />
          </AssessmentRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>
      </ScaffoldServicesProvider>,
    );

    expect(document.querySelector("[data-testid='assessment-artifact-id']")?.textContent).toBe(
      "artifact-one",
    );
  });

  it("reports selector use without a valid artifact store explicitly", () => {
    expect(() =>
      render(
        <ScaffoldServicesProvider ports={{ assessment: createAssessmentPort() }}>
          <ScaffoldArtifactIdentityProvider artifactId=" ">
            <AssessmentRuntimeProvider>
              <ArtifactSelectorProbe />
            </AssessmentRuntimeProvider>
          </ScaffoldArtifactIdentityProvider>
        </ScaffoldServicesProvider>,
      ),
    ).toThrow("Assessment store selectors require a valid runtime artifact identity.");
  });
});

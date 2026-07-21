// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Editor, Node } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { mcqResponseCodec } from "../../mcq/assessment";
import { pageAssessmentExperience } from "../model/assessment-capability";
import {
  useAssessmentBlockSetup,
  type AssessmentBlockSetupConfig,
} from "./use-assessment-block-setup";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import {
  AssessmentRuntimeProvider,
  useAssessmentStoreApi,
} from "@/runtime/assessment/AssessmentRuntimeProvider";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";
import { scopeAssessmentProblemId } from "@/runtime/assessment/assessment-store";

const TestAssessmentNode = Node.create({
  name: "test_assessment_block",
  group: "block",
  atom: true,
  addAttributes: () => ({ id: { default: null } }),
  parseHTML: () => [{ tag: "div[data-test-assessment-block]" }],
  renderHTML: () => ["div", { "data-test-assessment-block": "" }],
});

const config: AssessmentBlockSetupConfig = {
  targetId: "block-1",
  interactionKind: "single-select",
  feedbackMode: "on_submit",
  maxAttempts: 2,
  showAnswerEnabled: true,
  experience: pageAssessmentExperience,
  hintsTotal: 1,
  points: 2,
  isGraded: true,
  responseCodec: mcqResponseCodec,
};

const editors: Editor[] = [];
let capturedStore: AssessmentStoreApi | null = null;

function StoreCapture() {
  capturedStore = useAssessmentStoreApi();
  return null;
}

function SetupProbe({
  node,
  setupConfig = config,
}: {
  node: PMNode;
  setupConfig?: AssessmentBlockSetupConfig;
}) {
  const setup = useAssessmentBlockSetup({ node, config: setupConfig });
  return (
    <>
      <p data-testid="problem-id">{setup.problemId}</p>
      <p data-testid="status">{setup.facade.status}</p>
      <p data-testid="unsafe">{String(setup.hasUnsafeIdentity)}</p>
    </>
  );
}

function makeNode(blockId: string | null = "block-1") {
  const editor = new Editor({
    extensions: [StarterKit.configure({ undoRedo: false }), TestAssessmentNode],
    content: { type: "doc", content: [{ type: "test_assessment_block", attrs: { id: blockId } }] },
  });
  editors.push(editor);
  const node = editor.state.doc.firstChild;
  if (!node) throw new Error("expected assessment test node");
  return node;
}

function RuntimeRoot({ children }: { children?: ReactNode }) {
  return (
    <ScaffoldServicesProvider ports={{ assessment: null }}>
      <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
        <AssessmentRuntimeProvider>
          <StoreCapture />
          {children}
        </AssessmentRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>
    </ScaffoldServicesProvider>
  );
}

afterEach(() => {
  cleanup();
  capturedStore = null;
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("useAssessmentBlockSetup", () => {
  it("registers authored identity through the artifact-scoped facade", async () => {
    render(
      <RuntimeRoot>
        <SetupProbe node={makeNode()} />
      </RuntimeRoot>,
    );

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("registered"));
    expect(screen.getByTestId("problem-id").textContent).toBe("artifact:artifact-1/block:block-1");
    expect(
      capturedStore?.getState().registrations["artifact:artifact-1/block:block-1"],
    ).toMatchObject({ targetId: "block-1", interactionKind: "single-select" });
  });

  it("updates config without replacing durable response state", async () => {
    const node = makeNode();
    const mounted = render(
      <RuntimeRoot>
        <SetupProbe node={node} />
      </RuntimeRoot>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("registered"));
    const problemId = scopeAssessmentProblemId("artifact-1", "block-1");
    capturedStore
      ?.getState()
      .setLocalResponse(
        { problemId: "block-1", targetId: "block-1", interactionKind: "single-select" },
        { choices: "a" },
      );
    const durableBefore = capturedStore?.getState().durable.problems[problemId];

    mounted.rerender(
      <RuntimeRoot>
        <SetupProbe node={node} setupConfig={{ ...config, hintsTotal: 3 }} />
      </RuntimeRoot>,
    );

    await waitFor(() =>
      expect(capturedStore?.getState().registrations[problemId]?.config.hintsTotal).toBe(3),
    );
    expect(capturedStore?.getState().durable.problems[problemId]).toBe(durableBefore);
  });

  it("reports an authored block without an id as unsafe", () => {
    render(
      <RuntimeRoot>
        <SetupProbe node={makeNode("")} />
      </RuntimeRoot>,
    );

    expect(screen.getByTestId("unsafe").textContent).toBe("true");
    expect(capturedStore?.getState().registrations).toEqual({});
  });

  it("unregisters facade registration state on unmount", async () => {
    const mounted = render(
      <RuntimeRoot>
        <SetupProbe node={makeNode()} />
      </RuntimeRoot>,
    );
    const problemId = scopeAssessmentProblemId("artifact-1", "block-1");
    await waitFor(() => expect(capturedStore?.getState().registrations[problemId]).toBeDefined());

    mounted.rerender(<RuntimeRoot />);

    expect(capturedStore?.getState().registrations[problemId]).toBeUndefined();
  });
});

// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import {
  EmbeddedNodeIdSchema,
  McqSettingsSchema,
  ScaffoldArtifactSchema,
  type EmbeddedNodeId,
  type ScaffoldDocumentContent,
} from "@scaffold/contracts";
import { StrictMode, type ReactElement, type ReactNode } from "react";
import { Result } from "better-result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
} from "@/composition/application/create-scaffold-application";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { defineBlock } from "@/editor/blocks/block-definition";
import { McqAuthoringExtension } from "@/editor/blocks/assessment/mcq/mcq-authoring-extension";
import { McqRuntimeExtension } from "@/editor/blocks/assessment/mcq/mcq-runtime-extension";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { ScaffoldUnavailableAgentIntegration } from "@/editor/shell/agent/ScaffoldUnavailableAgentIntegration";
import type { AuthorPreviewTransport } from "./author-preview-session-controller";

import { documentAuthoringPluginKey } from "@/document/authoring/document-authoring-storage";
import { createFakeWorkspaceDocumentOwners } from "@/editor/shell/workspaces/testing/fake-workspace-document-owners";
import { type CourseDocumentAuthoringMount } from "@/document/authoring/prepared-authoring-mount";
import type {
  ArtifactPersistenceResult,
  ArtifactSavePayload,
  LearnerPublicationPayload,
  LearnerPublicationPort,
} from "@/host/ports";
import type { ScaffoldAuthoringHostServices } from "@/host/contracts";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

const mocks = vi.hoisted(() => {
  return {
    authorJSON: {} as JSONContent,
    blockStripProps: [] as Array<Record<string, unknown>>,
    fakeEditor: {
      getJSON: vi.fn(),
      isDestroyed: false,
      storage: {} as Record<string, unknown>,
      state: {
        doc: {
          firstChild: {
            attrs: {} as Record<string, unknown>,
          },
        },
      },
    },
    authorPreviewModuleError: null as unknown,
    authorPreviewMounts: 0,
    learnerModuleReads: 0,
    learnerAppProps: [] as Array<Record<string, unknown>>,
    contentAuthorHostProps: [] as Array<Record<string, unknown>>,
    contentAuthorHostRenderCount: 0,
    renderBottomWorkspace: false,
    autoOpenWorkspace: true,
    stubLearnerInteractionSave: false,
    learnerInteractionSaves: [] as Array<Record<string, unknown>>,
    savedBundles: [] as Array<ArtifactSavePayload>,
  };
});

vi.mock("@/editor/shell/chrome/BlockStrip", async () => {
  const React = await import("react");
  const { createElement } = React;

  return {
    BlockStrip: (props: Record<string, unknown>) => {
      mocks.blockStripProps.push(props);
      return createElement("aside", { "data-testid": "block-strip" });
    },
  };
});

vi.mock("@/editor/shell/chrome/Header", async () => {
  const { createElement } = await import("react");

  return {
    canonicalizeDocumentTitle: (title: string) => title.trim() || "Untitled",
    Header: ({
      actions,
      onTitleChange,
      saveState,
      title,
    }: {
      actions?: ReactNode;
      onTitleChange?: (title: string) => void;
      saveState?: string;
      title: string;
    }) =>
      createElement(
        "header",
        { "data-save-state": saveState },
        createElement("h1", null, title),
        createElement("input", {
          "aria-label": "Document title",
          onChange: (event: { currentTarget: { value: string } }) =>
            onTitleChange?.(event.currentTarget.value),
          value: title,
        }),
        createElement(
          "button",
          { type: "button", onClick: () => onTitleChange?.("Changed title") },
          "Change title",
        ),
        actions,
      ),
  };
});

vi.mock("@/editor/shell/chrome/Toolbar", async () => {
  const { createElement } = await import("react");

  return {
    Toolbar: () => createElement("aside", { "data-testid": "toolbar" }),
  };
});

vi.mock("@/editor/presentation/timeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/editor/presentation/timeline")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    PresentationTimeline: () =>
      createElement(
        "section",
        { "data-testid": "presentation-timeline" },
        createElement("h2", null, "Timeline"),
      ),
  };
});

vi.mock("@/editor/learner-interaction/model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/editor/learner-interaction/model")>();
  const { Result: BetterResult } = await import("better-result");
  return {
    ...actual,
    saveLearnerInteractionRule: (
      input: Parameters<typeof actual.saveLearnerInteractionRule>[0],
    ) => {
      if (!mocks.stubLearnerInteractionSave) return actual.saveLearnerInteractionRule(input);
      mocks.learnerInteractionSaves.push(input);
      return BetterResult.ok("testrule0001");
    },
  };
});

vi.mock("@/editor/shell/outline/DocumentOutlineHost", async () => {
  const { createElement } = await import("react");

  return {
    DocumentOutlineHost: ({ onClose }: { onClose: () => void }) =>
      createElement(
        "aside",
        { "data-testid": "authoring-outline-dock" },
        createElement("button", { type: "button", onClick: onClose }, "Close Document Outline"),
      ),
  };
});

vi.mock("./ContentAuthorHost", async () => {
  const React = await import("react");
  const { createElement, useEffect } = React;
  const { useSurfaceWorkspaceRequest } =
    await import("@/editor/shell/workspaces/surface-workspace-request");

  return {
    ContentAuthorHost: ({
      agentIntegration,
      agentOpen,
      authoringNavigatorDock,
      mount,
      onAgentClose,
      onChange,
      onEditorReady,
      onDocumentError,
      leftRail,
      onUpdate,
      onUnavailableContentChange,
      rightRail,
      courseAppearance,
      bottomWorkspace,
      stagePreview,
    }: {
      agentIntegration?: unknown;
      agentOpen?: boolean;
      authoringNavigatorDock?: (editor: unknown) => ReactNode;
      mount?: CourseDocumentAuthoringMount;
      onAgentClose?: () => void;
      onChange?: (editor: unknown) => void;
      onEditorReady?: (editor: unknown) => void;
      onDocumentError?: (failure: unknown) => void;
      leftRail?: (editor: unknown) => ReactNode;
      onUpdate?: (
        content: unknown,
        unavailableContent: readonly unknown[],
        sourceDocument: object,
      ) => void;
      onUnavailableContentChange?: (content: unknown) => void;
      rightRail?: (editor: unknown) => ReactNode;
      courseAppearance?: unknown;
      bottomWorkspace?: ReactNode;
      stagePreview?: ReactNode;
    }) => {
      mocks.contentAuthorHostRenderCount += 1;
      mocks.contentAuthorHostProps.push({
        agentIntegration,
        agentOpen,
        authoringNavigatorDock,
        mount,
        leftRail,
        onAgentClose,
        onChange,
        onDocumentError,
        onUpdate,
        onUnavailableContentChange,
        courseAppearance,
        rightRail,
        bottomWorkspace,
        stagePreview,
      });
      useEffect(() => {
        onEditorReady?.(mocks.fakeEditor);
      }, [onEditorReady]);
      const workspaceRequest = useSurfaceWorkspaceRequest();
      useEffect(() => {
        if (mocks.autoOpenWorkspace) {
          workspaceRequest?.open("timeline", "workspace001" as never);
        }
      }, [workspaceRequest]);

      return createElement(
        "section",
        { "data-testid": "content-author-host" },
        authoringNavigatorDock?.(mocks.fakeEditor),
        stagePreview,
        createElement(
          "button",
          {
            type: "button",
            onClick: () => workspaceRequest?.open("timeline", "workspace001" as never),
          },
          "Request timeline workspace",
        ),
        createElement(
          "button",
          {
            type: "button",
            onClick: () => workspaceRequest?.open("interactions", "workspace001" as never),
          },
          "Request interactions workspace",
        ),
        mocks.renderBottomWorkspace ? bottomWorkspace : null,
        rightRail?.(mocks.fakeEditor),
        agentOpen
          ? createElement(
              "aside",
              { "data-testid": "authoring-agent-dock" },
              createElement(
                "button",
                { type: "button", onClick: onAgentClose },
                "Close Scaffold Agent",
              ),
            )
          : null,
      );
    },
  };
});

vi.mock("@/runtime/app/ScaffoldLearnerApp", async () => {
  const React = await import("react");
  const { createElement } = React;

  const ScaffoldLearnerApp = (props: Record<string, unknown>) => {
    mocks.learnerAppProps.push(props);
    return createElement("section", {
      "data-testid": "scaffold-learner-app",
    });
  };

  return {
    get ScaffoldLearnerApp() {
      mocks.learnerModuleReads += 1;
      return ScaffoldLearnerApp;
    },
  };
});

vi.mock("@/runtime/app/ScaffoldAuthorPreviewApp", async () => {
  const React = await import("react");
  const { createElement } = React;

  const ScaffoldAuthorPreviewApp = (props: Record<string, unknown>) => {
    mocks.authorPreviewMounts += 1;
    mocks.learnerAppProps.push(props);
    return createElement("section", {
      "data-testid": "scaffold-learner-app",
    });
  };

  return {
    createSlideshowRuntimeProgramSource:
      ({
        presentation,
        learnerInteractions,
      }: {
        presentation?: { autoAdvance: boolean; surfaceById: ReadonlyMap<EmbeddedNodeId, unknown> };
        learnerInteractions?: ReadonlyMap<EmbeddedNodeId, unknown>;
      }) =>
      (surfaceId: EmbeddedNodeId) => {
        const timeline = presentation?.surfaceById.get(surfaceId);
        const learnerInteractionProgram = learnerInteractions?.get(surfaceId);
        if (!timeline && !learnerInteractionProgram) return undefined;
        return {
          ...(timeline && presentation
            ? { presentation: { timeline, autoAdvance: presentation.autoAdvance } }
            : {}),
          ...(learnerInteractionProgram ? { learnerInteractions: learnerInteractionProgram } : {}),
        };
      },
    get ScaffoldAuthorPreviewApp() {
      if (mocks.authorPreviewModuleError) throw mocks.authorPreviewModuleError;
      return ScaffoldAuthorPreviewApp;
    },
  };
});

const testApplication = createScaffoldApplication();
const PRIVATE_ASSESSMENT_NODE_TYPE = "private_assessment_fixture";
const coreMcqDefinition = builtInBlockRegistry.getByNodeType("mcq");
if (!coreMcqDefinition?.capabilities?.assessment || !coreMcqDefinition.insert) {
  throw new Error("expected installed Core MCQ definition");
}
const coreMcqInsert = coreMcqDefinition.insert;
const privateAssessmentDefinition = defineBlock({
  ...coreMcqDefinition,
  nodeType: PRIVATE_ASSESSMENT_NODE_TYPE,
  capabilities: {
    ...coreMcqDefinition.capabilities,
    assessment: {
      ...coreMcqDefinition.capabilities.assessment,
      projection: {
        projectInteraction: () => ({
          kind: "single-select" as const,
          options: [{ id: "option000001", label: "Private option" }],
        }),
        projectAssessment: () => ({
          kind: "single-select" as const,
          correctOptionId: "option000001",
          feedbackByOptionId: {},
        }),
        projectLearnerNode: (node) => ({
          ...node,
          attrs: { id: node.attrs?.["id"], settings: node.attrs?.["settings"] },
        }),
      },
    },
  },
  insert: {
    ...coreMcqDefinition.insert,
    id: "private-assessment-fixture",
    content: () => ({ type: PRIVATE_ASSESSMENT_NODE_TYPE }),
  },
});
const privateAssessmentApplication = createScaffoldApplication({
  packs: [
    defineScaffoldExtensionPack({
      id: "private-assessment-fixture",
      blocks: [
        {
          definition: privateAssessmentDefinition,
          authoringExtension: McqAuthoringExtension.extend({ name: PRIVATE_ASSESSMENT_NODE_TYPE }),
          runtimeExtension: McqRuntimeExtension.extend({ name: PRIVATE_ASSESSMENT_NODE_TYPE }),
        },
      ],
    }),
  ],
});
Object.assign(mocks.fakeEditor.storage, {
  scaffoldAuthoringCatalogues: Object.freeze({
    catalogues: testApplication.authoring.catalogues,
  }),
  scaffoldCapabilities: Object.freeze({
    capabilities: testApplication.capabilities,
  }),
});

import {
  ScaffoldAuthoringApp as PublicScaffoldAuthoringApp,
  type ScaffoldAuthoringAppProps,
} from "./ScaffoldAuthoringApp";
import type { ScaffoldAuthoringHostActionsContext } from "./AuthoringHeaderActions";
import { ScaffoldAuthoringEntry } from "./ScaffoldAuthoringEntry";

const coreProductAccess = { scaffoldPlusAuthorized: false } as const;
const plusProductAccess = { scaffoldPlusAuthorized: true } as const;

function successfulArtifactSaveResult(
  artifactRevision = "test-saved-revision",
  title?: string,
): ArtifactPersistenceResult {
  return Result.ok({
    artifactRevision,
    ...(title === undefined ? {} : { artifact: { title } }),
  });
}

function ScaffoldAuthoringApp(
  props: Omit<ScaffoldAuthoringAppProps, "productAccess" | "services"> & {
    readonly productAccess?: ScaffoldAuthoringAppProps["productAccess"];
    readonly services: Omit<ScaffoldAuthoringHostServices, "learnerPublication"> & {
      readonly learnerPublication?: LearnerPublicationPort;
    };
  },
) {
  const learnerPublication =
    props.services.learnerPublication ?? createDefaultLearnerPublicationPort();
  const services: ScaffoldAuthoringHostServices = {
    ...props.services,
    learnerPublication,
  };
  return (
    <PublicScaffoldAuthoringApp
      {...props}
      productAccess={props.productAccess ?? coreProductAccess}
      services={services}
    />
  );
}

function createDefaultLearnerPublicationPort(): LearnerPublicationPort {
  return {
    getStatus: async () =>
      Result.ok({
        currentArtifactRevision: "test-saved-revision",
        publishedArtifactRevision: null,
        publishedAt: null,
      }),
    publish: async (payload) =>
      Result.ok({
        currentArtifactRevision: payload.sourceArtifactRevision,
        publishedArtifactRevision: payload.sourceArtifactRevision,
        publishedAt: "2026-08-10T12:00:00.000Z",
      }),
  };
}

beforeEach(() => {
  localStorage.clear();
  mocks.authorPreviewMounts = 0;
  mocks.authorPreviewModuleError = null;
  mocks.learnerModuleReads = 0;
  mocks.authorJSON = pageDocumentWithParagraph("authorsurf01", "Author");
  mocks.fakeEditor.getJSON.mockImplementation(() => mocks.authorJSON);
  mocks.fakeEditor.state.doc.firstChild.attrs = mocks.authorJSON.content?.[0]?.attrs ?? {};
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  mocks.learnerAppProps.length = 0;
  mocks.blockStripProps.length = 0;
  mocks.contentAuthorHostProps.length = 0;
  mocks.contentAuthorHostRenderCount = 0;
  mocks.renderBottomWorkspace = false;
  mocks.autoOpenWorkspace = true;
  mocks.stubLearnerInteractionSave = false;
  mocks.learnerInteractionSaves.length = 0;
  mocks.savedBundles.length = 0;
  vi.clearAllMocks();
});

function firstSurfaceAttrs(content: unknown): Record<string, unknown> | null {
  return findJsonNode(content, "surface")?.attrs ?? null;
}

function findJsonNode(content: unknown, type: string): JSONContent | undefined {
  const stack = [content];
  while (stack.length > 0) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;
    const node = value as JSONContent;
    if (node.type === type) return node;
    stack.push(...(node.content ?? []));
  }
  return undefined;
}

function pageDocumentWithParagraph(surfaceId: string, text: string): JSONContent {
  const document = createScaffoldDocumentContent({
    mode: "page",
    surfaceId,
  });
  const surface = document.content?.[0]?.content?.[0];
  if (!surface) {
    throw new Error("expected default page surface");
  }
  surface.content = [
    {
      type: "paragraph",
      attrs: { id: "paragraph001" },
      content: [{ type: "text", text }],
    },
  ];
  return document;
}

function pageDocumentWithEmptyQuiz(): JSONContent {
  const document = pageDocumentWithParagraph("authorsurf01", "Published learner content");
  document.content![0]!.content![0]!.content!.push({
    type: "quiz",
    attrs: { id: "quizempty001", settings: {} },
  });
  return document;
}

function slideshowDocument(surfaceId: string): JSONContent {
  return createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId,
    initialCourseSectionTitle: "Section 1",
  });
}

function slideshowDocumentWithLearnerRule(type: string, isEnabled = true): JSONContent {
  const surfaceId = "publishsurf1";
  const document = slideshowDocument(surfaceId);
  const courseDocument = document.content?.[0];
  if (!courseDocument?.attrs) throw new Error("expected Course Document attributes");
  courseDocument.attrs["learnerInteractions"] = {
    schemaVersion: 1,
    surfaces: [
      {
        surfaceId,
        rules: [
          {
            id: "publishrule1",
            isEnabled,
            when: { targetId: surfaceId, type },
            conditions: [],
            commands: [{ kind: "reveal-target", targetId: surfaceId }],
          },
        ],
      },
    ],
  };
  return document;
}

function presentationPreviewDocument(surfaceId: EmbeddedNodeId): {
  readonly document: ScaffoldDocumentContent;
  readonly surfaceId: EmbeddedNodeId;
} {
  const document = slideshowDocument(surfaceId);
  const courseDocument = document.content?.[0];
  if (!courseDocument?.attrs) throw new Error("expected Course Document attributes");
  courseDocument.attrs["presentation"] = {
    schemaVersion: 1,
    autoAdvance: false,
    allowPrevious: true,
    surfaces: [{ surfaceId, durationMs: 1_000, actions: [] }],
  };
  mocks.authorJSON = document;
  mocks.fakeEditor.state.doc.firstChild.attrs = courseDocument.attrs;

  const surface = {
    id: surfaceId,
    kind: "surface" as const,
    nodeType: "surface",
    definitionId: "slide-cover",
    label: "Preview slide",
    summary: null,
    presentation: { actionIds: [], disabledReason: null },
    presentationContainer: null,
    children: [],
  };
  const semantics = {
    revision: 0,
    mode: "slideshow" as const,
    roots: [surface],
    itemById: new Map([[surfaceId, surface]]),
    parentById: new Map([[surfaceId, null]]),
    locationById: new Map(),
    diagnostics: [],
  };
  const owners = createFakeWorkspaceDocumentOwners([surfaceId]);
  vi.spyOn(owners.documentTree, "getSnapshot").mockReturnValue(semantics);
  vi.spyOn(documentAuthoringPluginKey, "getState").mockReturnValue(
    owners as unknown as NonNullable<ReturnType<typeof documentAuthoringPluginKey.getState>>,
  );
  return { document: document as ScaffoldDocumentContent, surfaceId };
}

function currentAuthorPreviewTransport(): AuthorPreviewTransport {
  const workspace = mocks.contentAuthorHostProps.at(-1)?.["bottomWorkspace"] as
    | ReactElement<{ previewTransport: AuthorPreviewTransport }>
    | undefined;
  if (!workspace?.props.previewTransport) {
    throw new Error("expected the mounted Author Preview transport");
  }
  return workspace.props.previewTransport;
}

function installFakeDocumentOwners(
  surfaceIds: readonly EmbeddedNodeId[],
  options: {
    readonly courseSectionId?: EmbeddedNodeId;
    readonly selectedId?: EmbeddedNodeId | null;
  } = {},
) {
  const owners = createFakeWorkspaceDocumentOwners(surfaceIds, options);
  vi.spyOn(documentAuthoringPluginKey, "getState").mockReturnValue(
    owners as unknown as NonNullable<ReturnType<typeof documentAuthoringPluginKey.getState>>,
  );
  return owners.editorNavigation;
}

function slideshowDocumentWithSurfaces(
  firstSurfaceId: EmbeddedNodeId,
  secondSurfaceId: EmbeddedNodeId,
): JSONContent {
  const first = slideshowDocument(firstSurfaceId);
  const second = slideshowDocument(secondSurfaceId);
  const firstCourseDocument = first.content?.[0];
  const secondSurface = second.content?.[0]?.content?.[1];
  if (!firstCourseDocument?.content || !secondSurface) {
    throw new Error("expected Slideshow fixtures");
  }
  firstCourseDocument.content.push(secondSurface);
  return first;
}

function privateAssessmentDocument(): JSONContent {
  const document = createScaffoldDocumentContent({ mode: "page", surfaceId: "privatesurf1" });
  const surface = document.content?.[0]?.content?.[0];
  if (!surface) throw new Error("expected default page Surface");
  const privateAssessment = coreMcqInsert.content() as JSONContent;
  privateAssessment.type = PRIVATE_ASSESSMENT_NODE_TYPE;
  privateAssessment.attrs = {
    ...privateAssessment.attrs,
    id: "privassess01",
    settings: McqSettingsSchema.parse({}),
    assessment: {
      ...((privateAssessment.attrs?.["assessment"] as Record<string, unknown> | undefined) ?? {}),
      privateAnswer: "must-not-reach-preview",
    },
  };
  const pending = [...(privateAssessment.content ?? [])];
  let embeddedIndex = 0;
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.type !== "text") {
      embeddedIndex += 1;
      node.attrs = { ...node.attrs, id: `privch${String(embeddedIndex).padStart(6, "0")}` };
    }
    pending.push(...(node.content ?? []));
  }
  surface.content = [privateAssessment];
  return document;
}

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve(value: T) {
      if (!resolvePromise) throw new Error("deferred promise was not initialized");
      resolvePromise(value);
    },
    reject(reason?: unknown) {
      if (!rejectPromise) throw new Error("deferred promise was not initialized");
      rejectPromise(reason);
    },
  };
}

function createControlledArtifactHost() {
  const requests: Array<{
    readonly completion: ReturnType<typeof createDeferred<ArtifactPersistenceResult>>;
    readonly payload: ArtifactSavePayload;
  }> = [];
  let storedPayload: ArtifactSavePayload | null = null;
  const saveArtifact = vi.fn((payload: ArtifactSavePayload) => {
    const completion = createDeferred<ArtifactPersistenceResult>();
    const request = { completion, payload: structuredClone(payload) };
    requests.push(request);
    return completion.promise.then((result) => {
      storedPayload = request.payload;
      return result;
    });
  });

  return {
    requests,
    saveArtifact,
    getStoredPayload: () => storedPayload,
    resolve(index: number, artifactRevision: string, title?: string) {
      const request = requests[index];
      if (!request) throw new Error(`save request ${index} does not exist`);
      request.completion.resolve(
        Result.ok({
          artifactRevision,
          ...(title === undefined ? {} : { artifact: { title } }),
        }),
      );
    },
    reject(index: number, reason: unknown) {
      const request = requests[index];
      if (!request) throw new Error(`save request ${index} does not exist`);
      request.completion.reject(reason);
    },
    fail(index: number) {
      const request = requests[index];
      if (!request) throw new Error(`save request ${index} does not exist`);
      request.completion.resolve(
        Result.err({
          reason: "write-aborted",
          artifactId: request.payload.artifact.id,
          cause: new DOMException("write aborted", "AbortError"),
        }),
      );
    },
  };
}

function renderSaveCoordinatorHarness(
  saveArtifact: (payload: ArtifactSavePayload) => Promise<ArtifactPersistenceResult>,
) {
  let actions: ScaffoldAuthoringHostActionsContext | null = null;
  render(
    <ScaffoldAuthoringApp
      application={testApplication}
      artifact={{
        id: "artifact-save-coordinator",
        title: "Draft",
        mode: "page",
        content: mocks.authorJSON,
      }}
      services={{ artifactPersistence: { saveArtifact }, media: null }}
      hostHeaderActions={(context) => {
        actions = context;
        return {};
      }}
    />,
  );

  const getActions = () => {
    if (!actions) throw new Error("save coordinator actions are unavailable");
    return actions;
  };
  const update = (content: JSONContent) => {
    mocks.authorJSON = content;
    const props = mocks.contentAuthorHostProps.at(-1);
    const onChange = props?.["onChange"] as ((editor: typeof mocks.fakeEditor) => void) | undefined;
    const onUpdate = props?.["onUpdate"] as
      | ((
          nextContent: JSONContent,
          unavailableContent: readonly [],
          sourceDocument: object,
        ) => void)
      | undefined;
    if (!onUpdate) throw new Error("authoring update callback is unavailable");
    act(() => {
      onChange?.(mocks.fakeEditor);
      onUpdate(content, [], {});
    });
  };
  const invalidate = () => {
    const onDocumentError = mocks.contentAuthorHostProps.at(-1)?.["onDocumentError"] as
      | ((failure: unknown) => void)
      | undefined;
    if (!onDocumentError) throw new Error("authoring error callback is unavailable");
    act(() => onDocumentError({ status: "canonicalization-failed", issues: [] }));
  };
  const saveNow = () => {
    let result!: ReturnType<ScaffoldAuthoringHostActionsContext["saveNow"]>;
    act(() => {
      result = getActions().saveNow();
    });
    return result;
  };

  return { getActions, invalidate, saveNow, update };
}

function getCorePublishAction(): HTMLButtonElement {
  const action = document.querySelector<HTMLButtonElement>(".sc-app-publish-action");
  if (!action) throw new Error("Core Publish action is unavailable");
  return action;
}

async function renderSurfaceWorkspaceHarness() {
  const firstSurfaceId = EmbeddedNodeIdSchema.parse("workspace001");
  const secondSurfaceId = EmbeddedNodeIdSchema.parse("workspace002");
  const content = slideshowDocumentWithSurfaces(firstSurfaceId, secondSurfaceId);
  mocks.authorJSON = content;
  mocks.fakeEditor.state.doc.firstChild.attrs = content.content?.[0]?.attrs ?? {};
  mocks.renderBottomWorkspace = true;
  mocks.stubLearnerInteractionSave = true;
  const semanticController = installFakeDocumentOwners([firstSurfaceId, secondSurfaceId]);
  const user = userEvent.setup();
  const saveArtifact = vi.fn(async () => successfulArtifactSaveResult());

  render(
    <ScaffoldAuthoringApp
      application={testApplication}
      artifact={{
        id: "artifact-surface-workspaces",
        title: "Workspaces",
        mode: "slideshow",
        content,
      }}
      services={{
        artifactPersistence: { saveArtifact },
        media: null,
      }}
    />,
  );
  await screen.findByRole("tablist", { name: "Surface workspace" });
  return { firstSurfaceId, secondSurfaceId, semanticController, saveArtifact, user };
}

/**
 * Drives a Radix rule dropdown the way the primitive's own tests do: open
 * the trigger, then pick the portalled option by its visible label.
 */
async function chooseRuleOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerName: string,
  optionName: string,
): Promise<void> {
  await user.click(screen.getByRole("combobox", { name: triggerName }));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

async function createDirtyInteractionDraft(
  user: ReturnType<typeof userEvent.setup>,
  // Callers always pass the first surface, whose fake semantic label is "Slide 1".
  _surfaceId: EmbeddedNodeId,
) {
  await user.click(screen.getByRole("tab", { name: "Interactions" }));
  await user.click(screen.getByRole("button", { name: "Add rule" }));
  await user.click(screen.getByLabelText("When"));
  await user.click(await screen.findByRole("option", { name: "Slide 1 — Activated" }));
  await chooseRuleOption(user, "Add response", "Reveal content");
}

describe("ScaffoldAuthoringApp Surface workspaces", () => {
  it("opens the Surface workspace only on request and closes it from the panel", async () => {
    mocks.autoOpenWorkspace = false;
    const user = userEvent.setup();
    const firstSurfaceId = EmbeddedNodeIdSchema.parse("workspace001");
    const secondSurfaceId = EmbeddedNodeIdSchema.parse("workspace002");
    const content = slideshowDocumentWithSurfaces(firstSurfaceId, secondSurfaceId);
    mocks.authorJSON = content;
    mocks.fakeEditor.state.doc.firstChild.attrs = content.content?.[0]?.attrs ?? {};
    mocks.renderBottomWorkspace = true;
    installFakeDocumentOwners([firstSurfaceId, secondSurfaceId]);

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-workspace-on-request",
          title: "Workspace on request",
          mode: "slideshow",
          content,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    await screen.findByTestId("content-author-host");
    expect(screen.queryByRole("tablist", { name: "Surface workspace" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Request interactions workspace" }));
    expect(await screen.findByRole("tab", { name: "Interactions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Request timeline workspace" }));
    expect(await screen.findByRole("tab", { name: "Timeline" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Close workspace" }));
    await waitFor(() => {
      expect(screen.queryByRole("tablist", { name: "Surface workspace" })).toBeNull();
    });
  });

  it("omits the Surface workspace for a Slideshow with no Surfaces", async () => {
    const content = slideshowDocument("removedsurf1");
    const courseDocument = content.content?.[0];
    const courseSection = courseDocument?.content?.[0];
    if (!courseDocument || courseSection?.type !== "courseSection") {
      throw new Error("expected a sectioned Slideshow fixture");
    }
    courseDocument.content = [courseSection];
    const courseSectionId = EmbeddedNodeIdSchema.parse(courseSection.attrs?.["id"]);
    mocks.authorJSON = content;
    mocks.fakeEditor.state.doc.firstChild.attrs = courseDocument.attrs ?? {};
    mocks.renderBottomWorkspace = true;
    installFakeDocumentOwners([], {
      courseSectionId,
      selectedId: courseSectionId,
    });

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-empty-slideshow-workspace",
          title: "Empty Slideshow",
          mode: "slideshow",
          content,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    await screen.findByTestId("content-author-host");
    expect(screen.queryByRole("tablist", { name: "Surface workspace" })).toBeNull();
  });

  it("resolves a selected Course Section to its first Surface workspace", async () => {
    const user = userEvent.setup();
    const firstSurfaceId = EmbeddedNodeIdSchema.parse("workspace001");
    const secondSurfaceId = EmbeddedNodeIdSchema.parse("workspace002");
    const content = slideshowDocumentWithSurfaces(firstSurfaceId, secondSurfaceId);
    const courseSectionId = EmbeddedNodeIdSchema.parse(
      findJsonNode(content, "courseSection")?.attrs?.["id"],
    );
    mocks.authorJSON = content;
    mocks.fakeEditor.state.doc.firstChild.attrs = content.content?.[0]?.attrs ?? {};
    mocks.renderBottomWorkspace = true;
    installFakeDocumentOwners([firstSurfaceId, secondSurfaceId], {
      courseSectionId,
      selectedId: courseSectionId,
    });

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-section-workspace",
          title: "Section workspace",
          mode: "slideshow",
          content,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    await user.click(await screen.findByRole("tab", { name: "Interactions" }));
    expect(
      document.querySelector(`[data-interaction-surface-id="${firstSurfaceId}"]`),
    ).not.toBeNull();
  });

  it("mounts Timeline and Interactions exclusively and guards workspace and Surface changes", async () => {
    const user = userEvent.setup();
    const firstSurfaceId = EmbeddedNodeIdSchema.parse("workspace001");
    const secondSurfaceId = EmbeddedNodeIdSchema.parse("workspace002");
    const content = slideshowDocumentWithSurfaces(firstSurfaceId, secondSurfaceId);
    mocks.authorJSON = content;
    mocks.fakeEditor.state.doc.firstChild.attrs = content.content?.[0]?.attrs ?? {};
    mocks.renderBottomWorkspace = true;
    const semanticController = installFakeDocumentOwners([firstSurfaceId, secondSurfaceId]);

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-surface-workspaces",
          title: "Workspaces",
          mode: "slideshow",
          content,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    expect(await screen.findByRole("tablist", { name: "Surface workspace" })).toBeInTheDocument();
    expect(screen.getByTestId("presentation-timeline")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Interactions" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Interactions" }));
    expect(screen.getByRole("region", { name: "Interactions" })).toBeInTheDocument();
    expect(screen.queryByTestId("presentation-timeline")).toBeNull();
    expect(
      document.querySelector(`[data-interaction-surface-id="${firstSurfaceId}"]`),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Add rule" }));
    await chooseRuleOption(user, "When", "Slide 1 — Activated");
    await chooseRuleOption(user, "Add response", "Reveal content");
    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(screen.getByRole("alertdialog", { name: "Unsaved rule changes" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel change" }));
    expect(screen.getByRole("region", { name: "Interactions" })).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Workspace slide" }),
      secondSurfaceId,
    );
    expect(
      await screen.findByRole("alertdialog", { name: "Unsaved rule changes" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() =>
      expect(
        document.querySelector(`[data-interaction-surface-id="${secondSurfaceId}"]`),
      ).not.toBeNull(),
    );
    expect(semanticController.getSelectionSnapshot().selectedId).toBe(firstSurfaceId);
    expect(semanticController.showTargetCalls).toEqual([]);

    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(screen.getByTestId("presentation-timeline")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Interactions" })).toBeNull();
  });

  it("omits the selector and Interactions entirely for Page mode", async () => {
    mocks.renderBottomWorkspace = true;
    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-page-no-interactions",
          title: "Page",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    await screen.findByTestId("content-author-host");
    expect(screen.queryByRole("tablist", { name: "Surface workspace" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Interactions" })).toBeNull();
    expect(mocks.contentAuthorHostProps.at(-1)?.["bottomWorkspace"]).toBeUndefined();
  });

  it("applies guarded workspace changes after Save and Discard", async () => {
    const { firstSurfaceId, user } = await renderSurfaceWorkspaceHarness();
    await createDirtyInteractionDraft(user, firstSurfaceId);

    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByTestId("presentation-timeline")).toBeInTheDocument();
    expect(mocks.learnerInteractionSaves).toHaveLength(1);
    expect(mocks.learnerInteractionSaves[0]?.["surfaceId"]).toBe(firstSurfaceId);

    await createDirtyInteractionDraft(user, firstSurfaceId);
    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByTestId("presentation-timeline")).toBeInTheDocument();
    expect(mocks.learnerInteractionSaves).toHaveLength(1);
  });

  it("keeps or applies guarded Surface changes after Cancel and Save", async () => {
    const { firstSurfaceId, secondSurfaceId, semanticController, user } =
      await renderSurfaceWorkspaceHarness();
    await createDirtyInteractionDraft(user, firstSurfaceId);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Workspace slide" }),
      secondSurfaceId,
    );
    await screen.findByRole("alertdialog", { name: "Unsaved rule changes" });
    await user.click(screen.getByRole("button", { name: "Cancel change" }));
    expect(semanticController.getSelectionSnapshot().selectedId).toBe(firstSurfaceId);
    expect(
      document.querySelector(`[data-interaction-surface-id="${firstSurfaceId}"]`),
    ).not.toBeNull();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Workspace slide" }),
      secondSurfaceId,
    );
    await screen.findByRole("alertdialog", { name: "Unsaved rule changes" });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(
        document.querySelector(`[data-interaction-surface-id="${secondSurfaceId}"]`),
      ).not.toBeNull(),
    );
    expect(mocks.learnerInteractionSaves[0]?.["surfaceId"]).toBe(firstSurfaceId);
    expect(semanticController.getSelectionSnapshot().selectedId).toBe(firstSurfaceId);
    expect(semanticController.showTargetCalls).toEqual([]);
  });
});

describe("ScaffoldAuthoringApp StrictMode lifecycle", () => {
  it("keeps the top Preview lifecycle usable after StrictMode replay", async () => {
    const user = userEvent.setup();
    const surfaceId = "previewsurf6" as EmbeddedNodeId;
    const input = presentationPreviewDocument(surfaceId);
    mocks.authorPreviewModuleError = new Error("preview chunk unavailable");

    render(
      <StrictMode>
        <ScaffoldAuthoringApp
          application={testApplication}
          artifact={{
            id: "artifact-strict-mode-preview",
            title: "Draft",
            mode: "slideshow",
            content: input.document,
          }}
          services={{
            artifactPersistence: {
              saveArtifact: vi.fn(async () => successfulArtifactSaveResult()),
            },
            media: null,
          }}
        />
      </StrictMode>,
    );

    await user.click(await screen.findByRole("button", { name: "Switch to preview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Preview could not be prepared. Try again.",
    );

    mocks.authorPreviewModuleError = null;
    await user.click(screen.getByRole("button", { name: "Switch to preview" }));
    await screen.findByTestId("scaffold-learner-app");
    expect(screen.getByRole("button", { name: "Switch to editing" })).toBeInTheDocument();
  });

  it("keeps the Interactions workspace usable after StrictMode replay", async () => {
    const firstSurfaceId = EmbeddedNodeIdSchema.parse("workspace001");
    const secondSurfaceId = EmbeddedNodeIdSchema.parse("workspace002");
    const content = slideshowDocumentWithSurfaces(firstSurfaceId, secondSurfaceId);
    mocks.authorJSON = content;
    mocks.fakeEditor.state.doc.firstChild.attrs = content.content?.[0]?.attrs ?? {};
    mocks.renderBottomWorkspace = true;
    installFakeDocumentOwners([firstSurfaceId, secondSurfaceId]);
    const user = userEvent.setup();

    render(
      <StrictMode>
        <ScaffoldAuthoringApp
          application={testApplication}
          artifact={{
            id: "artifact-strict-mode-workspaces",
            title: "Workspaces",
            mode: "slideshow",
            content,
          }}
          services={{
            artifactPersistence: {
              saveArtifact: vi.fn(async () => successfulArtifactSaveResult()),
            },
            media: null,
          }}
        />
      </StrictMode>,
    );

    await user.click(await screen.findByRole("tab", { name: "Interactions" }));
    expect(screen.getByRole("region", { name: "Interactions" })).toBeInTheDocument();
  });
});

describe("ScaffoldAuthoringApp preview", () => {
  it("refuses timeline transport outside Preview without preparing a runtime", async () => {
    const surfaceId = "previewsurf5" as EmbeddedNodeId;
    const input = presentationPreviewDocument(surfaceId);

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-presentation-preview-runtime-error",
          title: "Draft",
          mode: "slideshow",
          content: input.document,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    await waitFor(() =>
      expect(mocks.contentAuthorHostProps.at(-1)?.["bottomWorkspace"]).toBeTruthy(),
    );
    const transport = currentAuthorPreviewTransport();
    expect(transport.play(surfaceId)).toMatchObject({
      error: { reason: "preview-not-ready", operation: "play", status: "idle" },
    });
    await expect(transport.seek(surfaceId, 250)).resolves.toMatchObject({
      error: { reason: "preview-not-ready", operation: "seek", status: "idle" },
    });
    expect(mocks.authorPreviewMounts).toBe(0);
    expect(mocks.contentAuthorHostProps.at(-1)?.["stagePreview"]).toBeUndefined();
  });

  it("loads the dedicated author Preview runtime instead of the public learner app", async () => {
    const user = userEvent.setup();
    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-author-preview-runtime",
          title: "Author Preview",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).not.toBeDisabled());
    await user.click(previewButton);

    await screen.findByTestId("scaffold-learner-app");
    expect(mocks.authorPreviewMounts).toBe(1);
    expect(mocks.learnerModuleReads).toBe(0);
  });

  it("enters paused Preview on the locally selected workspace Surface without saving or navigating", async () => {
    const { firstSurfaceId, secondSurfaceId, semanticController, saveArtifact, user } =
      await renderSurfaceWorkspaceHarness();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Workspace slide" }),
      secondSurfaceId,
    );
    expect(semanticController.showTargetCalls).toEqual([]);
    expect(saveArtifact).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Switch to preview" }));
    await screen.findByTestId("scaffold-learner-app");

    const mount = mocks.learnerAppProps.at(-1)?.["authorPreviewRuntimeMount"] as
      | { readonly initialSurfaceId: EmbeddedNodeId }
      | undefined;
    expect(mount?.initialSurfaceId).toBe(secondSurfaceId);
    expect(semanticController.getSelectionSnapshot().selectedId).not.toBe(secondSurfaceId);
    expect(semanticController.showTargetCalls).toEqual([]);
    expect(saveArtifact).not.toHaveBeenCalled();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Workspace slide" }),
      firstSurfaceId,
    );
    await waitFor(() => {
      const refreshedMount = mocks.learnerAppProps.at(-1)?.["authorPreviewRuntimeMount"] as
        | { readonly initialSurfaceId: EmbeddedNodeId }
        | undefined;
      expect(refreshedMount?.initialSurfaceId).toBe(firstSurfaceId);
    });
    expect(screen.getByRole("button", { name: "Switch to editing" })).toBeInTheDocument();
    expect(semanticController.showTargetCalls).toEqual([]);
    expect(saveArtifact).not.toHaveBeenCalled();
  });

  it("sends canonical configuration updates to the saving owner while Preview stays active", async () => {
    const user = userEvent.setup();
    const surfaceId = EmbeddedNodeIdSchema.parse("applysurf001");
    const input = presentationPreviewDocument(surfaceId);
    let savedPayload: ArtifactSavePayload | null = null;
    const saveArtifact = vi.fn(async (payload: ArtifactSavePayload) => {
      savedPayload = payload;
      return successfulArtifactSaveResult("revision-preview-apply");
    });
    let actions: ScaffoldAuthoringHostActionsContext | null = null;
    const getActions = (): ScaffoldAuthoringHostActionsContext => {
      if (!actions) throw new Error("expected the saving owner");
      return actions;
    };
    const getSavedPayload = (): ArtifactSavePayload => {
      if (!savedPayload) throw new Error("expected a saved canonical payload");
      return savedPayload;
    };

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-preview-apply",
          title: "Preview Apply",
          mode: "slideshow",
          content: input.document,
        }}
        services={{ artifactPersistence: { saveArtifact }, media: null }}
        hostHeaderActions={(context) => {
          actions = context;
          return {};
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Switch to preview" }));
    await screen.findByTestId("scaffold-learner-app");
    const initialMount = mocks.learnerAppProps.at(-1)?.["authorPreviewRuntimeMount"] as
      | {
          programSource(
            surfaceId: EmbeddedNodeId,
          ): { presentation?: { timeline?: { durationMs?: number } } } | undefined;
        }
      | undefined;
    expect(initialMount?.programSource(surfaceId)?.presentation?.timeline?.durationMs).toBe(1_000);

    const updated = structuredClone(input.document) as JSONContent;
    const presentation = updated.content?.[0]?.attrs?.["presentation"] as
      | { surfaces: Array<{ surfaceId: EmbeddedNodeId; durationMs: number }> }
      | undefined;
    if (!presentation?.surfaces[0]) throw new Error("expected Presentation configuration");
    presentation.surfaces[0].durationMs = 2_000;
    mocks.authorJSON = updated;
    const host = mocks.contentAuthorHostProps.at(-1);
    const onChange = host?.["onChange"] as ((editor: typeof mocks.fakeEditor) => void) | undefined;
    const onUpdate = host?.["onUpdate"] as
      | ((content: JSONContent, unavailable: readonly [], sourceDocument: object) => void)
      | undefined;
    if (!onUpdate) throw new Error("expected the authoring update owner");
    act(() => {
      onChange?.(mocks.fakeEditor);
      onUpdate(updated, [], {});
    });

    await waitFor(() => {
      const refreshedMount = mocks.learnerAppProps.at(-1)?.["authorPreviewRuntimeMount"] as
        | {
            programSource(
              surfaceId: EmbeddedNodeId,
            ): { presentation?: { timeline?: { durationMs?: number } } } | undefined;
          }
        | undefined;
      expect(refreshedMount).not.toBe(initialMount);
      expect(refreshedMount?.programSource(surfaceId)?.presentation?.timeline?.durationMs).toBe(
        2_000,
      );
    });

    await getActions().saveNow();

    expect(saveArtifact).toHaveBeenCalledOnce();
    const savedPresentation = getSavedPayload().artifact.content.content?.[0]?.attrs?.[
      "presentation"
    ] as { surfaces?: Array<{ durationMs?: number }> } | undefined;
    expect(savedPresentation?.surfaces?.[0]?.durationMs).toBe(2_000);
    expect(screen.getByRole("button", { name: "Switch to editing" })).toBeInTheDocument();
    expect(mocks.contentAuthorHostProps.at(-1)?.["stagePreview"]).toBeTruthy();
  });

  it("mounts saved Interaction rules without a Presentation program and reports the latest real turn", async () => {
    const user = userEvent.setup();
    const content = slideshowDocumentWithLearnerRule("activated");
    const surfaceId = EmbeddedNodeIdSchema.parse("publishsurf1");
    mocks.authorJSON = content;
    mocks.fakeEditor.state.doc.firstChild.attrs = content.content?.[0]?.attrs ?? {};
    mocks.renderBottomWorkspace = true;
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult());
    installFakeDocumentOwners([surfaceId]);

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-interactions-preview",
          title: "Interactions Preview",
          mode: "slideshow",
          content,
        }}
        services={{ artifactPersistence: { saveArtifact }, media: null }}
      />,
    );

    await user.click(await screen.findByRole("tab", { name: "Interactions" }));
    await user.click(screen.getByRole("button", { name: "Switch to preview" }));
    await screen.findByTestId("scaffold-learner-app");

    const mount = mocks.learnerAppProps.at(-1)?.["authorPreviewRuntimeMount"] as
      | {
          initialSurfaceId: EmbeddedNodeId;
          programSource: (
            surfaceId: EmbeddedNodeId,
          ) => { presentation?: unknown; learnerInteractions?: unknown } | undefined;
          onLearnerInteractionReportsPortChange: (port: {
            subscribeReports: (listener: (report: unknown) => void) => () => void;
          }) => void;
        }
      | undefined;
    expect(mount?.initialSurfaceId).toBe(surfaceId);
    expect(mount?.programSource(surfaceId)).toMatchObject({ learnerInteractions: {} });
    expect(mount?.programSource(surfaceId)).not.toHaveProperty("presentation");

    let publishReport: ((report: unknown) => void) | null = null;
    act(() => {
      mount?.onLearnerInteractionReportsPortChange({
        subscribeReports(listener) {
          publishReport = listener;
          return () => {
            publishReport = null;
          };
        },
      });
    });
    act(() => {
      publishReport?.({
        turnNumber: 1,
        event: { targetId: surfaceId, type: "activated" },
        ruleEvaluations: [{ kind: "matched", ruleId: "publishrule1", conditions: [] }],
        commandExecutions: [
          {
            address: { ruleId: "publishrule1", commandIndex: 0 },
            outcome: { kind: "succeeded" },
          },
        ],
        end: "completed",
      });
    });
    expect(screen.getByRole("region", { name: "Latest interaction turn" })).toHaveTextContent(
      "Turn 1",
    );
    expect(saveArtifact).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    await waitFor(() => expect(mocks.contentAuthorHostProps.at(-1)?.["stagePreview"]).toBeTruthy());
    expect(screen.getByRole("button", { name: "Switch to editing" })).toBeInTheDocument();
  });

  it("presents invalid Course Structure as a plain-language App error", () => {
    const content = pageDocumentWithParagraph("authorsurf01", "Invalid structure");
    const courseDocument = content.content?.[0];
    const surface = courseDocument?.content?.[0];
    if (!courseDocument?.content || !surface) throw new Error("expected default page structure");
    courseDocument.content.push({
      ...surface,
      attrs: { ...surface.attrs, id: "authorsurf02" },
    });

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{ id: "artifact-invalid-structure", title: "Invalid", mode: "page", content }}
        productAccess={coreProductAccess}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    const unavailable = screen.getByRole("alert", { name: "This document couldn’t be opened" });
    expect(unavailable).toHaveTextContent("The saved course structure is invalid.");
    expect(unavailable).not.toHaveTextContent("Scaffold content has invalid Course Structure.");
  });

  it("refuses a Plus-required artifact before mounting authoring", () => {
    const content = pageDocumentWithParagraph("authorsurf01", "Protected authoring content");
    content.content![0]!.attrs!["requiresScaffoldPlus"] = true;
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult());

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{ id: "artifact-plus-required", title: "Plus", mode: "page", content }}
        productAccess={coreProductAccess}
        services={{ artifactPersistence: { saveArtifact }, media: null }}
      />,
    );

    expect(screen.getByTestId("scaffold-authoring-unavailable")).toHaveTextContent(
      "This course requires Scaffold Plus.",
    );
    expect(screen.queryByTestId("content-author-host")).toBeNull();
    expect(saveArtifact).not.toHaveBeenCalled();
  });

  it("mounts a Plus-required artifact after product access succeeds", async () => {
    const content = pageDocumentWithParagraph("authorsurf01", "Protected authoring content");
    content.content![0]!.attrs!["requiresScaffoldPlus"] = true;

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{ id: "artifact-plus-authorized", title: "Plus", mode: "page", content }}
        productAccess={plusProductAccess}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    expect(await screen.findByTestId("content-author-host")).toBeInTheDocument();
    expect(screen.queryByTestId("scaffold-authoring-unavailable")).toBeNull();
  });

  it("synchronizes the live persisted theme from every editor document update", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-live-theme",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );
    const onChange = mocks.contentAuthorHostProps.at(-1)?.["onChange"] as
      | ((editor: typeof mocks.fakeEditor) => void)
      | undefined;
    expect(onChange).toBeTypeOf("function");

    const unavailableTheme = {
      schemaVersion: 1,
      design: { id: "unavailable-design", revision: "7" },
      colourSystem: { id: "unavailable-colours", revision: "3" },
      overrides: {},
    };
    mocks.authorJSON.content![0]!.attrs!["theme"] = unavailableTheme;
    mocks.fakeEditor.state.doc.firstChild.attrs = mocks.authorJSON.content![0]!.attrs!;
    act(() => onChange?.(mocks.fakeEditor));
    await userEvent.setup().click(screen.getByRole("button", { name: "Open course theme" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved design unavailable-design@7 is unavailable.",
    );
  });

  it("opens the course Theme panel without a separate preview colour mode", async () => {
    const user = userEvent.setup();
    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-theme-panel",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open course theme" }));

    expect(screen.getByRole("dialog", { name: "Course theme" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Course preview colours" })).toBeNull();
  });

  it("toggles and remembers the authoring application colour mode", async () => {
    const user = userEvent.setup();
    const props = {
      application: testApplication,
      artifact: {
        id: "artifact-colour-mode",
        title: "Draft",
        mode: "page" as const,
        content: mocks.authorJSON,
      },
      services: {
        artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
        media: null,
      },
    };
    const first = render(<ScaffoldAuthoringApp {...props} />);
    const application = document.querySelector<HTMLElement>(".sc-scaffold-authoring-app");

    expect(application).toHaveAttribute("data-scaffold-color-mode", "light");
    await waitFor(() =>
      expect(application?.querySelector("[data-scaffold-overlay-host]")).toBeInTheDocument(),
    );
    expect(application?.style.colorScheme).toBe("light");
    const initialCourseTheme = mocks.authorJSON.content?.[0]?.attrs?.["theme"];
    expect(initialCourseTheme).toBeDefined();

    const colorModeToggle = screen.getByRole("button", {
      name: "Switch authoring application to dark mode",
    });
    expect(colorModeToggle).toHaveClass("sc-icon-button");
    expect(colorModeToggle).toHaveTextContent("");
    expect(colorModeToggle).toHaveAttribute("aria-pressed", "false");

    await user.hover(colorModeToggle);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Use dark mode");
    await user.unhover(colorModeToggle);
    await user.click(colorModeToggle);

    expect(application).toHaveAttribute("data-scaffold-color-mode", "dark");
    expect(application?.style.colorScheme).toBe("dark");
    expect(latestCourseAppearance()).toBe("dark");
    expect(localStorage.getItem("scaffold.authoring.color-mode.v1")).toBe("dark");
    expect(mocks.authorJSON.content?.[0]?.attrs?.["theme"]).toEqual(initialCourseTheme);

    first.unmount();
    render(<ScaffoldAuthoringApp {...props} />);
    expect(document.querySelector(".sc-scaffold-authoring-app")).toHaveAttribute(
      "data-scaffold-color-mode",
      "dark",
    );
  });

  it("serializes and saves once only after ordinary typing settles", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((callback) => callback());
    const saveArtifact = vi.fn(() => new Promise<ArtifactPersistenceResult>(() => {}));

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-autosave",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          media: null,
        }}
      />,
    );

    const initialProps = mocks.contentAuthorHostProps.at(-1);
    const onUpdate = initialProps?.["onUpdate"] as
      | ((content: JSONContent, unavailableContent: readonly [], sourceDocument: object) => void)
      | undefined;
    expect(onUpdate).toBeTypeOf("function");
    expect(mocks.fakeEditor.getJSON).not.toHaveBeenCalled();
    mocks.fakeEditor.getJSON.mockClear();

    const firstEdit = pageDocumentWithParagraph("authorsurf01", "First edit");
    const settledEdit = pageDocumentWithParagraph("authorsurf01", "Settled edit");
    const firstSourceDocument = {};
    const settledSourceDocument = {};
    act(() => {
      onUpdate?.(firstEdit, [], firstSourceDocument);
    });
    act(() => {
      onUpdate?.(settledEdit, [], settledSourceDocument);
      onUpdate?.(structuredClone(settledEdit), [], settledSourceDocument);
    });

    expect(mocks.fakeEditor.getJSON).not.toHaveBeenCalled();
    expect(saveArtifact).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mocks.fakeEditor.getJSON).not.toHaveBeenCalled();
    expect(saveArtifact).toHaveBeenCalledTimes(1);
  });

  it("does not schedule saving for an editor selection-only change", () => {
    vi.useFakeTimers();
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult());
    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-selection-only",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{ artifactPersistence: { saveArtifact }, media: null }}
      />,
    );
    const onChange = mocks.contentAuthorHostProps.at(-1)?.["onChange"] as
      | ((editor: typeof mocks.fakeEditor) => void)
      | undefined;

    act(() => onChange?.(mocks.fakeEditor));
    vi.advanceTimersByTime(500);

    expect(saveArtifact).not.toHaveBeenCalled();
  });

  it("autosaves after StrictMode replays the coordinator lifecycle effect", async () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult("revision-strict-mode"));

    render(
      <StrictMode>
        <ScaffoldAuthoringApp
          application={testApplication}
          artifact={{
            id: "artifact-strict-mode-autosave",
            title: "Draft",
            mode: "page",
            content: mocks.authorJSON,
          }}
          services={{ artifactPersistence: { saveArtifact }, media: null }}
        />
      </StrictMode>,
    );

    const onUpdate = mocks.contentAuthorHostProps.at(-1)?.["onUpdate"] as
      | ((content: JSONContent, unavailableContent: readonly [], sourceDocument: object) => void)
      | undefined;
    expect(onUpdate).toBeTypeOf("function");

    act(() => onUpdate?.(pageDocumentWithParagraph("authorsurf01", "StrictMode edit"), [], {}));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(saveArtifact).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("banner")).toHaveAttribute("data-save-state", "saved");
    expect(document.querySelectorAll(".sc-app-notification")).toHaveLength(0);
  });

  it("starts a newer Save only after the in-flight Save settles", async () => {
    const host = createControlledArtifactHost();
    const harness = renderSaveCoordinatorHarness(host.saveArtifact);
    const contentA = pageDocumentWithParagraph("authorsurf01", "Snapshot A");
    const contentB = pageDocumentWithParagraph("authorsurf01", "Snapshot B");

    harness.update(contentA);
    const saveA = harness.saveNow();
    harness.update(contentB);
    const saveB = harness.saveNow();

    expect(host.requests).toHaveLength(1);
    expect(
      findJsonNode(host.requests[0]?.payload.artifact.content, "paragraph")?.content?.[0]?.text,
    ).toBe("Snapshot A");

    await act(async () => {
      host.resolve(0, "revision-a");
      await Promise.resolve();
    });

    expect(host.requests).toHaveLength(2);
    expect(
      findJsonNode(host.requests[1]?.payload.artifact.content, "paragraph")?.content?.[0]?.text,
    ).toBe("Snapshot B");

    await act(async () => {
      host.resolve(1, "revision-b");
      await Promise.all([saveA, saveB]);
    });
  });

  it("keeps the UI saving until the newest requested snapshot reaches the host", async () => {
    const host = createControlledArtifactHost();
    const harness = renderSaveCoordinatorHarness(host.saveArtifact);
    const contentA = pageDocumentWithParagraph("authorsurf01", "Snapshot A");
    const contentB = pageDocumentWithParagraph("authorsurf01", "Snapshot B");

    harness.update(contentA);
    const saveA = harness.saveNow();
    let saveAOutcome:
      | Awaited<ReturnType<ScaffoldAuthoringHostActionsContext["saveNow"]>>
      | undefined;
    void saveA.then((saved) => {
      saveAOutcome = saved;
    });
    harness.update(contentB);
    const saveB = harness.saveNow();
    expect(screen.getByRole("banner")).toHaveAttribute("data-save-state", "saving");

    await act(async () => {
      host.resolve(0, "revision-a");
      await Promise.resolve();
    });

    expect(saveAOutcome).toBeUndefined();
    expect(screen.getByRole("banner")).toHaveAttribute("data-save-state", "saving");
    expect(host.getStoredPayload()?.artifact.content).toEqual(contentA);

    await act(async () => {
      host.resolve(1, "revision-b");
      await Promise.all([saveA, saveB]);
    });

    expect(host.getStoredPayload()?.artifact.content).toEqual(contentB);
    expect(screen.getByRole("banner")).toHaveAttribute("data-save-state", "saved");
  });

  it("coalesces multiple pending Saves to the latest immutable snapshot", async () => {
    const host = createControlledArtifactHost();
    const harness = renderSaveCoordinatorHarness(host.saveArtifact);
    const contentA = pageDocumentWithParagraph("authorsurf01", "Snapshot A");
    const contentB = pageDocumentWithParagraph("authorsurf01", "Snapshot B");
    const contentC = pageDocumentWithParagraph("authorsurf01", "Snapshot C");

    harness.update(contentA);
    const saveA = harness.saveNow();
    harness.update(contentB);
    const saveB = harness.saveNow();
    harness.update(contentC);
    const saveC = harness.saveNow();

    expect(host.requests).toHaveLength(1);

    await act(async () => {
      host.resolve(0, "revision-a");
      await Promise.resolve();
    });

    expect(host.requests).toHaveLength(2);
    expect(
      findJsonNode(host.requests[1]?.payload.artifact.content, "paragraph")?.content?.[0]?.text,
    ).toBe("Snapshot C");

    await act(async () => {
      host.resolve(1, "revision-c");
      await Promise.all([saveA, saveB, saveC]);
    });
    expect(host.requests.map((request) => request.payload.artifact.content)).toEqual([
      contentA,
      contentC,
    ]);
  });

  it("materializes Untitled when saving a cleared title before blur", async () => {
    const user = userEvent.setup();
    const host = createControlledArtifactHost();
    const harness = renderSaveCoordinatorHarness(host.saveArtifact);
    const title = screen.getByRole("textbox", { name: "Document title" });

    await user.clear(title);
    expect(title).toHaveValue("");
    expect(title).toHaveFocus();

    const save = harness.saveNow();

    expect(host.requests).toHaveLength(1);
    expect(host.requests[0]?.payload.artifact.title).toBe("Untitled");
    expect(ScaffoldArtifactSchema.parse(host.requests[0]?.payload.artifact).title).toBe("Untitled");
    expect(title).toHaveValue("Untitled");
    expect(title).toHaveFocus();

    await act(async () => {
      host.resolve(0, "revision-untitled");
      await save;
    });
  });

  it("acknowledges a host-returned title without another edit or save", async () => {
    vi.useFakeTimers();
    const saveArtifact = vi
      .fn()
      .mockResolvedValueOnce(successfulArtifactSaveResult("revision-1", "Persisted title"))
      .mockResolvedValueOnce(successfulArtifactSaveResult("revision-2"));
    const harness = renderSaveCoordinatorHarness(saveArtifact);

    let firstSave!: ReturnType<typeof harness.saveNow>;
    await act(async () => {
      firstSave = harness.saveNow();
      await firstSave;
    });

    await expect(firstSave).resolves.toMatchObject({ value: { localRevision: 0 } });
    expect(screen.getByRole("heading", { name: "Persisted title" })).toBeVisible();
    expect(harness.getActions().title).toBe("Persisted title");
    expect(saveArtifact).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(500));
    expect(saveArtifact).toHaveBeenCalledTimes(1);

    let secondSave!: ReturnType<typeof harness.saveNow>;
    await act(async () => {
      secondSave = harness.saveNow();
      await secondSave;
    });

    await expect(secondSave).resolves.toMatchObject({ value: { localRevision: 0 } });
    expect(saveArtifact.mock.calls[1]?.[0].artifact.title).toBe("Persisted title");
    expect(screen.getByRole("heading", { name: "Persisted title" })).toBeVisible();
  });

  it("does not let an older save acknowledgement overwrite a newer title", async () => {
    const host = createControlledArtifactHost();
    const harness = renderSaveCoordinatorHarness(host.saveArtifact);
    const olderSave = harness.saveNow();

    act(() => screen.getByRole("button", { name: "Change title" }).click());
    const newerSave = harness.saveNow();

    await act(async () => {
      host.resolve(0, "revision-old", "Stale persisted title");
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "Changed title" })).toBeVisible();
    expect(host.requests).toHaveLength(2);
    expect(host.requests[1]?.payload.artifact.title).toBe("Changed title");

    await act(async () => {
      host.resolve(1, "revision-new");
      await Promise.all([olderSave, newerSave]);
    });

    expect(screen.getByRole("heading", { name: "Changed title" })).toBeVisible();
  });

  it("orders title-only autosave behind an in-flight content Save", async () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const host = createControlledArtifactHost();
    const harness = renderSaveCoordinatorHarness(host.saveArtifact);
    const contentA = pageDocumentWithParagraph("authorsurf01", "Snapshot A");

    harness.update(contentA);
    const saveA = harness.saveNow();
    act(() => {
      screen.getByRole("button", { name: "Change title" }).click();
      vi.advanceTimersByTime(500);
    });

    expect(host.requests).toHaveLength(1);

    await act(async () => {
      host.resolve(0, "revision-a");
      await Promise.resolve();
    });

    expect(host.requests).toHaveLength(2);
    expect(host.requests[1]?.payload.artifact.title).toBe("Changed title");
    expect(host.requests[1]?.payload.artifact.content).toEqual(contentA);

    await act(async () => {
      host.resolve(1, "revision-title");
      await saveA;
    });
    expect(screen.getByRole("banner")).toHaveAttribute("data-save-state", "saved");
  });

  it("clears an unsent pending Save when the working state becomes invalid", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const host = createControlledArtifactHost();
    const harness = renderSaveCoordinatorHarness(host.saveArtifact);
    const contentA = pageDocumentWithParagraph("authorsurf01", "Snapshot A");
    const contentB = pageDocumentWithParagraph("authorsurf01", "Snapshot B");

    harness.update(contentA);
    const saveA = harness.saveNow();
    harness.update(contentB);
    const saveB = harness.saveNow();
    harness.invalidate();

    expect(screen.getByRole("banner")).toHaveAttribute("data-save-state", "error");
    expect(getCorePublishAction()).toHaveAttribute("data-publish-state", "invalid");

    await act(async () => {
      host.resolve(0, "revision-a");
      await Promise.resolve();
    });

    await expect(saveA).resolves.toMatchObject({
      error: { reason: "document-invalidated", requestedRevision: 1 },
    });
    await expect(saveB).resolves.toMatchObject({
      error: { reason: "document-invalidated", requestedRevision: 2 },
    });
    expect(host.requests).toHaveLength(1);
    expect(screen.getByRole("banner")).toHaveAttribute("data-save-state", "error");
  });

  it("satisfies coalesced manual callers with a newer successful generation", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const host = createControlledArtifactHost();
    const harness = renderSaveCoordinatorHarness(host.saveArtifact);
    const contentA = pageDocumentWithParagraph("authorsurf01", "Snapshot A");
    const contentB = pageDocumentWithParagraph("authorsurf01", "Snapshot B");
    const contentC = pageDocumentWithParagraph("authorsurf01", "Snapshot C");

    harness.update(contentA);
    const saveA = harness.saveNow();
    harness.update(contentB);
    const saveB = harness.saveNow();
    harness.update(contentC);
    const saveC = harness.saveNow();

    await act(async () => {
      host.fail(0);
      await Promise.resolve();
    });

    expect(host.requests).toHaveLength(2);
    expect(host.requests[1]?.payload.artifact.content).toEqual(contentC);

    await act(async () => {
      host.resolve(1, "revision-c");
      await Promise.resolve();
    });

    await expect(saveA).resolves.toMatchObject({ value: { localRevision: 3 } });
    await expect(saveB).resolves.toMatchObject({ value: { localRevision: 3 } });
    await expect(saveC).resolves.toMatchObject({ value: { localRevision: 3 } });
    expect(host.getStoredPayload()?.artifact.content).toEqual(contentC);
  });

  it("keeps Publish unavailable while an otherwise-current Save is in flight", async () => {
    const host = createControlledArtifactHost();
    const harness = renderSaveCoordinatorHarness(host.saveArtifact);

    await waitFor(() =>
      expect(getCorePublishAction()).toHaveAttribute("data-publish-state", "not-published"),
    );
    const save = harness.saveNow();
    expect(getCorePublishAction()).toHaveAttribute("data-publish-state", "unsaved");

    await act(async () => {
      host.resolve(0, "revision-current");
      await save;
    });
    expect(getCorePublishAction()).toHaveAttribute("data-publish-state", "not-published");
  });

  it("cancels pending autosave when canonicalization rejects the latest edit", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult());

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-invalid-edit",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{ artifactPersistence: { saveArtifact }, media: null }}
      />,
    );

    const props = mocks.contentAuthorHostProps.at(-1);
    const onUpdate = props?.["onUpdate"] as
      | ((content: JSONContent, unavailableContent: readonly [], sourceDocument: object) => void)
      | undefined;
    const onDocumentError = props?.["onDocumentError"] as ((failure: unknown) => void) | undefined;
    act(() => {
      onUpdate?.(mocks.authorJSON, [], {});
      onDocumentError?.({
        status: "canonicalization-failed",
        issues: [{ code: "invalid", message: "Rejected edit.", path: [] }],
      });
      vi.advanceTimersByTime(500);
    });

    expect(saveArtifact).not.toHaveBeenCalled();
    expect(screen.getByRole("banner")).toHaveAttribute("data-save-state", "error");
  });

  it("refuses explicit Save while the current working state is invalid", async () => {
    const user = userEvent.setup();
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult());

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-invalid-explicit-save",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{ artifactPersistence: { saveArtifact }, media: null }}
        hostHeaderActions={({ saveNow }) => ({
          beforePublish: (
            <button type="button" onClick={() => void saveNow()}>
              Save now
            </button>
          ),
        })}
      />,
    );

    const onDocumentError = mocks.contentAuthorHostProps.at(-1)?.["onDocumentError"] as
      | ((failure: unknown) => void)
      | undefined;
    act(() => onDocumentError?.({ status: "canonicalization-failed", issues: [] }));
    await user.click(screen.getByRole("button", { name: "Save now" }));

    expect(saveArtifact).not.toHaveBeenCalled();
    expect(screen.getByRole("banner")).toHaveAttribute("data-save-state", "error");
  });

  it("refuses Preview while the current working state is invalid", async () => {
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult());

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-invalid-preview",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{ artifactPersistence: { saveArtifact }, media: null }}
      />,
    );

    const onDocumentError = mocks.contentAuthorHostProps.at(-1)?.["onDocumentError"] as
      | ((failure: unknown) => void)
      | undefined;
    act(() => onDocumentError?.({ status: "canonicalization-failed", issues: [] }));

    expect(screen.getByRole("button", { name: "Switch to preview" })).toBeDisabled();

    expect(saveArtifact).not.toHaveBeenCalled();
    expect(screen.queryByTestId("scaffold-learner-app")).toBeNull();
  });

  it("refuses title autosave while the current working state is invalid", () => {
    vi.useFakeTimers();
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult());

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-invalid-title",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{ artifactPersistence: { saveArtifact }, media: null }}
      />,
    );

    const onDocumentError = mocks.contentAuthorHostProps.at(-1)?.["onDocumentError"] as
      | ((failure: unknown) => void)
      | undefined;
    act(() => {
      onDocumentError?.({ status: "canonicalization-failed", issues: [] });
      screen.getByRole("button", { name: "Change title" }).click();
      vi.advanceTimersByTime(500);
    });

    expect(saveArtifact).not.toHaveBeenCalled();
    expect(screen.getByRole("banner")).toHaveAttribute("data-save-state", "error");
  });

  it("previews current supported content without persisting draft or publication state", async () => {
    const user = userEvent.setup();
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult("revision-1"));
    const publish = vi.fn();

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-preview-memory-only",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          learnerPublication: {
            getStatus: async () =>
              Result.ok({
                currentArtifactRevision: "revision-1",
                publishedArtifactRevision: null,
                publishedAt: null,
              }),
            publish,
          },
          media: null,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Switch to preview" }));

    expect(await screen.findByTestId("scaffold-learner-app")).toBeInTheDocument();
    expect(saveArtifact).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("previews a course while omitting a newly inserted empty quiz", async () => {
    const user = userEvent.setup();
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult("revision-1"));
    mocks.authorJSON = pageDocumentWithEmptyQuiz();

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-empty-quiz-preview",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{ artifactPersistence: { saveArtifact }, media: null }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Switch to preview" }));

    expect(await screen.findByTestId("scaffold-learner-app")).toBeInTheDocument();
    const publication = (
      mocks.learnerAppProps.at(-1)?.["bootstrap"] as
        | { publication?: { learnerContent?: JSONContent } }
        | undefined
    )?.publication;
    expect(findJsonNode(publication?.learnerContent, "quiz")).toBeUndefined();
    expect(saveArtifact).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("groups header actions by task order while preserving publication slots", async () => {
    let hostContextKeys: string[] = [];
    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-host-slots",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
        hostHeaderActions={(context) => {
          hostContextKeys = Object.keys(context).sort();
          return {
            utility: <button type="button">Host utility</button>,
            beforePublish: <button type="button">Before Publish</button>,
            afterPublish: <button type="button">After Publish</button>,
          };
        }}
      />,
    );

    const utility = await screen.findByRole("button", { name: "Host utility" });
    const appearance = screen.getByRole("group", { name: "Appearance" });
    const workspace = screen.getByRole("group", { name: "Workspace" });
    const release = screen.getByRole("group", { name: "Preview and publishing" });
    const preview = screen.getByRole("button", { name: "Switch to preview" });
    const before = await screen.findByRole("button", { name: "Before Publish" });
    const publish = screen.getByRole("button", { name: "Publish" });
    const after = screen.getByRole("button", { name: "After Publish" });
    expect(utility.closest('[data-authoring-action-group="utility"]')).not.toBeNull();
    expect(
      appearance.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(workspace.compareDocumentPosition(release) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
      0,
    );
    expect(preview.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(before.compareDocumentPosition(publish) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(publish.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(hostContextKeys).toEqual(["preview", "saveNow", "saveState", "title"]);
    expect(screen.getAllByRole("button", { name: "Publish" })).toHaveLength(1);
  });

  it("publishes once under rapid activation and emits one success notification", async () => {
    const publishResult = createDeferred<
      ReturnType<
        typeof Result.ok<{
          currentArtifactRevision: string;
          publishedArtifactRevision: string;
          publishedAt: string;
        }>
      >
    >();
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult("revision-2"));
    const publish = vi.fn(() => publishResult.promise);

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-core-publication",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          learnerPublication: {
            getStatus: async () =>
              Result.ok({
                currentArtifactRevision: "revision-1",
                publishedArtifactRevision: null,
                publishedAt: null,
              }),
            publish,
          },
          media: null,
        }}
        hostHeaderActions={({ saveNow }) => ({
          beforePublish: (
            <button type="button" onClick={() => void saveNow()}>
              Save changes
            </button>
          ),
        })}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const publishAction = screen.getByRole("button", { name: "Publish" });
    await waitFor(() => expect(publishAction).toHaveAttribute("aria-disabled", "false"));

    act(() => {
      publishAction.click();
      publishAction.click();
    });
    expect(publish).toHaveBeenCalledTimes(1);

    publishResult.resolve(
      Result.ok({
        currentArtifactRevision: "revision-2",
        publishedArtifactRevision: "revision-2",
        publishedAt: "2026-08-11T12:00:00.000Z",
      }),
    );

    expect(await screen.findByText("Publication complete")).toBeVisible();
    expect(screen.getByText("This version is now live for learners.")).toBeVisible();
    expect(document.querySelectorAll(".sc-app-notification")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Published" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.queryByTestId("scaffold-learner-app")).toBeNull();
  });

  it("updates one publication notification when a failed publication is retried", async () => {
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult("revision-2"));
    const publish = vi
      .fn()
      .mockResolvedValueOnce(
        Result.err({
          reason: "write-aborted",
          artifactId: "artifact-publication-retry",
          cause: new Error("network unavailable"),
        }),
      )
      .mockResolvedValueOnce(
        Result.ok({
          currentArtifactRevision: "revision-2",
          publishedArtifactRevision: "revision-2",
          publishedAt: "2026-08-11T12:00:00.000Z",
        }),
      );

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-publication-retry",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          learnerPublication: {
            getStatus: async () =>
              Result.ok({
                currentArtifactRevision: "revision-1",
                publishedArtifactRevision: null,
                publishedAt: null,
              }),
            publish,
          },
          media: null,
        }}
        hostHeaderActions={({ saveNow }) => ({
          beforePublish: (
            <button type="button" onClick={() => void saveNow()}>
              Save changes
            </button>
          ),
        })}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Publish" })).toHaveAttribute(
        "aria-disabled",
        "false",
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Publication failed")).toBeVisible();
    expect(screen.getByText("Try again.")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Publication complete")).toBeVisible();
    expect(screen.getByText("This version is now live for learners.")).toBeVisible();
    expect(publish).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll(".sc-app-notification")).toHaveLength(1);
  });

  it("starts a new notification operation after published content changes", async () => {
    const user = userEvent.setup();
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult("revision-2"));
    const publish = vi.fn(async (payload: LearnerPublicationPayload) =>
      Result.ok({
        currentArtifactRevision: payload.sourceArtifactRevision,
        publishedArtifactRevision: payload.sourceArtifactRevision,
        publishedAt: "2026-08-11T12:00:00.000Z",
      }),
    );

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-separate-publication-operations",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          learnerPublication: {
            getStatus: async () =>
              Result.ok({
                currentArtifactRevision: "revision-1",
                publishedArtifactRevision: null,
                publishedAt: null,
              }),
            publish,
          },
          media: null,
        }}
        hostHeaderActions={({ saveNow }) => ({
          beforePublish: (
            <button type="button" onClick={() => void saveNow()}>
              Save changes
            </button>
          ),
        })}
      />,
    );

    await waitFor(() =>
      expect(getCorePublishAction()).toHaveAttribute("data-publish-state", "not-published"),
    );
    await user.click(getCorePublishAction());
    expect(await screen.findByText("Publication complete")).toBeVisible();

    mocks.authorJSON = pageDocumentWithParagraph("authorsurf01", "A separate publication");
    const onUpdate = mocks.contentAuthorHostProps.at(-1)?.["onUpdate"] as
      | ((content: JSONContent, unavailableContent: readonly [], sourceDocument: object) => void)
      | undefined;
    act(() => onUpdate?.(mocks.authorJSON, [], {}));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(getCorePublishAction()).toHaveAttribute("data-publish-state", "unpublished"),
    );
    await user.click(getCorePublishAction());

    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
    expect(document.querySelectorAll(".sc-app-notification")).toHaveLength(2);
  });

  it("publishes only the latest successfully saved canonical generation", async () => {
    const user = userEvent.setup();
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult("revision-2"));
    const publish = vi.fn(async (_payload: LearnerPublicationPayload) =>
      Result.ok({
        currentArtifactRevision: "revision-2",
        publishedArtifactRevision: "revision-2",
        publishedAt: "2026-08-10T12:00:00.000Z",
      }),
    );

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-explicit-publication",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          learnerPublication: {
            getStatus: async () =>
              Result.ok({
                currentArtifactRevision: "revision-1",
                publishedArtifactRevision: null,
                publishedAt: null,
              }),
            publish,
          },
          media: null,
        }}
        hostHeaderActions={({ saveNow }) => ({
          beforePublish: (
            <button type="button" onClick={() => void saveNow()}>
              Save now
            </button>
          ),
        })}
      />,
    );

    await waitFor(() =>
      expect(getCorePublishAction()).toHaveAttribute("data-publish-state", "not-published"),
    );
    mocks.authorJSON = pageDocumentWithParagraph("authorsurf01", "Unsaved generation");
    const onUpdate = mocks.contentAuthorHostProps.at(-1)?.["onUpdate"] as
      | ((content: JSONContent, unavailableContent: readonly [], sourceDocument: object) => void)
      | undefined;
    act(() => onUpdate?.(mocks.authorJSON, [], {}));

    expect(publish).not.toHaveBeenCalled();
    expect(getCorePublishAction()).toHaveAttribute("data-publish-state", "unsaved");

    await user.click(screen.getByRole("button", { name: "Save now" }));
    await waitFor(() => expect(saveArtifact).toHaveBeenCalledTimes(1));
    await user.click(getCorePublishAction());

    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    expect(publish).toHaveBeenCalledWith({
      sourceArtifactRevision: "revision-2",
      artifact: {
        id: "artifact-explicit-publication",
        title: "Draft",
        mode: "page",
        requiresScaffoldPlus: false,
      },
      learnerContent: mocks.authorJSON,
      assessmentTargets: [],
      assessmentGroups: [],
    });
    expect(getCorePublishAction()).toHaveAttribute("data-publish-state", "published");
  });

  it("refuses Interaction diagnostics and publishes the portable document after repair", async () => {
    const user = userEvent.setup();
    const invalidContent = slideshowDocumentWithLearnerRule("missing-event", false);
    mocks.authorJSON = invalidContent;
    mocks.fakeEditor.state.doc.firstChild.attrs = invalidContent.content?.[0]?.attrs ?? {};
    const surfaceId = EmbeddedNodeIdSchema.parse("publishsurf1");
    installFakeDocumentOwners([surfaceId]);
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult("revision-interactions"));
    const publish = vi.fn(async (payload: LearnerPublicationPayload) =>
      Result.ok({
        currentArtifactRevision: payload.sourceArtifactRevision,
        publishedArtifactRevision: payload.sourceArtifactRevision,
        publishedAt: "2026-08-11T12:00:00.000Z",
      }),
    );

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-interaction-publication",
          title: "Interactions",
          mode: "slideshow",
          content: invalidContent,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          learnerPublication: {
            getStatus: async () =>
              Result.ok({
                currentArtifactRevision: "revision-interactions",
                publishedArtifactRevision: null,
                publishedAt: null,
              }),
            publish,
          },
          media: null,
        }}
        hostHeaderActions={({ saveNow }) => ({
          beforePublish: (
            <button type="button" onClick={() => void saveNow()}>
              Save interactions
            </button>
          ),
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save interactions" }));
    await waitFor(() => expect(saveArtifact).toHaveBeenCalledTimes(1));
    await user.click(getCorePublishAction());

    expect(publish).not.toHaveBeenCalled();
    expect(getCorePublishAction()).toHaveAttribute("data-publish-state", "invalid");

    const repairedContent = slideshowDocumentWithLearnerRule("activated");
    delete repairedContent.content?.[0]?.attrs?.["learnerInteractions"];
    const onUpdate = mocks.contentAuthorHostProps.at(-1)?.["onUpdate"] as
      | ((content: JSONContent, unavailableContent: readonly [], sourceDocument: object) => void)
      | undefined;
    act(() => onUpdate?.(repairedContent, [], {}));
    await user.click(screen.getByRole("button", { name: "Save interactions" }));
    await waitFor(() => expect(saveArtifact).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(getCorePublishAction()).toHaveAttribute("data-publish-state", "not-published"),
    );
    await user.click(getCorePublishAction());

    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    const payload = publish.mock.calls[0]?.[0];
    expect(Object.keys(payload ?? {}).sort()).toEqual([
      "artifact",
      "assessmentGroups",
      "assessmentTargets",
      "learnerContent",
      "sourceArtifactRevision",
    ]);
    expect(payload?.learnerContent.content?.[0]?.attrs?.["learnerInteractions"]).toEqual(
      repairedContent.content?.[0]?.attrs?.["learnerInteractions"],
    );
  });

  it("saves an empty quiz canonically and publishes learner content without it", async () => {
    const user = userEvent.setup();
    const content = pageDocumentWithEmptyQuiz();
    mocks.authorJSON = content;
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) =>
      successfulArtifactSaveResult("revision-empty-quiz"),
    );
    const publish = vi.fn(async (_payload: LearnerPublicationPayload) =>
      Result.ok({
        currentArtifactRevision: "revision-empty-quiz",
        publishedArtifactRevision: "revision-empty-quiz",
        publishedAt: "2026-08-11T10:00:00.000Z",
      }),
    );

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{ id: "artifact-empty-quiz", title: "Draft", mode: "page", content }}
        services={{
          artifactPersistence: { saveArtifact },
          learnerPublication: {
            getStatus: async () =>
              Result.ok({
                currentArtifactRevision: "revision-before-empty-quiz",
                publishedArtifactRevision: null,
                publishedAt: null,
              }),
            publish,
          },
          media: null,
        }}
        hostHeaderActions={({ saveNow }) => ({
          beforePublish: (
            <button type="button" onClick={() => void saveNow()}>
              Save empty quiz
            </button>
          ),
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save empty quiz" }));
    await waitFor(() => expect(saveArtifact).toHaveBeenCalledTimes(1));
    expect(findJsonNode(saveArtifact.mock.calls[0]?.[0].artifact.content, "quiz")).toEqual(
      findJsonNode(content, "quiz"),
    );

    await user.click(getCorePublishAction());
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    const publication = publish.mock.calls[0]?.[0];
    expect(findJsonNode(publication?.learnerContent, "quiz")).toBeUndefined();
    expect(publication?.assessmentTargets).toEqual([]);
    expect(publication?.assessmentGroups).toEqual([]);
  });

  it("does not adopt a completed Save after a newer canonicalization failure", async () => {
    const user = userEvent.setup();
    const saveResult = createDeferred<ArtifactPersistenceResult>();
    const saveArtifact = vi.fn(() => saveResult.promise);
    const publish = vi.fn();

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-superseded-save",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          learnerPublication: {
            getStatus: async () =>
              Result.ok({
                currentArtifactRevision: "revision-1",
                publishedArtifactRevision: null,
                publishedAt: null,
              }),
            publish,
          },
          media: null,
        }}
        hostHeaderActions={({ saveNow }) => ({
          beforePublish: (
            <button type="button" onClick={() => void saveNow()}>
              Save now
            </button>
          ),
        })}
      />,
    );

    const onUpdate = mocks.contentAuthorHostProps.at(-1)?.["onUpdate"] as
      | ((content: JSONContent, unavailableContent: readonly [], sourceDocument: object) => void)
      | undefined;
    const onDocumentError = mocks.contentAuthorHostProps.at(-1)?.["onDocumentError"] as
      | ((failure: unknown) => void)
      | undefined;
    act(() => onUpdate?.(mocks.authorJSON, [], {}));
    await user.click(screen.getByRole("button", { name: "Save now" }));
    expect(saveArtifact).toHaveBeenCalledTimes(1);
    act(() => onDocumentError?.({ status: "canonicalization-failed", issues: [] }));
    saveResult.resolve(successfulArtifactSaveResult("revision-2"));

    await waitFor(() =>
      expect(getCorePublishAction()).toHaveAttribute("data-publish-state", "invalid"),
    );
    await user.click(getCorePublishAction());
    expect(publish).not.toHaveBeenCalled();
    expect(screen.getByRole("banner")).toHaveAttribute("data-save-state", "error");
  });

  it("serializes current editor content for an explicit save", async () => {
    const user = userEvent.setup();
    const saveArtifact = vi.fn(async (bundle: ArtifactSavePayload) => {
      mocks.savedBundles.push(bundle);
      return successfulArtifactSaveResult();
    });

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-explicit-save",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          media: null,
        }}
        hostHeaderActions={({ saveNow }) => ({
          beforePublish: (
            <button type="button" onClick={() => void saveNow()}>
              Save now
            </button>
          ),
        })}
      />,
    );

    mocks.authorJSON = pageDocumentWithParagraph("authorsurf01", "Fresh editor content");
    const onUpdate = mocks.contentAuthorHostProps.at(-1)?.["onUpdate"] as
      | ((content: JSONContent, unavailableContent: readonly [], sourceDocument: object) => void)
      | undefined;
    act(() => onUpdate?.(mocks.authorJSON, [], {}));
    mocks.fakeEditor.getJSON.mockClear();
    await user.click(screen.getByRole("button", { name: "Save now" }));

    await waitFor(() => expect(saveArtifact).toHaveBeenCalledTimes(1));
    expect(mocks.fakeEditor.getJSON).not.toHaveBeenCalled();
    expect(mocks.savedBundles.at(-1)?.artifact.content).toEqual(mocks.authorJSON);
  });

  it("opens and saves unavailable canonical content without persisting compatibility nodes", async () => {
    const user = userEvent.setup();
    const content = pageDocumentWithParagraph("authorsurf01", "Editable");
    content.content![0]!.content![0]!.content!.push({
      type: "plus_private_block",
      attrs: { id: "plusblock001", private: "preserve exactly" },
    });
    const saveArtifact = vi.fn(async (bundle: ArtifactSavePayload) => {
      mocks.savedBundles.push(bundle);
      return successfulArtifactSaveResult();
    });

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{ id: "artifact-plus", title: "Plus", mode: "page", content }}
        services={{ artifactPersistence: { saveArtifact }, media: null }}
        hostHeaderActions={({ saveNow }) => ({
          beforePublish: (
            <button type="button" onClick={() => void saveNow()}>
              Save unavailable
            </button>
          ),
        })}
      />,
    );

    await screen.findByTestId("content-author-host");
    expect(screen.queryByTestId("scaffold-authoring-unavailable-content")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save unavailable" }));
    await waitFor(() => expect(saveArtifact).toHaveBeenCalledTimes(1));

    const saved = mocks.savedBundles.at(-1)?.artifact.content;
    expect(findJsonNode(saved, "plus_private_block")?.attrs).toMatchObject({
      id: "plusblock001",
      private: "preserve exactly",
    });
    expect(findJsonNode(saved, "unavailable_block")).toBeUndefined();
  });

  it("refuses learner preview with safe details without persisting unavailable content", async () => {
    const user = userEvent.setup();
    const content = pageDocumentWithParagraph("authorsurf01", "Editable");
    content.content![0]!.content![0]!.content!.push({
      type: "plus_private_block",
      attrs: {
        id: "plusblock001",
        private: "must never appear in preview errors",
      },
    });
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) =>
      successfulArtifactSaveResult(),
    );

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{ id: "artifact-plus-preview", title: "Plus", mode: "page", content }}
        services={{ artifactPersistence: { saveArtifact }, media: null }}
      />,
    );

    await screen.findByTestId("content-author-host");
    await user.click(screen.getByRole("button", { name: "Switch to preview" }));

    expect(saveArtifact).not.toHaveBeenCalled();
    const refusal = await screen.findByRole("alert");
    expect(refusal).toHaveTextContent("Preview unavailable: 1 block capability is not installed.");
    expect(refusal).not.toHaveTextContent("must never appear in preview errors");
    expect(screen.queryByTestId("scaffold-learner-app")).toBeNull();
  });

  it("cancels a pending autosave when authoring unmounts", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const saveArtifact = vi.fn(() => new Promise<ArtifactPersistenceResult>(() => {}));

    const rendered = render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-unmount",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          media: null,
        }}
      />,
    );
    const onUpdate = mocks.contentAuthorHostProps.at(-1)?.["onUpdate"] as
      | ((content: JSONContent, unavailableContent: readonly [], sourceDocument: object) => void)
      | undefined;
    mocks.fakeEditor.getJSON.mockClear();

    act(() => {
      onUpdate?.(mocks.authorJSON, [], {});
    });
    rendered.unmount();
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mocks.fakeEditor.getJSON).not.toHaveBeenCalled();
    expect(saveArtifact).not.toHaveBeenCalled();
  });

  it("loads learner preview on demand without persisting projected content", async () => {
    const user = userEvent.setup();
    const saveArtifact = vi.fn(async () => successfulArtifactSaveResult("revision-1"));
    mocks.authorJSON = privateAssessmentDocument();

    expect(mocks.learnerModuleReads).toBe(0);

    render(
      <ScaffoldAuthoringApp
        application={privateAssessmentApplication}
        artifact={{
          id: "artifact-lazy-preview",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          media: null,
        }}
      />,
    );

    await screen.findByTestId("content-author-host");
    expect(mocks.contentAuthorHostProps.at(-1)?.["mount"]).toEqual(expect.any(Object));
    expect(mocks.contentAuthorHostProps.at(-1)).not.toHaveProperty("content");
    expect(mocks.contentAuthorHostProps.at(-1)).not.toHaveProperty("composition");
    expect(mocks.contentAuthorHostProps.at(-1)).not.toHaveProperty("authoringEnvironment");
    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);

    await screen.findByTestId("scaffold-learner-app");
    expect(saveArtifact).not.toHaveBeenCalled();
    expect(mocks.learnerAppProps.at(-1)?.["bootstrap"]).toMatchObject({
      publication: { status: "supported", learnerContent: expect.any(Object) },
    });
    expect(JSON.stringify(mocks.learnerAppProps.at(-1)?.["bootstrap"])).not.toContain(
      "must-not-reach-preview",
    );
    expect(mocks.learnerAppProps.at(-1)?.["composition"]).toBe(
      privateAssessmentApplication.runtime,
    );

    await user.click(screen.getByRole("button", { name: "Switch to editing" }));
    await screen.findByTestId("content-author-host");
    const nextPreviewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(nextPreviewButton).toHaveProperty("disabled", false));
    await user.click(nextPreviewButton);

    await screen.findByTestId("scaffold-learner-app");
    expect(saveArtifact).not.toHaveBeenCalled();
  });

  it("keeps the current authoring session mounted while entering and leaving Preview", async () => {
    const user = userEvent.setup();
    const initialContent = structuredClone(mocks.authorJSON);
    const workingContent = structuredClone(initialContent);
    workingContent.content![0]!.attrs!["theme"] = {
      ...createDefaultPersistedCourseTheme(),
      overrides: { design: { roundness: "square" } },
    };
    mocks.authorJSON = workingContent;
    mocks.fakeEditor.state.doc.firstChild.attrs = workingContent.content![0]!.attrs!;

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-preview-session",
          title: "Draft",
          mode: "page",
          content: initialContent,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    const initialMount = mocks.contentAuthorHostProps.at(-1)?.["mount"];
    const onUpdate = mocks.contentAuthorHostProps.at(-1)?.["onUpdate"] as
      | ((content: JSONContent, unavailableContent: readonly [], sourceDocument: object) => void)
      | undefined;
    act(() => onUpdate?.(workingContent, [], {}));

    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);
    await screen.findByTestId("scaffold-learner-app");
    await user.click(screen.getByRole("button", { name: "Switch to editing" }));
    await screen.findByTestId("content-author-host");

    expect(screen.getByTestId("content-author-host")).toBeInTheDocument();
    expect(mocks.contentAuthorHostProps.at(-1)?.["mount"]).toBe(initialMount);
    expect(mocks.contentAuthorHostRenderCount).toBeGreaterThan(0);
  });

  it("shares application mode with the canvas and learner Preview without changing JSON", async () => {
    const user = userEvent.setup();
    localStorage.setItem("scaffold.authoring.color-mode.v1", "dark");
    const initialJSON = JSON.stringify(mocks.authorJSON);
    const props = {
      application: testApplication,
      artifact: {
        id: "artifact-contextual-colour-mode",
        title: "Preview modes",
        mode: "page" as const,
        content: mocks.authorJSON,
      },
      services: {
        artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
        media: null,
      },
      createPreviewServices: vi.fn(() => ({ media: null })),
    };
    const first = render(<ScaffoldAuthoringApp {...props} />);

    expect(document.querySelector(".sc-scaffold-authoring-app")).toHaveAttribute(
      "data-scaffold-color-mode",
      "dark",
    );
    expect(latestCourseAppearance()).toBe("dark");

    await user.click(
      screen.getByRole("button", { name: "Switch authoring application to light mode" }),
    );

    await waitFor(() => {
      expect(latestCourseAppearance()).toBe("light");
    });
    expect(JSON.stringify(mocks.authorJSON)).toBe(initialJSON);
    expect(mocks.authorJSON.content?.[0]?.attrs).not.toHaveProperty("colorMode");

    await user.click(screen.getByRole("button", { name: "Switch to preview" }));
    await waitFor(() => expect(mocks.learnerAppProps.length).toBeGreaterThan(0));
    expect(mocks.learnerAppProps.at(-1)?.["hostColorMode"]).toBe("light");
    expect(JSON.stringify(mocks.authorJSON)).toBe(initialJSON);

    first.unmount();
    mocks.contentAuthorHostProps.length = 0;
    render(<ScaffoldAuthoringApp {...props} />);
    expect(latestCourseAppearance()).toBe("light");
  });

  it("awaits asynchronous preview services before entering preview", async () => {
    const user = userEvent.setup();
    const accept = vi.fn(async () => undefined);
    const servicesResult = createDeferred<{
      media: null;
      learningEvents: {
        rootActivityId: string;
        accept: typeof accept;
      };
    }>();
    const createPreviewServices = vi.fn(() => servicesResult.promise);

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-async-preview-services",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
        createPreviewServices={createPreviewServices}
      />,
    );

    await screen.findByTestId("content-author-host");
    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);

    await waitFor(() => expect(createPreviewServices).toHaveBeenCalledTimes(1));
    expect(previewButton.textContent).toBe("Preparing...");
    expect(screen.queryByTestId("scaffold-learner-app")).toBeNull();

    servicesResult.resolve({
      media: null,
      learningEvents: {
        rootActivityId: "https://learning.example.test/artifacts/authoring-preview",
        accept,
      },
    });
    await screen.findByTestId("scaffold-learner-app");
    expect(mocks.learnerAppProps.at(-1)?.["productAccess"]).toBe(coreProductAccess);
    expect(mocks.learnerAppProps.at(-1)?.["services"]).toEqual({ media: null });
    expect(accept).not.toHaveBeenCalled();
  });

  it("announces an asynchronous preview-service failure and allows retry", async () => {
    const user = userEvent.setup();
    const firstServices = createDeferred<{ media: null }>();
    const createPreviewServices = vi
      .fn<() => Promise<{ media: null }>>()
      .mockReturnValueOnce(firstServices.promise)
      .mockResolvedValueOnce({ media: null });

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-preview-service-retry",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
        createPreviewServices={createPreviewServices}
      />,
    );

    await screen.findByTestId("content-author-host");
    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);
    firstServices.reject(new Error("preview service unavailable"));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Preview could not be prepared. Try again.",
    );
    expect(screen.getByTestId("content-author-host")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to preview" }));

    await screen.findByTestId("scaffold-learner-app");
    expect(createPreviewServices).toHaveBeenCalledTimes(2);
  });

  it("does not publish a late Preview after top-level preparation is cancelled", async () => {
    const user = userEvent.setup();
    const surfaceId = "previewsurf1" as EmbeddedNodeId;
    const input = presentationPreviewDocument(surfaceId);
    const servicesResult = createDeferred<{ media: null }>();
    const createPreviewServices = vi.fn(() => servicesResult.promise);
    const onPreviewChange = vi.fn();

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-stale-presentation-preview",
          title: "Draft",
          mode: "slideshow",
          content: input.document,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
        createPreviewServices={createPreviewServices}
        onPreviewChange={onPreviewChange}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Switch to preview" }));
    await waitFor(() => expect(createPreviewServices).toHaveBeenCalledOnce());

    await user.click(screen.getByRole("button", { name: "Cancel preview preparation" }));
    onPreviewChange.mockClear();
    await act(async () => {
      servicesResult.resolve({ media: null });
      await servicesResult.promise;
      await Promise.resolve();
    });
    expect(onPreviewChange).not.toHaveBeenCalledWith(true);
    expect(mocks.contentAuthorHostProps.at(-1)?.["stagePreview"]).toBeUndefined();
    expect(screen.queryByTestId("scaffold-learner-app")).toBeNull();
    expect(screen.getByRole("button", { name: "Switch to preview" })).toBeInTheDocument();
  });

  it("keeps an expected preview-service failure in Editing", async () => {
    const user = userEvent.setup();
    const surfaceId = "previewsurf2" as EmbeddedNodeId;
    const input = presentationPreviewDocument(surfaceId);
    const cause = new Error("preview service unavailable");

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-presentation-preview-service-error",
          title: "Draft",
          mode: "slideshow",
          content: input.document,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
        createPreviewServices={vi.fn().mockRejectedValue(cause)}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Switch to preview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Preview could not be prepared. Try again.",
    );
    expect(screen.queryByTestId("scaffold-learner-app")).toBeNull();
    expect(screen.getByRole("button", { name: "Switch to preview" })).toBeInTheDocument();
  });

  it("keeps an oversized Preview payload in Editing", async () => {
    const user = userEvent.setup();
    const surfaceId = "previewsurf4" as EmbeddedNodeId;
    const input = presentationPreviewDocument(surfaceId);
    const paragraph = findJsonNode(input.document, "paragraph");
    if (!paragraph) throw new Error("expected a Presentation paragraph");
    paragraph.content = [{ type: "text", text: "x".repeat(2 * 1024 * 1024 + 1) }];

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-presentation-preview-payload-size",
          title: "Draft",
          mode: "slideshow",
          content: input.document,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Switch to preview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Preview could not be prepared. Try again.",
    );
    expect(screen.queryByTestId("scaffold-learner-app")).toBeNull();
  });

  it("keeps keyboard focus on the Preview and Edit action across the transition", async () => {
    const user = userEvent.setup();

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-preview-focus",
          title: "Focused draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    await screen.findByTestId("content-author-host");
    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);

    const editButton = await screen.findByRole("button", { name: "Switch to editing" });
    expect(document.activeElement).toBe(editButton);

    await user.click(editButton);

    await screen.findByTestId("content-author-host");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Switch to preview" }));
  });

  it("shows the document creation gate before mounting authoring without an artifact", () => {
    render(
      <ScaffoldAuthoringEntry
        application={testApplication}
        artifact={null}
        productAccess={coreProductAccess}
        services={{
          artifactPersistence: {
            saveArtifact: vi.fn(async () => Result.ok({ artifactRevision: "revision-1" })),
          },
          artifactCreation: { createArtifactMetadata: vi.fn() },
          learnerPublication: createDefaultLearnerPublicationPort(),
          media: null,
        }}
      />,
    );

    expect(screen.getByTestId("document-creation-gate")).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Choose a format" })).toBeInTheDocument();
    expect(
      screen.getByText("Choose how learners will move through your content."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create slideshow (beta)" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Slideshow is currently in beta. You can use it now, but features and layouts may change.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("content-author-host")).toBeNull();
  });

  it("creates an artifact before mounting the editor", async () => {
    const user = userEvent.setup();
    const createArtifactMetadata = vi.fn(async (_input: { mode: "page" | "slideshow" }) => ({
      id: "artifact-new-slideshow",
      requiresScaffoldPlus: false,
      title: "Untitled",
    }));
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) =>
      Result.ok({ artifactRevision: "revision-new" }),
    );

    render(
      <ScaffoldAuthoringEntry
        application={testApplication}
        artifact={null}
        productAccess={coreProductAccess}
        services={{
          artifactPersistence: { saveArtifact },
          artifactCreation: { createArtifactMetadata },
          learnerPublication: createDefaultLearnerPublicationPort(),
          media: null,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create slideshow (beta)" }));

    await screen.findByTestId("content-author-host");

    expect(createArtifactMetadata).toHaveBeenCalledWith({ mode: "slideshow" });
    const savedBundle = saveArtifact.mock.calls[0]?.[0];
    if (!savedBundle) {
      throw new Error("artifact creation did not save a bundle");
    }
    expect(savedBundle).toMatchObject({
      artifact: {
        id: "artifact-new-slideshow",
        title: "Untitled",
        mode: "slideshow",
      },
    });
    expect(firstSurfaceAttrs(savedBundle?.artifact.content)).toMatchObject({
      variant: "slide-cover",
    });
    expect(savedBundle.artifact.content.content?.[0]?.attrs).toMatchObject({
      requiresScaffoldPlus: false,
    });
    expect(findJsonNode(savedBundle.artifact.content, "courseSection")?.attrs).toMatchObject({
      title: "Section 1",
    });
    expect(savedBundle).not.toHaveProperty("learnerContent");
  });

  it("publishes a newly created artifact with its creation Save revision", async () => {
    const user = userEvent.setup();
    const createArtifactMetadata = vi.fn(async () => ({
      id: "artifact-new-page",
      requiresScaffoldPlus: false,
      title: "Untitled",
    }));
    const saveArtifact = vi.fn(async () => Result.ok({ artifactRevision: "revision-created" }));
    const publish = vi.fn(async (_payload: LearnerPublicationPayload) =>
      Result.ok({
        currentArtifactRevision: "revision-created",
        publishedArtifactRevision: "revision-created",
        publishedAt: "2026-08-11T09:00:00.000Z",
      }),
    );

    render(
      <ScaffoldAuthoringEntry
        application={testApplication}
        artifact={null}
        productAccess={coreProductAccess}
        services={{
          artifactPersistence: { saveArtifact },
          artifactCreation: { createArtifactMetadata },
          learnerPublication: {
            getStatus: async () =>
              Result.ok({
                currentArtifactRevision: "revision-bootstrap",
                publishedArtifactRevision: null,
                publishedAt: null,
              }),
            publish,
          },
          media: null,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create page" }));
    await screen.findByTestId("content-author-host");
    await waitFor(() =>
      expect(getCorePublishAction()).toHaveAttribute("data-publish-state", "not-published"),
    );

    await user.click(getCorePublishAction());

    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    expect(publish.mock.calls[0]?.[0]?.sourceArtifactRevision).toBe("revision-created");
    expect(saveArtifact).toHaveBeenCalledTimes(1);
    expect(getCorePublishAction()).toHaveAttribute("data-publish-state", "published");
  });

  it("keeps the creation gate open when artifact creation fails", async () => {
    const user = userEvent.setup();
    const createArtifactMetadata = vi.fn(async () => {
      throw new Error("save failed");
    });

    render(
      <ScaffoldAuthoringEntry
        application={testApplication}
        artifact={null}
        productAccess={coreProductAccess}
        services={{
          artifactPersistence: {
            saveArtifact: vi.fn(async () => Result.ok({ artifactRevision: "revision-1" })),
          },
          artifactCreation: { createArtifactMetadata },
          learnerPublication: createDefaultLearnerPublicationPort(),
          media: null,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create page" }));

    await waitFor(() => {
      expect(screen.getByText("Document could not be created. Try again.")).toBeInTheDocument();
    });

    expect(screen.getByTestId("document-creation-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("content-author-host")).toBeNull();
  });

  it("keeps the Agent button available when no AI port is configured", async () => {
    const user = userEvent.setup();
    const onAgentClose = vi.fn();

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-agent",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
        onAgentClose={onAgentClose}
      />,
    );

    await screen.findByTestId("content-author-host");
    const agentButton = screen.getByRole("button", {
      name: "Show Scaffold Agent",
    });

    expect(agentButton).toHaveProperty("disabled", false);
    expect(screen.queryByTestId("authoring-agent-dock")).toBeNull();

    await user.click(agentButton);

    expect(screen.getByRole("button", { name: "Hide Scaffold Agent" })).toBeInTheDocument();
    expect(screen.getByTestId("authoring-agent-dock")).toBeInTheDocument();
    expect(mocks.contentAuthorHostProps.at(-1)?.["agentIntegration"]).toBe(
      ScaffoldUnavailableAgentIntegration,
    );
    expect(mocks.blockStripProps.at(-1)?.["items"]).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "callout" })]),
    );

    await user.click(screen.getByRole("button", { name: "Close Scaffold Agent" }));

    expect(screen.getByRole("button", { name: "Show Scaffold Agent" })).toBeInTheDocument();
    expect(screen.queryByTestId("authoring-agent-dock")).toBeNull();
    expect(onAgentClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the left Document Outline and right Agent docks independently operable", async () => {
    const user = userEvent.setup();

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-outline-agent",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    await screen.findByTestId("content-author-host");
    await user.click(screen.getByRole("button", { name: "Show Document Outline" }));
    expect(screen.getByTestId("authoring-outline-dock")).toBeInTheDocument();
    expect(screen.queryByTestId("authoring-agent-dock")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show Scaffold Agent" }));
    expect(screen.getByTestId("authoring-outline-dock")).toBeInTheDocument();
    expect(screen.getByTestId("authoring-agent-dock")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close Document Outline" }));
    expect(screen.queryByTestId("authoring-outline-dock")).toBeNull();
    expect(screen.getByTestId("authoring-agent-dock")).toBeInTheDocument();
  });

  it("does not mount the Document Outline in learner preview", async () => {
    const user = userEvent.setup();

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-outline-preview",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
        createPreviewServices={() => ({ media: null })}
      />,
    );

    await screen.findByTestId("content-author-host");
    await user.click(screen.getByRole("button", { name: "Show Document Outline" }));
    expect(screen.getByTestId("authoring-outline-dock")).toBeInTheDocument();

    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);

    await waitFor(() => expect(screen.getByTestId("content-author-host")).toBeInTheDocument());
    expect(screen.queryByTestId("authoring-outline-dock")).toBeNull();
    expect(screen.queryByRole("button", { name: "Hide Document Outline" })).toBeNull();
  });

  it("renders preview from projected learner content", async () => {
    const user = userEvent.setup();
    const saveArtifact = vi.fn(async (bundle: ArtifactSavePayload) => {
      mocks.savedBundles.push(bundle);
      return successfulArtifactSaveResult();
    });
    const onPreviewContentChange = vi.fn();
    const createPreviewServices = vi.fn(() => ({ media: null }));

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-preview",
          title: "Draft",
          mode: "page",
          content: mocks.authorJSON,
        }}
        services={{
          artifactPersistence: { saveArtifact },
          media: null,
        }}
        onPreviewContentChange={onPreviewContentChange}
        createPreviewServices={createPreviewServices}
      />,
    );

    await screen.findByTestId("content-author-host");
    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);

    await waitFor(() => expect(onPreviewContentChange).toHaveBeenCalledTimes(1));
    await screen.findByTestId("scaffold-learner-app");

    expect(saveArtifact).not.toHaveBeenCalled();
    expect(onPreviewContentChange).toHaveBeenCalledWith(
      expect.objectContaining({
        learnerContent: expect.any(Object),
      }),
    );
    const projectedPreview = onPreviewContentChange.mock.calls.at(-1)?.[0];
    expect(mocks.learnerAppProps.at(-1)?.["bootstrap"]).toMatchObject({
      artifactId: "artifact-preview",
      title: "Draft",
      mode: "page",
      publication: {
        status: "supported",
        learnerContent: projectedPreview?.learnerContent,
      },
    });
    expect(createPreviewServices).toHaveBeenCalledWith(
      expect.objectContaining({
        learnerContent: projectedPreview?.learnerContent,
      }),
    );
  });

  it("gives slideshow preview the remaining two-axis workspace", async () => {
    const user = userEvent.setup();
    const surfaceId = EmbeddedNodeIdSchema.parse("slideprev001");
    const content = slideshowDocument(surfaceId);
    mocks.authorJSON = content;
    mocks.fakeEditor.getJSON.mockReturnValue(content);
    installFakeDocumentOwners([surfaceId]);

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-slideshow-preview",
          title: "Slides",
          mode: "slideshow",
          content,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => successfulArtifactSaveResult()) },
          media: null,
        }}
      />,
    );

    await screen.findByTestId("content-author-host");
    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).toHaveProperty("disabled", false));
    await user.click(previewButton);

    const learnerApp = await screen.findByTestId("scaffold-learner-app");
    expect(screen.getByTestId("content-author-host")).toBeInTheDocument();
    expect(mocks.contentAuthorHostProps.at(-1)?.["stagePreview"]).toBeTruthy();
    expect(mocks.contentAuthorHostProps.at(-1)?.["bottomWorkspace"]).toBeTruthy();
    expect(mocks.learnerAppProps.at(-1)?.["slideshowSizing"]).toBe("contained");
    expect(
      learnerApp.closest(".sc-scaffold-authoring-workspace")?.getAttribute("data-preview-mode"),
    ).toBe("slideshow");
  });
});

function latestCourseAppearance(): unknown {
  const props = mocks.contentAuthorHostProps.at(-1);
  if (!props) throw new Error("ContentAuthorHost props were not recorded");
  return props["courseAppearance"];
}

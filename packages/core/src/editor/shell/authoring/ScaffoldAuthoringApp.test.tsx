// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import { EmbeddedNodeIdSchema, McqSettingsSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Result } from "better-result";
import { StrictMode, type ReactElement, type ReactNode } from "react";
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
import { PresentationPreviewController } from "@/editor/presentation/preview";
import { LearnerInteractionPreviewController } from "@/editor/learner-interaction/preview";
import type { PresentationPreviewDocument } from "@/presentation/model";
import type { SemanticDocumentController } from "@/document/authoring/semantic-document/semantic-document-controller";
import type { SemanticNavigationResult } from "@/document/authoring/semantic-document";
import { semanticDocumentPluginKey } from "@/document/authoring/semantic-document/semantic-document-storage";
import type { SemanticItem, SemanticLocation } from "@/document/model/semantic-document";
import { type CourseDocumentAuthoringMount } from "@/document/authoring/prepared-authoring-mount";
import type {
  ArtifactSavePayload,
  ArtifactSaveResult,
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
    authorPreviewModuleReads: 0,
    learnerModuleReads: 0,
    learnerAppProps: [] as Array<Record<string, unknown>>,
    contentAuthorHostProps: [] as Array<Record<string, unknown>>,
    contentAuthorHostRenderCount: 0,
    renderBottomWorkspace: false,
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
      onUpdate?: (content: unknown) => void;
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

      return createElement(
        "section",
        { "data-testid": "content-author-host" },
        authoringNavigatorDock?.(mocks.fakeEditor),
        stagePreview,
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
      mocks.authorPreviewModuleReads += 1;
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
  type ScaffoldAuthoringHostActionsContext,
} from "./ScaffoldAuthoringApp";
import { ScaffoldAuthoringEntry } from "./ScaffoldAuthoringEntry";

const coreProductAccess = { scaffoldPlusAuthorized: false } as const;
const plusProductAccess = { scaffoldPlusAuthorized: true } as const;

function ScaffoldAuthoringApp(
  props: Omit<ScaffoldAuthoringAppProps, "productAccess" | "services"> & {
    readonly productAccess?: ScaffoldAuthoringAppProps["productAccess"];
    readonly services: Omit<
      ScaffoldAuthoringHostServices,
      "artifactPersistence" | "learnerPublication"
    > & {
      readonly artifactPersistence: {
        readonly saveArtifact: (payload: ArtifactSavePayload) => Promise<unknown>;
      };
      readonly learnerPublication?: LearnerPublicationPort;
    };
  },
) {
  const learnerPublication =
    props.services.learnerPublication ?? createDefaultLearnerPublicationPort();
  const services: ScaffoldAuthoringHostServices = {
    ...props.services,
    artifactPersistence: {
      async saveArtifact(payload) {
        const result = await props.services.artifactPersistence.saveArtifact(payload);
        return {
          artifactRevision: "test-saved-revision",
          ...(result && typeof result === "object" ? result : {}),
        };
      },
    },
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
    getStatus: async () => ({
      currentArtifactRevision: "test-saved-revision",
      publishedArtifactRevision: null,
      publishedAt: null,
    }),
    publish: async (payload) => ({
      currentArtifactRevision: payload.sourceArtifactRevision,
      publishedArtifactRevision: payload.sourceArtifactRevision,
      publishedAt: "2026-08-10T12:00:00.000Z",
    }),
  };
}

beforeEach(() => {
  localStorage.clear();
  mocks.authorPreviewModuleReads = 0;
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

function presentationPreviewDocument(
  surfaceId: PresentationPreviewDocument["surfaceId"],
): PresentationPreviewDocument {
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
  vi.spyOn(semanticDocumentPluginKey, "getState").mockReturnValue({
    getSnapshot: () => ({ semantics }),
  } as unknown as SemanticDocumentController);
  return { document: document as PresentationPreviewDocument["document"], surfaceId };
}

function currentPresentationPreviewController(): PresentationPreviewController {
  const workspace = mocks.contentAuthorHostProps.at(-1)?.["bottomWorkspace"] as
    | ReactElement<{ previewController: PresentationPreviewController }>
    | undefined;
  if (!workspace?.props.previewController) {
    throw new Error("expected the mounted Presentation Timeline preview controller");
  }
  return workspace.props.previewController;
}

function currentLearnerInteractionPreviewController(): LearnerInteractionPreviewController {
  const workspace = mocks.contentAuthorHostProps.at(-1)?.["bottomWorkspace"] as
    | ReactElement<{ learnerInteractionPreviewController: LearnerInteractionPreviewController }>
    | undefined;
  if (!workspace?.props.learnerInteractionPreviewController) {
    throw new Error("expected the mounted Learner Interaction preview controller");
  }
  return workspace.props.learnerInteractionPreviewController;
}

class FakeWorkspaceSemanticController {
  readonly selectCalls: EmbeddedNodeId[] = [];
  readonly #selectionResults: Array<SemanticNavigationResult | Promise<SemanticNavigationResult>> =
    [];
  readonly #listeners = new Set<() => void>();
  #snapshot: ReturnType<SemanticDocumentController["getSnapshot"]>;

  constructor(
    surfaceIds: readonly EmbeddedNodeId[],
    options: {
      readonly courseSectionId?: EmbeddedNodeId;
      readonly selectedId?: EmbeddedNodeId | null;
    } = {},
  ) {
    const items: SemanticItem[] = surfaceIds.map((id, index) => ({
      id,
      kind: "surface" as const,
      nodeType: "surface",
      definitionId: index === 0 ? "slide-content" : "slide-cover",
      label: `Slide ${index + 1}`,
      summary: null,
      presentation: { actionIds: [], disabledReason: null },
      presentationContainer: null,
      children: [],
    }));
    const courseSection: SemanticItem | null = options.courseSectionId
      ? {
          id: options.courseSectionId,
          kind: "course-section" as const,
          nodeType: "courseSection",
          definitionId: null,
          label: "Section 1",
          summary: null,
          presentation: { actionIds: [], disabledReason: null },
          presentationContainer: null,
          children: items,
        }
      : null;
    const itemById = new Map<EmbeddedNodeId, SemanticItem>(items.map((item) => [item.id, item]));
    const parentById = new Map<EmbeddedNodeId, EmbeddedNodeId | null>(
      items.map((item) => [item.id, courseSection?.id ?? null]),
    );
    const locationById = new Map<EmbeddedNodeId, SemanticLocation>(
      items.map((item, index) => [
        item.id,
        {
          id: item.id,
          nodeType: "surface",
          from: index + 2,
          to: index + 3,
          selectionTarget: { kind: "node" as const, pos: index + 2 },
          surfaceId: item.id,
          authoringAnchorId: item.id,
          activationPath: [],
        },
      ]),
    );
    if (courseSection) {
      itemById.set(courseSection.id, courseSection);
      parentById.set(courseSection.id, null);
      locationById.set(courseSection.id, {
        id: courseSection.id,
        nodeType: "courseSection",
        from: 1,
        to: 2,
        selectionTarget: { kind: "node", pos: 1 },
        surfaceId: null,
        authoringAnchorId: null,
        activationPath: [],
      });
    }
    const semantics = {
      revision: 0,
      mode: "slideshow" as const,
      roots: courseSection ? [courseSection] : items,
      itemById,
      parentById,
      locationById,
      diagnostics: [],
    };
    const selectedId =
      options.selectedId === undefined ? (surfaceIds[0] ?? null) : options.selectedId;
    this.#snapshot = Object.freeze({
      semantics,
      selectedId,
      selectionOrigin: selectedId ? ("editor" as const) : null,
    });
  }

  readonly getSnapshot = () => this.#snapshot;
  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  readonly getControlCapabilityCatalogue = () => ({
    resolve: (targetId: EmbeddedNodeId) =>
      Result.ok({
        ownerId: targetId,
        targetId,
        capabilities: {
          events: [{ type: "activated", label: "Activated" }],
          commands: [{ type: "activate", label: "Activate" }],
        },
      }),
  });
  readonly select = async (id: EmbeddedNodeId): Promise<SemanticNavigationResult> => {
    this.selectCalls.push(id);
    const result = await (this.#selectionResults.shift() ?? ({ kind: "reached", id } as const));
    if (result.kind === "reached") this.publish(result.id, "presentation-timeline");
    if (result.kind === "reached-owner") this.publish(result.ownerId, "presentation-timeline");
    return result;
  };

  queueSelectionResult(result: SemanticNavigationResult | Promise<SemanticNavigationResult>) {
    this.#selectionResults.push(result);
  }

  publish(
    id: EmbeddedNodeId,
    selectionOrigin: "component" | "presentation-timeline" = "component",
  ) {
    this.#snapshot = Object.freeze({ ...this.#snapshot, selectedId: id, selectionOrigin });
    for (const listener of this.#listeners) listener();
  }
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
    readonly completion: ReturnType<typeof createDeferred<ArtifactSaveResult>>;
    readonly payload: ArtifactSavePayload;
  }> = [];
  let storedPayload: ArtifactSavePayload | null = null;
  const saveArtifact = vi.fn((payload: ArtifactSavePayload) => {
    const completion = createDeferred<ArtifactSaveResult>();
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
    resolve(index: number, artifactRevision: string) {
      const request = requests[index];
      if (!request) throw new Error(`save request ${index} does not exist`);
      request.completion.resolve({ artifactRevision });
    },
    reject(index: number, reason: unknown) {
      const request = requests[index];
      if (!request) throw new Error(`save request ${index} does not exist`);
      request.completion.reject(reason);
    },
  };
}

function renderSaveCoordinatorHarness(
  saveArtifact: (payload: ArtifactSavePayload) => Promise<unknown>,
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
    const onUpdate = mocks.contentAuthorHostProps.at(-1)?.["onUpdate"] as
      | ((nextContent: JSONContent, unavailableContent: readonly []) => void)
      | undefined;
    if (!onUpdate) throw new Error("authoring update callback is unavailable");
    act(() => onUpdate(content, []));
  };
  const invalidate = () => {
    const onDocumentError = mocks.contentAuthorHostProps.at(-1)?.["onDocumentError"] as
      | ((failure: unknown) => void)
      | undefined;
    if (!onDocumentError) throw new Error("authoring error callback is unavailable");
    act(() => onDocumentError({ status: "canonicalization-failed", issues: [] }));
  };
  const saveNow = () => {
    let result!: Promise<boolean>;
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
  const semanticController = new FakeWorkspaceSemanticController([firstSurfaceId, secondSurfaceId]);
  vi.spyOn(semanticDocumentPluginKey, "getState").mockReturnValue(
    semanticController as unknown as SemanticDocumentController,
  );
  const user = userEvent.setup();

  render(
    <ScaffoldAuthoringApp
      application={testApplication}
      artifact={{
        id: "artifact-surface-workspaces",
        title: "Workspaces",
        mode: "slideshow",
        content,
      }}
      services={{ artifactPersistence: { saveArtifact: vi.fn(async () => ({})) }, media: null }}
    />,
  );
  await screen.findByRole("tablist", { name: "Surface workspace" });
  return { firstSurfaceId, secondSurfaceId, semanticController, user };
}

async function createDirtyInteractionDraft(
  user: ReturnType<typeof userEvent.setup>,
  surfaceId: EmbeddedNodeId,
) {
  await user.click(screen.getByRole("tab", { name: "Interactions" }));
  await user.click(screen.getByRole("button", { name: "Add rule" }));
  await user.selectOptions(screen.getByLabelText("When"), `${surfaceId}:activated`);
  await user.click(screen.getByRole("button", { name: "Add reveal" }));
}

describe("ScaffoldAuthoringApp Surface workspaces", () => {
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
    const semanticController = new FakeWorkspaceSemanticController([], {
      courseSectionId,
      selectedId: courseSectionId,
    });
    vi.spyOn(semanticDocumentPluginKey, "getState").mockReturnValue(
      semanticController as unknown as SemanticDocumentController,
    );

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-empty-slideshow-workspace",
          title: "Empty Slideshow",
          mode: "slideshow",
          content,
        }}
        services={{ artifactPersistence: { saveArtifact: vi.fn(async () => ({})) }, media: null }}
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
    const semanticController = new FakeWorkspaceSemanticController(
      [firstSurfaceId, secondSurfaceId],
      { courseSectionId, selectedId: courseSectionId },
    );
    vi.spyOn(semanticDocumentPluginKey, "getState").mockReturnValue(
      semanticController as unknown as SemanticDocumentController,
    );

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-section-workspace",
          title: "Section workspace",
          mode: "slideshow",
          content,
        }}
        services={{ artifactPersistence: { saveArtifact: vi.fn(async () => ({})) }, media: null }}
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
    const semanticController = new FakeWorkspaceSemanticController([
      firstSurfaceId,
      secondSurfaceId,
    ]);
    vi.spyOn(semanticDocumentPluginKey, "getState").mockReturnValue(
      semanticController as unknown as SemanticDocumentController,
    );

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-surface-workspaces",
          title: "Workspaces",
          mode: "slideshow",
          content,
        }}
        services={{ artifactPersistence: { saveArtifact: vi.fn(async () => ({})) }, media: null }}
      />,
    );

    expect(await screen.findByRole("tablist", { name: "Surface workspace" })).toBeInTheDocument();
    expect(screen.getByTestId("presentation-timeline")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Interactions" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Interactions" }));
    expect(screen.getByRole("heading", { name: "Interactions" })).toBeInTheDocument();
    expect(screen.queryByTestId("presentation-timeline")).toBeNull();
    expect(
      document.querySelector(`[data-interaction-surface-id="${firstSurfaceId}"]`),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Add rule" }));
    await user.selectOptions(screen.getByLabelText("When"), `${firstSurfaceId}:activated`);
    await user.click(screen.getByRole("button", { name: "Add reveal" }));
    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    expect(screen.getByRole("alertdialog", { name: "Unsaved rule changes" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel change" }));
    expect(screen.getByRole("heading", { name: "Interactions" })).toBeInTheDocument();

    semanticController.publish(secondSurfaceId);
    expect(
      await screen.findByRole("alertdialog", { name: "Unsaved rule changes" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(semanticController.getSnapshot().selectedId).toBe(firstSurfaceId));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(semanticController.getSnapshot().selectedId).toBe(secondSurfaceId));
    await waitFor(() =>
      expect(
        document.querySelector(`[data-interaction-surface-id="${secondSurfaceId}"]`),
      ).not.toBeNull(),
    );

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
        services={{ artifactPersistence: { saveArtifact: vi.fn(async () => ({})) }, media: null }}
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

    semanticController.queueSelectionResult({
      kind: "reached-owner",
      requestedId: firstSurfaceId,
      ownerId: firstSurfaceId,
      reason: "temporarily-unavailable",
    });
    semanticController.publish(secondSurfaceId);
    await screen.findByRole("alertdialog", { name: "Unsaved rule changes" });
    await waitFor(() => expect(semanticController.getSnapshot().selectedId).toBe(firstSurfaceId));
    await user.click(screen.getByRole("button", { name: "Cancel change" }));
    expect(semanticController.getSnapshot().selectedId).toBe(firstSurfaceId);
    expect(
      document.querySelector(`[data-interaction-surface-id="${firstSurfaceId}"]`),
    ).not.toBeNull();

    semanticController.publish(secondSurfaceId);
    await screen.findByRole("alertdialog", { name: "Unsaved rule changes" });
    await waitFor(() => expect(semanticController.getSnapshot().selectedId).toBe(firstSurfaceId));
    semanticController.queueSelectionResult({
      kind: "reached-owner",
      requestedId: secondSurfaceId,
      ownerId: secondSurfaceId,
      reason: "temporarily-unavailable",
    });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(semanticController.getSnapshot().selectedId).toBe(secondSurfaceId));
    await waitFor(() =>
      expect(
        document.querySelector(`[data-interaction-surface-id="${secondSurfaceId}"]`),
      ).not.toBeNull(),
    );
    expect(mocks.learnerInteractionSaves[0]?.["surfaceId"]).toBe(firstSurfaceId);
  });

  it.each(["missing", "interrupted"] as const)(
    "keeps the dirty Surface decision pending when restoration is %s",
    async (kind) => {
      const { firstSurfaceId, secondSurfaceId, semanticController, user } =
        await renderSurfaceWorkspaceHarness();
      await createDirtyInteractionDraft(user, firstSurfaceId);
      semanticController.queueSelectionResult({ kind, id: firstSurfaceId });

      semanticController.publish(secondSurfaceId);
      await screen.findByRole("alertdialog", { name: "Unsaved rule changes" });
      await waitFor(() => expect(semanticController.selectCalls).toEqual([firstSurfaceId]));
      expect(semanticController.getSnapshot().selectedId).toBe(secondSurfaceId);
      expect(
        document.querySelector(`[data-interaction-surface-id="${firstSurfaceId}"]`),
      ).not.toBeNull();

      semanticController.queueSelectionResult({ kind, id: firstSurfaceId });
      await user.click(screen.getByRole("button", { name: "Cancel change" }));
      await waitFor(() => expect(semanticController.selectCalls).toHaveLength(2));
      expect(screen.getByRole("alertdialog", { name: "Unsaved rule changes" })).toBeInTheDocument();

      semanticController.queueSelectionResult({ kind: "reached", id: firstSurfaceId });
      await user.click(screen.getByRole("button", { name: "Cancel change" }));
      await waitFor(() => expect(semanticController.getSnapshot().selectedId).toBe(firstSurfaceId));
      expect(screen.queryByRole("alertdialog", { name: "Unsaved rule changes" })).toBeNull();
    },
  );

  it.each(["missing", "interrupted"] as const)(
    "retains the authoritative outgoing Surface when deferred application is %s",
    async (kind) => {
      const { firstSurfaceId, secondSurfaceId, semanticController, user } =
        await renderSurfaceWorkspaceHarness();
      await createDirtyInteractionDraft(user, firstSurfaceId);

      semanticController.publish(secondSurfaceId);
      await screen.findByRole("alertdialog", { name: "Unsaved rule changes" });
      await waitFor(() => expect(semanticController.getSnapshot().selectedId).toBe(firstSurfaceId));
      const selection = createDeferred<SemanticNavigationResult>();
      semanticController.queueSelectionResult(selection.promise);
      const observedSurfaceIds: Array<string | null> = [];
      const workspace = document.querySelector<HTMLElement>(".sc-surface-workspaces");
      if (!workspace) throw new Error("expected Surface workspace");
      const observer = new MutationObserver(() => {
        observedSurfaceIds.push(workspace.getAttribute("data-interaction-surface-id"));
      });
      observer.observe(workspace, {
        attributes: true,
        attributeFilter: ["data-interaction-surface-id"],
      });
      await user.click(screen.getByRole("button", { name: "Discard changes" }));

      await waitFor(() => expect(semanticController.selectCalls.at(-1)).toBe(secondSurfaceId));
      await act(async () => Promise.resolve());
      expect(observedSurfaceIds).not.toContain(secondSurfaceId);
      selection.resolve({ kind, id: secondSurfaceId });
      await act(async () => selection.promise);
      observer.disconnect();
      expect(semanticController.getSnapshot().selectedId).toBe(firstSurfaceId);
      expect(
        document.querySelector(`[data-interaction-surface-id="${firstSurfaceId}"]`),
      ).not.toBeNull();
      expect(
        document.querySelector(`[data-interaction-surface-id="${secondSurfaceId}"]`),
      ).toBeNull();
    },
  );
});

describe("ScaffoldAuthoringApp StrictMode lifecycle", () => {
  it("keeps both preview controllers usable after StrictMode replay", async () => {
    const surfaceId = "previewsurf6" as PresentationPreviewDocument["surfaceId"];
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
            artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
            media: null,
          }}
        />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(mocks.contentAuthorHostProps.at(-1)?.["bottomWorkspace"]).toBeTruthy(),
    );
    expect(() => currentPresentationPreviewController().close()).not.toThrow();
    expect(() => currentLearnerInteractionPreviewController().close()).not.toThrow();
    await expect(
      currentPresentationPreviewController().play(input),
    ).resolves.toMatchObject({
      error: { reason: "preview-runtime-unavailable" },
    });
  });

  it("keeps the Interactions workspace usable after StrictMode replay", async () => {
    const firstSurfaceId = EmbeddedNodeIdSchema.parse("workspace001");
    const secondSurfaceId = EmbeddedNodeIdSchema.parse("workspace002");
    const content = slideshowDocumentWithSurfaces(firstSurfaceId, secondSurfaceId);
    mocks.authorJSON = content;
    mocks.fakeEditor.state.doc.firstChild.attrs = content.content?.[0]?.attrs ?? {};
    mocks.renderBottomWorkspace = true;
    const semanticController = new FakeWorkspaceSemanticController([
      firstSurfaceId,
      secondSurfaceId,
    ]);
    vi.spyOn(semanticDocumentPluginKey, "getState").mockReturnValue(
      semanticController as unknown as SemanticDocumentController,
    );
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
          services={{ artifactPersistence: { saveArtifact: vi.fn(async () => ({})) }, media: null }}
        />
      </StrictMode>,
    );

    await user.click(await screen.findByRole("tab", { name: "Interactions" }));
    expect(screen.getByRole("heading", { name: "Interactions" })).toBeInTheDocument();
  });
});

describe("ScaffoldAuthoringApp preview", () => {
  it("retains a recoverable preview-runtime cause and retries the lazy boundary", async () => {
    const surfaceId = "previewsurf5" as PresentationPreviewDocument["surfaceId"];
    const input = presentationPreviewDocument(surfaceId);
    const cause = new Error("preview chunk unavailable");
    mocks.authorPreviewModuleError = cause;

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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
      />,
    );

    await waitFor(() =>
      expect(mocks.contentAuthorHostProps.at(-1)?.["bottomWorkspace"]).toBeTruthy(),
    );
    const controller = currentPresentationPreviewController();
    await expect(controller.play(input)).resolves.toMatchObject({
      error: { reason: "preview-runtime-unavailable", cause },
    });

    const retryCause = new Error("preview chunk still unavailable");
    mocks.authorPreviewModuleError = retryCause;
    const retry = controller.play(input);
    await waitFor(() => expect(mocks.authorPreviewModuleReads).toBe(2));
    await expect(retry).resolves.toMatchObject({
      error: { reason: "preview-runtime-unavailable", cause: retryCause },
    });
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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
      />,
    );

    const previewButton = screen.getByRole("button", { name: "Switch to preview" });
    await waitFor(() => expect(previewButton).not.toBeDisabled());
    await user.click(previewButton);

    await screen.findByTestId("scaffold-learner-app");
    expect(mocks.authorPreviewModuleReads).toBe(1);
    expect(mocks.learnerModuleReads).toBe(0);
  });

  it("mounts saved Interaction rules without a Presentation program and reports the latest real turn", async () => {
    const user = userEvent.setup();
    const content = slideshowDocumentWithLearnerRule("activated");
    const surfaceId = EmbeddedNodeIdSchema.parse("publishsurf1");
    mocks.authorJSON = content;
    mocks.fakeEditor.state.doc.firstChild.attrs = content.content?.[0]?.attrs ?? {};
    mocks.renderBottomWorkspace = true;
    const semanticController = new FakeWorkspaceSemanticController([surfaceId]);
    vi.spyOn(semanticDocumentPluginKey, "getState").mockReturnValue(
      semanticController as unknown as SemanticDocumentController,
    );

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-interactions-preview",
          title: "Interactions Preview",
          mode: "slideshow",
          content,
        }}
        services={{ artifactPersistence: { saveArtifact: vi.fn(async () => ({})) }, media: null }}
      />,
    );

    await user.click(await screen.findByRole("tab", { name: "Interactions" }));
    await user.click(screen.getByRole("button", { name: "Preview interactions" }));
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
    await screen.findByRole("button", { name: "Close interactions preview" });
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

    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    await waitFor(() =>
      expect(mocks.contentAuthorHostProps.at(-1)?.["stagePreview"]).toBeUndefined(),
    );
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
        services={{ artifactPersistence: { saveArtifact: vi.fn(async () => ({})) }, media: null }}
      />,
    );

    const unavailable = screen.getByRole("alert", { name: "This document couldn’t be opened" });
    expect(unavailable).toHaveTextContent("The saved course structure is invalid.");
    expect(unavailable).not.toHaveTextContent("Scaffold content has invalid Course Structure.");
  });

  it("refuses a Plus-required artifact before mounting authoring", () => {
    const content = pageDocumentWithParagraph("authorsurf01", "Protected authoring content");
    content.content![0]!.attrs!["requiresScaffoldPlus"] = true;
    const saveArtifact = vi.fn(async () => ({}));

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
        services={{ artifactPersistence: { saveArtifact: vi.fn(async () => ({})) }, media: null }}
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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
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
        artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
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
    const saveArtifact = vi.fn(() => new Promise<Record<string, never>>(() => {}));

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
      | ((content: JSONContent, unavailableContent: readonly []) => void)
      | undefined;
    expect(onUpdate).toBeTypeOf("function");
    expect(mocks.fakeEditor.getJSON).not.toHaveBeenCalled();
    mocks.fakeEditor.getJSON.mockClear();

    act(() => {
      onUpdate?.(mocks.authorJSON, []);
    });
    act(() => {
      onUpdate?.(mocks.authorJSON, []);
      onUpdate?.(mocks.authorJSON, []);
    });

    expect(mocks.fakeEditor.getJSON).not.toHaveBeenCalled();
    expect(saveArtifact).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mocks.fakeEditor.getJSON).not.toHaveBeenCalled();
    expect(saveArtifact).toHaveBeenCalledTimes(1);
  });

  it("autosaves after StrictMode replays the coordinator lifecycle effect", async () => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const saveArtifact = vi.fn(async () => ({ artifactRevision: "revision-strict-mode" }));

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
      | ((content: JSONContent, unavailableContent: readonly []) => void)
      | undefined;
    expect(onUpdate).toBeTypeOf("function");

    act(() => onUpdate?.(mocks.authorJSON, []));
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
    let saveAOutcome: boolean | undefined;
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

    await expect(saveA).resolves.toBe(false);
    await expect(saveB).resolves.toBe(false);
    expect(host.requests).toHaveLength(1);
    expect(screen.getByRole("banner")).toHaveAttribute("data-save-state", "error");
  });

  it("satisfies coalesced manual callers with a newer successful generation", async () => {
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
      host.reject(0, new Error("older save failed"));
      await Promise.resolve();
    });

    expect(host.requests).toHaveLength(2);
    expect(host.requests[1]?.payload.artifact.content).toEqual(contentC);

    await act(async () => {
      host.resolve(1, "revision-c");
      await Promise.resolve();
    });

    await expect(saveA).resolves.toBe(true);
    await expect(saveB).resolves.toBe(true);
    await expect(saveC).resolves.toBe(true);
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
    const saveArtifact = vi.fn(async () => ({}));

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
      | ((content: JSONContent, unavailableContent: readonly []) => void)
      | undefined;
    const onDocumentError = props?.["onDocumentError"] as ((failure: unknown) => void) | undefined;
    act(() => {
      onUpdate?.(mocks.authorJSON, []);
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
    const saveArtifact = vi.fn(async () => ({}));

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
    const user = userEvent.setup();
    const saveArtifact = vi.fn(async () => ({}));

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
    await user.click(screen.getByRole("button", { name: "Switch to preview" }));

    expect(saveArtifact).not.toHaveBeenCalled();
    expect(screen.queryByTestId("scaffold-learner-app")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Preview could not be prepared");
  });

  it("refuses title autosave while the current working state is invalid", () => {
    vi.useFakeTimers();
    const saveArtifact = vi.fn(async () => ({}));

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
    const saveArtifact = vi.fn(async () => ({ artifactRevision: "revision-1" }));
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
            getStatus: async () => ({
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
    const saveArtifact = vi.fn(async () => ({ artifactRevision: "revision-1" }));
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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
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
    const publishResult = createDeferred<{
      currentArtifactRevision: string;
      publishedArtifactRevision: string;
      publishedAt: string;
    }>();
    const saveArtifact = vi.fn(async () => ({ artifactRevision: "revision-2" }));
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
            getStatus: async () => ({
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

    publishResult.resolve({
      currentArtifactRevision: "revision-2",
      publishedArtifactRevision: "revision-2",
      publishedAt: "2026-08-11T12:00:00.000Z",
    });

    expect(await screen.findByText("Publication complete")).toBeVisible();
    expect(screen.getByText("This version is now live for learners.")).toBeVisible();
    expect(document.querySelectorAll(".sc-app-notification")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Published" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("updates one publication notification when a failed publication is retried", async () => {
    const saveArtifact = vi.fn(async () => ({ artifactRevision: "revision-2" }));
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce({
        currentArtifactRevision: "revision-2",
        publishedArtifactRevision: "revision-2",
        publishedAt: "2026-08-11T12:00:00.000Z",
      });

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
            getStatus: async () => ({
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
    const saveArtifact = vi.fn(async () => ({ artifactRevision: "revision-2" }));
    const publish = vi.fn(async (payload: LearnerPublicationPayload) => ({
      currentArtifactRevision: payload.sourceArtifactRevision,
      publishedArtifactRevision: payload.sourceArtifactRevision,
      publishedAt: "2026-08-11T12:00:00.000Z",
    }));

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
            getStatus: async () => ({
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
      | ((content: JSONContent, unavailableContent: readonly []) => void)
      | undefined;
    act(() => onUpdate?.(mocks.authorJSON, []));
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
    const saveArtifact = vi.fn(async () => ({ artifactRevision: "revision-2" }));
    const publish = vi.fn(async (_payload: LearnerPublicationPayload) => ({
      currentArtifactRevision: "revision-2",
      publishedArtifactRevision: "revision-2",
      publishedAt: "2026-08-10T12:00:00.000Z",
    }));

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
            getStatus: async () => ({
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
      | ((content: JSONContent, unavailableContent: readonly []) => void)
      | undefined;
    act(() => onUpdate?.(mocks.authorJSON, []));

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
    const semanticController = new FakeWorkspaceSemanticController([surfaceId]);
    vi.spyOn(semanticDocumentPluginKey, "getState").mockReturnValue(
      semanticController as unknown as SemanticDocumentController,
    );
    const saveArtifact = vi.fn(async () => ({ artifactRevision: "revision-interactions" }));
    const publish = vi.fn(async (payload: LearnerPublicationPayload) => ({
      currentArtifactRevision: payload.sourceArtifactRevision,
      publishedArtifactRevision: payload.sourceArtifactRevision,
      publishedAt: "2026-08-11T12:00:00.000Z",
    }));

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
            getStatus: async () => ({
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
    const onUpdate = mocks.contentAuthorHostProps.at(-1)?.["onUpdate"] as
      | ((content: JSONContent, unavailableContent: readonly []) => void)
      | undefined;
    act(() => onUpdate?.(repairedContent, []));
    await user.click(screen.getByRole("button", { name: "Save interactions" }));
    await waitFor(() => expect(saveArtifact).toHaveBeenCalledTimes(2));
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
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) => ({
      artifactRevision: "revision-empty-quiz",
    }));
    const publish = vi.fn(async (_payload: LearnerPublicationPayload) => ({
      currentArtifactRevision: "revision-empty-quiz",
      publishedArtifactRevision: "revision-empty-quiz",
      publishedAt: "2026-08-11T10:00:00.000Z",
    }));

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{ id: "artifact-empty-quiz", title: "Draft", mode: "page", content }}
        services={{
          artifactPersistence: { saveArtifact },
          learnerPublication: {
            getStatus: async () => ({
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
    const saveResult = createDeferred<{ artifactRevision: string }>();
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
            getStatus: async () => ({
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
      | ((content: JSONContent, unavailableContent: readonly []) => void)
      | undefined;
    const onDocumentError = mocks.contentAuthorHostProps.at(-1)?.["onDocumentError"] as
      | ((failure: unknown) => void)
      | undefined;
    act(() => onUpdate?.(mocks.authorJSON, []));
    await user.click(screen.getByRole("button", { name: "Save now" }));
    expect(saveArtifact).toHaveBeenCalledTimes(1);
    act(() => onDocumentError?.({ status: "canonicalization-failed", issues: [] }));
    saveResult.resolve({ artifactRevision: "revision-2" });

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
      return {};
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
      | ((content: JSONContent, unavailableContent: readonly []) => void)
      | undefined;
    act(() => onUpdate?.(mocks.authorJSON, []));
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
      return {};
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
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) => ({}));

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
    const saveArtifact = vi.fn(() => new Promise<Record<string, never>>(() => {}));

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
      | ((content: JSONContent, unavailableContent: readonly []) => void)
      | undefined;
    mocks.fakeEditor.getJSON.mockClear();

    act(() => {
      onUpdate?.(mocks.authorJSON, []);
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
    const saveArtifact = vi.fn(async () => ({ artifactRevision: "revision-1" }));
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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
      />,
    );

    const initialMount = mocks.contentAuthorHostProps.at(-1)?.["mount"];
    const onUpdate = mocks.contentAuthorHostProps.at(-1)?.["onUpdate"] as
      | ((content: JSONContent, unavailableContent: readonly []) => void)
      | undefined;
    act(() => onUpdate?.(workingContent, []));

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
        artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
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

  it("does not publish a late Presentation preview after it is closed", async () => {
    const surfaceId = "previewsurf1" as PresentationPreviewDocument["surfaceId"];
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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
        createPreviewServices={createPreviewServices}
        onPreviewChange={onPreviewChange}
      />,
    );

    await waitFor(() =>
      expect(mocks.contentAuthorHostProps.at(-1)?.["bottomWorkspace"]).toBeTruthy(),
    );
    const controller = currentPresentationPreviewController();
    const play = controller.play(input);
    await waitFor(() => expect(createPreviewServices).toHaveBeenCalledOnce());

    controller.close();
    onPreviewChange.mockClear();
    await act(async () => {
      servicesResult.resolve({ media: null });
      await servicesResult.promise;
      await Promise.resolve();
    });
    await expect(play).resolves.toMatchObject({
      error: { reason: "preview-load-superseded", surfaceId },
    });

    expect(onPreviewChange).not.toHaveBeenCalledWith(true);
    expect(mocks.contentAuthorHostProps.at(-1)?.["stagePreview"]).toBeUndefined();
    expect(screen.queryByTestId("scaffold-learner-app")).toBeNull();
  });

  it("retains the preview-service failure cause as typed data", async () => {
    const surfaceId = "previewsurf2" as PresentationPreviewDocument["surfaceId"];
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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
        createPreviewServices={vi.fn().mockRejectedValue(cause)}
      />,
    );

    await waitFor(() =>
      expect(mocks.contentAuthorHostProps.at(-1)?.["bottomWorkspace"]).toBeTruthy(),
    );
    await expect(currentPresentationPreviewController().play(input)).resolves.toMatchObject({
      error: { reason: "preview-services-unavailable", cause },
    });
  });

  it("returns the expected payload-size failure as typed data", async () => {
    const surfaceId = "previewsurf4" as PresentationPreviewDocument["surfaceId"];
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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
      />,
    );

    await waitFor(() =>
      expect(mocks.contentAuthorHostProps.at(-1)?.["bottomWorkspace"]).toBeTruthy(),
    );
    await expect(currentPresentationPreviewController().play(input)).resolves.toMatchObject({
      error: { reason: "preview-payload-too-large" },
    });
  });

  it("keeps unexpected payload-validation defects observable", async () => {
    const surfaceId = "previewsurf3" as PresentationPreviewDocument["surfaceId"];
    const input = presentationPreviewDocument(surfaceId);
    const defect = new TypeError("Text encoding invariant failed");

    render(
      <ScaffoldAuthoringApp
        application={testApplication}
        artifact={{
          id: "artifact-presentation-preview-payload-defect",
          title: "Draft",
          mode: "slideshow",
          content: input.document,
        }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
      />,
    );
    await waitFor(() =>
      expect(mocks.contentAuthorHostProps.at(-1)?.["bottomWorkspace"]).toBeTruthy(),
    );
    vi.stubGlobal(
      "TextEncoder",
      class {
        encode(): never {
          throw defect;
        }
      },
    );

    try {
      await expect(currentPresentationPreviewController().play(input)).rejects.toBe(defect);
    } finally {
      vi.unstubAllGlobals();
    }
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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
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
            saveArtifact: vi.fn(async () => ({ artifactRevision: "revision-1" })),
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
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) => ({
      artifactRevision: "revision-new",
    }));

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
    const saveArtifact = vi.fn(async () => ({
      artifactRevision: "revision-created",
    }));
    const publish = vi.fn(async (_payload: LearnerPublicationPayload) => ({
      currentArtifactRevision: "revision-created",
      publishedArtifactRevision: "revision-created",
      publishedAt: "2026-08-11T09:00:00.000Z",
    }));

    render(
      <ScaffoldAuthoringEntry
        application={testApplication}
        artifact={null}
        productAccess={coreProductAccess}
        services={{
          artifactPersistence: { saveArtifact },
          artifactCreation: { createArtifactMetadata },
          learnerPublication: {
            getStatus: async () => ({
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
            saveArtifact: vi.fn(async () => ({ artifactRevision: "revision-1" })),
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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
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
      return {};
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
    const content = slideshowDocument("slideprev001");
    mocks.authorJSON = content;
    mocks.fakeEditor.getJSON.mockReturnValue(content);

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
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
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

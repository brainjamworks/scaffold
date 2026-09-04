import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  LearnerInteractionConfigurationV1Schema,
  PresentationConfigurationV1Schema,
  ScaffoldDocumentContentSchema,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import {
  projectCourseStructure,
  type ProjectedSlideshowCourseStructure,
} from "@/document/model/course-structure";
import {
  getSemanticDocumentControllerForEditor,
  useSemanticDocumentControllerSnapshot,
} from "@/document/authoring/semantic-document";
import type { PresentationPreviewController } from "@/editor/presentation/preview";
import {
  PresentationTimeline,
  PresentationTimelineController,
  projectPresentationTimeline,
} from "@/editor/presentation/timeline";
import {
  projectLearnerInteractionAuthoring,
  removeLearnerInteractionRule,
  reorderLearnerInteractionRule,
  saveLearnerInteractionRule,
  setLearnerInteractionRuleEnabled,
} from "@/editor/learner-interaction/model";
import type { LearnerInteractionPreviewController } from "@/editor/learner-interaction/preview";
import {
  LearnerInteractionWorkspace,
  LearnerInteractionWorkspaceController,
  type LearnerInteractionWorkspaceSnapshot,
} from "@/editor/learner-interaction/workspace";
import { EditorBottomPanel } from "@/editor/shell/chrome/EditorBottomPanel";
import type { SurfaceWorkspaceRequest } from "@/editor/shell/workspaces/surface-workspace-request";
import {
  IDLE_LEARNER_INTERACTION_WORKSPACE_SNAPSHOT,
  resolvePresentationSurfaceId,
  SurfaceWorkspacesController,
  type SurfaceWorkspacesSnapshot,
} from "./surface-workspaces-controller";

export interface SurfaceWorkspacesPanelProps {
  readonly editor: TiptapEditor;
  readonly previewController: PresentationPreviewController;
  readonly learnerInteractionPreviewController: LearnerInteractionPreviewController;
  /** The App-level request that opened this workspace; a new nonce re-targets it. */
  readonly request: SurfaceWorkspaceRequest;
  /** Closes the workspace panel after any pending draft decision settles. */
  readonly onClose: () => void;
}

export function SurfaceWorkspacesPanel({
  editor,
  previewController,
  learnerInteractionPreviewController,
  request,
  onClose,
}: SurfaceWorkspacesPanelProps) {
  const semanticController = getSemanticDocumentControllerForEditor(editor);
  const semanticSnapshot = useSemanticDocumentControllerSnapshot(editor);
  const documentRevision = semanticSnapshot.semantics.revision;
  const document = useMemo(() => {
    void documentRevision;
    return ScaffoldDocumentContentSchema.parse(editor.getJSON());
  }, [documentRevision, editor]);
  const courseStructure = projectCourseStructure(document);
  if (!courseStructure || courseStructure.kind !== "slideshow") {
    throw new Error("Learner Interaction authoring requires a valid Slideshow Course Document.");
  }
  const requestedSurfaceId = resolvePresentationSurfaceId(semanticSnapshot, courseStructure);
  if (!requestedSurfaceId) return null;

  return (
    <ResolvedSurfaceWorkspacesPanel
      editor={editor}
      previewController={previewController}
      learnerInteractionPreviewController={learnerInteractionPreviewController}
      request={request}
      onClose={onClose}
      semanticController={semanticController}
      semanticSnapshot={semanticSnapshot}
      document={document}
      courseStructure={courseStructure}
      requestedSurfaceId={requestedSurfaceId}
    />
  );
}

function ResolvedSurfaceWorkspacesPanel({
  editor,
  previewController,
  learnerInteractionPreviewController,
  request,
  onClose,
  semanticController,
  semanticSnapshot,
  document,
  courseStructure,
  requestedSurfaceId,
}: SurfaceWorkspacesPanelProps & {
  readonly semanticController: ReturnType<typeof getSemanticDocumentControllerForEditor>;
  readonly semanticSnapshot: ReturnType<typeof useSemanticDocumentControllerSnapshot>;
  readonly document: ReturnType<typeof ScaffoldDocumentContentSchema.parse>;
  readonly courseStructure: ProjectedSlideshowCourseStructure;
  readonly requestedSurfaceId: EmbeddedNodeId;
}) {
  const [interactionController, setInteractionController] =
    useState<LearnerInteractionWorkspaceController | null>(null);
  const interactionSurfaceIdForSaveRef = useRef(requestedSurfaceId);
  useEffect(() => {
    const created = new LearnerInteractionWorkspaceController({
      saveDraft: (draft) =>
        saveLearnerInteractionRule({
          editor,
          surfaceId: interactionSurfaceIdForSaveRef.current,
          draft,
        }),
      closePreview: () => {
        if (previewController.getSnapshot().status !== "idle") previewController.close();
        if (learnerInteractionPreviewController.getSnapshot().status !== "idle") {
          learnerInteractionPreviewController.close();
        }
      },
    });
    setInteractionController(created);
    return () => created.dispose();
  }, [editor, learnerInteractionPreviewController, previewController]);
  const subscribeToInteraction = useCallback(
    (listener: () => void) =>
      interactionController?.subscribe(listener) ?? (() => undefined),
    [interactionController],
  );
  const getInteractionSnapshot = useCallback(
    (): LearnerInteractionWorkspaceSnapshot =>
      interactionController?.getSnapshot() ?? IDLE_LEARNER_INTERACTION_WORKSPACE_SNAPSHOT,
    [interactionController],
  );
  const interactionSnapshot = useSyncExternalStore(
    subscribeToInteraction,
    getInteractionSnapshot,
    getInteractionSnapshot,
  );
  void interactionSnapshot;
  const courseStructureRef = useRef(courseStructure);
  const requestedSurfaceIdRef = useRef(requestedSurfaceId);
  const semanticSnapshotRef = useRef(semanticSnapshot);
  const onCloseRef = useRef(onClose);
  courseStructureRef.current = courseStructure;
  requestedSurfaceIdRef.current = requestedSurfaceId;
  semanticSnapshotRef.current = semanticSnapshot;
  onCloseRef.current = onClose;
  const [surfaceController, setSurfaceController] =
    useState<SurfaceWorkspacesController | null>(null);
  useEffect(() => {
    if (!interactionController) return;
    const created = new SurfaceWorkspacesController(
      {
        editor,
        semanticController,
        interactionController,
        presentationPreviewController: previewController,
        learnerInteractionPreviewController,
        courseStructure: () => courseStructureRef.current,
        requestedSurfaceId: () => requestedSurfaceIdRef.current,
        semanticSnapshot: () => semanticSnapshotRef.current,
        onClosed: () => onCloseRef.current(),
      },
      request.workspace,
      requestedSurfaceIdRef.current,
    );
    setSurfaceController(created);
    return () => created.dispose();
  }, [
    editor,
    semanticController,
    interactionController,
    previewController,
    learnerInteractionPreviewController,
  ]);
  const [initialWorkspacesSnapshot] = useState<SurfaceWorkspacesSnapshot>(() =>
    Object.freeze({
      workspace: request.workspace,
      interactionSurfaceId: requestedSurfaceId,
      pendingSurfaceChange: null,
    }),
  );
  const subscribeToWorkspaces = useCallback(
    (listener: () => void) =>
      surfaceController?.subscribe(listener) ?? (() => undefined),
    [surfaceController],
  );
  const getWorkspacesSnapshot = useCallback(
    (): SurfaceWorkspacesSnapshot =>
      surfaceController?.getSnapshot() ?? initialWorkspacesSnapshot,
    [surfaceController, initialWorkspacesSnapshot],
  );
  const workspacesSnapshot = useSyncExternalStore(
    subscribeToWorkspaces,
    getWorkspacesSnapshot,
    getWorkspacesSnapshot,
  );
  const workspace = workspacesSnapshot.workspace;
  const interactionSurfaceId =
    workspace === "interactions"
      ? workspacesSnapshot.interactionSurfaceId
      : requestedSurfaceId;
  interactionSurfaceIdForSaveRef.current = interactionSurfaceId;
  const courseDocument = (document as JSONContent).content?.[0];
  if (courseDocument?.type !== "courseDocument") {
    throw new Error("Learner Interaction authoring requires a Course Document root.");
  }
  const projectedSurfaceId =
    courseStructure.surfaceById[interactionSurfaceId] &&
    semanticSnapshot.semantics.itemById.has(interactionSurfaceId)
      ? interactionSurfaceId
      : requestedSurfaceId;
  const presentationValue = courseDocument.attrs?.["presentation"];
  const configuration =
    presentationValue === null || presentationValue === undefined
      ? null
      : PresentationConfigurationV1Schema.parse(presentationValue);
  const presentationProjection = projectPresentationTimeline(
    projectedSurfaceId,
    semanticSnapshot.semantics,
    configuration,
  );
  const learnerInteractionValue = courseDocument.attrs?.["learnerInteractions"];
  const learnerInteractionConfiguration =
    learnerInteractionValue === null || learnerInteractionValue === undefined
      ? null
      : LearnerInteractionConfigurationV1Schema.parse(learnerInteractionValue);
  const learnerInteractionProjection = projectLearnerInteractionAuthoring({
    configuration: learnerInteractionConfiguration,
    surfaceId: projectedSurfaceId,
    courseStructure,
    semanticSnapshot: semanticSnapshot.semantics,
    controlCapabilities: semanticController.getControlCapabilityCatalogue(),
  });
  useEffect(() => {
    surfaceController?.syncRequestedSurface();
  }, [
    surfaceController,
    courseStructure,
    interactionController,
    requestedSurfaceId,
    semanticController,
    semanticSnapshot.selectedId,
    semanticSnapshot.semantics,
    workspace,
  ]);
  useEffect(() => {
    surfaceController?.applyRequest(request);
  });

  const resolveInteractionContextChange = (decision: "save" | "discard" | "cancel") => {
    surfaceController?.resolveContextChange(decision);
  };

  const requestWorkspaceTab = (nextWorkspace: "timeline" | "interactions") => {
    surfaceController?.requestWorkspace(nextWorkspace);
  };

  const closeWorkspaces = () => {
    if (!surfaceController) {
      if (previewController.getSnapshot().status !== "idle") previewController.close();
      if (learnerInteractionPreviewController.getSnapshot().status !== "idle") {
        learnerInteractionPreviewController.close();
      }
      onClose();
      return;
    }
    surfaceController.requestClose();
  };

  return (
    <EditorBottomPanel
      tabsLabel="Surface workspace"
      tabs={[
        {
          id: "timeline",
          label: "Timeline",
          content: (
            <PresentationTimelineAuthoringWorkspace
              editor={editor}
              previewController={previewController}
              semanticController={semanticController}
              surfaceId={projectedSurfaceId}
              document={document}
              projection={presentationProjection}
            />
          ),
        },
        {
          id: "interactions",
          label: "Interactions",
          content: interactionController ? (
            <div data-interaction-surface-id={projectedSurfaceId}>
              <LearnerInteractionWorkspace
                controller={interactionController}
                projection={learnerInteractionProjection}
                previewController={learnerInteractionPreviewController}
                previewDocument={document}
                onResolveContextChange={resolveInteractionContextChange}
                onSetRuleEnabled={(ruleId, isEnabled) =>
                  setLearnerInteractionRuleEnabled({
                    editor,
                    surfaceId: projectedSurfaceId,
                    ruleId,
                    isEnabled,
                  })
                }
                onReorderRule={(ruleId, direction) =>
                  reorderLearnerInteractionRule({
                    editor,
                    surfaceId: projectedSurfaceId,
                    ruleId,
                    direction,
                  })
                }
                onRemoveRule={(ruleId) =>
                  removeLearnerInteractionRule({ editor, surfaceId: projectedSurfaceId, ruleId })
                }
              />
            </div>
          ) : null,
        },
      ]}
      activeTabId={workspace}
      onTabChange={requestWorkspaceTab}
      onClose={closeWorkspaces}
    />
  );
}

function PresentationTimelineAuthoringWorkspace({
  editor,
  previewController,
  semanticController,
  surfaceId,
  document,
  projection,
}: {
  readonly editor: TiptapEditor;
  readonly previewController: PresentationPreviewController;
  readonly semanticController: ReturnType<typeof getSemanticDocumentControllerForEditor>;
  readonly surfaceId: EmbeddedNodeId;
  readonly document: ReturnType<typeof ScaffoldDocumentContentSchema.parse>;
  readonly projection: ReturnType<typeof projectPresentationTimeline>;
}) {
  const initialViewportRef = useRef<{ durationMs: number; viewportWidthPx: number } | null>(
    null,
  );
  initialViewportRef.current ??= {
    durationMs: projection.durationMs ?? 0,
    viewportWidthPx: 600,
  };
  const [timelineController, setTimelineController] =
    useState<PresentationTimelineController | null>(null);
  useEffect(() => {
    const created = new PresentationTimelineController({
      semanticSelection: semanticController,
      initialViewport: initialViewportRef.current ?? {
        durationMs: 0,
        viewportWidthPx: 600,
      },
      zoomBounds: { minPixelsPerSecond: 20, maxPixelsPerSecond: 400 },
    });
    setTimelineController(created);
    return () => created.destroy();
  }, [semanticController]);
  const previousDocumentRef = useRef(document);
  useEffect(() => {
    if (
      previousDocumentRef.current !== document &&
      previewController.getSnapshot().status !== "idle"
    ) {
      previewController.close();
    }
    previousDocumentRef.current = document;
  }, [document, previewController]);

  if (!timelineController) return null;

  return (
    <PresentationTimeline
      controller={timelineController}
      editor={editor}
      preview={{ controller: previewController, document: { document, surfaceId } }}
      projection={projection}
    />
  );
}

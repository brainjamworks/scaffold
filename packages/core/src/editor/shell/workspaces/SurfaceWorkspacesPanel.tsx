import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
  getDocumentTreeForEditor,
  useDocumentTreeSnapshot,
} from "@/document/authoring/document-tree";
import { getEditorNavigationForEditor } from "@/document/authoring/editor-navigation";
import type {
  AuthorPreviewReports,
  AuthorPreviewTransport,
} from "@/editor/shell/authoring/author-preview-session-controller";
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
import {
  LearnerInteractionWorkspace,
  LearnerInteractionWorkspaceController,
} from "@/editor/learner-interaction/workspace";
import { EditorBottomPanel } from "@/editor/shell/chrome/EditorBottomPanel";
import { SurfaceWorkspaceErrorBoundary } from "./SurfaceWorkspaceErrorBoundary";
import type { SurfaceWorkspaceRequest } from "@/editor/shell/workspaces/surface-workspace-request";
import {
  resolvePresentationSurfaceId,
  SurfaceWorkspacesController,
  type SurfaceWorkspacesSnapshot,
} from "./surface-workspaces-controller";

export interface SurfaceWorkspacesPanelProps {
  readonly editor: TiptapEditor;
  readonly previewTransport: AuthorPreviewTransport;
  readonly previewReports: AuthorPreviewReports;
  readonly previewActive?: boolean;
  readonly onPreviewRequired?: () => void;
  readonly onSurfaceChanged?: (surfaceId: EmbeddedNodeId) => void;
  /** The App-level request that opened this workspace; a new nonce re-targets it. */
  readonly request: SurfaceWorkspaceRequest;
  /** Closes the workspace panel after any pending draft decision settles. */
  readonly onClose: () => void;
  /** sessionStorage key for per-artifact height memory, owned by the App. */
  readonly heightStorageKey?: string;
}

export function SurfaceWorkspacesPanel({
  editor,
  previewTransport,
  previewReports,
  previewActive = false,
  onPreviewRequired = () => undefined,
  onSurfaceChanged = () => undefined,
  request,
  onClose,
  heightStorageKey,
}: SurfaceWorkspacesPanelProps) {
  const documentTree = getDocumentTreeForEditor(editor);
  const treeSnapshot = useDocumentTreeSnapshot(editor);
  const documentRevision = treeSnapshot.revision;
  const document = useMemo(() => {
    void documentRevision;
    return ScaffoldDocumentContentSchema.parse(editor.getJSON());
  }, [documentRevision, editor]);
  const courseStructure = projectCourseStructure(document);
  if (!courseStructure || courseStructure.kind !== "slideshow") {
    throw new Error("Learner Interaction authoring requires a valid Slideshow Course Document.");
  }
  const [initialSurfaceId] = useState<EmbeddedNodeId | null>(() => {
    const editorSelectedSurfaceId = resolvePresentationSurfaceId(
      getEditorNavigationForEditor(editor).getSelectionSnapshot(),
      treeSnapshot,
      courseStructure,
    );
    return courseStructure.surfaceById[request.surfaceId]
      ? request.surfaceId
      : (editorSelectedSurfaceId ?? courseStructure.surfaceIds[0] ?? null);
  });
  if (!initialSurfaceId) return null;

  return (
    <ResolvedSurfaceWorkspacesPanel
      editor={editor}
      previewTransport={previewTransport}
      previewReports={previewReports}
      previewActive={previewActive}
      onPreviewRequired={onPreviewRequired}
      onSurfaceChanged={onSurfaceChanged}
      request={request}
      onClose={onClose}
      {...(heightStorageKey !== undefined ? { heightStorageKey } : {})}
      documentTree={documentTree}
      treeSnapshot={treeSnapshot}
      document={document}
      courseStructure={courseStructure}
      initialSurfaceId={initialSurfaceId}
    />
  );
}

function ResolvedSurfaceWorkspacesPanel({
  editor,
  previewTransport,
  previewReports,
  previewActive,
  onPreviewRequired,
  onSurfaceChanged,
  request,
  onClose,
  heightStorageKey,
  documentTree,
  treeSnapshot,
  document,
  courseStructure,
  initialSurfaceId,
}: Omit<SurfaceWorkspacesPanelProps, "previewActive" | "onPreviewRequired" | "onSurfaceChanged"> & {
  readonly previewActive: boolean;
  readonly onPreviewRequired: () => void;
  readonly onSurfaceChanged: (surfaceId: EmbeddedNodeId) => void;
  readonly documentTree: ReturnType<typeof getDocumentTreeForEditor>;
  readonly treeSnapshot: ReturnType<typeof useDocumentTreeSnapshot>;
  readonly document: ReturnType<typeof ScaffoldDocumentContentSchema.parse>;
  readonly courseStructure: ProjectedSlideshowCourseStructure;
  readonly initialSurfaceId: EmbeddedNodeId;
}) {
  const surfaceIdForSaveRef = useRef(initialSurfaceId);
  const appliedRequestNonceRef = useRef<number | null>(null);
  const courseStructureRef = useRef(courseStructure);
  const treeSnapshotRef = useRef(treeSnapshot);
  const onCloseRef = useRef(onClose);
  const onSurfaceChangedRef = useRef(onSurfaceChanged);
  courseStructureRef.current = courseStructure;
  treeSnapshotRef.current = treeSnapshot;
  onCloseRef.current = onClose;
  onSurfaceChangedRef.current = onSurfaceChanged;
  const [initialSnapshot] = useState<SurfaceWorkspacesSnapshot>(() => ({
    workspace: request.workspace,
    surfaceId: initialSurfaceId,
    pendingSurfaceChange: null,
  }));
  const courseDocument = (document as JSONContent).content?.[0];
  if (courseDocument?.type !== "courseDocument") {
    throw new Error("Learner Interaction authoring requires a Course Document root.");
  }
  const presentationValue = courseDocument.attrs?.["presentation"];
  const presentationConfiguration =
    presentationValue === null || presentationValue === undefined
      ? null
      : PresentationConfigurationV1Schema.parse(presentationValue);
  const presentationConfigurationRef = useRef(presentationConfiguration);
  presentationConfigurationRef.current = presentationConfiguration;
  const initialTimelineProjectionRef = useRef(
    projectPresentationTimeline(initialSnapshot.surfaceId, treeSnapshot, presentationConfiguration),
  );
  const [controllers, setControllers] = useState<{
    interaction: LearnerInteractionWorkspaceController;
    surface: SurfaceWorkspacesController;
    timeline: PresentationTimelineController;
  } | null>(null);
  useEffect(() => {
    // Create and dispose all workspace owners in the same open-session lifetime,
    // including StrictMode replay. Tab visibility and Preview are view concerns.
    const interaction = new LearnerInteractionWorkspaceController({
      saveDraft: (draft) =>
        saveLearnerInteractionRule({
          editor,
          surfaceId: surfaceIdForSaveRef.current,
          draft,
        }),
    });
    const timeline = new PresentationTimelineController({
      initialProjection: initialTimelineProjectionRef.current,
      initialSelectedTargetId: initialSnapshot.surfaceId,
      initialViewport: {
        durationMs: initialTimelineProjectionRef.current.durationMs ?? 0,
        viewportWidthPx: 600,
      },
      zoomBounds: { minPixelsPerSecond: 20, maxPixelsPerSecond: 400 },
    });
    const surface = new SurfaceWorkspacesController(
      {
        interactionController: interaction,
        courseStructure: () => courseStructureRef.current,
        onSurfaceChanged: (surfaceId) => {
          surfaceIdForSaveRef.current = surfaceId;
          timeline.setSurface(
            projectPresentationTimeline(
              surfaceId,
              treeSnapshotRef.current,
              presentationConfigurationRef.current,
            ),
          );
          onSurfaceChangedRef.current(surfaceId);
        },
        onClosed: () => onCloseRef.current(),
      },
      initialSnapshot.workspace,
      initialSnapshot.surfaceId,
    );
    setControllers({ interaction, surface, timeline });
    return () => {
      surface.dispose();
      timeline.destroy();
      interaction.dispose();
    };
  }, [editor, initialSnapshot]);
  const surfaceController = controllers?.surface;
  const subscribeToWorkspaces = useCallback(
    (listener: () => void) => surfaceController?.subscribe(listener) ?? (() => undefined),
    [surfaceController],
  );
  const getWorkspacesSnapshot = useCallback(
    (): SurfaceWorkspacesSnapshot => surfaceController?.getSnapshot() ?? initialSnapshot,
    [surfaceController, initialSnapshot],
  );
  const workspacesSnapshot = useSyncExternalStore(
    subscribeToWorkspaces,
    getWorkspacesSnapshot,
    getWorkspacesSnapshot,
  );
  const workspace = workspacesSnapshot.workspace;
  const currentSurfaceId = workspacesSnapshot.surfaceId;
  surfaceIdForSaveRef.current = currentSurfaceId;
  const firstValidSurfaceId = courseStructure.surfaceIds.find((surfaceId) =>
    treeSnapshot.itemById.has(surfaceId),
  );
  const projectedSurfaceId =
    courseStructure.surfaceById[currentSurfaceId] && treeSnapshot.itemById.has(currentSurfaceId)
      ? currentSurfaceId
      : firstValidSurfaceId;
  if (!projectedSurfaceId) {
    throw new Error("Surface workspace lost every valid Slideshow Surface.");
  }
  const presentationProjection = projectPresentationTimeline(
    projectedSurfaceId,
    treeSnapshot,
    presentationConfiguration,
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
    semanticSnapshot: treeSnapshot,
    controlCapabilities: documentTree.getControlCapabilities(),
  });
  useEffect(() => {
    if (currentSurfaceId !== projectedSurfaceId) {
      surfaceController?.requestSurface(projectedSurfaceId);
    }
  }, [currentSurfaceId, projectedSurfaceId, surfaceController]);
  useEffect(() => {
    if (!surfaceController || appliedRequestNonceRef.current === request.nonce) return;
    appliedRequestNonceRef.current = request.nonce;
    if (courseStructure.surfaceById[request.surfaceId]) {
      surfaceController.requestSurface(request.surfaceId);
    }
    surfaceController.requestWorkspace(request.workspace);
  }, [courseStructure, request, surfaceController]);
  useEffect(() => {
    if (!controllers || controllers.surface.getSnapshot().surfaceId !== projectedSurfaceId) return;
    controllers.timeline.reconcileContent(presentationProjection);
  }, [controllers, presentationProjection, projectedSurfaceId]);

  if (!controllers || !surfaceController) return null;
  const interactionController = controllers.interaction;
  const timelineController = controllers.timeline;

  const resolveInteractionContextChange = (decision: "save" | "discard" | "cancel") => {
    surfaceController.resolveContextChange(decision);
  };

  const requestWorkspaceTab = (nextWorkspace: string) => {
    if (nextWorkspace !== "timeline" && nextWorkspace !== "interactions") {
      throw new Error(`Unknown Surface workspace: ${nextWorkspace}`);
    }
    surfaceController.requestWorkspace(nextWorkspace);
  };

  const closeWorkspaces = () => {
    surfaceController.requestClose();
  };

  const selectWorkspaceSurface = (surfaceId: EmbeddedNodeId) => {
    surfaceController.requestSurface(surfaceId);
  };

  return (
    <EditorBottomPanel
      key={workspace}
      tabsLabel="Surface workspace"
      headerActions={
        <label className="sc-surface-workspace-slide-picker">
          <span>Slide</span>
          <select
            aria-label="Workspace slide"
            value={projectedSurfaceId}
            onChange={(event) =>
              selectWorkspaceSurface(event.currentTarget.value as EmbeddedNodeId)
            }
          >
            {courseStructure.surfaces.map((surface) => (
              <option key={surface.id} value={surface.id}>
                {`Slide ${surface.index + 1}`}
              </option>
            ))}
          </select>
        </label>
      }
      initialHeightPx={workspace === "interactions" ? 280 : 360}
      {...(heightStorageKey ? { heightStorageKey: `${heightStorageKey}:${workspace}` } : {})}
      tabs={[
        {
          id: "timeline",
          label: "Timeline",
          content: (
            // Keyed per tab: the panel renders the active content unkeyed,
            // so same-type boundaries would otherwise share error/retry
            // state across tab switches.
            <SurfaceWorkspaceErrorBoundary key="timeline" tabLabel="Timeline">
              <PresentationTimelineAuthoringWorkspace
                editor={editor}
                previewTransport={previewTransport}
                controller={timelineController}
                surfaceId={projectedSurfaceId}
                projection={presentationProjection}
                previewActive={previewActive}
                onPreviewRequired={onPreviewRequired}
              />
            </SurfaceWorkspaceErrorBoundary>
          ),
        },
        {
          id: "interactions",
          label: "Interactions",
          content: (
            <SurfaceWorkspaceErrorBoundary key="interactions" tabLabel="Interactions">
              <div data-interaction-surface-id={projectedSurfaceId}>
                <LearnerInteractionWorkspace
                  controller={interactionController}
                  projection={learnerInteractionProjection}
                  previewReports={previewReports}
                  previewActive={previewActive}
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
            </SurfaceWorkspaceErrorBoundary>
          ),
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
  previewTransport,
  controller,
  surfaceId,
  projection,
  previewActive,
  onPreviewRequired,
}: {
  readonly editor: TiptapEditor;
  readonly previewTransport: AuthorPreviewTransport;
  readonly controller: PresentationTimelineController;
  readonly surfaceId: EmbeddedNodeId;
  readonly projection: ReturnType<typeof projectPresentationTimeline>;
  readonly previewActive: boolean;
  readonly onPreviewRequired: () => void;
}) {
  return (
    <PresentationTimeline
      controller={controller}
      editor={editor}
      preview={{
        transport: previewTransport,
        surfaceId,
        active: previewActive,
        onPreviewRequired,
      }}
      projection={projection}
    />
  );
}

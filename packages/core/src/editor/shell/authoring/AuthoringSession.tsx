import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { EmbeddedNodeId } from "@scaffold/contracts";
import {
  getCourseDocumentAuthoringEnvironmentState,
  type CourseDocumentAuthoringEnvironment,
} from "@/composition/authoring/create-authoring-composition";
import {
  getCourseDocumentAuthoringMountState,
  type CourseDocumentAuthoringMount,
} from "@/document/authoring/prepared-authoring-mount";
import { type PreparedScaffoldArtifactValue } from "@/document/authoring/prepare-scaffold-artifact-for-authoring";
import type { UnavailableContentRef } from "@/document/model/establishment";
import { projectCourseStructure } from "@/document/model/course-structure";
import { resolveDocumentItemSurfaceId } from "@/document/model/document-tree";
import { getDocumentTreeForEditor } from "@/document/authoring/document-tree";
import { getEditorNavigationForEditor } from "@/document/authoring/editor-navigation";
import { cn } from "@/lib/cn";
import { OverlayBoundary } from "@/ui/overlays/OverlayBoundary";
import {
  useAppNotifications,
  type AppNotificationId,
} from "@/ui/components/app/AppNotifications/AppNotifications";
import { buildCompilationSnapshot } from "@/authoring/publication/build-compilation-snapshot";
import { prepareLearnerContent } from "@/authoring/publication/prepare-learner-content";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { ScaffoldUnavailableAgentIntegration } from "@/editor/shell/agent/ScaffoldUnavailableAgentIntegration";
import { Header } from "@/editor/shell/chrome/Header";
import { useShellLayout } from "@/editor/shell/layout/ShellLayoutProvider";
import { SurfaceWorkspacesPanel } from "@/editor/shell/workspaces/SurfaceWorkspacesPanel";
import { useMeasuredHeaderHeight } from "@/editor/shell/chrome/use-measured-header-height";
import { Toolbar } from "@/editor/shell/chrome/Toolbar";
import { DocumentOutlineHost } from "@/editor/shell/outline/DocumentOutlineHost";

import { ContentAuthorHost } from "./ContentAuthorHost";
import { AuthoringDocumentBlockStrip } from "./AuthoringDocumentChrome";
import { AuthoringHeaderActions } from "./AuthoringHeaderActions";
import type { AuthoringSaveResult } from "./authoring-save-controller";
import { useAuthoringDocument } from "./use-authoring-document";
import { type AuthorPreviewPreparationInput } from "./author-preview-session-controller";
import { prepareAuthorPreview, type AuthorPreviewHostServices } from "./author-preview-preparation";
import { AuthorPreviewStage, loadAuthorPreviewRuntimeModule } from "./AuthorPreviewStage";
import type {
  ScaffoldAuthoringAppSessionContentProps,
  ScaffoldLearnerPreviewContent,
} from "./ScaffoldAuthoringApp";
import { useAuthorPreview } from "./use-author-preview";
import { useAuthoringPublication } from "./use-authoring-publication";
import { useAuthoringSave } from "./use-authoring-save";
import { useAuthoringSaveLabel } from "./use-authoring-save-label";
import "./ScaffoldAuthoringApp.css";

export interface AuthoringSessionProps extends ScaffoldAuthoringAppSessionContentProps {
  readonly activeAuthoringMount: CourseDocumentAuthoringMount;
  readonly authoringEnvironment: CourseDocumentAuthoringEnvironment;
  readonly readyArtifact: PreparedScaffoldArtifactValue;
}

export function AuthoringSession({
  application,
  applicationColorMode,
  applicationElement,
  initialSavedArtifactRevision,
  productAccess,
  services,
  hostHeaderActions,
  onAgentClose,
  enablePreview = true,
  onPreviewChange,
  onPreviewContentChange,
  createPreviewServices,
  scrollModel = "page",
  mainClassName,
  toggleApplicationColorMode,
  workspaceClassName,
  activeAuthoringMount,
  authoringEnvironment,
  readyArtifact,
}: AuthoringSessionProps) {
  const appNotifications = useAppNotifications();
  const contentSessionSource = readyArtifact.id;
  const authoringDocument = useAuthoringDocument({
    source: contentSessionSource,
    artifact: readyArtifact,
  });
  const save = useAuthoringSave({
    document: authoringDocument,
    persistence: services.artifactPersistence,
  });
  const saveController = save.status === "ready" ? save.controller : null;
  const saveState = useAuthoringSaveLabel(save);
  const courseTheme = authoringDocument.theme;
  const editor = authoringDocument.editor;
  const title = authoringDocument.title;
  const outlineOpen = useShellLayout((state) => state.leftDock) === "outline";
  const resolvedAgentOpen = useShellLayout((state) => state.rightDock) === "agent";
  const surfaceWorkspaceRequest = useShellLayout((state) => state.bottomPanel);
  const surfaceWorkspaceSelectionRef = useRef<{
    source: string;
    open: boolean;
    surfaceId: EmbeddedNodeId | null;
  }>({ source: contentSessionSource, open: false, surfaceId: null });
  if (surfaceWorkspaceSelectionRef.current.source !== contentSessionSource) {
    surfaceWorkspaceSelectionRef.current = {
      source: contentSessionSource,
      open: false,
      surfaceId: null,
    };
  }
  if (!surfaceWorkspaceRequest) {
    surfaceWorkspaceSelectionRef.current.open = false;
    surfaceWorkspaceSelectionRef.current.surfaceId = null;
  } else if (!surfaceWorkspaceSelectionRef.current.open) {
    surfaceWorkspaceSelectionRef.current.open = true;
    surfaceWorkspaceSelectionRef.current.surfaceId = surfaceWorkspaceRequest.surfaceId;
  }
  const toggleLeftDock = useShellLayout((state) => state.toggleLeftDock);
  const toggleRightDock = useShellLayout((state) => state.toggleRightDock);
  const setLeftDock = useShellLayout((state) => state.setLeftDock);
  const setRightDock = useShellLayout((state) => state.setRightDock);
  const closeSurfaceWorkspace = useShellLayout((state) => state.closeBottomPanel);
  const enterPreviewLayout = useShellLayout((state) => state.enterPreview);
  const publicationNotificationIdRef = useRef<AppNotificationId | null>(null);
  const outlineToggleRef = useRef<HTMLButtonElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  useMeasuredHeaderHeight(headerRef, mainRef);
  const surfaceWorkspaceSessionRef = useRef({ source: contentSessionSource, key: 0 });
  if (surfaceWorkspaceSessionRef.current.source !== contentSessionSource) {
    surfaceWorkspaceSessionRef.current = {
      source: contentSessionSource,
      key: surfaceWorkspaceSessionRef.current.key + 1,
    };
  }
  const resolvedArtifactId = readyArtifact.id;
  const providerPorts = useMemo(
    () => ({
      media: services.media ?? null,
    }),
    [services.media],
  );

  const prepareCapturedLearnerContent = useCallback(
    (document: Parameters<typeof prepareLearnerContent>[0]) => {
      const environmentState = getCourseDocumentAuthoringEnvironmentState(authoringEnvironment);
      const mountState = getCourseDocumentAuthoringMountState(activeAuthoringMount);
      return prepareLearnerContent(document, {
        capabilities: environmentState.capabilities,
        authoringSchema: environmentState.schema,
        expectedRequiresScaffoldPlus: mountState.expectedRequiresScaffoldPlus,
        productAccess: mountState.productAccess,
      });
    },
    [activeAuthoringMount, authoringEnvironment],
  );
  const buildCapturedCompilationSnapshot = useCallback(
    (document: Parameters<typeof buildCompilationSnapshot>[0], revision: number) =>
      buildCompilationSnapshot(
        document,
        revision,
        getCourseDocumentAuthoringEnvironmentState(authoringEnvironment).schema,
        application.authoring.documentTree,
      ),
    [application.authoring.documentTree, authoringEnvironment],
  );

  const publication = useAuthoringPublication({
    document: authoringDocument,
    saving: saveController,
    publication: services.learnerPublication,
    initialSavedArtifactRevision,
    prepareLearnerContent: prepareCapturedLearnerContent,
    buildCompilationSnapshot: buildCapturedCompilationSnapshot,
  });
  const publicationController = publication.status === "ready" ? publication.controller : null;
  const publicationSnapshot = publication.status === "ready" ? publication.snapshot : null;
  useEffect(() => {
    publicationNotificationIdRef.current = null;
  }, [publicationController]);

  const handleEditorReady = useCallback(
    (nextEditor: TiptapEditor) => {
      authoringDocument.setEditor(nextEditor);
    },
    [authoringDocument],
  );

  const handleDocumentError = useCallback(
    (failure: Parameters<typeof authoringDocument.reportDocumentError>[0]) => {
      authoringDocument.reportDocumentError(failure);
      publicationNotificationIdRef.current = null;
    },
    [authoringDocument],
  );

  const saveNow = useCallback((): Promise<AuthoringSaveResult> => {
    authoringDocument.capture();
    if (!saveController) {
      return Promise.reject(new Error("Scaffold authoring save controller is not ready."));
    }
    return saveController.saveNow();
  }, [authoringDocument, saveController]);

  const handleCanonicalUpdate = useCallback(
    (
      content: JSONContent,
      _unavailableContent: readonly UnavailableContentRef[],
      sourceDocument: object,
    ) => {
      authoringDocument.acceptCanonicalUpdate(content, sourceDocument);
      publicationNotificationIdRef.current = null;
    },
    [authoringDocument],
  );

  const handleEditorChange = useCallback(
    (nextEditor: TiptapEditor) => {
      queueMicrotask(() => {
        authoringDocument.setEditor(nextEditor);
      });
    },
    [authoringDocument],
  );

  const prepareAuthorPreviewSession = useCallback(
    (input: AuthorPreviewPreparationInput, retainedServices: AuthorPreviewHostServices | null) => {
      if (!activeAuthoringMount) {
        throw new Error("Author Preview requires an active authoring mount.");
      }
      return prepareAuthorPreview(
        input,
        {
          prepareLearnerContent: prepareCapturedLearnerContent,
          buildCompilationSnapshot: buildCapturedCompilationSnapshot,
          ...(createPreviewServices ? { createServices: createPreviewServices } : {}),
          fallbackServices: services,
          loadRuntimeModule: loadAuthorPreviewRuntimeModule,
        },
        retainedServices,
      );
    },
    [
      activeAuthoringMount,
      buildCapturedCompilationSnapshot,
      createPreviewServices,
      prepareCapturedLearnerContent,
      services,
    ],
  );
  const authorPreview = useAuthorPreview({
    document: authoringDocument,
    prepare: prepareAuthorPreviewSession,
  });
  const authorPreviewSession = authorPreview.status === "ready" ? authorPreview.session : null;
  const authorPreviewSnapshot = authorPreview.status === "ready" ? authorPreview.snapshot : null;
  const activeAuthorPreview =
    authorPreviewSnapshot &&
    (authorPreviewSnapshot.status === "preview" ||
      authorPreviewSnapshot.status === "refreshing" ||
      authorPreviewSnapshot.status === "refresh-failed")
      ? authorPreviewSnapshot.active
      : null;
  const preview = activeAuthorPreview !== null;
  const previewEntryPending = authorPreviewSnapshot?.status === "entering";
  const previewFailure =
    authorPreviewSnapshot?.status === "editing"
      ? authorPreviewSnapshot.failure
      : authorPreviewSnapshot?.status === "refresh-failed"
        ? authorPreviewSnapshot.failure
        : null;
  const previousPreviewEntryRef = useRef<number | null>(null);
  useEffect(() => {
    const entryId = activeAuthorPreview?.entryId ?? null;
    if (entryId !== null && previousPreviewEntryRef.current === null) {
      enterPreviewLayout();
      onPreviewChange?.(true);
    } else if (entryId === null && previousPreviewEntryRef.current !== null) {
      onPreviewChange?.(false);
    }
    previousPreviewEntryRef.current = entryId;
  }, [activeAuthorPreview?.entryId, enterPreviewLayout, onPreviewChange]);
  const previousPreviewContentRef = useRef<ScaffoldLearnerPreviewContent | null | undefined>(
    undefined,
  );
  useEffect(() => {
    const content = activeAuthorPreview?.content ?? null;
    if (
      previousPreviewContentRef.current !== undefined &&
      previousPreviewContentRef.current !== content
    ) {
      onPreviewContentChange?.(content);
    } else if (previousPreviewContentRef.current === undefined && content !== null) {
      onPreviewContentChange?.(content);
    }
    previousPreviewContentRef.current = content;
  }, [activeAuthorPreview?.content, onPreviewContentChange]);

  const handlePreviewToggle = useCallback(() => {
    if (preview || previewEntryPending) {
      authorPreviewSession?.exit();
      return;
    }

    if (!editor || !activeAuthoringMount || !authorPreviewSession) return;
    const captured = authoringDocument.capture();
    if (captured.isErr()) return;
    const currentContent = toJsonDocument(captured.value.artifact.content);
    const structure = projectCourseStructure(currentContent);
    if (!structure) {
      throw new Error("Author Preview requires a valid Course Structure.");
    }
    const documentTree = structure.kind === "slideshow" ? getDocumentTreeForEditor(editor) : null;
    const editorSelection =
      structure.kind === "slideshow"
        ? getEditorNavigationForEditor(editor).getSelectionSnapshot()
        : null;
    const selectedSurfaceId =
      editorSelection?.selectedId && documentTree && structure.kind === "slideshow"
        ? resolveDocumentItemSurfaceId(
            editorSelection.selectedId,
            documentTree.getSnapshot(),
            structure,
          )
        : null;
    const workspaceSurfaceId = surfaceWorkspaceSelectionRef.current.surfaceId;
    const surfaceId =
      (workspaceSurfaceId && structure.surfaceById[workspaceSurfaceId]
        ? workspaceSurfaceId
        : selectedSurfaceId) ?? structure.surfaceIds[0];
    if (!surfaceId) {
      throw new Error("Author Preview requires at least one Surface.");
    }
    void authorPreviewSession.enter(captured.value, surfaceId);
  }, [
    activeAuthoringMount,
    authorPreviewSession,
    editor,
    preview,
    previewEntryPending,
    authoringDocument,
  ]);

  const handleWorkspaceSurfaceChanged = useCallback(
    (surfaceId: EmbeddedNodeId) => {
      surfaceWorkspaceSelectionRef.current.surfaceId = surfaceId;
      if (preview) void authorPreviewSession?.showSurface(surfaceId);
    },
    [authorPreviewSession, preview],
  );

  const notifyPublicationOutcome = useCallback(
    (intent: "success" | "error", message: string, description: string) => {
      const notificationId = publicationNotificationIdRef.current;
      if (notificationId) {
        appNotifications.update(notificationId, intent, message, { description });
        return;
      }
      publicationNotificationIdRef.current = appNotifications.notify(intent, message, {
        description,
      });
    },
    [appNotifications],
  );

  const publishNow = useCallback(async (): Promise<boolean> => {
    if (!publicationController) return false;
    const result = await publicationController.publish();
    if (result.isErr()) {
      if (
        result.error.reason === "publication-failed" ||
        result.error.reason === "publication-not-activated"
      ) {
        notifyPublicationOutcome("error", "Publication failed", "Try again.");
      }
      return false;
    }
    notifyPublicationOutcome(
      "success",
      "Publication complete",
      "This version is now live for learners.",
    );
    return true;
  }, [notifyPublicationOutcome, publicationController]);

  const handleAgentToggle = useCallback(() => {
    toggleRightDock("agent");
  }, [toggleRightDock]);

  const handleAgentClose = useCallback(() => {
    setRightDock(null);
    onAgentClose?.();
  }, [onAgentClose, setRightDock]);

  const handleOutlineClose = useCallback(() => {
    setLeftDock(null);
    requestAnimationFrame(() => outlineToggleRef.current?.focus());
  }, [setLeftDock]);

  const renderAuthoringNavigatorDock = useCallback(
    (editorInstance: TiptapEditor) => (
      <DocumentOutlineHost editor={editorInstance} onClose={handleOutlineClose} />
    ),
    [handleOutlineClose],
  );

  const renderLeftRail = useCallback(
    (editorInstance: TiptapEditor) => <Toolbar editor={editorInstance} />,
    [],
  );
  const renderRightRail = useCallback(
    (editorInstance: TiptapEditor) => <AuthoringDocumentBlockStrip editor={editorInstance} />,
    [],
  );

  const publishState = publicationSnapshot?.publishState ?? "loading";
  const appHeaderActions = (
    <AuthoringHeaderActions
      title={title}
      theme={{ course: courseTheme, editor, colorMode: applicationColorMode }}
      status={{
        save: saveState,
        publish: publishState,
        outlineOpen,
        agentOpen: resolvedAgentOpen,
        preview,
        previewEntryPending,
        previewEntryAllowed:
          authorPreviewSession !== null &&
          editor !== null &&
          authoringDocument.getSnapshot().status !== "invalid",
        previewFailure,
        previewEnabled: enablePreview,
      }}
      actions={{
        saveNow,
        changeTheme: () => {
          if (!editor) return;
          authoringDocument.setEditor(editor);
        },
        toggleColorMode: toggleApplicationColorMode,
        toggleOutline: () => toggleLeftDock("outline"),
        toggleAgent: handleAgentToggle,
        togglePreview: handlePreviewToggle,
        publish: publishNow,
      }}
      outlineToggleRef={outlineToggleRef}
      {...(hostHeaderActions ? { hostHeaderActions } : {})}
    />
  );

  const stagePreview =
    activeAuthorPreview && authorPreviewSession ? (
      <AuthorPreviewStage
        active={activeAuthorPreview}
        executionEnabled={authorPreviewSnapshot?.status === "preview"}
        artifactId={readyArtifact.id}
        title={title}
        mode={readyArtifact.mode}
        composition={application.runtime}
        hostColorMode={applicationColorMode}
        productAccess={productAccess}
        session={authorPreviewSession}
      />
    ) : null;
  return (
    <OverlayBoundary container={applicationElement} kind="viewport">
      <div ref={headerRef}>
        <Header
          title={title}
          onTitleChange={(nextTitle) => {
            authoringDocument.setTitle(nextTitle);
            publicationNotificationIdRef.current = null;
          }}
          brandSurface={applicationColorMode}
          saveState={saveState}
          actions={appHeaderActions}
        />
      </div>

      <main ref={mainRef} className={cn("sc-scaffold-authoring-main", mainClassName)}>
        <div
          className={cn("sc-scaffold-authoring-workspace", workspaceClassName)}
          data-preview-mode={activeAuthorPreview ? readyArtifact.mode : undefined}
        >
          <ScaffoldServicesProvider ports={providerPorts}>
            <ContentAuthorHost
              agentIntegration={ScaffoldUnavailableAgentIntegration}
              {...(outlineOpen && !preview
                ? { authoringNavigatorDock: renderAuthoringNavigatorDock }
                : {})}
              artifactId={resolvedArtifactId}
              mount={activeAuthoringMount}
              courseAppearance={applicationColorMode}
              onChange={handleEditorChange}
              onEditorReady={handleEditorReady}
              onDocumentError={handleDocumentError}
              onUpdate={handleCanonicalUpdate}
              agentOpen={!preview && resolvedAgentOpen}
              onAgentClose={handleAgentClose}
              scrollModel={scrollModel}
              leftRail={renderLeftRail}
              rightRail={renderRightRail}
              {...(stagePreview ? { stagePreview } : {})}
              {...(editor &&
              readyArtifact.mode === "slideshow" &&
              surfaceWorkspaceRequest &&
              authorPreviewSession
                ? {
                    bottomWorkspace: (
                      <SurfaceWorkspacesPanel
                        key={surfaceWorkspaceSessionRef.current.key}
                        {...(resolvedArtifactId
                          ? {
                              heightStorageKey: `sc-editor-bottom-panel-height:${resolvedArtifactId}`,
                            }
                          : {})}
                        editor={editor}
                        previewTransport={authorPreviewSession.transport}
                        previewReports={authorPreviewSession.reports}
                        previewActive={preview}
                        onPreviewRequired={() =>
                          appNotifications.notify("info", "Switch to Preview to test this.")
                        }
                        onSurfaceChanged={handleWorkspaceSurfaceChanged}
                        request={surfaceWorkspaceRequest}
                        onClose={closeSurfaceWorkspace}
                      />
                    ),
                  }
                : {})}
            />
          </ScaffoldServicesProvider>
        </div>
      </main>
    </OverlayBoundary>
  );
}

function toJsonDocument(content: unknown): JSONContent {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return content as JSONContent;
  }
  return { type: "doc", content: [] };
}

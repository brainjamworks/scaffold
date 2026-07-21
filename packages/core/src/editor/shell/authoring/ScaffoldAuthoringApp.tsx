import {
  ChatCircleTextIcon as ChatCircleText,
  EyeIcon as Eye,
  PencilSimpleIcon as PencilSimple,
} from "@phosphor-icons/react";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Y from "yjs";
import type { AssessmentGroupContract, AssessmentTargetContract } from "@scaffold/contracts";

import { cn } from "@/lib/cn";
import { iconSm } from "@/ui/tokens/icon-sizes";
import {
  projectArtifactSaveBundle,
  validateArtifactSaveBundleSize,
} from "@/authoring/publication/artifact-save-bundle";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { ScaffoldUnavailableAgentIntegration } from "@/editor/shell/agent/ScaffoldUnavailableAgentIntegration";
import type { ScaffoldAgentIntegration } from "@/editor/shell/agent/agent-integration";
import { Header } from "@/editor/shell/chrome/Header";
import { Toolbar } from "@/editor/shell/chrome/Toolbar";
import type { EditorShellScrollModel } from "@/editor/shell/chrome/EditorShell";
import {
  prepareScaffoldArtifactForAuthoring,
  type PreparedScaffoldArtifactValue,
} from "@/format/artifact";
import type {
  ScaffoldAuthoringArtifact,
  ScaffoldAuthoringHostServices,
  ScaffoldLearnerHostServices,
} from "@/host/contracts";
import type { ArtifactSaveBundle, SaveableScaffoldArtifact } from "@/host/ports";

import { ContentAuthorHost } from "./ContentAuthorHost";
import { AuthoringDocumentBlockStrip } from "./AuthoringDocumentChrome";
import { initializeAuthoringCourseDocumentFragment } from "@/document/authoring/initialize-authoring-document";
import "./ScaffoldAuthoringApp.css";

export type ScaffoldAuthoringSaveState = "idle" | "saving" | "saved" | "error";
const SAVE_DEBOUNCE_MS = 500;
const SAVE_OK_DISPLAY_MS = 2_000;

function importScaffoldLearnerApp() {
  return import("@/runtime/app/ScaffoldLearnerApp").then(({ ScaffoldLearnerApp }) => ({
    default: ScaffoldLearnerApp,
  }));
}

let scaffoldLearnerAppPromise: ReturnType<typeof importScaffoldLearnerApp> | null = null;

function loadScaffoldLearnerApp() {
  scaffoldLearnerAppPromise ??= importScaffoldLearnerApp();
  return scaffoldLearnerAppPromise;
}

const LazyScaffoldLearnerApp = lazy(loadScaffoldLearnerApp);

export interface ScaffoldLearnerPreviewContent {
  assessmentGroups: AssessmentGroupContract[];
  assessmentTargets: AssessmentTargetContract[];
  learnerContent: JSONContent;
}

export interface PrepareScaffoldLearnerPreviewArgs {
  artifactId: string | null;
  authorContent: JSONContent;
  title: string;
}

export interface ScaffoldAuthoringHeaderActionsContext {
  saveState: ScaffoldAuthoringSaveState;
  saveNow: () => Promise<boolean>;
  title: string;
  preview: boolean;
}

export type ScaffoldPreviewServicesFactory = (
  content: ScaffoldLearnerPreviewContent,
) => ScaffoldLearnerHostServices | Promise<ScaffoldLearnerHostServices>;

export interface ScaffoldAuthoringAppProps {
  agentIntegration?: ScaffoldAgentIntegration;
  artifact: ScaffoldAuthoringArtifact;
  services: ScaffoldAuthoringHostServices;
  onEditorReady?: (editor: TiptapEditor) => void;
  /**
   * Host-specific header actions, for example XBlock Save / Done or a
   * browser Reset button. Scaffold-owned actions such as Agent and
   * Preview are rendered by this app shell.
   */
  headerActions?: (context: ScaffoldAuthoringHeaderActionsContext) => ReactNode;
  agentOpen?: boolean;
  onAgentOpenChange?: (open: boolean) => void;
  onAgentClose?: () => void;
  enablePreview?: boolean;
  onAuthoringEditorChange?: (editor: TiptapEditor | null) => void;
  onPreviewChange?: (preview: boolean) => void;
  onPreviewContentChange?: (content: ScaffoldLearnerPreviewContent | null) => void;
  createPreviewServices?: ScaffoldPreviewServicesFactory;
  /**
   * `page` for window/document scrolling, `contained` when this authoring app
   * owns an internal scrollport below its header.
   */
  scrollModel?: EditorShellScrollModel;
  className?: string;
  mainClassName?: string;
  workspaceClassName?: string;
}

export function ScaffoldAuthoringApp({
  agentIntegration = ScaffoldUnavailableAgentIntegration,
  artifact,
  services,
  onEditorReady,
  headerActions,
  agentOpen = false,
  onAgentOpenChange,
  onAgentClose,
  enablePreview = true,
  onAuthoringEditorChange,
  onPreviewChange,
  onPreviewContentChange,
  createPreviewServices,
  scrollModel = "page",
  className,
  mainClassName,
  workspaceClassName,
}: ScaffoldAuthoringAppProps) {
  const preparedArtifact = useMemo(() => prepareScaffoldArtifactForAuthoring(artifact), [artifact]);
  const readyArtifact = preparedArtifact.status === "ready" ? preparedArtifact.artifact : null;
  const document = useMemo(() => {
    const nextDocument = new Y.Doc();
    if (readyArtifact) {
      initializeAuthoringCourseDocumentFragment(nextDocument, readyArtifact.content);
    }
    return nextDocument;
  }, [readyArtifact]);
  const artifactStateSource = readyArtifact ?? artifact;
  const initialTitle = readyArtifact?.title ?? artifact.title;
  const [titleState, setTitleState] = useState<{
    source: unknown;
    value: string;
  }>(() => ({
    source: artifactStateSource,
    value: initialTitle,
  }));
  const title = titleState.source === artifactStateSource ? titleState.value : initialTitle;
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const [preview, setPreview] = useState(false);
  const [uncontrolledAgentOpen, setUncontrolledAgentOpen] = useState(agentOpen);
  const [previewContent, setPreviewContent] = useState<ScaffoldLearnerPreviewContent | null>(null);
  const [previewServices, setPreviewServices] = useState<ScaffoldLearnerHostServices | null>(null);
  const [previewState, setPreviewStateStatus] = useState<"idle" | "loading" | "error">("idle");
  const [saveState, setSaveState] = useState<ScaffoldAuthoringSaveState>("idle");
  const saveStateRef = useRef<ScaffoldAuthoringSaveState>("idle");
  const hydratingRef = useRef(true);
  const latestEditorRef = useRef<TiptapEditor | null>(null);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const initialLatestContent = readyArtifact?.content ?? null;
  const latestContentRef = useRef<{
    source: unknown;
    value: unknown;
  }>({
    source: artifactStateSource,
    value: initialLatestContent,
  });
  if (latestContentRef.current.source !== artifactStateSource) {
    latestContentRef.current = {
      source: artifactStateSource,
      value: initialLatestContent,
    };
  }
  const titleRef = useRef(title);
  titleRef.current = title;
  const resolvedArtifactId = readyArtifact?.id ?? artifact.id ?? null;
  const resolvedAgentOpen = onAgentOpenChange ? agentOpen : uncontrolledAgentOpen;
  const providerPorts = useMemo(
    () => ({
      media: services.media ?? null,
    }),
    [services.media],
  );

  useEffect(() => {
    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
      latestEditorRef.current = null;
      document.destroy();
    };
  }, [document]);

  const setTitleForCurrentArtifact = useCallback(
    (value: string) => {
      setTitleState({ source: artifactStateSource, value });
    },
    [artifactStateSource],
  );

  const setResolvedSaveState = useCallback((nextState: ScaffoldAuthoringSaveState) => {
    if (saveStateRef.current === nextState) return;
    saveStateRef.current = nextState;
    setSaveState(nextState);
  }, []);

  const handleEditorReady = useCallback(
    (nextEditor: TiptapEditor) => {
      latestEditorRef.current = nextEditor;
      setEditor(nextEditor);
      hydratingRef.current = true;
      requestAnimationFrame(() => {
        hydratingRef.current = false;
      });
      onAuthoringEditorChange?.(nextEditor);
      onEditorReady?.(nextEditor);
    },
    [onAuthoringEditorChange, onEditorReady],
  );

  const persist = useCallback(
    async (content: unknown, nextTitle: string): Promise<ArtifactSaveBundle> => {
      if (!readyArtifact) {
        throw new Error("Scaffold authoring artifact is not ready.");
      }

      setResolvedSaveState("saving");
      try {
        const bundle = projectArtifactSaveBundle({
          artifact: toSaveableArtifact({
            artifact: readyArtifact,
            title: nextTitle,
            content,
          }),
        });
        validateArtifactSaveBundleSize(bundle);
        const result = await services.artifactPersistence.saveArtifact(bundle);
        if (typeof result?.artifact?.title === "string" && result.artifact.title) {
          setTitleForCurrentArtifact(result.artifact.title);
        }
        setResolvedSaveState("saved");
        return bundle;
      } catch {
        setResolvedSaveState("error");
        throw new Error("Scaffold authoring save failed.");
      }
    },
    [readyArtifact, services.artifactPersistence, setResolvedSaveState, setTitleForCurrentArtifact],
  );

  const readLatestContent = useCallback(
    (currentEditor: TiptapEditor | null = latestEditorRef.current) => {
      const content = currentEditor?.getJSON() ?? latestContentRef.current.value;
      latestContentRef.current = {
        source: artifactStateSource,
        value: content,
      };
      return content;
    },
    [artifactStateSource],
  );

  const saveNow = useCallback(async (): Promise<boolean> => {
    try {
      await persist(readLatestContent(), titleRef.current);
      return true;
    } catch {
      return false;
    }
  }, [persist, readLatestContent]);

  const scheduleAutosave = useCallback(() => {
    setResolvedSaveState("saving");
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
    }
    autosaveTimeoutRef.current = window.setTimeout(() => {
      autosaveTimeoutRef.current = null;
      void saveNow();
    }, SAVE_DEBOUNCE_MS);
  }, [saveNow, setResolvedSaveState]);

  const handleEditorChange = useCallback(
    (nextEditor: TiptapEditor) => {
      latestEditorRef.current = nextEditor;
      if (hydratingRef.current) return;
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  useEffect(() => {
    if (saveState !== "saved") return;
    const timeout = window.setTimeout(() => setResolvedSaveState("idle"), SAVE_OK_DISPLAY_MS);
    return () => window.clearTimeout(timeout);
  }, [saveState, setResolvedSaveState]);

  const setPreviewState = useCallback(
    (
      nextPreview: boolean,
      nextContent: ScaffoldLearnerPreviewContent | null,
      nextServices: ScaffoldLearnerHostServices | null,
    ) => {
      setPreview(nextPreview);
      setPreviewContent(nextContent);
      setPreviewServices(nextServices);
      onPreviewChange?.(nextPreview);
      onPreviewContentChange?.(nextContent);
    },
    [onPreviewChange, onPreviewContentChange],
  );

  const handlePreviewToggle = useCallback(() => {
    if (preview) {
      setPreviewState(false, null, null);
      setPreviewStateStatus("idle");
      return;
    }

    if (!editor) return;

    setPreviewStateStatus("loading");
    const learnerAppLoad = loadScaffoldLearnerApp();
    void Promise.all([learnerAppLoad, persist(toJsonDocument(readLatestContent(editor)), title)])
      .then(async ([, bundle]) => {
        const nextContent = {
          assessmentGroups: bundle.assessmentGroups,
          assessmentTargets: bundle.assessmentTargets,
          learnerContent: bundle.learnerContent,
        };
        const nextServices = createPreviewServices
          ? await createPreviewServices(nextContent)
          : { media: services.media ?? null };
        onAuthoringEditorChange?.(null);
        latestEditorRef.current = null;
        setEditor(null);
        setPreviewState(true, nextContent, nextServices);
        setPreviewStateStatus("idle");
      })
      .catch(() => {
        setPreviewStateStatus("error");
      });
  }, [
    editor,
    createPreviewServices,
    onAuthoringEditorChange,
    persist,
    preview,
    readLatestContent,
    setPreviewState,
    services.media,
    title,
  ]);

  const setResolvedAgentOpen = useCallback(
    (open: boolean) => {
      if (onAgentOpenChange) {
        onAgentOpenChange(open);
        return;
      }
      setUncontrolledAgentOpen(open);
    },
    [onAgentOpenChange],
  );

  const handleAgentToggle = useCallback(() => {
    setResolvedAgentOpen(!resolvedAgentOpen);
  }, [resolvedAgentOpen, setResolvedAgentOpen]);

  const handleAgentClose = useCallback(() => {
    setResolvedAgentOpen(false);
    onAgentClose?.();
  }, [onAgentClose, setResolvedAgentOpen]);

  const renderLeftRail = useCallback(
    (editorInstance: TiptapEditor) => <Toolbar editor={editorInstance} />,
    [],
  );
  const renderRightRail = useCallback(
    (editorInstance: TiptapEditor) => <AuthoringDocumentBlockStrip editor={editorInstance} />,
    [],
  );

  const appHeaderActions = (
    <div className="sc-scaffold-authoring-actions">
      {headerActions?.({
        preview,
        saveNow,
        saveState,
        title,
      })}
      {!preview ? (
        <button
          type="button"
          onClick={handleAgentToggle}
          aria-pressed={resolvedAgentOpen}
          aria-label={resolvedAgentOpen ? "Hide Scaffold Agent" : "Show Scaffold Agent"}
          title="Toggle Scaffold Agent"
          className="sc-scaffold-authoring-action"
          data-compact-label
          data-state={resolvedAgentOpen ? "active-muted" : "default"}
        >
          <ChatCircleText size={iconSm} aria-hidden />
          <span className="sc-scaffold-authoring-action-label">Agent</span>
        </button>
      ) : null}
      {enablePreview ? (
        <button
          type="button"
          onClick={handlePreviewToggle}
          disabled={previewState === "loading" || (!preview && !editor)}
          aria-pressed={preview}
          aria-label={preview ? "Switch to editing" : "Switch to preview"}
          title={preview ? "Switch to editing" : "Switch to preview"}
          className="sc-scaffold-authoring-action"
          data-compact-label
          data-state={preview ? "active-primary" : "default"}
        >
          {preview ? <PencilSimple size={iconSm} aria-hidden /> : <Eye size={iconSm} aria-hidden />}
          <span className="sc-scaffold-authoring-action-label">
            {preview ? "Edit" : previewState === "loading" ? "Preparing..." : "Preview"}
          </span>
        </button>
      ) : null}
      {previewState === "error" ? (
        <span role="alert">Preview could not be prepared. Try again.</span>
      ) : null}
    </div>
  );

  const activePreviewContent =
    preview && previewContent && readyArtifact
      ? {
          bootstrap: {
            artifactId: readyArtifact.id,
            title,
            mode: readyArtifact.mode,
            learnerContent: previewContent.learnerContent,
          },
          content: previewContent,
        }
      : null;
  const authoringUnavailableMessage =
    preparedArtifact.status === "error"
      ? preparedArtifact.message
      : preparedArtifact.status === "uninitialized"
        ? "Scaffold artifact is missing document content."
        : null;

  return (
    <div className={cn("sc-scaffold-authoring-app", className)}>
      <Header
        title={title}
        onTitleChange={(nextTitle) => {
          setTitleForCurrentArtifact(nextTitle);
          titleRef.current = nextTitle;
          if (!readyArtifact) return;
          scheduleAutosave();
        }}
        saveState={saveState}
        actions={appHeaderActions}
      />

      <main className={cn("sc-scaffold-authoring-main", mainClassName)}>
        <div
          className={cn("sc-scaffold-authoring-workspace", workspaceClassName)}
          data-preview-mode={activePreviewContent?.bootstrap.mode}
        >
          <ScaffoldServicesProvider ports={providerPorts}>
            {authoringUnavailableMessage && !readyArtifact ? (
              <ScaffoldAuthoringUnavailable message={authoringUnavailableMessage} />
            ) : activePreviewContent && previewServices ? (
              <Suspense fallback={<div role="status">Preparing preview...</div>}>
                <LazyScaffoldLearnerApp
                  bootstrap={activePreviewContent.bootstrap}
                  slideshowSizing="contained"
                  services={previewServices}
                />
              </Suspense>
            ) : (
              <ContentAuthorHost
                agentIntegration={agentIntegration}
                artifactId={resolvedArtifactId}
                document={document}
                editable
                onChange={handleEditorChange}
                onEditorReady={handleEditorReady}
                agentOpen={resolvedAgentOpen}
                onAgentClose={handleAgentClose}
                scrollModel={scrollModel}
                leftRail={renderLeftRail}
                rightRail={renderRightRail}
              />
            )}
          </ScaffoldServicesProvider>
        </div>
      </main>
    </div>
  );
}

function ScaffoldAuthoringUnavailable({ message }: { message: string }) {
  return (
    <div role="alert" data-testid="scaffold-authoring-unavailable">
      <strong>Scaffold document could not be loaded.</strong>
      <span>{message}</span>
    </div>
  );
}

function toJsonDocument(content: unknown): JSONContent {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return content as JSONContent;
  }
  return { type: "doc", content: [] };
}

function toSaveableArtifact({
  artifact,
  title,
  content,
}: {
  artifact: PreparedScaffoldArtifactValue;
  title: string;
  content: unknown;
}): SaveableScaffoldArtifact {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return {
      ...artifact,
      title,
      content: content as SaveableScaffoldArtifact["content"],
    };
  }

  throw new Error("Scaffold artifact content must be a JSON object.");
}

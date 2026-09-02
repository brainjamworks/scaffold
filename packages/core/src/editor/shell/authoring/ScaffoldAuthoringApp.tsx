import {
  ChatCircleTextIcon as ChatCircleText,
  EyeIcon as Eye,
  ListBulletsIcon as ListBullets,
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
import type { AssessmentGroupContract, AssessmentTargetContract } from "@scaffold/contracts";
import type { ScaffoldApplication } from "@/composition/application/create-scaffold-application";
import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import type { CourseDocumentAuthoringFailure } from "@/document/authoring/CourseDocumentEditor";
import {
  getCourseDocumentAuthoringMountState,
  prepareCourseDocumentAuthoringMount,
} from "@/document/authoring/prepared-authoring-mount";
import {
  prepareScaffoldArtifactForAuthoring,
  type PreparedScaffoldArtifactValue,
} from "@/document/authoring/prepare-scaffold-artifact-for-authoring";
import {
  checkLearnerProjectionReadiness,
  type UnavailableContentRef,
} from "@/document/model/establishment";

import { cn } from "@/lib/cn";
import { OverlayBoundary } from "@/ui/overlays/OverlayBoundary";
import { iconSm } from "@/ui/tokens/icon-sizes";
import {
  AppNotificationsProvider,
  useAppNotifications,
  type AppNotificationId,
} from "@/ui/components/app/AppNotifications/AppNotifications";
import { AppShellState } from "@/ui/components/app/AppShellState/AppShellState";
import {
  createArtifactSavePayload,
  validateLearnerPublicationPayloadSize,
} from "@/authoring/publication/artifact-save-bundle";
import { projectLearnerPublication } from "@/authoring/publication/document-projection";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { ScaffoldUnavailableAgentIntegration } from "@/editor/shell/agent/ScaffoldUnavailableAgentIntegration";
import { Header } from "@/editor/shell/chrome/Header";
import { AuthoringPublishAction } from "@/editor/shell/chrome/AuthoringPublishAction";
import { AuthoringColorModeButton } from "@/editor/shell/chrome/AuthoringColorModeButton";
import { Toolbar } from "@/editor/shell/chrome/Toolbar";
import type { EditorShellScrollModel } from "@/editor/shell/chrome/EditorShell";
import { DocumentOutlineHost } from "@/editor/shell/outline/DocumentOutlineHost";
import type {
  ScaffoldAuthoringArtifact,
  ScaffoldAuthoringHostServices,
  ScaffoldLearnerHostServices,
} from "@/host/contracts";
import type { ScaffoldProductAccess } from "@/host/contracts/product-access";
import type {
  ArtifactRevision,
  ArtifactSaveResult,
  LearnerPublicationPayload,
  LearnerPublicationPortErrorCode,
  LearnerPublicationStatus,
  SaveableScaffoldArtifact,
} from "@/host/ports";
import {
  CourseDocumentAttrsSchema,
  PersistedCourseThemeSchema,
  type PersistedCourseTheme,
} from "@/schemas/course-document";
import { CourseThemePanel } from "@/theme/authoring/CourseThemePanel";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";
import { builtInCourseColourSystemRegistry } from "@/theme/course/colour-systems/registry";
import { builtInCourseDesignThemeRegistry } from "@/theme/course/designs/registry";
import { useAuthoringColorMode } from "@/theme/state/authoring-color-mode";

import { ContentAuthorHost } from "./ContentAuthorHost";
import { AuthoringDocumentBlockStrip } from "./AuthoringDocumentChrome";
import {
  createAuthoringSaveMachine,
  type AuthoringSaveMachine,
  type AuthoringSaveSnapshot,
} from "./authoring-save-machine";
import "./ScaffoldAuthoringApp.css";

export type ScaffoldAuthoringSaveState = "idle" | "saving" | "saved" | "error";
export type ScaffoldAuthoringPublishState =
  | "loading"
  | "not-published"
  | "published"
  | "unpublished"
  | "unsaved"
  | "publishing"
  | "invalid"
  | "unavailable-content"
  | "requires-scaffold-plus"
  | "unsupported-core-format"
  | "projection-warning"
  | "payload-too-large"
  | LearnerPublicationPortErrorCode
  | "error";
const SAVE_DEBOUNCE_MS = 500;
const SAVE_OK_DISPLAY_MS = 2_000;

function importScaffoldAuthorPreviewApp() {
  return import("@/runtime/app/ScaffoldAuthorPreviewApp").then(({ ScaffoldAuthorPreviewApp }) => ({
    default: ScaffoldAuthorPreviewApp,
  }));
}

let scaffoldAuthorPreviewAppPromise: ReturnType<typeof importScaffoldAuthorPreviewApp> | null =
  null;

function loadScaffoldAuthorPreviewApp() {
  scaffoldAuthorPreviewAppPromise ??= importScaffoldAuthorPreviewApp();
  return scaffoldAuthorPreviewAppPromise;
}

const LazyScaffoldAuthorPreviewApp = lazy(loadScaffoldAuthorPreviewApp);

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

export interface ScaffoldAuthoringHostActionsContext {
  saveState: ScaffoldAuthoringSaveState;
  saveNow: () => Promise<boolean>;
  title: string;
  preview: boolean;
}

export interface ScaffoldAuthoringHostActionSlots {
  /** Host-owned utility actions displayed before Core's task groups. */
  utility?: ReactNode;
  beforePublish?: ReactNode;
  afterPublish?: ReactNode;
}

type ScaffoldPreviewHostServices = Omit<ScaffoldLearnerHostServices, "learningEvents">;

export type ScaffoldPreviewServicesFactory = (
  content: ScaffoldLearnerPreviewContent,
) => ScaffoldPreviewHostServices | Promise<ScaffoldPreviewHostServices>;

function withoutLearningEventCapability(
  services: ScaffoldLearnerHostServices,
): ScaffoldPreviewHostServices {
  const previewServices = { ...services };
  delete previewServices.learningEvents;
  return previewServices;
}

export interface ScaffoldAuthoringAppProps {
  application: ScaffoldApplication;
  artifact: ScaffoldAuthoringArtifact;
  productAccess: ScaffoldProductAccess;
  services: ScaffoldAuthoringHostServices;
  /**
   * Host-owned utility and publication-adjacent actions. Publication state and
   * commands intentionally remain private to the Core app shell.
   */
  hostHeaderActions?: (
    context: ScaffoldAuthoringHostActionsContext,
  ) => ScaffoldAuthoringHostActionSlots;
  agentOpen?: boolean;
  onAgentOpenChange?: (open: boolean) => void;
  onAgentClose?: () => void;
  enablePreview?: boolean;
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

export function ScaffoldAuthoringApp(props: ScaffoldAuthoringAppProps) {
  return <ScaffoldAuthoringAppSession {...props} initialSavedArtifactRevision={null} />;
}

interface ScaffoldAuthoringAppEntryProps extends ScaffoldAuthoringAppProps {
  readonly initialSavedArtifactRevision: ArtifactRevision | null;
}

export function ScaffoldAuthoringAppForEntry(props: ScaffoldAuthoringAppEntryProps) {
  return <ScaffoldAuthoringAppSession {...props} />;
}

export function createScaffoldAuthoringAppEnvironment(application: ScaffoldApplication) {
  return createCourseDocumentAuthoringEnvironment({
    composition: application.authoring,
  });
}

function ScaffoldAuthoringAppSession(props: ScaffoldAuthoringAppEntryProps) {
  const { mode: applicationColorMode, toggleMode: toggleApplicationColorMode } =
    useAuthoringColorMode();
  const [applicationElement, setApplicationElement] = useState<HTMLDivElement | null>(null);

  return (
    <AppThemeProvider appearance={applicationColorMode}>
      <div ref={setApplicationElement} className={cn("sc-scaffold-authoring-app", props.className)}>
        <AppNotificationsProvider appearance={applicationColorMode}>
          <ScaffoldAuthoringAppSessionContent
            {...props}
            applicationColorMode={applicationColorMode}
            applicationElement={applicationElement}
            toggleApplicationColorMode={toggleApplicationColorMode}
          />
        </AppNotificationsProvider>
      </div>
    </AppThemeProvider>
  );
}

interface ScaffoldAuthoringAppSessionContentProps extends ScaffoldAuthoringAppEntryProps {
  readonly applicationColorMode: ScaffoldColorMode;
  readonly applicationElement: HTMLDivElement | null;
  readonly toggleApplicationColorMode: () => void;
}

function ScaffoldAuthoringAppSessionContent({
  application,
  applicationColorMode,
  applicationElement,
  artifact,
  initialSavedArtifactRevision,
  productAccess,
  services,
  hostHeaderActions,
  agentOpen = false,
  onAgentOpenChange,
  onAgentClose,
  enablePreview = true,
  onPreviewChange,
  onPreviewContentChange,
  createPreviewServices,
  scrollModel = "page",
  mainClassName,
  toggleApplicationColorMode,
  workspaceClassName,
}: ScaffoldAuthoringAppSessionContentProps) {
  const appNotifications = useAppNotifications();
  const authoringEnvironment = useMemo(
    () => createScaffoldAuthoringAppEnvironment(application),
    [application],
  );
  const preparedArtifact = useMemo(
    () => prepareScaffoldArtifactForAuthoring(artifact, authoringEnvironment, productAccess),
    [artifact, authoringEnvironment, productAccess],
  );
  const readyArtifact =
    preparedArtifact.status === "supported" || preparedArtifact.status === "unavailable"
      ? preparedArtifact.artifact
      : null;
  const authoringMount =
    preparedArtifact.status === "supported" || preparedArtifact.status === "unavailable"
      ? preparedArtifact.authoringMount
      : null;
  const [authoringMountState, setAuthoringMountState] = useState<{
    source: PreparedScaffoldArtifactValue | null;
    mount: typeof authoringMount;
  }>(() => ({ source: readyArtifact, mount: authoringMount }));
  const activeAuthoringMount =
    authoringMountState.source === readyArtifact ? authoringMountState.mount : authoringMount;
  const readyCourseTheme = useMemo(
    () =>
      readyArtifact
        ? CourseDocumentAttrsSchema.parse(readyArtifact.content.content?.[0]?.attrs).theme
        : null,
    [readyArtifact],
  );
  const [courseThemeState, setCourseThemeState] = useState<{
    source: unknown;
    value: PersistedCourseTheme | null;
  }>(() => ({ source: readyArtifact, value: readyCourseTheme }));
  const courseTheme =
    courseThemeState.source === readyArtifact ? courseThemeState.value : readyCourseTheme;
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
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [uncontrolledAgentOpen, setUncontrolledAgentOpen] = useState(agentOpen);
  const [previewContent, setPreviewContent] = useState<ScaffoldLearnerPreviewContent | null>(null);
  const [previewServices, setPreviewServices] = useState<ScaffoldPreviewHostServices | null>(null);
  const [previewState, setPreviewStateStatus] = useState<
    "idle" | "loading" | "error" | "requires-scaffold-plus" | "unavailable-content"
  >("idle");
  const [previewUnavailableContent, setPreviewUnavailableContent] = useState<
    readonly UnavailableContentRef[]
  >([]);
  const [saveState, setSaveState] = useState<ScaffoldAuthoringSaveState>("idle");
  const [publicationStatus, setPublicationStatus] = useState<LearnerPublicationStatus | null>(null);
  const [publishActionState, setPublishActionState] =
    useState<ScaffoldAuthoringPublishState | null>(null);
  const saveStateRef = useRef<ScaffoldAuthoringSaveState>("idle");
  const publishInFlightRef = useRef(false);
  const publicationNotificationIdRef = useRef<AppNotificationId | null>(null);
  const outlineToggleRef = useRef<HTMLButtonElement | null>(null);
  const hydratingRef = useRef(true);
  const latestEditorRef = useRef<TiptapEditor | null>(null);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const initialLatestContent = readyArtifact?.content ?? null;
  const contentSessionSource = readyArtifact?.id ?? artifact.id ?? artifactStateSource;
  const latestContentRef = useRef<{
    source: unknown;
    value: unknown;
  }>({
    source: contentSessionSource,
    value: initialLatestContent,
  });
  if (latestContentRef.current.source !== contentSessionSource) {
    latestContentRef.current = {
      source: contentSessionSource,
      value: initialLatestContent,
    };
  }
  const invalidWorkingStateRef = useRef({
    source: contentSessionSource,
    value: false,
  });
  if (invalidWorkingStateRef.current.source !== contentSessionSource) {
    invalidWorkingStateRef.current = { source: contentSessionSource, value: false };
  }
  const publicationLifecycleRef = useRef<{
    source: unknown;
    generation: number;
    savedGeneration: number | null;
    savedRevision: ArtifactRevision | null;
  }>({
    source: contentSessionSource,
    generation: 0,
    savedGeneration: null,
    savedRevision: null,
  });
  if (publicationLifecycleRef.current.source !== contentSessionSource) {
    publicationLifecycleRef.current = {
      source: contentSessionSource,
      generation: 0,
      savedGeneration: null,
      savedRevision: null,
    };
  }
  const saveMachineRef = useRef<AuthoringSaveMachine>(
    createAuthoringSaveMachine(contentSessionSource),
  );
  if (saveMachineRef.current.source !== contentSessionSource) {
    saveMachineRef.current = createAuthoringSaveMachine(contentSessionSource);
  }
  const [, setPublicationLifecycleVersion] = useState(0);
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

  const refreshPublicationLifecycleView = useCallback(() => {
    setPublicationLifecycleVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const source = contentSessionSource;
    publicationNotificationIdRef.current = null;
    setPublicationStatus(null);
    setPublishActionState(null);
    void services.learnerPublication
      .getStatus()
      .then((status) => {
        if (cancelled || publicationLifecycleRef.current.source !== source) return;
        const currentArtifactRevision =
          initialSavedArtifactRevision ?? status.currentArtifactRevision;
        setPublicationStatus(
          currentArtifactRevision === status.currentArtifactRevision
            ? status
            : { ...status, currentArtifactRevision },
        );
        if (
          publicationLifecycleRef.current.generation === 0 &&
          !invalidWorkingStateRef.current.value
        ) {
          publicationLifecycleRef.current.savedGeneration = 0;
          publicationLifecycleRef.current.savedRevision = currentArtifactRevision;
          refreshPublicationLifecycleView();
        }
      })
      .catch(() => {
        if (!cancelled) setPublishActionState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [
    contentSessionSource,
    initialSavedArtifactRevision,
    refreshPublicationLifecycleView,
    services.learnerPublication,
  ]);

  useEffect(() => {
    const machine = saveMachineRef.current;
    machine.activate();
    return () => {
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
      machine.deactivate();
      latestEditorRef.current = null;
    };
  }, [contentSessionSource]);

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
      const nextTheme = readPersistedCourseTheme(nextEditor);
      if (nextTheme) {
        setCourseThemeState({ source: readyArtifact, value: nextTheme });
      }
      hydratingRef.current = true;
      requestAnimationFrame(() => {
        hydratingRef.current = false;
      });
    },
    [readyArtifact],
  );

  const readLatestContent = useCallback(() => latestContentRef.current.value, []);

  const captureSaveSnapshot = useCallback((): AuthoringSaveSnapshot => {
    if (!readyArtifact) {
      throw new Error("Scaffold authoring artifact is not ready.");
    }
    const machine = saveMachineRef.current;
    const lifecycle = publicationLifecycleRef.current;
    if (machine.source !== lifecycle.source) {
      throw new Error("Scaffold authoring save source is not current.");
    }
    const sequence = machine.reserveSequence();
    const content = structuredClone(readLatestContent());
    const payload = createArtifactSavePayload({
      artifact: toSaveableArtifact({
        artifact: readyArtifact,
        title: titleRef.current,
        content,
      }),
    });
    return {
      generation: lifecycle.generation,
      payload,
      saveArtifact: services.artifactPersistence.saveArtifact,
      sequence,
      source: lifecycle.source,
    };
  }, [readLatestContent, readyArtifact, services.artifactPersistence.saveArtifact]);

  const drainSaveCoordinator = useCallback(
    async (machine: AuthoringSaveMachine): Promise<void> => {
      if (!machine.beginDrain()) return;
      try {
        while (true) {
          const snapshot = machine.takeNext();
          if (!snapshot) break;
          let result: ArtifactSaveResult | null = null;
          try {
            result = await snapshot.saveArtifact(snapshot.payload);
          } catch {
            result = null;
          }
          machine.finishInFlight(snapshot);

          if (
            !machine.isActive() ||
            saveMachineRef.current !== machine ||
            publicationLifecycleRef.current.source !== snapshot.source
          ) {
            machine.deactivate();
            break;
          }

          if (result) {
            if (
              !machine.hasPending() &&
              !invalidWorkingStateRef.current.value &&
              publicationLifecycleRef.current.generation === snapshot.generation
            ) {
              machine.settleThrough(snapshot.sequence, true);
              publicationLifecycleRef.current.savedGeneration = snapshot.generation;
              publicationLifecycleRef.current.savedRevision = result.artifactRevision;
              setPublicationStatus((current) =>
                current
                  ? { ...current, currentArtifactRevision: result.artifactRevision }
                  : current,
              );
              if (typeof result.artifact?.title === "string" && result.artifact.title) {
                setTitleForCurrentArtifact(result.artifact.title);
              }
              setPublishActionState(null);
              setResolvedSaveState("saved");
              refreshPublicationLifecycleView();
            } else if (!invalidWorkingStateRef.current.value) {
              setResolvedSaveState("saving");
            }
          } else if (
            !machine.hasPending() &&
            publicationLifecycleRef.current.generation === snapshot.generation
          ) {
            machine.settleThrough(snapshot.sequence, false);
            if (!invalidWorkingStateRef.current.value) setResolvedSaveState("error");
          }
        }
      } finally {
        machine.finishDrain();
      }
    },
    [refreshPublicationLifecycleView, setResolvedSaveState, setTitleForCurrentArtifact],
  );

  const handleDocumentError = useCallback(
    (_failure: CourseDocumentAuthoringFailure) => {
      invalidWorkingStateRef.current.value = true;
      publicationLifecycleRef.current.generation += 1;
      publicationNotificationIdRef.current = null;
      saveMachineRef.current.invalidate();
      setPublishActionState("invalid");
      refreshPublicationLifecycleView();
      if (autosaveTimeoutRef.current !== null) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
      setResolvedSaveState("error");
    },
    [refreshPublicationLifecycleView, setResolvedSaveState],
  );

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (invalidWorkingStateRef.current.value) {
      setResolvedSaveState("error");
      return false;
    }
    let snapshot: AuthoringSaveSnapshot;
    try {
      snapshot = captureSaveSnapshot();
    } catch {
      setResolvedSaveState("error");
      return false;
    }
    const machine = saveMachineRef.current;
    if (!machine.isActive()) return false;
    const outcome = machine.enqueue(snapshot);
    setResolvedSaveState("saving");
    void drainSaveCoordinator(machine);
    return outcome;
  }, [captureSaveSnapshot, drainSaveCoordinator, setResolvedSaveState]);

  const scheduleAutosave = useCallback(() => {
    if (invalidWorkingStateRef.current.value) {
      setResolvedSaveState("error");
      return;
    }
    setResolvedSaveState("saving");
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
    }
    autosaveTimeoutRef.current = window.setTimeout(() => {
      autosaveTimeoutRef.current = null;
      void saveNow();
    }, SAVE_DEBOUNCE_MS);
  }, [saveNow, setResolvedSaveState]);

  const handleCanonicalUpdate = useCallback(
    (content: JSONContent) => {
      invalidWorkingStateRef.current.value = false;
      publicationLifecycleRef.current.generation += 1;
      publicationNotificationIdRef.current = null;
      setPublishActionState(null);
      refreshPublicationLifecycleView();
      latestContentRef.current = {
        source: contentSessionSource,
        value: content,
      };
      if (!hydratingRef.current) scheduleAutosave();
    },
    [contentSessionSource, refreshPublicationLifecycleView, scheduleAutosave],
  );

  const handleEditorChange = useCallback(
    (nextEditor: TiptapEditor) => {
      latestEditorRef.current = nextEditor;
      const nextTheme = readPersistedCourseTheme(nextEditor);
      queueMicrotask(() => {
        if (latestEditorRef.current !== nextEditor) return;
        if (nextTheme) {
          setCourseThemeState((current) =>
            current.source === readyArtifact && current.value === nextTheme
              ? current
              : { source: readyArtifact, value: nextTheme },
          );
        }
      });
    },
    [readyArtifact],
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
      nextServices: ScaffoldPreviewHostServices | null,
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
      const remount = prepareCourseDocumentAuthoringMount(
        readLatestContent(),
        authoringEnvironment,
        productAccess,
      );
      if (
        remount.status === "invalid" ||
        remount.status === "requires-scaffold-plus" ||
        remount.status === "unsupported-core-format"
      ) {
        setPreviewStateStatus("error");
        return;
      }
      setAuthoringMountState({ source: readyArtifact, mount: remount.mount });
      setPreviewState(false, null, null);
      setPreviewStateStatus("idle");
      return;
    }

    if (!editor || !activeAuthoringMount) return;

    if (invalidWorkingStateRef.current.value) {
      setPreviewStateStatus("error");
      return;
    }

    setPreviewStateStatus("loading");
    const currentContent = toJsonDocument(readLatestContent());
    void Promise.resolve()
      .then(async () => {
        const mountState = getCourseDocumentAuthoringMountState(activeAuthoringMount);
        const readiness = checkLearnerProjectionReadiness({
          workingDocument: currentContent,
          capabilities:
            getCourseDocumentAuthoringEnvironmentState(authoringEnvironment).capabilities,
          authoringSchema: getCourseDocumentAuthoringEnvironmentState(authoringEnvironment).schema,
          expectedRequiresScaffoldPlus: mountState.expectedRequiresScaffoldPlus,
          productAccess: mountState.productAccess,
        });
        const publication = projectLearnerPublication(
          readiness,
          application.capabilities.blocks.registry,
          application.capabilities.surfaces.registry,
        );
        switch (publication.status) {
          case "unavailable-content":
            setPreviewUnavailableContent(publication.unavailableContent);
            setPreviewStateStatus("unavailable-content");
            return;
          case "invalid":
          case "unsupported-core-format":
            setPreviewUnavailableContent([]);
            setPreviewStateStatus("error");
            return;
          case "requires-scaffold-plus":
            setPreviewUnavailableContent([]);
            setPreviewStateStatus("requires-scaffold-plus");
            return;
          case "supported":
            break;
        }
        if (publication.warnings.length > 0) {
          setPreviewUnavailableContent([]);
          setPreviewStateStatus("error");
          return;
        }
        validateLearnerPublicationPayloadSize(publication);
        await loadScaffoldAuthorPreviewApp();
        const nextContent = {
          assessmentGroups: publication.assessmentGroups,
          assessmentTargets: publication.assessmentTargets,
          learnerContent: publication.learnerContent,
        };
        const resolvedServices = createPreviewServices
          ? await createPreviewServices(nextContent)
          : { media: services.media ?? null };
        const nextServices = withoutLearningEventCapability(resolvedServices);
        latestEditorRef.current = null;
        setEditor(null);
        setPreviewState(true, nextContent, nextServices);
        setPreviewUnavailableContent([]);
        setPreviewStateStatus("idle");
      })
      .catch(() => {
        setPreviewStateStatus("error");
      });
  }, [
    application,
    activeAuthoringMount,
    authoringEnvironment,
    editor,
    createPreviewServices,
    preview,
    productAccess,
    readLatestContent,
    readyArtifact,
    setPreviewState,
    services.media,
  ]);

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
    if (publishInFlightRef.current) return false;
    if (!publicationStatus || !activeAuthoringMount) {
      setPublishActionState("loading");
      return false;
    }
    if (invalidWorkingStateRef.current.value) {
      setPublishActionState("invalid");
      return false;
    }
    if (saveMachineRef.current.isBusy()) {
      setPublishActionState("unsaved");
      return false;
    }

    const lifecycle = publicationLifecycleRef.current;
    if (
      lifecycle.savedGeneration === null ||
      lifecycle.savedGeneration !== lifecycle.generation ||
      lifecycle.savedRevision === null
    ) {
      setPublishActionState("unsaved");
      return false;
    }
    if (lifecycle.savedRevision !== publicationStatus.currentArtifactRevision) {
      setPublishActionState("stale-artifact-revision");
      return false;
    }

    const source = lifecycle.source;
    const generation = lifecycle.generation;
    const sourceArtifactRevision = lifecycle.savedRevision;
    const currentContent = toJsonDocument(readLatestContent());
    const mountState = getCourseDocumentAuthoringMountState(activeAuthoringMount);
    const environmentState = getCourseDocumentAuthoringEnvironmentState(authoringEnvironment);
    const readiness = checkLearnerProjectionReadiness({
      workingDocument: currentContent,
      capabilities: environmentState.capabilities,
      authoringSchema: environmentState.schema,
      expectedRequiresScaffoldPlus: mountState.expectedRequiresScaffoldPlus,
      productAccess: mountState.productAccess,
    });
    const projection = projectLearnerPublication(
      readiness,
      application.capabilities.blocks.registry,
      application.capabilities.surfaces.registry,
    );
    if (projection.status !== "supported") {
      setPublishActionState(publicationRefusalState(projection.status));
      return false;
    }
    if (projection.warnings.length > 0) {
      setPublishActionState("projection-warning");
      return false;
    }

    try {
      validateLearnerPublicationPayloadSize(projection);
    } catch {
      setPublishActionState("payload-too-large");
      return false;
    }

    const courseAttrs = CourseDocumentAttrsSchema.parse(currentContent.content?.[0]?.attrs);
    const payload: LearnerPublicationPayload = {
      sourceArtifactRevision,
      artifact: {
        id: readyArtifact!.id,
        title: titleRef.current,
        mode: readyArtifact!.mode,
        requiresScaffoldPlus: courseAttrs.requiresScaffoldPlus,
      },
      learnerContent: projection.learnerContent,
      assessmentTargets: projection.assessmentTargets,
      assessmentGroups: projection.assessmentGroups,
    };

    publishInFlightRef.current = true;
    setPublishActionState("publishing");
    try {
      const status = await services.learnerPublication.publish(payload);
      setPublicationStatus(status);
      if (
        publicationLifecycleRef.current.source === source &&
        publicationLifecycleRef.current.generation === generation &&
        !invalidWorkingStateRef.current.value
      ) {
        setPublishActionState(null);
      } else {
        setPublishActionState("unsaved");
      }
      const published = status.publishedArtifactRevision === sourceArtifactRevision;
      notifyPublicationOutcome(
        published ? "success" : "error",
        published ? "Publication complete" : "Publication failed",
        published ? "This version is now live for learners." : "Try again.",
      );
      return published;
    } catch (error) {
      setPublishActionState(readPublicationPortErrorCode(error) ?? "error");
      notifyPublicationOutcome("error", "Publication failed", "Try again.");
      return false;
    } finally {
      publishInFlightRef.current = false;
    }
  }, [
    activeAuthoringMount,
    application.capabilities.blocks.registry,
    application.capabilities.surfaces.registry,
    authoringEnvironment,
    notifyPublicationOutcome,
    publicationStatus,
    readLatestContent,
    readyArtifact,
    services.learnerPublication,
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

  const handleOutlineClose = useCallback(() => {
    setOutlineOpen(false);
    requestAnimationFrame(() => outlineToggleRef.current?.focus());
  }, []);

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

  const publishState =
    publishActionState ??
    derivePublishState({
      invalidWorkingState: invalidWorkingStateRef.current.value,
      lifecycle: publicationLifecycleRef.current,
      saveInProgress: saveMachineRef.current.isBusy(),
      status: publicationStatus,
    });
  const hostActionSlots = hostHeaderActions?.({ preview, saveNow, saveState, title });

  const appHeaderActions = (
    <div className="sc-scaffold-authoring-actions">
      {hostActionSlots?.utility ? (
        <div
          className="sc-scaffold-authoring-action-group"
          data-authoring-action-group="utility"
          role="group"
          aria-label="Host tools"
        >
          {hostActionSlots.utility}
        </div>
      ) : null}
      <div
        className="sc-scaffold-authoring-action-group"
        data-authoring-action-group="appearance"
        role="group"
        aria-label="Appearance"
      >
        {courseTheme ? (
          <CourseThemePanel
            editor={editor}
            designs={builtInCourseDesignThemeRegistry}
            colourSystems={builtInCourseColourSystemRegistry}
            theme={courseTheme}
            onThemeChange={(nextTheme) => {
              setCourseThemeState({ source: readyArtifact, value: nextTheme });
            }}
          />
        ) : null}
        <AuthoringColorModeButton
          mode={applicationColorMode}
          onToggle={toggleApplicationColorMode}
        />
      </div>
      {!preview ? (
        <div
          className="sc-scaffold-authoring-action-group"
          data-authoring-action-group="workspace"
          role="group"
          aria-label="Workspace"
        >
          <button
            ref={outlineToggleRef}
            type="button"
            onClick={() => setOutlineOpen((open) => !open)}
            aria-pressed={outlineOpen}
            aria-label={outlineOpen ? "Hide Document Outline" : "Show Document Outline"}
            title="Toggle Document Outline"
            className="sc-scaffold-authoring-action"
            data-compact-label
            data-state={outlineOpen ? "active-muted" : "default"}
          >
            <ListBullets size={iconSm} aria-hidden />
            <span className="sc-scaffold-authoring-action-label">Outline</span>
          </button>
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
        </div>
      ) : null}
      <div
        className="sc-scaffold-authoring-action-group"
        data-authoring-action-group="release"
        role="group"
        aria-label="Preview and publishing"
      >
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
            {preview ? (
              <PencilSimple size={iconSm} aria-hidden />
            ) : (
              <Eye size={iconSm} aria-hidden />
            )}
            <span className="sc-scaffold-authoring-action-label">
              {preview ? "Edit" : previewState === "loading" ? "Preparing..." : "Preview"}
            </span>
          </button>
        ) : null}
        {hostActionSlots?.beforePublish}
        <AuthoringPublishAction onPublish={publishNow} publishState={publishState} />
        {hostActionSlots?.afterPublish}
      </div>
      {previewState === "error" ? (
        <span role="alert">Preview could not be prepared. Try again.</span>
      ) : null}
      {previewState === "unavailable-content" ? (
        <span role="alert">{formatUnavailablePreviewMessage(previewUnavailableContent)}</span>
      ) : null}
      {previewState === "requires-scaffold-plus" ? (
        <span role="alert">Preview requires Scaffold Plus.</span>
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
            publication: {
              status: "supported" as const,
              learnerContent: previewContent.learnerContent,
            },
          },
          content: previewContent,
        }
      : null;
  const authoringUnavailableState =
    preparedArtifact.status === "requires-scaffold-plus"
      ? {
          title: "Scaffold Plus is required",
          description: "This course requires Scaffold Plus.",
        }
      : preparedArtifact.status === "invalid"
        ? {
            title: "This document couldn’t be opened",
            description: "The saved course structure is invalid.",
          }
        : preparedArtifact.status === "unsupported-core-format"
          ? {
              title: "This document couldn’t be opened",
              description: "This document uses a Scaffold format this editor does not support.",
            }
          : preparedArtifact.status === "uninitialized"
            ? {
                title: "This document couldn’t be opened",
                description: "This document does not contain Scaffold content.",
              }
            : null;

  return (
    <OverlayBoundary container={applicationElement} kind="viewport">
      <Header
        title={title}
        onTitleChange={(nextTitle) => {
          setTitleForCurrentArtifact(nextTitle);
          titleRef.current = nextTitle;
          if (!readyArtifact) return;
          publicationLifecycleRef.current.generation += 1;
          publicationNotificationIdRef.current = null;
          setPublishActionState(null);
          refreshPublicationLifecycleView();
          scheduleAutosave();
        }}
        brandSurface={applicationColorMode}
        saveState={saveState}
        actions={appHeaderActions}
      />

      <main className={cn("sc-scaffold-authoring-main", mainClassName)}>
        <div
          className={cn("sc-scaffold-authoring-workspace", workspaceClassName)}
          data-preview-mode={activePreviewContent?.bootstrap.mode}
        >
          <ScaffoldServicesProvider ports={providerPorts}>
            {authoringUnavailableState && !readyArtifact ? (
              <ScaffoldAuthoringUnavailable {...authoringUnavailableState} />
            ) : activePreviewContent && previewServices ? (
              <Suspense fallback={<AppShellState kind="loading" title="Preparing preview" />}>
                <LazyScaffoldAuthorPreviewApp
                  composition={application.runtime}
                  bootstrap={activePreviewContent.bootstrap}
                  hostColorMode={applicationColorMode}
                  productAccess={productAccess}
                  slideshowSizing="contained"
                  services={previewServices}
                />
              </Suspense>
            ) : readyArtifact && activeAuthoringMount ? (
              <ContentAuthorHost
                agentIntegration={ScaffoldUnavailableAgentIntegration}
                {...(outlineOpen ? { authoringNavigatorDock: renderAuthoringNavigatorDock } : {})}
                artifactId={resolvedArtifactId}
                mount={activeAuthoringMount}
                courseAppearance={applicationColorMode}
                onChange={handleEditorChange}
                onEditorReady={handleEditorReady}
                onDocumentError={handleDocumentError}
                onUpdate={handleCanonicalUpdate}
                agentOpen={resolvedAgentOpen}
                onAgentClose={handleAgentClose}
                scrollModel={scrollModel}
                leftRail={renderLeftRail}
                rightRail={renderRightRail}
              />
            ) : null}
          </ScaffoldServicesProvider>
        </div>
      </main>
    </OverlayBoundary>
  );
}

function ScaffoldAuthoringUnavailable({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <AppShellState
      description={description}
      kind="error"
      testId="scaffold-authoring-unavailable"
      title={title}
    />
  );
}

function derivePublishState({
  invalidWorkingState,
  lifecycle,
  saveInProgress,
  status,
}: {
  invalidWorkingState: boolean;
  lifecycle: {
    generation: number;
    savedGeneration: number | null;
    savedRevision: ArtifactRevision | null;
  };
  saveInProgress: boolean;
  status: LearnerPublicationStatus | null;
}): ScaffoldAuthoringPublishState {
  if (invalidWorkingState) return "invalid";
  if (!status) return "loading";
  if (saveInProgress) return "unsaved";
  if (
    lifecycle.savedGeneration === null ||
    lifecycle.savedGeneration !== lifecycle.generation ||
    lifecycle.savedRevision === null
  ) {
    return "unsaved";
  }
  if (lifecycle.savedRevision !== status.currentArtifactRevision) {
    return "stale-artifact-revision";
  }
  if (status.publishedArtifactRevision === null) return "not-published";
  return status.publishedArtifactRevision === status.currentArtifactRevision
    ? "published"
    : "unpublished";
}

function publicationRefusalState(
  status: "unavailable-content" | "invalid" | "unsupported-core-format" | "requires-scaffold-plus",
): ScaffoldAuthoringPublishState {
  return status;
}

function readPublicationPortErrorCode(error: unknown): LearnerPublicationPortErrorCode | null {
  if (!error || typeof error !== "object") return null;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    const code =
      descriptor?.get === undefined && descriptor?.set === undefined ? descriptor?.value : null;
    return code === "stale-artifact-revision" || code === "forbidden" || code === "invalid-payload"
      ? code
      : null;
  } catch {
    return null;
  }
}

function formatUnavailablePreviewMessage(content: readonly UnavailableContentRef[]): string {
  const kinds = ["block", "layout", "surface"] as const;
  const parts = kinds.flatMap((kind) => {
    const count = content.filter((item) => item.kind === kind).length;
    return count === 0
      ? []
      : [`${count} ${kind} ${count === 1 ? "capability is" : "capabilities are"} not installed`];
  });
  return `Preview unavailable: ${parts.join(", ")}.`;
}

function readPersistedCourseTheme(editor: TiptapEditor): PersistedCourseTheme | null {
  const theme = editor.state.doc.firstChild?.attrs["theme"];
  return PersistedCourseThemeSchema.safeParse(theme).success
    ? (theme as PersistedCourseTheme)
    : null;
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

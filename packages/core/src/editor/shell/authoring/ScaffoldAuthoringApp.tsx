import type { JSONContent } from "@tiptap/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AssessmentGroupContract, AssessmentTargetContract } from "@scaffold/contracts";

import type { ScaffoldApplication } from "@/composition/application/create-scaffold-application";
import { createCourseDocumentAuthoringEnvironment } from "@/composition/authoring/create-authoring-composition";
import { prepareScaffoldArtifactForAuthoring } from "@/document/authoring/prepare-scaffold-artifact-for-authoring";
import type { EditorShellScrollModel } from "@/editor/shell/chrome/EditorShell";
import { createShellLayoutStore } from "@/editor/shell/layout/shell-layout-store";
import { ShellLayoutProvider } from "@/editor/shell/layout/ShellLayoutProvider";
import type { ScaffoldAuthoringArtifact, ScaffoldAuthoringHostServices } from "@/host/contracts";
import type { ScaffoldProductAccess } from "@/host/contracts/product-access";
import type { ArtifactRevision } from "@/host/ports";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";
import { useAuthoringColorMode } from "@/theme/state/authoring-color-mode";
import { AppNotificationsProvider } from "@/ui/components/app/AppNotifications/AppNotifications";
import { AppShellState } from "@/ui/components/app/AppShellState/AppShellState";
import { OverlayBoundary } from "@/ui/overlays/OverlayBoundary";
import { cn } from "@/lib/cn";

import { AuthoringSession } from "./AuthoringSession";
import type {
  ScaffoldAuthoringHostActionSlots,
  ScaffoldAuthoringHostActionsContext,
} from "./AuthoringHeaderActions";
import type { AuthorPreviewHostServices } from "./author-preview-preparation";
import "./ScaffoldAuthoringApp.css";

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

type ScaffoldPreviewHostServices = AuthorPreviewHostServices;

export type ScaffoldPreviewServicesFactory = (
  content: ScaffoldLearnerPreviewContent,
) => ScaffoldPreviewHostServices | Promise<ScaffoldPreviewHostServices>;

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

export interface ScaffoldAuthoringAppEntryProps extends ScaffoldAuthoringAppProps {
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

export interface ScaffoldAuthoringAppSessionContentProps extends ScaffoldAuthoringAppEntryProps {
  readonly applicationColorMode: ScaffoldColorMode;
  readonly applicationElement: HTMLDivElement | null;
  readonly toggleApplicationColorMode: () => void;
}

function ScaffoldAuthoringAppSessionContent(props: ScaffoldAuthoringAppSessionContentProps) {
  const { agentOpen = false, onAgentOpenChange } = props;
  const [store] = useState(() => createShellLayoutStore({ rightDock: agentOpen ? "agent" : null }));
  const agentOpenRef = useRef(agentOpen);
  agentOpenRef.current = agentOpen;
  useEffect(() => {
    if (!onAgentOpenChange) return;
    const wanted = agentOpen ? "agent" : null;
    if (store.getState().rightDock !== wanted) {
      store.getState().setRightDock(wanted);
    }
  }, [store, agentOpen, onAgentOpenChange]);
  useEffect(() => {
    if (!onAgentOpenChange) return;
    return store.subscribe((state) => {
      const open = state.rightDock === "agent";
      if (open !== agentOpenRef.current) {
        onAgentOpenChange(open);
      }
    });
  }, [store, onAgentOpenChange]);
  return (
    <ShellLayoutProvider store={store}>
      <ScaffoldAuthoringAppSessionLayout {...props} />
    </ShellLayoutProvider>
  );
}

function ScaffoldAuthoringAppSessionLayout(props: ScaffoldAuthoringAppSessionContentProps) {
  const { application, applicationElement, artifact, productAccess } = props;
  const authoringEnvironment = useMemo(
    () => createScaffoldAuthoringAppEnvironment(application),
    [application],
  );
  const preparedArtifact = useMemo(
    () => prepareScaffoldArtifactForAuthoring(artifact, authoringEnvironment, productAccess),
    [artifact, authoringEnvironment, productAccess],
  );
  if (preparedArtifact.status === "supported" || preparedArtifact.status === "unavailable") {
    return (
      <AuthoringSession
        {...props}
        activeAuthoringMount={preparedArtifact.authoringMount}
        authoringEnvironment={authoringEnvironment}
        readyArtifact={preparedArtifact.artifact}
      />
    );
  }

  const unavailable =
    preparedArtifact.status === "requires-scaffold-plus"
      ? {
          title: "Scaffold Plus is required",
          description: "This course requires Scaffold Plus.",
        }
      : preparedArtifact.status === "unsupported-core-format"
        ? {
            title: "This document couldn’t be opened",
            description: "This document uses a Scaffold format this editor does not support.",
          }
        : {
            title: "This document couldn’t be opened",
            description:
              preparedArtifact.status === "invalid"
                ? "The saved course structure is invalid."
                : "This document does not contain Scaffold content.",
          };

  return (
    <OverlayBoundary container={applicationElement} kind="viewport">
      <ScaffoldAuthoringUnavailable {...unavailable} />
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

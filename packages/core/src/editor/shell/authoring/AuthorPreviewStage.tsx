import { lazy, Suspense, useCallback, useMemo } from "react";

import type { ScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import type { ScaffoldLearnerBootstrap } from "@/host/contracts";
import type { ScaffoldProductAccess } from "@/host/contracts/product-access";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";
import { AppShellState } from "@/ui/components/app/AppShellState/AppShellState";

import type {
  ActiveAuthorPreview,
  AuthorPreviewSessionController,
} from "./author-preview-session-controller";

function importScaffoldAuthorPreviewApp() {
  return import("@/runtime/app/ScaffoldAuthorPreviewApp").then(
    ({ ScaffoldAuthorPreviewApp, createSlideshowRuntimeProgramSource }) => ({
      ScaffoldAuthorPreviewApp,
      createSlideshowRuntimeProgramSource,
    }),
  );
}

let runtimeModulePromise: ReturnType<typeof importScaffoldAuthorPreviewApp> | null = null;

export function loadAuthorPreviewRuntimeModule() {
  runtimeModulePromise ??= importScaffoldAuthorPreviewApp().catch((error: unknown) => {
    runtimeModulePromise = null;
    throw error;
  });
  return runtimeModulePromise;
}

const LazyScaffoldAuthorPreviewApp = lazy(() =>
  loadAuthorPreviewRuntimeModule().then(({ ScaffoldAuthorPreviewApp }) => ({
    default: ScaffoldAuthorPreviewApp,
  })),
);

export interface AuthorPreviewStageProps {
  readonly active: ActiveAuthorPreview;
  readonly executionEnabled: boolean;
  readonly artifactId: string;
  readonly title: string;
  readonly mode: ScaffoldLearnerBootstrap["mode"];
  readonly composition: ScaffoldRuntimeComposition;
  readonly hostColorMode: ScaffoldColorMode;
  readonly productAccess: ScaffoldProductAccess;
  readonly session: Pick<
    AuthorPreviewSessionController,
    "connectPresentationPlayback" | "connectLearnerInteractionReports" | "showSurface"
  >;
}

/** Renders one author-preview attempt and binds only generation-scoped runtime connectors. */
export function AuthorPreviewStage({
  active,
  executionEnabled,
  artifactId,
  title,
  mode,
  composition,
  hostColorMode,
  productAccess,
  session,
}: AuthorPreviewStageProps) {
  const runtimeGeneration = active.runtimeGeneration;
  const requestSurfaceChange = useCallback(
    (surfaceId: ActiveAuthorPreview["surfaceId"]) => {
      void session.showSurface(surfaceId);
    },
    [session],
  );
  const connectPresentationPlayback = useCallback(
    (port: Parameters<AuthorPreviewSessionController["connectPresentationPlayback"]>[1]) => {
      session.connectPresentationPlayback(runtimeGeneration, port);
    },
    [runtimeGeneration, session],
  );
  const connectLearnerInteractionReports = useCallback(
    (port: Parameters<AuthorPreviewSessionController["connectLearnerInteractionReports"]>[1]) => {
      session.connectLearnerInteractionReports(runtimeGeneration, port);
    },
    [runtimeGeneration, session],
  );
  const publication = useMemo(
    () => ({ status: "supported" as const, learnerContent: active.content.learnerContent }),
    [active.content.learnerContent],
  );
  const bootstrap = useMemo(
    () => ({ artifactId, title, mode, publication }),
    [artifactId, mode, publication, title],
  );
  const authorPreviewRuntimeMount = useMemo(
    () => ({
      initialSurfaceId: active.surfaceId,
      executionEnabled,
      onSurfaceChangeRequest: requestSurfaceChange,
      ...(active.program ? { programSource: active.program } : {}),
      onPresentationPlaybackPortChange: connectPresentationPlayback,
      onLearnerInteractionReportsPortChange: connectLearnerInteractionReports,
    }),
    [
      active.program,
      active.surfaceId,
      connectLearnerInteractionReports,
      connectPresentationPlayback,
      executionEnabled,
      requestSurfaceChange,
    ],
  );
  return (
    <Suspense fallback={<AppShellState kind="loading" title="Preparing preview" />}>
      <LazyScaffoldAuthorPreviewApp
        key={active.entryId}
        composition={composition}
        bootstrap={bootstrap}
        hostColorMode={hostColorMode}
        productAccess={productAccess}
        slideshowSizing="contained"
        services={active.services}
        authorPreviewRuntimeMount={authorPreviewRuntimeMount}
      />
    </Suspense>
  );
}

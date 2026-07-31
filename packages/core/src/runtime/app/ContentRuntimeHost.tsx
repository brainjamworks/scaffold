import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";

import {
  validateCourseSurfaceLifecycle,
  type CourseDocumentIssue,
} from "@/document/model/validation";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { CourseDocumentAttrsSchema } from "@/schemas/course-document";
import {
  createThemeCatalogue,
  resolveCourseTheme,
  type ResolvedCourseTheme,
  type ScaffoldColorMode,
  type ScaffoldThemeExtension,
} from "@/theme/model";
import {
  useLearnerColorMode,
  type ScaffoldLearnerColorModeProps,
} from "@/theme/state/learner-color-mode";

import { AssessmentRuntimeProvider } from "../assessment/AssessmentRuntimeProvider";
import {
  LearnerActivityReadinessGate,
  LearnerActivityRuntimeProvider,
} from "../learner-activity/LearnerActivityRuntimeProvider";
import { selectRuntimePlayer } from "../players/player-selection";
import type {
  RuntimePlayerSelection,
  RuntimePlayerUnavailableReason,
  SlideshowPlayerSizing,
} from "../players/player-types";
import { PagePlayer } from "../players/page/PagePlayer";
import { SlideshowPlayer } from "../players/slideshow/SlideshowPlayer";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import {
  XapiRuntimeProvider,
  buildSurfaceExperiencedStatementDraft,
  useXapiSession,
  type XapiSession,
} from "../xapi";

export interface ContentRuntimeHostProps extends ScaffoldLearnerColorModeProps {
  artifactId?: string | null;
  courseTitle?: string | null;
  initialAssessmentSnapshot?: unknown;
  initialLearnerActivitySnapshot?: unknown;
  initialContent: JSONContent | null;
  slideshowSizing?: SlideshowPlayerSizing;
  onEditorReady?: (editor: TiptapEditor) => void;
  themeExtension?: ScaffoldThemeExtension;
}

export function ContentRuntimeHost({
  artifactId,
  courseTitle,
  initialAssessmentSnapshot,
  initialLearnerActivitySnapshot,
  initialContent,
  hostColorMode,
  slideshowSizing,
  onEditorReady,
  themeExtension,
}: ContentRuntimeHostProps) {
  const colorMode = useLearnerColorMode(hostColorMode);
  const themeCatalogue = useMemo(() => createThemeCatalogue(themeExtension), [themeExtension]);
  const runtimeArtifactId = artifactId ?? null;
  if (!initialContent) {
    return (
      <div data-testid="scaffold-runtime-host">
        <ContentRuntimeUnavailable reason="missing-initial-content" />
      </div>
    );
  }

  const validation = validateCourseSurfaceLifecycle({
    content: initialContent,
    registry: builtInSurfaceVariantRegistry,
  });
  if (!validation.ok) {
    return (
      <div data-testid="scaffold-runtime-host">
        <ContentRuntimeUnavailable reason={unavailableReasonFromIssues(validation.issues)} />
      </div>
    );
  }

  const playerSelection = selectRuntimePlayer(validation.value);
  const courseDocumentAttrs = CourseDocumentAttrsSchema.parse(initialContent.content?.[0]?.attrs);
  const resolvedTheme = resolveCourseTheme({
    catalogue: themeCatalogue,
    mode: colorMode,
    theme: courseDocumentAttrs.theme,
  });

  return (
    <ScaffoldArtifactIdentityProvider artifactId={runtimeArtifactId}>
      <XapiRuntimeProvider {...(courseTitle === undefined ? {} : { courseTitle })}>
        <AssessmentRuntimeProvider
          {...(initialAssessmentSnapshot === undefined
            ? {}
            : { initialSnapshot: initialAssessmentSnapshot })}
        >
          <LearnerActivityRuntimeProvider
            {...(initialLearnerActivitySnapshot === undefined
              ? {}
              : { initialSnapshot: initialLearnerActivitySnapshot })}
          >
            <LearnerActivityReadinessGate>
              <HydratedRuntimePlayer
                initialContent={initialContent}
                playerSelection={playerSelection}
                colorMode={colorMode}
                resolvedTheme={resolvedTheme}
                runtimeArtifactId={runtimeArtifactId}
                {...(onEditorReady ? { onEditorReady } : {})}
                {...(slideshowSizing ? { slideshowSizing } : {})}
              />
            </LearnerActivityReadinessGate>
          </LearnerActivityRuntimeProvider>
        </AssessmentRuntimeProvider>
      </XapiRuntimeProvider>
    </ScaffoldArtifactIdentityProvider>
  );
}

interface HydratedRuntimePlayerProps {
  readonly colorMode: ScaffoldColorMode;
  readonly initialContent: JSONContent;
  readonly onEditorReady?: (editor: TiptapEditor) => void;
  readonly playerSelection: RuntimePlayerSelection;
  readonly runtimeArtifactId: string | null;
  readonly resolvedTheme: ResolvedCourseTheme;
  readonly slideshowSizing?: SlideshowPlayerSizing;
}

function HydratedRuntimePlayer({
  colorMode,
  initialContent,
  onEditorReady,
  playerSelection,
  runtimeArtifactId,
  resolvedTheme,
  slideshowSizing,
}: HydratedRuntimePlayerProps) {
  const xapiSession = useXapiSession();
  const rendererReadyRef = useRef(false);
  const activeSurfaceIdRef = useRef(playerSelection.surfaceIds[0]);
  const recordedSurfaceRef = useRef<{
    session: XapiSession;
    surfaceId: string;
  } | null>(null);
  if (!playerSelection.surfaceIds.includes(activeSurfaceIdRef.current)) {
    activeSurfaceIdRef.current = playerSelection.surfaceIds[0];
  }
  const recordSurfaceExperienced = useCallback(
    (surfaceId: string) => {
      activeSurfaceIdRef.current = surfaceId;
      if (!rendererReadyRef.current || !xapiSession) return;
      const surfaceIndex = playerSelection.surfaceIds.indexOf(surfaceId);
      if (surfaceIndex < 0) return;
      const previous = recordedSurfaceRef.current;
      if (previous?.session === xapiSession && previous.surfaceId === surfaceId) return;

      try {
        xapiSession.record(
          buildSurfaceExperiencedStatementDraft({
            rootActivityId: xapiSession.rootActivityId,
            surfaceId,
            surfaceKind: playerSelection.player === "page" ? "page" : "slide",
            position: surfaceIndex + 1,
            count: playerSelection.surfaceIds.length,
          }),
        );
        recordedSurfaceRef.current = { session: xapiSession, surfaceId };
      } catch {
        // Surface recording is observational and cannot make content unavailable.
      }
    },
    [playerSelection.player, playerSelection.surfaceIds, xapiSession],
  );
  const handleRendererReady = useCallback(
    (editor: TiptapEditor) => {
      rendererReadyRef.current = true;
      xapiSession?.start();
      recordSurfaceExperienced(activeSurfaceIdRef.current);
      onEditorReady?.(editor);
    },
    [onEditorReady, recordSurfaceExperienced, xapiSession],
  );

  useEffect(() => {
    if (rendererReadyRef.current) {
      xapiSession?.start();
      recordSurfaceExperienced(activeSurfaceIdRef.current);
    }
  }, [recordSurfaceExperienced, xapiSession]);

  const runtimeContent =
    playerSelection.player === "page" ? (
      <PagePlayer
        artifactId={runtimeArtifactId}
        initialContent={initialContent}
        resolvedTheme={resolvedTheme}
        onRendererReady={handleRendererReady}
        surfaceId={playerSelection.surfaceIds[0]}
      />
    ) : (
      <SlideshowPlayer
        artifactId={runtimeArtifactId}
        initialContent={initialContent}
        resolvedTheme={resolvedTheme}
        onActiveSurfaceChange={recordSurfaceExperienced}
        onRendererReady={handleRendererReady}
        surfaceIds={playerSelection.surfaceIds}
        {...(slideshowSizing ? { sizing: slideshowSizing } : {})}
      />
    );
  const runtimeThemeStyle: CSSProperties = {
    ...resolvedTheme.cssTokens,
    colorScheme: colorMode,
  };

  return (
    <div
      className="sc-course-theme-scope"
      data-testid="scaffold-runtime-host"
      data-scaffold-color-mode={colorMode}
      style={runtimeThemeStyle}
    >
      {runtimeContent}
    </div>
  );
}

type RuntimeUnavailableReason = RuntimePlayerUnavailableReason;

function unavailableReasonFromIssues(
  issues: readonly CourseDocumentIssue[],
): RuntimeUnavailableReason {
  if (issues.some(({ code }) => code === "unsupported_surface_mode")) {
    return "unsupported-mode";
  }
  if (issues.some(({ code }) => code === "duplicate_surface_id")) {
    return "duplicate-surface-id";
  }
  if (issues.some(({ code }) => code === "invalid_surface_cardinality")) {
    return "invalid-surface-cardinality";
  }
  if (
    issues.some(
      ({ code }) => code === "unknown_surface_variant" || code === "surface_variant_mode_mismatch",
    )
  ) {
    return "invalid-surface-variant";
  }
  if (issues.some(({ code, path }) => code === "invalid_surface_attrs" && path.at(-1) === "id")) {
    return "missing-surface-id";
  }
  if (
    issues.some(({ code, path }) => code === "invalid_surface_attrs" && path.at(-1) === "variant")
  ) {
    return "invalid-surface-variant";
  }
  if (issues.some(({ code }) => code === "invalid_course_document_attrs")) {
    return "invalid-mode";
  }
  return "invalid-course-document";
}

function ContentRuntimeUnavailable({ reason }: { reason: RuntimeUnavailableReason }) {
  return (
    <div
      data-testid="scaffold-runtime-unavailable"
      data-runtime-unavailable-reason={reason}
      role="status"
    >
      This content is unavailable in the current runtime.
    </div>
  );
}

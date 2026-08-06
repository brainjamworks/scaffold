import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";

import type { ScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
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
  SlideshowPlayerSizing,
} from "../players/player-types";
import { PagePlayer } from "../players/page/PagePlayer";
import { SlideshowPlayer } from "../players/slideshow/SlideshowPlayer";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import {
  LearningEventRuntimeProvider,
  useLearningEventReporter,
  type LearningEventReporter,
} from "../learning-events/LearningEventRuntimeProvider";

export interface ContentRuntimeHostProps extends ScaffoldLearnerColorModeProps {
  artifactId?: string | null;
  composition: ScaffoldRuntimeComposition;
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
  composition,
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

  const playerSelection = selectRuntimePlayer(initialContent);
  const courseDocumentAttrs = CourseDocumentAttrsSchema.parse(initialContent.content?.[0]?.attrs);
  const resolvedTheme = resolveCourseTheme({
    catalogue: themeCatalogue,
    mode: colorMode,
    theme: courseDocumentAttrs.theme,
  });

  return (
    <ScaffoldArtifactIdentityProvider artifactId={runtimeArtifactId}>
      <LearningEventRuntimeProvider
        {...(courseTitle === undefined ? {} : { contentTitle: courseTitle })}
      >
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
                composition={composition}
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
      </LearningEventRuntimeProvider>
    </ScaffoldArtifactIdentityProvider>
  );
}

interface HydratedRuntimePlayerProps {
  readonly colorMode: ScaffoldColorMode;
  readonly composition: ScaffoldRuntimeComposition;
  readonly initialContent: JSONContent;
  readonly onEditorReady?: (editor: TiptapEditor) => void;
  readonly playerSelection: RuntimePlayerSelection;
  readonly runtimeArtifactId: string | null;
  readonly resolvedTheme: ResolvedCourseTheme;
  readonly slideshowSizing?: SlideshowPlayerSizing;
}

function HydratedRuntimePlayer({
  colorMode,
  composition,
  initialContent,
  onEditorReady,
  playerSelection,
  runtimeArtifactId,
  resolvedTheme,
  slideshowSizing,
}: HydratedRuntimePlayerProps) {
  const learningEventReporter = useLearningEventReporter();
  const rendererReadyRef = useRef(false);
  const activeSurfaceIdRef = useRef(playerSelection.surfaceIds[0]);
  const recordedSurfaceRef = useRef<{
    reporter: LearningEventReporter;
    surfaceId: string;
  } | null>(null);
  if (!playerSelection.surfaceIds.includes(activeSurfaceIdRef.current)) {
    activeSurfaceIdRef.current = playerSelection.surfaceIds[0];
  }
  const recordSurfaceExperienced = useCallback(
    (surfaceId: string) => {
      const surfaceIndex = playerSelection.surfaceIds.findIndex(
        (candidate) => candidate === surfaceId,
      );
      if (surfaceIndex < 0) return;
      const selectedSurfaceId = playerSelection.surfaceIds[surfaceIndex]!;
      activeSurfaceIdRef.current = selectedSurfaceId;
      if (!rendererReadyRef.current) return;
      const previous = recordedSurfaceRef.current;
      if (previous?.reporter === learningEventReporter && previous.surfaceId === selectedSurfaceId) {
        return;
      }

      try {
        learningEventReporter.report({
          type: "surface.experienced",
          surfaceId: selectedSurfaceId,
          surfaceKind: playerSelection.player === "page" ? "page" : "slide",
          position: surfaceIndex + 1,
          count: playerSelection.surfaceIds.length,
        });
        recordedSurfaceRef.current = {
          reporter: learningEventReporter,
          surfaceId: selectedSurfaceId,
        };
      } catch {
        // Surface recording is observational and cannot make content unavailable.
      }
    },
    [learningEventReporter, playerSelection.player, playerSelection.surfaceIds],
  );
  const handleRendererReady = useCallback(
    (editor: TiptapEditor) => {
      rendererReadyRef.current = true;
      recordSurfaceExperienced(activeSurfaceIdRef.current);
      onEditorReady?.(editor);
    },
    [onEditorReady, recordSurfaceExperienced],
  );

  useEffect(() => {
    if (rendererReadyRef.current) {
      recordSurfaceExperienced(activeSurfaceIdRef.current);
    }
  }, [recordSurfaceExperienced]);

  const runtimeContent =
    playerSelection.player === "page" ? (
      <PagePlayer
        artifactId={runtimeArtifactId}
        composition={composition}
        initialContent={initialContent}
        resolvedTheme={resolvedTheme}
        onRendererReady={handleRendererReady}
        surfaceId={playerSelection.surfaceIds[0]}
      />
    ) : (
      <SlideshowPlayer
        artifactId={runtimeArtifactId}
        composition={composition}
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

function ContentRuntimeUnavailable({ reason }: { reason: "missing-initial-content" }) {
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

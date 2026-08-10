import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { ScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { CourseDocumentAttrsSchema } from "@/schemas/course-document";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";
import { useLearnerColorMode } from "@/theme/state/learner-color-mode";

import { AssessmentRuntimeProvider } from "../assessment/AssessmentRuntimeProvider";
import {
  LearnerActivityReadinessGate,
  LearnerActivityRuntimeProvider,
} from "../learner-activity/LearnerActivityRuntimeProvider";
import { selectRuntimePlayer } from "../players/player-selection";
import type { RuntimePlayerSelection, SlideshowPlayerSizing } from "../players/player-types";
import { PagePlayer } from "../players/page/PagePlayer";
import { SlideshowPlayer } from "../players/slideshow/SlideshowPlayer";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import {
  LearningEventRuntimeProvider,
  useLearningEventReporter,
  type LearningEventReporter,
} from "../learning-events/LearningEventRuntimeProvider";

export interface ContentRuntimeHostProps {
  artifactId?: string | null;
  composition: ScaffoldRuntimeComposition;
  courseTitle?: string | null;
  hostColorMode?: ScaffoldColorMode;
  initialAssessmentSnapshot?: unknown;
  initialLearnerActivitySnapshot?: unknown;
  initialContent: JSONContent | null;
  slideshowSizing?: SlideshowPlayerSizing;
  onEditorReady?: (editor: TiptapEditor) => void;
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
}: ContentRuntimeHostProps) {
  const colorMode = useLearnerColorMode(hostColorMode);
  const runtimeArtifactId = artifactId ?? null;
  const playerSelection = useMemo(
    () => (initialContent ? selectRuntimePlayer(initialContent) : null),
    [initialContent],
  );
  if (!initialContent) {
    return (
      <div className="sc-content-runtime-host" data-testid="scaffold-runtime-host">
        <ContentRuntimeUnavailable reason="missing-initial-content" />
      </div>
    );
  }

  if (!playerSelection) {
    return (
      <div className="sc-content-runtime-host" data-testid="scaffold-runtime-host">
        <ContentRuntimeUnavailable reason="invalid-course-structure" />
      </div>
    );
  }
  const courseDocumentAttrs = CourseDocumentAttrsSchema.parse(initialContent.content?.[0]?.attrs);

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
            <div
              className="sc-content-runtime-host"
              data-testid="scaffold-runtime-host"
              data-scaffold-color-mode={colorMode}
            >
              <CourseThemeProvider
                theme={courseDocumentAttrs.theme}
                appearance={colorMode}
                hasBackground={playerSelection.player !== "page"}
              >
                <LearnerActivityReadinessGate>
                  <HydratedRuntimePlayer
                    composition={composition}
                    initialContent={initialContent}
                    playerSelection={playerSelection}
                    runtimeArtifactId={runtimeArtifactId}
                    {...(onEditorReady ? { onEditorReady } : {})}
                    {...(slideshowSizing ? { slideshowSizing } : {})}
                  />
                </LearnerActivityReadinessGate>
              </CourseThemeProvider>
            </div>
          </LearnerActivityRuntimeProvider>
        </AssessmentRuntimeProvider>
      </LearningEventRuntimeProvider>
    </ScaffoldArtifactIdentityProvider>
  );
}

interface HydratedRuntimePlayerProps {
  readonly composition: ScaffoldRuntimeComposition;
  readonly initialContent: JSONContent;
  readonly onEditorReady?: (editor: TiptapEditor) => void;
  readonly playerSelection: RuntimePlayerSelection;
  readonly runtimeArtifactId: string | null;
  readonly slideshowSizing?: SlideshowPlayerSizing;
}

function HydratedRuntimePlayer({
  composition,
  initialContent,
  onEditorReady,
  playerSelection,
  runtimeArtifactId,
  slideshowSizing,
}: HydratedRuntimePlayerProps) {
  const learningEventReporter = useLearningEventReporter();
  const rendererReadyRef = useRef(false);
  const surfaceIds = playerSelection.structure.surfaceIds;
  const activeSurfaceIdRef = useRef(surfaceIds[0]);
  const recordedSurfaceRef = useRef<{
    reporter: LearningEventReporter;
    surfaceId: string;
  } | null>(null);
  if (!surfaceIds.includes(activeSurfaceIdRef.current)) {
    activeSurfaceIdRef.current = surfaceIds[0];
  }
  const recordSurfaceExperienced = useCallback(
    (surfaceId: string) => {
      const surfaceIndex = surfaceIds.findIndex((candidate) => candidate === surfaceId);
      if (surfaceIndex < 0) return;
      const selectedSurfaceId = surfaceIds[surfaceIndex]!;
      activeSurfaceIdRef.current = selectedSurfaceId;
      if (!rendererReadyRef.current) return;
      const previous = recordedSurfaceRef.current;
      if (
        previous?.reporter === learningEventReporter &&
        previous.surfaceId === selectedSurfaceId
      ) {
        return;
      }

      try {
        learningEventReporter.report({
          type: "surface.experienced",
          surfaceId: selectedSurfaceId,
          surfaceKind: playerSelection.player === "page" ? "page" : "slide",
          position: surfaceIndex + 1,
          count: surfaceIds.length,
        });
        recordedSurfaceRef.current = {
          reporter: learningEventReporter,
          surfaceId: selectedSurfaceId,
        };
      } catch {
        // Surface recording is observational and cannot make content unavailable.
      }
    },
    [learningEventReporter, playerSelection.player, surfaceIds],
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
        onRendererReady={handleRendererReady}
        surfaceId={playerSelection.structure.surfaceIds[0]}
      />
    ) : (
      <SlideshowPlayer
        artifactId={runtimeArtifactId}
        composition={composition}
        initialContent={initialContent}
        onActiveSurfaceChange={recordSurfaceExperienced}
        onRendererReady={handleRendererReady}
        structure={playerSelection.structure}
        {...(slideshowSizing ? { sizing: slideshowSizing } : {})}
      />
    );
  return runtimeContent;
}

function ContentRuntimeUnavailable({
  reason,
}: {
  reason: "invalid-course-structure" | "missing-initial-content";
}) {
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

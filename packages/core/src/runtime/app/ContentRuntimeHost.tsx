import type { Editor as TiptapEditor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { ScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import type { SurfaceId } from "@/document/model/course-structure";
import type { ScaffoldLearnerPublication } from "@/host/contracts";
import type { ScaffoldProductAccess } from "@/host/contracts/product-access";
import { CourseDocumentAttrsSchema } from "@/schemas/course-document";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";
import { useLearnerColorMode } from "@/theme/state/learner-color-mode";
import {
  prepareRuntimeLearnerPublication,
  type PreparedRuntimeDocument,
} from "../renderer/CourseDocumentRuntimeRenderer";

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
  publication: ScaffoldLearnerPublication;
  productAccess: ScaffoldProductAccess;
  slideshowSizing?: SlideshowPlayerSizing;
  onEditorReady?: (editor: TiptapEditor) => void;
}

export function ContentRuntimeHost({
  artifactId,
  composition,
  courseTitle,
  initialAssessmentSnapshot,
  initialLearnerActivitySnapshot,
  publication,
  productAccess,
  hostColorMode,
  slideshowSizing,
  onEditorReady,
}: ContentRuntimeHostProps) {
  const colorMode = useLearnerColorMode(hostColorMode);
  const runtimeArtifactId = artifactId ?? null;
  const readiness = useMemo(
    () => prepareRuntimeLearnerPublication(publication, composition, productAccess),
    [composition, productAccess, publication],
  );
  const playerSelection = useMemo(
    () =>
      readiness.status === "supported"
        ? selectRuntimePlayer(readiness.preparedDocument.content)
        : null,
    [readiness],
  );
  if (readiness.status !== "supported") {
    return (
      <div className="sc-content-runtime-host" data-testid="scaffold-runtime-host">
        <ContentRuntimeUnavailable
          reason={
            readiness.status === "missing-content" ? "missing-initial-content" : readiness.status
          }
        />
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
  const courseDocumentAttrs = CourseDocumentAttrsSchema.parse(
    readiness.preparedDocument.content.content?.[0]?.attrs,
  );

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
                    preparedDocument={readiness.preparedDocument}
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
  readonly onEditorReady?: (editor: TiptapEditor) => void;
  readonly preparedDocument: PreparedRuntimeDocument;
  readonly playerSelection: RuntimePlayerSelection;
  readonly runtimeArtifactId: string | null;
  readonly slideshowSizing?: SlideshowPlayerSizing;
}

function HydratedRuntimePlayer({
  onEditorReady,
  preparedDocument,
  playerSelection,
  runtimeArtifactId,
  slideshowSizing,
}: HydratedRuntimePlayerProps) {
  const learningEventReporter = useLearningEventReporter();
  const rendererReadyRef = useRef(false);
  const surfaceIds = playerSelection.structure.surfaceIds;
  const activeSurfaceIdRef = useRef<SurfaceId | null>(surfaceIds[0] ?? null);
  const recordedSurfaceRef = useRef<{
    reporter: LearningEventReporter;
    surfaceId: string;
  } | null>(null);
  if (activeSurfaceIdRef.current === null || !surfaceIds.includes(activeSurfaceIdRef.current)) {
    activeSurfaceIdRef.current = surfaceIds[0] ?? null;
  }
  const recordSurfaceExperienced = useCallback(
    (surfaceId: SurfaceId | null) => {
      if (surfaceId === null) {
        activeSurfaceIdRef.current = null;
        return;
      }
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
        preparedDocument={preparedDocument}
        onRendererReady={handleRendererReady}
        surfaceId={playerSelection.structure.surfaceIds[0]}
      />
    ) : (
      <SlideshowPlayer
        artifactId={runtimeArtifactId}
        preparedDocument={preparedDocument}
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
  reason:
    | "invalid-course-structure"
    | "invalid-learner-content"
    | "missing-initial-content"
    | "not-published"
    | "requires-scaffold-plus"
    | "unsupported-core-format"
    | "unavailable-content";
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

import type { Editor as TiptapEditor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getRuntimeSemanticDocumentSourceForEditor } from "@/composition/runtime/create-runtime-composition";
import type { ScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { getControlCapabilityCatalogueForEditor } from "@/document/control-binding";
import type { SurfaceId } from "@/document/model/course-structure";
import type { ScaffoldLearnerPublication } from "@/host/contracts";
import type { ScaffoldProductAccess } from "@/host/contracts/product-access";
import {
  compileLearnerInteractions,
  type LearnerInteractionPreviewReportsPort,
} from "@/learner-interaction/model";
import type { PresentationPreviewPlaybackPort } from "@/presentation/model";
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
import type { SurfaceExitPolicy } from "../players/slideshow/slideshow-surface-change";
import type { SlideshowSurfaceRuntimeProgramSource } from "../players/slideshow/slideshow-surface-runtime-composition";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import {
  LearningEventRuntimeProvider,
  useLearningEventReporter,
  type LearningEventReporter,
} from "../learning-events/LearningEventRuntimeProvider";

import { createSlideshowRuntimeProgramSource } from "./slideshow-runtime-program-source";

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

/** @internal One author-only runtime mount with independent typed consumer connectors. */
export interface AuthorPreviewRuntimeMount {
  readonly initialSurfaceId: SurfaceId;
  readonly executionEnabled: boolean;
  readonly programSource?: SlideshowSurfaceRuntimeProgramSource;
  readonly onSurfaceChangeRequest: (surfaceId: SurfaceId) => void;
  readonly onPresentationPlaybackPortChange?: (
    port: PresentationPreviewPlaybackPort | null,
  ) => void;
  readonly onLearnerInteractionReportsPortChange?: (
    port: LearnerInteractionPreviewReportsPort | null,
  ) => void;
}

export function ContentRuntimeHost({ ...props }: ContentRuntimeHostProps) {
  return <ContentRuntimeHostWithSurfaceExitPolicy {...props} surfaceExitPolicy="enforce" />;
}

/** @internal Author Preview supplies the only non-enforcing policy. */
export function ContentRuntimeHostWithSurfaceExitPolicy({
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
  surfaceExitPolicy,
  authorPreviewRuntimeMount,
}: ContentRuntimeHostProps & {
  readonly authorPreviewRuntimeMount?: AuthorPreviewRuntimeMount;
  readonly surfaceExitPolicy: SurfaceExitPolicy;
}) {
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
                    surfaceExitPolicy={surfaceExitPolicy}
                    {...(authorPreviewRuntimeMount ? { authorPreviewRuntimeMount } : {})}
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
  readonly surfaceExitPolicy: SurfaceExitPolicy;
  readonly authorPreviewRuntimeMount?: AuthorPreviewRuntimeMount;
}

function HydratedRuntimePlayer({
  onEditorReady,
  preparedDocument,
  playerSelection,
  runtimeArtifactId,
  slideshowSizing,
  surfaceExitPolicy,
  authorPreviewRuntimeMount,
}: HydratedRuntimePlayerProps) {
  const learningEventReporter = useLearningEventReporter();
  const rendererReadyRef = useRef(false);
  const [runtimeProgramOwner, setRuntimeProgramOwner] = useState<{
    readonly preparedDocument: PreparedRuntimeDocument;
    readonly source: SlideshowSurfaceRuntimeProgramSource;
  } | null>(null);
  const surfaceRuntimeProgramSource =
    authorPreviewRuntimeMount?.programSource ??
    (runtimeProgramOwner?.preparedDocument === preparedDocument
      ? runtimeProgramOwner.source
      : undefined);
  const authorPreviewProgramSource = authorPreviewRuntimeMount?.programSource;
  const isAuthorPreview = authorPreviewRuntimeMount !== undefined;
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
      if (playerSelection.player === "slideshow") {
        let source = authorPreviewProgramSource;
        if (!source) {
          const semanticSource = getRuntimeSemanticDocumentSourceForEditor(editor);
          if (semanticSource.courseStructure.kind !== "slideshow") {
            throw new Error("Slideshow runtime semantic source has Page Course Structure.");
          }
          const courseDocument = preparedDocument.content.content?.[0];
          if (courseDocument?.type !== "courseDocument") {
            throw new Error("Learner Interaction runtime requires a Course Document root.");
          }
          const configuration =
            CourseDocumentAttrsSchema.parse(courseDocument.attrs).learnerInteractions ?? null;
          const compilation = compileLearnerInteractions({
            configuration,
            courseStructure: semanticSource.courseStructure,
            semanticSnapshot: semanticSource.semantics,
            controlCapabilities: getControlCapabilityCatalogueForEditor(editor),
          });
          source = createSlideshowRuntimeProgramSource({
            learnerInteractions: compilation.surfaceById,
          });
        }
        if (!isAuthorPreview) {
          setRuntimeProgramOwner({
            preparedDocument,
            source,
          });
        }
      }
      onEditorReady?.(editor);
    },
    [
      authorPreviewProgramSource,
      isAuthorPreview,
      onEditorReady,
      playerSelection.player,
      preparedDocument,
      recordSurfaceExperienced,
    ],
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
        surfaceExitPolicy={surfaceExitPolicy}
        {...(surfaceRuntimeProgramSource ? { surfaceRuntimeProgramSource } : {})}
        {...(authorPreviewRuntimeMount
          ? {
              autoPlayPresentation: false,
              authorPreviewExecutionEnabled: authorPreviewRuntimeMount.executionEnabled,
              initialSurfaceId: authorPreviewRuntimeMount.initialSurfaceId,
              onAuthorPreviewSurfaceChangeRequest: authorPreviewRuntimeMount.onSurfaceChangeRequest,
              ...(authorPreviewRuntimeMount.onPresentationPlaybackPortChange
                ? {
                    onPresentationPreviewPortChange:
                      authorPreviewRuntimeMount.onPresentationPlaybackPortChange,
                  }
                : {}),
              ...(authorPreviewRuntimeMount.onLearnerInteractionReportsPortChange
                ? {
                    onLearnerInteractionReportsPortChange:
                      authorPreviewRuntimeMount.onLearnerInteractionReportsPortChange,
                  }
                : {}),
            }
          : {})}
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

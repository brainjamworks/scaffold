import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";

import {
  validateCourseSurfaceLifecycle,
  type CourseDocumentIssue,
} from "@/document/model/validation";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import { AssessmentRuntimeProvider } from "../assessment/AssessmentRuntimeProvider";
import {
  LearnerActivityReadinessGate,
  LearnerActivityRuntimeProvider,
} from "../learner-activity/LearnerActivityRuntimeProvider";
import { selectRuntimePlayer } from "../players/player-selection";
import type {
  RuntimePlayerUnavailableReason,
  SlideshowPlayerSizing,
} from "../players/player-types";
import { PagePlayer } from "../players/page/PagePlayer";
import { SlideshowPlayer } from "../players/slideshow/SlideshowPlayer";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";

export interface ContentRuntimeHostProps {
  artifactId?: string | null;
  initialAssessmentSnapshot?: unknown;
  initialLearnerActivitySnapshot?: unknown;
  initialContent: JSONContent | null;
  slideshowSizing?: SlideshowPlayerSizing;
  onEditorReady?: (editor: TiptapEditor) => void;
}

export function ContentRuntimeHost({
  artifactId,
  initialAssessmentSnapshot,
  initialLearnerActivitySnapshot,
  initialContent,
  slideshowSizing,
  onEditorReady,
}: ContentRuntimeHostProps) {
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
  const runtimeContent =
    playerSelection.player === "page" ? (
      <PagePlayer
        artifactId={runtimeArtifactId}
        initialContent={initialContent}
        surfaceId={playerSelection.surfaceIds[0]}
        {...(onEditorReady ? { onRendererReady: onEditorReady } : {})}
      />
    ) : (
      <SlideshowPlayer
        artifactId={runtimeArtifactId}
        initialContent={initialContent}
        surfaceIds={playerSelection.surfaceIds}
        {...(slideshowSizing ? { sizing: slideshowSizing } : {})}
        {...(onEditorReady ? { onRendererReady: onEditorReady } : {})}
      />
    );

  return (
    <ScaffoldArtifactIdentityProvider artifactId={runtimeArtifactId}>
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
            <div data-testid="scaffold-runtime-host">{runtimeContent}</div>
          </LearnerActivityReadinessGate>
        </LearnerActivityRuntimeProvider>
      </AssessmentRuntimeProvider>
    </ScaffoldArtifactIdentityProvider>
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

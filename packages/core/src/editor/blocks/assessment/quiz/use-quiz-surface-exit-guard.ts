import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import { useEffect } from "react";

import type { SurfaceId } from "@/document/model/course-structure";
import type { resolveAssessmentSurfaceScope } from "@/runtime/assessment/assessment-scope";
import type {
  AssessmentGroupId,
  AssessmentQuizRegistration,
  AssessmentStoreApi,
} from "@/runtime/assessment/types";
import type {
  SurfaceExitGuard,
  SurfaceExitGuardSnapshot,
} from "@/runtime/players/slideshow/surface-exit-environment";
import { useSurfaceExitEnvironmentAvailability } from "@/runtime/players/slideshow/SurfaceExitEnvironmentProvider";

interface UseQuizSurfaceExitGuardInput {
  readonly editor: Editor;
  readonly enabled: boolean;
  readonly getPos: () => number | undefined;
  readonly groupId: AssessmentGroupId | null;
  readonly resolveSurfaceScope: typeof resolveAssessmentSurfaceScope;
  readonly store: AssessmentStoreApi | null;
}

const allowedSnapshot = Object.freeze({ status: "allowed" } as const);

/** Adapts one mounted Quiz attempt to the owning player's Surface exit lifecycle. */
export function useQuizSurfaceExitGuard({
  editor,
  enabled,
  getPos,
  groupId,
  resolveSurfaceScope,
  store,
}: UseQuizSurfaceExitGuardInput): void {
  const availability = useSurfaceExitEnvironmentAvailability();

  useEffect(() => {
    if (availability.status !== "available" || !enabled || !groupId || !store) return;

    const registration = store.getState().quizRegistrations[groupId];
    if (!registration || registration.targetIds.length === 0) return;
    assertRegistrationIdentity(registration, groupId);

    const surfaceId = requireCurrentQuizSurface({
      authoredGroupId: registration.authoredGroupId,
      editor,
      getPos,
      groupId,
      resolveSurfaceScope,
      store,
    });
    const guard = createQuizSurfaceExitGuard({
      groupId,
      requireCurrentSurface: () => {
        const currentSurfaceId = requireCurrentQuizSurface({
          authoredGroupId: registration.authoredGroupId,
          editor,
          getPos,
          groupId,
          resolveSurfaceScope,
          store,
        });
        if (currentSurfaceId !== surfaceId) {
          throw new Error(`Quiz Surface Exit Guard owner "${groupId}" changed its owning Surface.`);
        }
      },
      store,
      surfaceId,
    });

    return availability.environment.registerGuard(guard);
  }, [availability, editor, enabled, getPos, groupId, resolveSurfaceScope, store]);
}

function createQuizSurfaceExitGuard({
  groupId,
  requireCurrentSurface,
  store,
  surfaceId,
}: {
  readonly groupId: AssessmentGroupId;
  readonly requireCurrentSurface: () => void;
  readonly store: AssessmentStoreApi;
  readonly surfaceId: SurfaceId;
}): SurfaceExitGuard {
  return Object.freeze({
    ownerId: groupId,
    surfaceId,
    getSnapshot(): SurfaceExitGuardSnapshot {
      requireCurrentSurface();
      const attempt = store.getState().durable.quizzes[groupId];
      if (!attempt) return blockedSnapshot(groupId, surfaceId, "not_started");
      if (attempt.groupId !== groupId) {
        throw new Error(
          `Quiz Surface Exit Guard owner "${groupId}" read an attempt for "${attempt.groupId}".`,
        );
      }

      switch (attempt.status) {
        case "in_progress":
          return blockedSnapshot(groupId, surfaceId, "in_progress");
        case "completed":
        case "expired":
          return allowedSnapshot;
      }
    },
    subscribe(listener: () => void) {
      requireCurrentSurface();
      return store.subscribe((state, previousState) => {
        if (state.durable.quizzes[groupId] === previousState.durable.quizzes[groupId]) return;
        listener();
      });
    },
  });
}

function blockedSnapshot(
  ownerId: AssessmentGroupId,
  surfaceId: SurfaceId,
  attemptStatus: "not_started" | "in_progress",
): SurfaceExitGuardSnapshot {
  return Object.freeze({
    status: "blocked",
    blocker: Object.freeze({
      reason: "quiz-not-complete",
      ownerId,
      surfaceId,
      attemptStatus,
    }),
  });
}

function requireCurrentQuizSurface({
  authoredGroupId,
  editor,
  getPos,
  groupId,
  resolveSurfaceScope,
  store,
}: {
  readonly authoredGroupId: string;
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly groupId: AssessmentGroupId;
  readonly resolveSurfaceScope: typeof resolveAssessmentSurfaceScope;
  readonly store: AssessmentStoreApi;
}): SurfaceId {
  const currentRegistration = store.getState().quizRegistrations[groupId];
  if (!currentRegistration) {
    throw new Error(`Quiz Surface Exit Guard owner "${groupId}" has no current registration.`);
  }
  assertRegistrationIdentity(currentRegistration, groupId);
  if (
    currentRegistration.authoredGroupId !== authoredGroupId ||
    currentRegistration.targetIds.length === 0
  ) {
    throw new Error(`Quiz Surface Exit Guard owner "${groupId}" registration is no longer valid.`);
  }

  let position: number | undefined;
  try {
    position = getPos();
  } catch {
    throw new Error(`Quiz Surface Exit Guard owner "${groupId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`Quiz Surface Exit Guard owner "${groupId}" is no longer mounted.`);
  }

  const currentQuiz = editor.state.doc.nodeAt(position);
  if (
    currentQuiz?.type.name !== "quiz" ||
    currentQuiz.attrs["id"] !== authoredGroupId ||
    currentQuiz.childCount === 0
  ) {
    throw new Error(`Quiz Surface Exit Guard owner "${groupId}" is no longer mounted.`);
  }

  const scope = resolveSurfaceScope({ doc: editor.state.doc, blockPos: position });
  if (!scope.ok) {
    throw new Error(
      `Quiz Surface Exit Guard owner "${groupId}" cannot resolve its owning Surface.`,
    );
  }
  const surfaceId = EmbeddedNodeIdSchema.safeParse(scope.surfaceId);
  if (!surfaceId.success) {
    throw new Error(
      `Quiz Surface Exit Guard owner "${groupId}" cannot resolve its owning Surface.`,
    );
  }
  return surfaceId.data;
}

function assertRegistrationIdentity(
  registration: AssessmentQuizRegistration,
  groupId: AssessmentGroupId,
): void {
  if (registration.groupId !== groupId) {
    throw new Error(
      `Quiz Surface Exit Guard owner "${groupId}" found registration "${registration.groupId}".`,
    );
  }
}

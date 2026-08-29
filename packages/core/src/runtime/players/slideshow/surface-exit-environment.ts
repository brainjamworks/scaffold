import type { SurfaceId } from "@/document/model/course-structure";

export interface QuizNotCompleteSurfaceExitBlocker {
  readonly reason: "quiz-not-complete";
  readonly ownerId: string;
  readonly surfaceId: SurfaceId;
  readonly attemptStatus: "not_started" | "in_progress";
}

export type SurfaceExitBlocker = QuizNotCompleteSurfaceExitBlocker;

export type SurfaceExitGuardSnapshot =
  | Readonly<{ status: "allowed" }>
  | Readonly<{ status: "blocked"; blocker: SurfaceExitBlocker }>;

export type SurfaceExitSnapshot =
  | Readonly<{
      status: "allowed";
      surfaceId: SurfaceId | null;
      blockers: readonly [];
    }>
  | Readonly<{
      status: "blocked";
      surfaceId: SurfaceId;
      blockers: readonly [SurfaceExitBlocker, ...SurfaceExitBlocker[]];
    }>;

export interface SurfaceExitGuard {
  readonly ownerId: string;
  readonly surfaceId: SurfaceId;
  getSnapshot(): SurfaceExitGuardSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface SurfaceExitEnvironment {
  registerGuard(guard: SurfaceExitGuard): () => void;
  getSnapshot(): SurfaceExitSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface SurfaceExitEnvironmentOwner {
  readonly environment: SurfaceExitEnvironment;
  setActiveSurfaceId(surfaceId: SurfaceId | null): void;
  dispose(): void;
}

export interface CreateSurfaceExitEnvironmentInput {
  readonly knownSurfaceIds: readonly SurfaceId[];
  readonly activeSurfaceId: SurfaceId | null;
}

interface GuardRegistration {
  readonly guard: SurfaceExitGuard;
  activeSubscription: ActiveGuardSubscription | null;
}

interface ActiveGuardSubscription {
  readonly unsubscribe: () => void;
}

const emptyBlockers = Object.freeze([]) as readonly [];

export function createSurfaceExitEnvironment({
  knownSurfaceIds,
  activeSurfaceId: initialActiveSurfaceId,
}: CreateSurfaceExitEnvironmentInput): SurfaceExitEnvironmentOwner {
  const knownSurfaces = new Set<SurfaceId>();
  for (const surfaceId of knownSurfaceIds) {
    if (knownSurfaces.has(surfaceId)) {
      throw new Error(`Duplicate known Surface "${surfaceId}"`);
    }
    knownSurfaces.add(surfaceId);
  }
  assertKnownActiveSurface(knownSurfaces, initialActiveSurfaceId);

  const registrations = new Map<string, GuardRegistration>();
  const listeners = new Set<() => void>();
  let activeSurfaceId = initialActiveSurfaceId;
  let currentSnapshot = allowedSnapshot(activeSurfaceId);
  let disposed = false;

  const assertAvailable = () => {
    if (disposed) throw new Error("Surface Exit Environment has been disposed");
  };

  const readAggregateSnapshot = (): SurfaceExitSnapshot => {
    const surfaceId = activeSurfaceId;
    if (surfaceId === null) return allowedSnapshot(null);

    const blockers: SurfaceExitBlocker[] = [];
    for (const { guard } of registrations.values()) {
      if (guard.surfaceId !== surfaceId) continue;
      const guardSnapshot = guard.getSnapshot();
      if (guardSnapshot.status === "allowed") continue;
      if (guardSnapshot.status !== "blocked") {
        throw new Error(`Surface Exit Guard "${guard.ownerId}" returned an invalid snapshot`);
      }
      blockers.push(validateAndFreezeBlocker(guard, guardSnapshot.blocker));
    }

    if (blockers.length === 0) return allowedSnapshot(surfaceId);
    return Object.freeze({
      status: "blocked",
      surfaceId,
      blockers: Object.freeze(blockers) as readonly [SurfaceExitBlocker, ...SurfaceExitBlocker[]],
    });
  };

  const publishAggregateSnapshot = () => {
    const nextSnapshot = readAggregateSnapshot();
    if (sameSnapshot(currentSnapshot, nextSnapshot)) return;
    currentSnapshot = nextSnapshot;
    for (const listener of listeners) listener();
  };

  const deactivateRegistration = (registration: GuardRegistration) => {
    const subscription = registration.activeSubscription;
    if (!subscription) return;
    registration.activeSubscription = null;
    subscription.unsubscribe();
  };

  const activateRegistration = (registration: GuardRegistration) => {
    const { guard } = registration;
    let unsubscribed = false;
    let unsubscribe = () => {};
    const unsubscribeGuard = guard.subscribe(() => {
      if (disposed || registration.activeSubscription?.unsubscribe !== unsubscribe) {
        return;
      }
      publishAggregateSnapshot();
    });
    if (typeof unsubscribeGuard !== "function") {
      throw new Error(`Surface Exit Guard "${guard.ownerId}" returned an invalid unsubscribe`);
    }
    unsubscribe = () => {
      if (unsubscribed) return;
      unsubscribed = true;
      unsubscribeGuard();
    };
    registration.activeSubscription = { unsubscribe };
  };

  const environment = Object.freeze<SurfaceExitEnvironment>({
    registerGuard(guard) {
      assertAvailable();
      if (registrations.has(guard.ownerId)) {
        throw new Error(`Surface Exit Guard owner "${guard.ownerId}" is already registered`);
      }
      if (!knownSurfaces.has(guard.surfaceId)) {
        throw new Error(`Surface Exit Guard owner "${guard.ownerId}" references unknown Surface`);
      }

      const registration: GuardRegistration = { guard, activeSubscription: null };
      registrations.set(guard.ownerId, registration);
      try {
        if (guard.surfaceId === activeSurfaceId) {
          activateRegistration(registration);
          publishAggregateSnapshot();
        }
      } catch (error) {
        registrations.delete(guard.ownerId);
        deactivateRegistration(registration);
        throw error;
      }

      let registered = true;
      return () => {
        if (!registered) return;
        registered = false;
        registrations.delete(guard.ownerId);
        deactivateRegistration(registration);
        if (!disposed && guard.surfaceId === activeSurfaceId) publishAggregateSnapshot();
      };
    },

    getSnapshot() {
      assertAvailable();
      return currentSnapshot;
    },

    subscribe(listener) {
      assertAvailable();
      listeners.add(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
      };
    },
  });

  return Object.freeze<SurfaceExitEnvironmentOwner>({
    environment,

    setActiveSurfaceId(surfaceId) {
      assertAvailable();
      assertKnownActiveSurface(knownSurfaces, surfaceId);
      if (surfaceId === activeSurfaceId) return;

      for (const registration of registrations.values()) {
        deactivateRegistration(registration);
      }
      activeSurfaceId = surfaceId;
      for (const registration of registrations.values()) {
        if (registration.guard.surfaceId === activeSurfaceId) {
          activateRegistration(registration);
        }
      }
      publishAggregateSnapshot();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      let firstDefect: unknown;
      for (const registration of registrations.values()) {
        try {
          deactivateRegistration(registration);
        } catch (error) {
          firstDefect ??= error;
        }
      }
      registrations.clear();
      listeners.clear();
      if (firstDefect !== undefined) throw firstDefect;
    },
  });
}

function assertKnownActiveSurface(
  knownSurfaces: ReadonlySet<SurfaceId>,
  surfaceId: SurfaceId | null,
): void {
  if (surfaceId !== null && !knownSurfaces.has(surfaceId)) {
    throw new Error(`Cannot activate unknown Surface "${surfaceId}"`);
  }
}

function allowedSnapshot(surfaceId: SurfaceId | null): SurfaceExitSnapshot {
  return Object.freeze({ status: "allowed", surfaceId, blockers: emptyBlockers });
}

function validateAndFreezeBlocker(
  guard: SurfaceExitGuard,
  blocker: SurfaceExitBlocker,
): SurfaceExitBlocker {
  if (blocker.reason !== "quiz-not-complete") {
    throw new Error(`Surface Exit Guard "${guard.ownerId}" returned an invalid blocker`);
  }
  if (blocker.ownerId !== guard.ownerId) {
    throw new Error(
      `Surface Exit Guard "${guard.ownerId}" returned a blocker for owner "${blocker.ownerId}"`,
    );
  }
  if (blocker.surfaceId !== guard.surfaceId) {
    throw new Error(`Surface Exit Guard "${guard.ownerId}" returned a blocker for another Surface`);
  }
  if (blocker.attemptStatus !== "not_started" && blocker.attemptStatus !== "in_progress") {
    throw new Error(`Surface Exit Guard "${guard.ownerId}" returned an invalid blocker`);
  }
  return Object.freeze({ ...blocker });
}

function sameSnapshot(left: SurfaceExitSnapshot, right: SurfaceExitSnapshot): boolean {
  if (left.status !== right.status || left.surfaceId !== right.surfaceId) return false;
  if (left.blockers.length !== right.blockers.length) return false;

  return left.blockers.every((blocker, index) => {
    const candidate = right.blockers[index];
    return (
      candidate !== undefined &&
      blocker.reason === candidate.reason &&
      blocker.ownerId === candidate.ownerId &&
      blocker.surfaceId === candidate.surfaceId &&
      blocker.attemptStatus === candidate.attemptStatus
    );
  });
}

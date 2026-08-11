import type { ArtifactPersistencePort, ArtifactSavePayload } from "@/host/ports";

export interface AuthoringSaveSnapshot {
  readonly generation: number;
  readonly payload: ArtifactSavePayload;
  readonly saveArtifact: ArtifactPersistencePort["saveArtifact"];
  readonly sequence: number;
  readonly source: unknown;
}

export interface AuthoringSaveMachine {
  readonly source: unknown;
  activate(): void;
  beginDrain(): boolean;
  deactivate(): void;
  enqueue(snapshot: AuthoringSaveSnapshot): Promise<boolean>;
  finishDrain(): void;
  finishInFlight(snapshot: AuthoringSaveSnapshot): void;
  hasPending(): boolean;
  invalidate(): void;
  isActive(): boolean;
  isBusy(): boolean;
  reserveSequence(): number;
  settleThrough(sequence: number, saved: boolean): void;
  takeNext(): AuthoringSaveSnapshot | null;
}

interface AuthoringSaveWaiter {
  readonly resolve: (saved: boolean) => void;
  readonly sequence: number;
}

export function createAuthoringSaveMachine(source: unknown): AuthoringSaveMachine {
  let active = false;
  let draining = false;
  let inFlight: AuthoringSaveSnapshot | null = null;
  let nextSequence = 0;
  let pending: AuthoringSaveSnapshot | null = null;
  let waiters: AuthoringSaveWaiter[] = [];

  function settleThrough(sequence: number, saved: boolean): void {
    const remaining: AuthoringSaveWaiter[] = [];
    for (const waiter of waiters) {
      if (waiter.sequence <= sequence) {
        waiter.resolve(saved);
      } else {
        remaining.push(waiter);
      }
    }
    waiters = remaining;
  }

  function clearUnsentWork(): void {
    pending = null;
    for (const waiter of waiters) waiter.resolve(false);
    waiters = [];
  }

  return {
    source,
    activate() {
      active = true;
    },
    beginDrain() {
      if (!active || draining) return false;
      draining = true;
      return true;
    },
    deactivate() {
      active = false;
      clearUnsentWork();
    },
    enqueue(snapshot) {
      if (!active) return Promise.resolve(false);
      const outcome = new Promise<boolean>((resolve) => {
        waiters.push({ resolve, sequence: snapshot.sequence });
      });
      pending = snapshot;
      return outcome;
    },
    finishDrain() {
      draining = false;
    },
    finishInFlight(snapshot) {
      if (inFlight === snapshot) inFlight = null;
    },
    hasPending() {
      return pending !== null;
    },
    invalidate() {
      clearUnsentWork();
    },
    isActive() {
      return active;
    },
    isBusy() {
      return inFlight !== null || pending !== null;
    },
    reserveSequence() {
      nextSequence += 1;
      return nextSequence;
    },
    settleThrough,
    takeNext() {
      if (!active || inFlight || !pending) return null;
      const snapshot = pending;
      pending = null;
      inFlight = snapshot;
      return snapshot;
    },
  };
}

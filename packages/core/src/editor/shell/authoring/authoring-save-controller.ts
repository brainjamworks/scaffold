import { Result, type Result as ResultType } from "better-result";

import type { CourseDocumentAuthoringFailure } from "@/document/authoring/CourseDocumentEditor";
import type {
  ArtifactPersistenceFailure,
  ArtifactPersistencePort,
  ArtifactRevision,
} from "@/host/ports";

import type { AuthoringDocumentSnapshot, AuthoringDocumentState } from "./use-authoring-document";

const SAVE_DEBOUNCE_MS = 500;

export interface SavedAuthoringRevision {
  readonly localRevision: number;
  readonly artifactRevision: ArtifactRevision;
}

export interface SavedArtifactMetadataAcknowledgement {
  readonly localRevision: number;
  readonly title: string;
}

export type AuthoringSaveFailure =
  | {
      readonly reason: "invalid-document";
      readonly failure: CourseDocumentAuthoringFailure;
    }
  | {
      readonly reason: "document-invalidated";
      readonly requestedRevision: number;
    }
  | {
      readonly reason: "session-closed";
      readonly requestedRevision: number;
    }
  | {
      readonly reason: "persistence-failed";
      readonly requestedRevision: number;
      readonly failure: ArtifactPersistenceFailure;
    };

export type AuthoringSaveResult = ResultType<SavedAuthoringRevision, AuthoringSaveFailure>;
export type AuthoringSaveActivity = "idle" | "scheduled" | "saving";

export interface AuthoringSaveSnapshot {
  readonly currentLocalRevision: number;
  readonly documentStatus: AuthoringDocumentState["status"];
  readonly lastSaved: SavedAuthoringRevision | null;
  readonly activity: AuthoringSaveActivity;
  readonly lastFailure: AuthoringSaveFailure | null;
}

export interface AuthoringSaveController {
  getSnapshot(): AuthoringSaveSnapshot;
  subscribe(listener: () => void): () => void;
  observeDocument(state: AuthoringDocumentState): void;
  seedInitialSavedRevision(revision: ArtifactRevision): void;
  saveNow(): Promise<AuthoringSaveResult>;
  dispose(): void;
}

interface SaveWaiter {
  readonly requestedRevision: number;
  readonly resolve: (result: AuthoringSaveResult) => void;
  readonly reject: (error: unknown) => void;
}

export class DefaultAuthoringSaveController implements AuthoringSaveController {
  readonly #initialLocalRevision: number;
  readonly #listeners = new Set<() => void>();
  readonly #acknowledgeSavedMetadata: (
    acknowledgement: SavedArtifactMetadataAcknowledgement,
  ) => void;
  readonly #persistence: ArtifactPersistencePort;
  #currentDocument: AuthoringDocumentState;
  #disposed = false;
  #draining = false;
  #hasSettledSave = false;
  #inFlight: AuthoringDocumentSnapshot | null = null;
  #lastFailure: AuthoringSaveFailure | null = null;
  #lastSaved: SavedAuthoringRevision | null = null;
  #pending: AuthoringDocumentSnapshot | null = null;
  #pendingReady = false;
  #snapshot: AuthoringSaveSnapshot;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #waiters: SaveWaiter[] = [];

  constructor(
    initialDocument: AuthoringDocumentState,
    persistence: ArtifactPersistencePort,
    acknowledgeSavedMetadata: (acknowledgement: SavedArtifactMetadataAcknowledgement) => void,
  ) {
    this.#acknowledgeSavedMetadata = acknowledgeSavedMetadata;
    this.#currentDocument = initialDocument;
    this.#initialLocalRevision = documentRevision(initialDocument);
    this.#persistence = persistence;
    this.#snapshot = this.#createSnapshot();
  }

  readonly getSnapshot = (): AuthoringSaveSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  observeDocument(state: AuthoringDocumentState): void {
    if (this.#disposed) return;
    const previousRevision = documentRevision(this.#currentDocument);
    const nextRevision = documentRevision(state);
    if (nextRevision < previousRevision) {
      throw new Error("Authoring document revisions must be monotonic within a save session.");
    }
    if (nextRevision === previousRevision) {
      if (state.status !== this.#currentDocument.status) {
        throw new Error("Authoring document validity changed without advancing its revision.");
      }
      this.#currentDocument = state;
      if (state.status === "valid" && this.#pending?.revision === nextRevision) {
        this.#pending = state.snapshot;
      }
      this.#refreshSnapshot();
      return;
    }

    this.#currentDocument = state;
    if (state.status === "invalid") {
      this.#clearTimer();
      this.#pending = null;
      this.#pendingReady = false;
      this.#lastFailure = { reason: "invalid-document", failure: state.failure };
      this.#settleInvalidatedWaiters();
      this.#refreshSnapshot();
      return;
    }

    this.#lastFailure = null;
    this.#pending = state.snapshot;
    this.#pendingReady = false;
    this.#clearTimer();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      if (this.#disposed || !this.#pending) return;
      this.#pendingReady = true;
      this.#refreshSnapshot();
      this.#startDrain();
    }, SAVE_DEBOUNCE_MS);
    this.#refreshSnapshot();
  }

  seedInitialSavedRevision(revision: ArtifactRevision): void {
    if (
      this.#disposed ||
      this.#hasSettledSave ||
      this.#lastSaved !== null ||
      documentRevision(this.#currentDocument) !== this.#initialLocalRevision
    ) {
      return;
    }
    this.#lastSaved = Object.freeze({
      localRevision: this.#initialLocalRevision,
      artifactRevision: revision,
    });
    this.#refreshSnapshot();
  }

  saveNow(): Promise<AuthoringSaveResult> {
    const requestedRevision = documentRevision(this.#currentDocument);
    if (this.#disposed) {
      return Promise.resolve(Result.err({ reason: "session-closed", requestedRevision }));
    }
    if (this.#currentDocument.status === "invalid") {
      const failure = Object.freeze({
        reason: "invalid-document" as const,
        failure: this.#currentDocument.failure,
      });
      this.#lastFailure = failure;
      this.#refreshSnapshot();
      return Promise.resolve(Result.err(failure));
    }

    const outcome = new Promise<AuthoringSaveResult>((resolve, reject) => {
      this.#waiters.push({ requestedRevision, resolve, reject });
    });
    this.#clearTimer();
    if (this.#inFlight?.revision !== requestedRevision) {
      this.#pending = this.#currentDocument.snapshot;
      this.#pendingReady = true;
    }
    this.#lastFailure = null;
    this.#refreshSnapshot();
    this.#startDrain();
    return outcome;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#clearTimer();
    this.#pending = null;
    this.#pendingReady = false;
    const waiters = this.#waiters;
    this.#waiters = [];
    for (const waiter of waiters) {
      waiter.resolve(
        Result.err({
          reason: "session-closed",
          requestedRevision: waiter.requestedRevision,
        }),
      );
    }
    this.#refreshSnapshot();
    this.#listeners.clear();
  }

  #startDrain(): void {
    if (this.#draining || this.#disposed) return;
    void this.#drain();
  }

  async #drain(): Promise<void> {
    if (this.#draining || this.#disposed) return;
    this.#draining = true;
    try {
      while (!this.#disposed && this.#pendingReady && this.#pending) {
        const document = this.#pending;
        this.#pending = null;
        this.#pendingReady = false;
        this.#inFlight = document;
        this.#refreshSnapshot();

        let persisted;
        try {
          persisted = await this.#persistence.saveArtifact({
            artifact: structuredClone(document.artifact),
          });
        } catch (error) {
          this.#inFlight = null;
          const rejected = this.#rejectWaitersThrough(document.revision, error);
          this.#refreshSnapshot();
          if (rejected === 0) queueMicrotask(() => Promise.reject(error));
          continue;
        }

        this.#inFlight = null;
        if (this.#disposed) break;
        this.#hasSettledSave = true;
        if (persisted.isOk()) {
          const saved = Object.freeze({
            localRevision: document.revision,
            artifactRevision: persisted.value.artifactRevision,
          });
          this.#lastSaved = saved;
          if (this.#currentDocument.status === "valid") this.#lastFailure = null;
          if (!this.#pending && documentRevision(this.#currentDocument) === document.revision) {
            const savedTitle = persisted.value.artifact?.title;
            if (typeof savedTitle === "string" && savedTitle.length > 0) {
              this.#acknowledgeSavedMetadata(
                Object.freeze({ localRevision: document.revision, title: savedTitle }),
              );
            }
            this.#settleSuccessfulWaiters(saved);
          }
        } else if (
          !this.#pending &&
          documentRevision(this.#currentDocument) === document.revision
        ) {
          const failure = Object.freeze({
            reason: "persistence-failed" as const,
            requestedRevision: document.revision,
            failure: persisted.error,
          });
          this.#lastFailure = failure;
          this.#settleFailedWaiters(document.revision, failure);
        }
        this.#refreshSnapshot();
      }
    } finally {
      this.#draining = false;
      this.#refreshSnapshot();
      if (!this.#disposed && this.#pendingReady && this.#pending) this.#startDrain();
    }
  }

  #settleSuccessfulWaiters(saved: SavedAuthoringRevision): void {
    const remaining: SaveWaiter[] = [];
    for (const waiter of this.#waiters) {
      if (waiter.requestedRevision <= saved.localRevision) waiter.resolve(Result.ok(saved));
      else remaining.push(waiter);
    }
    this.#waiters = remaining;
  }

  #settleFailedWaiters(revision: number, failure: AuthoringSaveFailure): void {
    const remaining: SaveWaiter[] = [];
    for (const waiter of this.#waiters) {
      if (waiter.requestedRevision <= revision) waiter.resolve(Result.err(failure));
      else remaining.push(waiter);
    }
    this.#waiters = remaining;
  }

  #settleInvalidatedWaiters(): void {
    const waiters = this.#waiters;
    this.#waiters = [];
    for (const waiter of waiters) {
      waiter.resolve(
        Result.err({
          reason: "document-invalidated",
          requestedRevision: waiter.requestedRevision,
        }),
      );
    }
  }

  #rejectWaitersThrough(revision: number, error: unknown): number {
    let rejected = 0;
    const remaining: SaveWaiter[] = [];
    for (const waiter of this.#waiters) {
      if (waiter.requestedRevision <= revision) {
        waiter.reject(error);
        rejected += 1;
      } else {
        remaining.push(waiter);
      }
    }
    this.#waiters = remaining;
    return rejected;
  }

  #clearTimer(): void {
    if (this.#timer === null) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }

  #createSnapshot(): AuthoringSaveSnapshot {
    return Object.freeze({
      currentLocalRevision: documentRevision(this.#currentDocument),
      documentStatus: this.#currentDocument.status,
      lastSaved: this.#lastSaved,
      activity: this.#inFlight ? "saving" : this.#timer || this.#pending ? "scheduled" : "idle",
      lastFailure: this.#lastFailure,
    });
  }

  #refreshSnapshot(): void {
    this.#snapshot = this.#createSnapshot();
    for (const listener of this.#listeners) listener();
  }
}

export function createAuthoringSaveController(
  initialDocument: AuthoringDocumentState,
  persistence: ArtifactPersistencePort,
  acknowledgeSavedMetadata: (acknowledgement: SavedArtifactMetadataAcknowledgement) => void,
): AuthoringSaveController {
  return new DefaultAuthoringSaveController(initialDocument, persistence, acknowledgeSavedMetadata);
}

function documentRevision(state: AuthoringDocumentState): number {
  return state.status === "valid" ? state.snapshot.revision : state.revision;
}

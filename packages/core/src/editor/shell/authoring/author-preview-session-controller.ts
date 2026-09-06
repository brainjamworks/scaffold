import {
  ScaffoldDocumentContentSchema,
  type EmbeddedNodeId,
  type ScaffoldDocumentContent,
} from "@scaffold/contracts";
import { Result, type Result as ResultType } from "better-result";

import type { LearnerPublicationPayloadPart } from "@/authoring/publication/artifact-save-bundle";
import type { AssessmentProjectionWarning } from "@/authoring/publication/document-projection";
import type {
  LearnerInteractionPreviewReportsPort,
  LearnerInteractionPreviewSnapshot,
  LearnerInteractionTurnReport,
} from "@/learner-interaction/model";
import type {
  PresentationCompilationError,
  PresentationPreviewOperationError,
  PresentationPreviewOperationResult,
  PresentationPreviewPlaybackPort,
  PresentationPreviewSeekError,
  PresentationPreviewSeekReport,
  PresentationPreviewSeekResult,
  PresentationPreviewSnapshot,
} from "@/presentation/model";

import type {
  AuthorPreviewHostServices,
  PreparedAuthorPreview,
} from "./author-preview-preparation";
import type { AuthoringDocumentSnapshot, AuthoringDocumentState } from "./use-authoring-document";

export interface AuthorPreviewPreparationInput {
  readonly document: ScaffoldDocumentContent;
  readonly revision: number;
  readonly surfaceId: EmbeddedNodeId;
}

export type AuthorPreviewFailure =
  | PresentationCompilationError
  | { readonly reason: "preview-not-active"; readonly surfaceId: EmbeddedNodeId }
  | { readonly reason: "preview-load-superseded"; readonly surfaceId: EmbeddedNodeId }
  | { readonly reason: "preview-not-slideshow"; readonly mode: "page" }
  | {
      readonly reason: "preview-surface-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly currentSurfaceIds: readonly EmbeddedNodeId[];
    }
  | {
      readonly reason: "preview-document-invalid";
      readonly issues: readonly {
        readonly code: string;
        readonly path: readonly (string | number)[];
        readonly message: string;
      }[];
    }
  | { readonly reason: "preview-requires-scaffold-plus" }
  | {
      readonly reason: "preview-unsupported-core-format";
      readonly documentVersion: number;
      readonly supportedVersion: number;
      readonly message: string;
    }
  | {
      readonly reason: "preview-unavailable-content";
      readonly unavailableContent: readonly {
        readonly kind: "block" | "layout" | "surface";
        readonly capabilityId: string;
        readonly stableId: string;
        readonly path: readonly (string | number)[];
      }[];
    }
  | {
      readonly reason: "preview-projection-warning";
      readonly warnings: readonly AssessmentProjectionWarning[];
    }
  | {
      readonly reason: "preview-payload-too-large";
      readonly part: LearnerPublicationPayloadPart;
      readonly measuredBytes: number;
      readonly limitBytes: number;
    }
  | { readonly reason: "preview-runtime-unavailable"; readonly cause: unknown }
  | { readonly reason: "preview-services-unavailable"; readonly cause: unknown };

export type AuthorPreviewSessionResult = ResultType<void, AuthorPreviewFailure>;

export interface ActiveAuthorPreview extends PreparedAuthorPreview {
  readonly entryId: number;
  readonly runtimeGeneration: number;
  readonly surfaceId: EmbeddedNodeId;
}

export type AuthorPreviewSnapshot =
  | { readonly status: "editing"; readonly failure: AuthorPreviewFailure | null }
  | { readonly status: "entering"; readonly surfaceId: EmbeddedNodeId }
  | { readonly status: "preview"; readonly active: ActiveAuthorPreview }
  | { readonly status: "refreshing"; readonly active: ActiveAuthorPreview }
  | {
      readonly status: "refresh-failed";
      readonly active: ActiveAuthorPreview;
      readonly failure: AuthorPreviewFailure;
    };

export interface AuthorPreviewTransport {
  getSnapshot(): PresentationPreviewSnapshot;
  subscribe(listener: () => void): () => void;
  play(surfaceId: EmbeddedNodeId): PresentationPreviewOperationResult;
  pause(surfaceId: EmbeddedNodeId): PresentationPreviewOperationResult;
  seek(surfaceId: EmbeddedNodeId, timeMs: number): Promise<PresentationPreviewSeekResult>;
}

export interface AuthorPreviewReports {
  getSnapshot(): LearnerInteractionPreviewSnapshot;
  subscribe(listener: () => void): () => void;
  subscribeReports(listener: (report: LearnerInteractionTurnReport) => void): () => void;
}

export interface CreateAuthorPreviewSessionControllerInput {
  readonly prepare: (
    input: AuthorPreviewPreparationInput,
    retainedServices: AuthorPreviewHostServices | null,
  ) => Promise<ResultType<PreparedAuthorPreview, AuthorPreviewFailure>>;
}

export interface AuthorPreviewSession {
  getSnapshot(): AuthorPreviewSnapshot;
  subscribe(listener: () => void): () => void;
  enter(
    documentSnapshot: AuthoringDocumentSnapshot,
    surfaceId: EmbeddedNodeId,
  ): Promise<AuthorPreviewSessionResult>;
  observeDocument(state: AuthoringDocumentState): void;
  showSurface(surfaceId: EmbeddedNodeId): Promise<AuthorPreviewSessionResult>;
  exit(): void;
  dispose(): void;
  readonly transport: AuthorPreviewTransport;
  readonly reports: AuthorPreviewReports;
}

/** Owns the one author-preview attempt, its prepared payload and its runtime connectors. */
export class AuthorPreviewSessionController implements AuthorPreviewSession {
  readonly #listeners = new Set<() => void>();
  readonly #transportListeners = new Set<() => void>();
  readonly #reportSnapshotListeners = new Set<() => void>();
  readonly #reportListeners = new Set<(report: LearnerInteractionTurnReport) => void>();
  readonly #prepare: CreateAuthorPreviewSessionControllerInput["prepare"];
  #disposed = false;
  #entrySequence = 0;
  #runtimeGeneration = 0;
  #operationGeneration = 0;
  #documentState: AuthoringDocumentState | null = null;
  #preparedDocument: AuthorPreviewPreparationInput | null = null;
  #requestedDocument: AuthorPreviewPreparationInput | null = null;
  #playback: PresentationPreviewPlaybackPort | null = null;
  #reportsPort: LearnerInteractionPreviewReportsPort | null = null;
  #playbackGeneration: number | null = null;
  #reportsGeneration: number | null = null;
  #unsubscribePlayback: (() => void) | null = null;
  #unsubscribeReports: (() => void) | null = null;
  #snapshot: AuthorPreviewSnapshot = Object.freeze({ status: "editing", failure: null });
  #transportSnapshot: PresentationPreviewSnapshot = Object.freeze({ status: "idle" });
  #reportsSnapshot: LearnerInteractionPreviewSnapshot = Object.freeze({ status: "idle" });

  readonly transport: AuthorPreviewTransport;
  readonly reports: AuthorPreviewReports;

  constructor({ prepare }: CreateAuthorPreviewSessionControllerInput) {
    this.#prepare = prepare;
    this.transport = Object.freeze({
      getSnapshot: () => this.#transportSnapshot,
      subscribe: this.#subscribeTransport,
      play: (surfaceId: EmbeddedNodeId) => this.#operate("play", surfaceId),
      pause: (surfaceId: EmbeddedNodeId) => this.#operate("pause", surfaceId),
      seek: this.#seek,
    });
    this.reports = Object.freeze({
      getSnapshot: () => this.#reportsSnapshot,
      subscribe: this.#subscribeReportSnapshot,
      subscribeReports: this.#subscribeReports,
    });
  }

  readonly getSnapshot = (): AuthorPreviewSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#assertNotDisposed();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  enter(
    documentSnapshot: AuthoringDocumentSnapshot,
    surfaceId: EmbeddedNodeId,
  ): Promise<AuthorPreviewSessionResult> {
    this.#assertNotDisposed();
    if (this.#snapshot.status !== "editing") {
      throw new Error("Author Preview can only be entered from Editing.");
    }
    this.#documentState = Object.freeze({ status: "valid", snapshot: documentSnapshot });
    return this.#prepareEntry(
      toPreparationInput(documentSnapshot, surfaceId),
      ++this.#entrySequence,
    );
  }

  observeDocument(state: AuthoringDocumentState): void {
    this.#assertNotDisposed();
    this.#documentState = state;
    const active = this.#active();
    if (state.status === "invalid") {
      if (this.#snapshot.status === "entering") return;
      if (!active) return;
      this.#pauseAndDisconnectRuntimePorts();
      if (this.#snapshot.status === "refreshing") this.#runtimeGeneration += 1;
      this.#operationGeneration += 1;
      this.#requestedDocument = null;
      this.#replaceSnapshot(
        Object.freeze({
          status: "refresh-failed",
          active,
          failure: toPreviewDocumentFailure(state.failure),
        }),
      );
      return;
    }
    if (!active) return;
    const nextDocument = toPreparationInput(
      state.snapshot,
      this.#snapshot.status === "refreshing"
        ? (this.#requestedDocument?.surfaceId ?? active.surfaceId)
        : active.surfaceId,
    );
    const comparisonDocument =
      this.#snapshot.status === "refreshing"
        ? this.#requestedDocument?.document
        : this.#preparedDocument?.document;
    if (
      this.#snapshot.status !== "refresh-failed" &&
      comparisonDocument &&
      !didPreviewConfigurationChange(comparisonDocument, nextDocument.document)
    ) {
      return;
    }
    void this.#prepareRefresh(nextDocument);
  }

  showSurface(surfaceId: EmbeddedNodeId): Promise<AuthorPreviewSessionResult> {
    this.#assertNotDisposed();
    const active = this.#active();
    if (!active) return Promise.resolve(Result.err(this.#notActive(surfaceId)));
    if (active.surfaceId === surfaceId && this.#snapshot.status === "preview") {
      return Promise.resolve(Result.ok());
    }
    if (this.#documentState?.status !== "valid") {
      return Promise.resolve(Result.err(this.#notActive(surfaceId)));
    }
    return this.#prepareRefresh(toPreparationInput(this.#documentState.snapshot, surfaceId));
  }

  exit(): void {
    this.#assertNotDisposed();
    this.#invalidateAsyncWork();
    this.#documentState = null;
    this.#preparedDocument = null;
    this.#requestedDocument = null;
    this.#pauseAndDisconnectRuntimePorts();
    this.#replaceSnapshot(Object.freeze({ status: "editing", failure: null }));
  }

  connectPresentationPlayback(
    runtimeGeneration: number,
    port: PresentationPreviewPlaybackPort | null,
  ): void {
    if (this.#disposed) return;
    if (!this.#acceptsConnector(runtimeGeneration)) return;
    if (port === null) {
      if (this.#playbackGeneration !== runtimeGeneration) return;
      this.#disconnectPlayback();
      this.#refreshPortSnapshots();
      return;
    }
    const snapshot = port.getSnapshot();
    const active = this.#active();
    if (snapshot.status !== "ready") {
      throw new Error("Author Preview connected a playback port before it was ready.");
    }
    if (!active || snapshot.surfaceId !== active.surfaceId) {
      throw new Error("Author Preview connected playback for a non-current Surface.");
    }
    this.#disconnectPlayback();
    this.#playback = port;
    this.#playbackGeneration = runtimeGeneration;
    this.#unsubscribePlayback = port.subscribe(this.#refreshPortSnapshots);
    this.#refreshPortSnapshots();
  }

  connectLearnerInteractionReports(
    runtimeGeneration: number,
    port: LearnerInteractionPreviewReportsPort | null,
  ): void {
    if (this.#disposed) return;
    if (!this.#acceptsConnector(runtimeGeneration)) return;
    if (port === null) {
      if (this.#reportsGeneration !== runtimeGeneration) return;
      this.#disconnectReports();
      this.#refreshPortSnapshots();
      return;
    }
    this.#disconnectReports();
    this.#reportsPort = port;
    this.#reportsGeneration = runtimeGeneration;
    this.#unsubscribeReports = port.subscribeReports(this.#publishReport);
    this.#refreshPortSnapshots();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#invalidateAsyncWork();
    this.#documentState = null;
    this.#preparedDocument = null;
    this.#requestedDocument = null;
    this.#pauseAndDisconnectRuntimePorts();
    this.#snapshot = Object.freeze({ status: "editing", failure: null });
    this.#transportSnapshot = Object.freeze({ status: "idle" });
    this.#reportsSnapshot = Object.freeze({ status: "idle" });
    this.#listeners.clear();
    this.#transportListeners.clear();
    this.#reportSnapshotListeners.clear();
    this.#reportListeners.clear();
  }

  async #prepareEntry(
    input: AuthorPreviewPreparationInput,
    entryId: number,
  ): Promise<AuthorPreviewSessionResult> {
    let runtimeGeneration = ++this.#runtimeGeneration;
    let preparedInput = input;
    this.#replaceSnapshot(Object.freeze({ status: "entering", surfaceId: input.surfaceId }));
    let prepared = await this.#prepare(preparedInput, null);
    while (true) {
      if (!this.#isCurrentGeneration(runtimeGeneration)) {
        return Result.err(this.#superseded(preparedInput.surfaceId));
      }
      if (prepared.isErr()) {
        this.#preparedDocument = null;
        this.#replaceSnapshot(Object.freeze({ status: "editing", failure: prepared.error }));
        return Result.err(prepared.error);
      }
      if (this.#documentState?.status === "invalid") {
        const failure = toPreviewDocumentFailure(this.#documentState.failure);
        this.#preparedDocument = null;
        this.#replaceSnapshot(Object.freeze({ status: "editing", failure }));
        return Result.err(failure);
      }
      const latestInput = this.#documentState
        ? toPreparationInput(this.#documentState.snapshot, preparedInput.surfaceId)
        : preparedInput;
      if (!didPreviewConfigurationChange(preparedInput.document, latestInput.document)) break;
      preparedInput = latestInput;
      runtimeGeneration = ++this.#runtimeGeneration;
      prepared = await this.#prepare(preparedInput, prepared.value.services);
    }
    this.#preparedDocument = preparedInput;
    this.#replaceSnapshot(
      Object.freeze({
        status: "preview",
        active: activePreview(prepared.value, entryId, runtimeGeneration, preparedInput.surfaceId),
      }),
    );
    return Result.ok();
  }

  async #prepareRefresh(input: AuthorPreviewPreparationInput): Promise<AuthorPreviewSessionResult> {
    const active = this.#active();
    if (!active) return Result.err(this.#notActive(input.surfaceId));
    this.#pauseAndDisconnectRuntimePorts();
    const runtimeGeneration = ++this.#runtimeGeneration;
    this.#operationGeneration += 1;
    this.#requestedDocument = input;
    this.#replaceSnapshot(Object.freeze({ status: "refreshing", active }));
    const prepared = await this.#prepare(input, active.services);
    if (!this.#isCurrentGeneration(runtimeGeneration)) {
      return Result.err(this.#superseded(input.surfaceId));
    }
    if (prepared.isErr()) {
      this.#requestedDocument = null;
      this.#replaceSnapshot(
        Object.freeze({ status: "refresh-failed", active, failure: prepared.error }),
      );
      return Result.err(prepared.error);
    }
    if (prepared.value.services !== active.services) {
      throw new Error("Author Preview replaced host services during an active entry.");
    }
    this.#requestedDocument = null;
    this.#preparedDocument = input;
    this.#replaceSnapshot(
      Object.freeze({
        status: "preview",
        active: activePreview(prepared.value, active.entryId, runtimeGeneration, input.surfaceId),
      }),
    );
    return Result.ok();
  }

  #active(): ActiveAuthorPreview | null {
    switch (this.#snapshot.status) {
      case "preview":
      case "refreshing":
      case "refresh-failed":
        return this.#snapshot.active;
      case "editing":
      case "entering":
        return null;
    }
  }

  #acceptsConnector(runtimeGeneration: number): boolean {
    return (
      this.#snapshot.status === "preview" &&
      this.#snapshot.active.runtimeGeneration === runtimeGeneration
    );
  }

  #isCurrentGeneration(runtimeGeneration: number): boolean {
    return !this.#disposed && runtimeGeneration === this.#runtimeGeneration;
  }

  #invalidateAsyncWork(): void {
    this.#runtimeGeneration += 1;
    this.#operationGeneration += 1;
  }

  #operate(
    operation: "play" | "pause",
    surfaceId: EmbeddedNodeId,
  ): PresentationPreviewOperationResult {
    this.#assertNotDisposed();
    const guarded = this.#guardTransportSurface(operation, surfaceId);
    if (guarded) return Result.err(guarded);
    const playback = this.#playback;
    if (!playback) return Result.err(this.#notReady(operation));
    return operation === "play" ? playback.play() : playback.pause();
  }

  readonly #seek = async (
    surfaceId: EmbeddedNodeId,
    timeMs: number,
  ): Promise<ResultType<PresentationPreviewSeekReport, PresentationPreviewSeekError>> => {
    this.#assertNotDisposed();
    if (!Number.isSafeInteger(timeMs) || timeMs < 0) {
      throw new Error("Presentation Preview seek time must be a non-negative integer.");
    }
    const guarded = this.#guardTransportSurface("seek", surfaceId);
    if (guarded) return Result.err(guarded);
    const playback = this.#playback;
    if (!playback) return Result.err(this.#notReady("seek"));
    const operationGeneration = ++this.#operationGeneration;
    const result = await playback.seek(timeMs);
    if (result.isErr() || operationGeneration === this.#operationGeneration) return result;
    return Result.ok(Object.freeze({ kind: "superseded", timeMs }));
  };

  #guardTransportSurface(
    operation: "play" | "pause" | "seek",
    surfaceId: EmbeddedNodeId,
  ): Extract<
    PresentationPreviewOperationError,
    { readonly reason: "preview-surface-mismatch" }
  > | null {
    const active = this.#active();
    if (!active || active.surfaceId === surfaceId) return null;
    return Object.freeze({
      reason: "preview-surface-mismatch",
      operation,
      requestedSurfaceId: surfaceId,
      liveSurfaceId: active.surfaceId,
    });
  }

  #notReady(operation: "play" | "pause" | "seek"): PresentationPreviewOperationError {
    if (this.#transportSnapshot.status === "ready") {
      throw new Error("Author Preview lost its ready playback port.");
    }
    return Object.freeze({
      reason: "preview-not-ready",
      operation,
      status: this.#transportSnapshot.status,
    });
  }

  #notActive(surfaceId: EmbeddedNodeId): AuthorPreviewFailure {
    return Object.freeze({ reason: "preview-not-active", surfaceId });
  }

  #superseded(surfaceId: EmbeddedNodeId): AuthorPreviewFailure {
    return Object.freeze({ reason: "preview-load-superseded", surfaceId });
  }

  readonly #subscribeTransport = (listener: () => void): (() => void) => {
    this.#assertNotDisposed();
    this.#transportListeners.add(listener);
    return () => this.#transportListeners.delete(listener);
  };

  readonly #subscribeReportSnapshot = (listener: () => void): (() => void) => {
    this.#assertNotDisposed();
    this.#reportSnapshotListeners.add(listener);
    return () => this.#reportSnapshotListeners.delete(listener);
  };

  readonly #subscribeReports = (
    listener: (report: LearnerInteractionTurnReport) => void,
  ): (() => void) => {
    this.#assertNotDisposed();
    this.#reportListeners.add(listener);
    return () => this.#reportListeners.delete(listener);
  };

  readonly #publishReport = (report: LearnerInteractionTurnReport): void => {
    if (
      this.#snapshot.status !== "preview" ||
      this.#reportsGeneration !== this.#snapshot.active.runtimeGeneration
    ) {
      return;
    }
    for (const listener of this.#reportListeners) listener(report);
  };

  readonly #refreshPortSnapshots = (): void => {
    const active = this.#snapshot.status === "preview" ? this.#snapshot.active : null;
    const nextTransport =
      active && this.#playback && this.#playbackGeneration === active.runtimeGeneration
        ? this.#playback.getSnapshot()
        : this.#sessionTransportSnapshot();
    const nextReports =
      active && this.#reportsPort && this.#reportsGeneration === active.runtimeGeneration
        ? Object.freeze({ status: "ready" as const, surfaceId: active.surfaceId })
        : this.#sessionReportsSnapshot();
    if (!samePresentationSnapshot(this.#transportSnapshot, nextTransport)) {
      this.#transportSnapshot = nextTransport;
      for (const listener of this.#transportListeners) listener();
    }
    if (!sameReportSnapshot(this.#reportsSnapshot, nextReports)) {
      this.#reportsSnapshot = nextReports;
      for (const listener of this.#reportSnapshotListeners) listener();
    }
  };

  #sessionTransportSnapshot(): PresentationPreviewSnapshot {
    if (this.#snapshot.status === "editing") return Object.freeze({ status: "idle" });
    const surfaceId =
      this.#snapshot.status === "entering"
        ? this.#snapshot.surfaceId
        : this.#snapshot.active.surfaceId;
    return Object.freeze({ status: "loading", surfaceId });
  }

  #sessionReportsSnapshot(): LearnerInteractionPreviewSnapshot {
    if (this.#snapshot.status === "editing") return Object.freeze({ status: "idle" });
    const surfaceId =
      this.#snapshot.status === "entering"
        ? this.#snapshot.surfaceId
        : this.#snapshot.active.surfaceId;
    return Object.freeze({ status: "loading", surfaceId });
  }

  #disconnectRuntimePorts(): void {
    this.#disconnectPlayback();
    this.#disconnectReports();
    this.#refreshPortSnapshots();
  }

  #pauseAndDisconnectRuntimePorts(): void {
    try {
      this.#playback?.pause();
    } finally {
      this.#disconnectRuntimePorts();
    }
  }

  #disconnectPlayback(): void {
    this.#unsubscribePlayback?.();
    this.#unsubscribePlayback = null;
    this.#playback = null;
    this.#playbackGeneration = null;
  }

  #disconnectReports(): void {
    this.#unsubscribeReports?.();
    this.#unsubscribeReports = null;
    this.#reportsPort = null;
    this.#reportsGeneration = null;
  }

  #replaceSnapshot(snapshot: AuthorPreviewSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener();
    this.#refreshPortSnapshots();
  }

  #assertNotDisposed(): void {
    if (this.#disposed) throw new Error("Cannot use a disposed Author Preview Session.");
  }
}

function toPreparationInput(
  snapshot: AuthoringDocumentSnapshot,
  surfaceId: EmbeddedNodeId,
): AuthorPreviewPreparationInput {
  return Object.freeze({
    document: ScaffoldDocumentContentSchema.parse(snapshot.artifact.content),
    revision: snapshot.revision,
    surfaceId,
  });
}

function activePreview(
  prepared: PreparedAuthorPreview,
  entryId: number,
  runtimeGeneration: number,
  surfaceId: EmbeddedNodeId,
): ActiveAuthorPreview {
  return Object.freeze({ ...prepared, entryId, runtimeGeneration, surfaceId });
}

function toPreviewDocumentFailure(
  failure: Extract<AuthoringDocumentState, { readonly status: "invalid" }>["failure"],
): AuthorPreviewFailure {
  switch (failure.status) {
    case "canonicalization-failed":
      return Object.freeze({
        reason: "preview-document-invalid",
        issues: Object.freeze(
          failure.issues.map(({ code, path, message }) =>
            Object.freeze({ code, path: Object.freeze([...path]), message }),
          ),
        ),
      });
    case "requires-scaffold-plus":
      return Object.freeze({ reason: "preview-requires-scaffold-plus" });
    case "unsupported-core-format":
      return Object.freeze({
        reason: "preview-unsupported-core-format",
        documentVersion: failure.documentVersion,
        supportedVersion: failure.supportedVersion,
        message: failure.message,
      });
  }
}

function didPreviewConfigurationChange(
  previous: ScaffoldDocumentContent,
  next: ScaffoldDocumentContent,
): boolean {
  const previousRoot = (previous as { readonly content?: readonly Record<string, unknown>[] })
    .content?.[0];
  const nextRoot = (next as { readonly content?: readonly Record<string, unknown>[] }).content?.[0];
  const previousAttrs = previousRoot?.["attrs"] as Record<string, unknown> | undefined;
  const nextAttrs = nextRoot?.["attrs"] as Record<string, unknown> | undefined;
  return (
    JSON.stringify(previousAttrs?.["presentation"] ?? null) !==
      JSON.stringify(nextAttrs?.["presentation"] ?? null) ||
    JSON.stringify(previousAttrs?.["learnerInteractions"] ?? null) !==
      JSON.stringify(nextAttrs?.["learnerInteractions"] ?? null)
  );
}

function samePresentationSnapshot(
  left: PresentationPreviewSnapshot,
  right: PresentationPreviewSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameReportSnapshot(
  left: LearnerInteractionPreviewSnapshot,
  right: LearnerInteractionPreviewSnapshot,
): boolean {
  return (
    left.status === right.status &&
    (left.status === "idle" || (right.status !== "idle" && left.surfaceId === right.surfaceId))
  );
}

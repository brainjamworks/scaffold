import { Result, type Result as ResultType } from "better-result";

import type {
  PresentationPreviewDocument,
  PresentationPreviewLoadError,
  PresentationPreviewLoadResult,
  PresentationPreviewOperationError,
  PresentationPreviewOperationResult,
  PresentationPreviewPort,
  PresentationPreviewPlaybackPort,
  PresentationPreviewSeekError,
  PresentationPreviewSeekReport,
  PresentationPreviewSnapshot,
} from "@/presentation/model/presentation-preview-port";

export type PresentationPreviewControllerResult = ResultType<
  void,
  PresentationPreviewLoadError | PresentationPreviewOperationError
>;
export type PresentationPreviewControllerSeekResult = ResultType<
  PresentationPreviewSeekReport,
  PresentationPreviewLoadError | PresentationPreviewSeekError
>;

export interface CreatePresentationPreviewControllerInput {
  readonly port: PresentationPreviewPort;
  readonly close?: () => void;
}

export class PresentationPreviewController {
  readonly #close: () => void;
  readonly #listeners = new Set<() => void>();
  readonly #port: PresentationPreviewPort;
  readonly #unsubscribe: () => void;
  #currentDocument: PresentationPreviewDocument | null = null;
  #generation = 0;
  #disposed = false;

  constructor({ port, close = () => undefined }: CreatePresentationPreviewControllerInput) {
    this.#port = port;
    this.#close = close;
    this.#unsubscribe = port.subscribe(() => {
      if (this.#disposed) return;
      for (const listener of this.#listeners) listener();
    });
  }

  readonly getSnapshot = (): PresentationPreviewSnapshot => this.#port.getSnapshot();

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async loadCurrentDocument(
    input: PresentationPreviewDocument,
  ): Promise<ResultType<void, PresentationPreviewLoadError>> {
    this.#assertNotDisposed("load a document into");
    const generation = ++this.#generation;
    this.#currentDocument = null;
    const result = await this.#port.loadCurrentDocument(input);
    if (this.#disposed || generation !== this.#generation) return result;
    if (result.isOk()) this.#currentDocument = input;
    return result;
  }

  async play(input: PresentationPreviewDocument): Promise<PresentationPreviewControllerResult> {
    this.#assertNotDisposed("play");
    const loaded = await this.#ensureCurrentDocument(input);
    if (loaded.isErr()) return Result.err(loaded.error);
    return this.#port.play();
  }

  pause(input: PresentationPreviewDocument): PresentationPreviewOperationResult {
    this.#assertNotDisposed("pause");
    const snapshot = this.#port.getSnapshot();
    if (snapshot.status === "ready" && snapshot.surfaceId !== input.surfaceId) {
      return Result.err(
        Object.freeze({
          reason: "preview-surface-mismatch" as const,
          operation: "pause" as const,
          requestedSurfaceId: input.surfaceId,
          liveSurfaceId: snapshot.surfaceId,
        }),
      );
    }
    return this.#port.pause();
  }

  async seek(
    input: PresentationPreviewDocument,
    timeMs: number,
  ): Promise<PresentationPreviewControllerSeekResult> {
    this.#assertNotDisposed("seek");
    assertSeekTime(timeMs);
    if (!this.#isCurrentDocument(input)) {
      const loaded = await this.loadCurrentDocument(input);
      if (loaded.isErr()) return Result.err(loaded.error);
      if (!this.#isCurrentDocument(input)) {
        return Result.ok(Object.freeze({ kind: "superseded" as const, timeMs }));
      }
    }
    const generation = ++this.#generation;
    const result = await this.#port.seek(timeMs);
    if (!result.isOk() || (!this.#disposed && generation === this.#generation)) return result;
    return Result.ok(Object.freeze({ kind: "superseded" as const, timeMs }));
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation += 1;
    this.#currentDocument = null;
    this.#unsubscribe();
    this.#listeners.clear();
    this.#close();
  }

  close(): void {
    this.#assertNotDisposed("close");
    this.#generation += 1;
    this.#currentDocument = null;
    this.#close();
  }

  async #ensureCurrentDocument(
    input: PresentationPreviewDocument,
  ): Promise<ResultType<void, PresentationPreviewLoadError>> {
    if (this.#isCurrentDocument(input)) return Result.ok();
    return this.loadCurrentDocument(input);
  }

  #isCurrentDocument(input: PresentationPreviewDocument): boolean {
    const snapshot = this.#port.getSnapshot();
    return (
      this.#currentDocument?.document === input.document &&
      this.#currentDocument.surfaceId === input.surfaceId &&
      snapshot.status === "ready" &&
      snapshot.surfaceId === input.surfaceId
    );
  }

  #assertNotDisposed(operation: string): void {
    if (this.#disposed) {
      throw new Error(`Cannot ${operation} a disposed Presentation Preview Controller.`);
    }
  }
}

function assertSeekTime(timeMs: number): void {
  if (!Number.isSafeInteger(timeMs) || timeMs < 0) {
    throw new Error("Presentation Preview seek time must be a non-negative integer.");
  }
}

export interface CreatePresentationPreviewPortOwnerInput {
  readonly prepare: (input: PresentationPreviewDocument) => Promise<PresentationPreviewLoadResult>;
  readonly close: () => void;
}

interface PendingPreviewLoad {
  readonly generation: number;
  readonly input: PresentationPreviewDocument;
  readonly resolve: (result: PresentationPreviewLoadResult) => void;
  prepared: boolean;
}

/** Owns the disposable runtime mount while keeping runtime details behind the neutral port. */
export class PresentationPreviewPortOwner implements PresentationPreviewPort {
  readonly #closeRuntime: () => void;
  readonly #listeners = new Set<() => void>();
  readonly #prepare: CreatePresentationPreviewPortOwnerInput["prepare"];
  #generation = 0;
  #pending: PendingPreviewLoad | null = null;
  #playback: PresentationPreviewPlaybackPort | null = null;
  #unsubscribePlayback: (() => void) | null = null;
  #snapshot: PresentationPreviewSnapshot = Object.freeze({ status: "idle" });

  constructor({ prepare, close }: CreatePresentationPreviewPortOwnerInput) {
    this.#prepare = prepare;
    this.#closeRuntime = close;
  }

  readonly getSnapshot = (): PresentationPreviewSnapshot =>
    this.#playback?.getSnapshot() ?? this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async loadCurrentDocument(
    input: PresentationPreviewDocument,
  ): Promise<PresentationPreviewLoadResult> {
    const generation = ++this.#generation;
    const replacesOwnedRuntime = this.#pending !== null || this.#playback !== null;
    this.#supersedePending();
    if (replacesOwnedRuntime) this.#closeRuntime();
    this.#disconnectPlayback();
    this.#replaceSnapshot(Object.freeze({ status: "loading", surfaceId: input.surfaceId }));

    const completion = new Promise<PresentationPreviewLoadResult>((resolve) => {
      this.#pending = { generation, input, resolve, prepared: false };
    });
    const prepared = await this.#prepare(input);
    const pending = this.#pending;
    if (!pending || pending.generation !== generation) return completion;
    if (prepared.isErr()) {
      this.#pending = null;
      this.#replaceSnapshot(
        Object.freeze({ status: "error", surfaceId: input.surfaceId, error: prepared.error }),
      );
      pending.resolve(prepared);
      return completion;
    }
    pending.prepared = true;
    this.#settleConnectedLoad();
    return completion;
  }

  connect(port: PresentationPreviewPlaybackPort | null): void {
    this.#disconnectPlayback();
    if (!port) return;
    const snapshot = port.getSnapshot();
    if (snapshot.status !== "ready") {
      throw new Error("Author Preview connected a playback port before it was ready.");
    }
    const pendingSurfaceId = this.#pending?.input.surfaceId;
    if (pendingSurfaceId && snapshot.surfaceId !== pendingSurfaceId) {
      throw new Error(
        `Author Preview connected Surface "${snapshot.surfaceId}" while loading "${pendingSurfaceId}".`,
      );
    }
    this.#playback = port;
    this.#unsubscribePlayback = port.subscribe(this.#publish);
    this.#publish();
    this.#settleConnectedLoad();
  }

  play(): PresentationPreviewOperationResult {
    return this.#playback?.play() ?? this.#notReady("play");
  }

  pause(): PresentationPreviewOperationResult {
    return this.#playback?.pause() ?? this.#notReady("pause");
  }

  seek(timeMs: number) {
    return this.#playback?.seek(timeMs) ?? Promise.resolve(this.#notReady("seek"));
  }

  close(): void {
    this.#generation += 1;
    this.#supersedePending();
    this.#disconnectPlayback();
    this.#closeRuntime();
    this.#replaceSnapshot(Object.freeze({ status: "idle" }));
  }

  #settleConnectedLoad(): void {
    const pending = this.#pending;
    if (!pending?.prepared || !this.#playback) return;
    this.#pending = null;
    pending.resolve(Result.ok());
  }

  #supersedePending(): void {
    const pending = this.#pending;
    if (!pending) return;
    this.#pending = null;
    pending.resolve(
      Result.err(
        Object.freeze({
          reason: "preview-load-superseded" as const,
          surfaceId: pending.input.surfaceId,
        }),
      ),
    );
  }

  #disconnectPlayback(): void {
    this.#unsubscribePlayback?.();
    this.#unsubscribePlayback = null;
    this.#playback = null;
  }

  #notReady(operation: "play" | "pause" | "seek") {
    const snapshot = this.getSnapshot();
    if (snapshot.status === "ready") {
      throw new Error("Presentation Preview lost its ready playback port.");
    }
    return Result.err(
      Object.freeze({ reason: "preview-not-ready" as const, operation, status: snapshot.status }),
    );
  }

  readonly #publish = (): void => {
    for (const listener of this.#listeners) listener();
  };

  #replaceSnapshot(snapshot: PresentationPreviewSnapshot): void {
    this.#snapshot = snapshot;
    this.#publish();
  }
}

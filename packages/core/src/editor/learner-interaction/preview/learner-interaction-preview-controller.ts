import { Result } from "better-result";

import type {
  LearnerInteractionPreviewDocument,
  LearnerInteractionPreviewLoadResult,
  LearnerInteractionPreviewPort,
  LearnerInteractionPreviewReportsPort,
  LearnerInteractionPreviewSnapshot,
  LearnerInteractionTurnReport,
} from "@/learner-interaction/model";

export interface CreateLearnerInteractionPreviewControllerInput {
  readonly port: LearnerInteractionPreviewPort;
  readonly close?: () => void;
}

export class LearnerInteractionPreviewController {
  readonly #close: () => void;
  readonly #port: LearnerInteractionPreviewPort;
  readonly #snapshotListeners = new Set<() => void>();
  readonly #reportListeners = new Set<(report: LearnerInteractionTurnReport) => void>();
  readonly #unsubscribeSnapshot: () => void;
  readonly #unsubscribeReports: () => void;
  #currentDocument: LearnerInteractionPreviewDocument | null = null;
  #generation = 0;
  #disposed = false;

  constructor({ port, close = () => undefined }: CreateLearnerInteractionPreviewControllerInput) {
    this.#port = port;
    this.#close = close;
    this.#unsubscribeSnapshot = port.subscribe(() => {
      if (this.#disposed) return;
      for (const listener of this.#snapshotListeners) listener();
    });
    this.#unsubscribeReports = port.subscribeReports((report) => {
      if (this.#disposed) return;
      for (const listener of this.#reportListeners) listener(report);
    });
  }

  readonly getSnapshot = (): LearnerInteractionPreviewSnapshot => this.#port.getSnapshot();

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => undefined;
    this.#snapshotListeners.add(listener);
    return () => this.#snapshotListeners.delete(listener);
  };

  readonly subscribeReports = (
    listener: (report: LearnerInteractionTurnReport) => void,
  ): (() => void) => {
    if (this.#disposed) return () => undefined;
    this.#reportListeners.add(listener);
    return () => this.#reportListeners.delete(listener);
  };

  async loadCurrentDocument(
    input: LearnerInteractionPreviewDocument,
  ): Promise<LearnerInteractionPreviewLoadResult> {
    this.#assertNotDisposed("load a document into");
    const snapshot = this.#port.getSnapshot();
    if (
      this.#currentDocument?.document === input.document &&
      this.#currentDocument.surfaceId === input.surfaceId &&
      snapshot.status === "ready" &&
      snapshot.surfaceId === input.surfaceId
    ) {
      return Result.ok();
    }
    const generation = ++this.#generation;
    this.#currentDocument = null;
    const result = await this.#port.loadCurrentDocument(input);
    if (!this.#disposed && generation === this.#generation && result.isOk()) {
      this.#currentDocument = input;
    }
    return result;
  }

  close(): void {
    this.#assertNotDisposed("close");
    this.#generation += 1;
    this.#currentDocument = null;
    this.#reportListeners.clear();
    this.#close();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation += 1;
    this.#currentDocument = null;
    this.#unsubscribeSnapshot();
    this.#unsubscribeReports();
    this.#snapshotListeners.clear();
    this.#reportListeners.clear();
    this.#close();
  }

  #assertNotDisposed(operation: string): void {
    if (this.#disposed) {
      throw new Error(`Cannot ${operation} a disposed Learner Interaction Preview Controller.`);
    }
  }
}

export interface CreateLearnerInteractionPreviewPortOwnerInput {
  readonly prepare: (
    input: LearnerInteractionPreviewDocument,
  ) => Promise<LearnerInteractionPreviewLoadResult>;
  readonly close: () => void;
}

interface PendingPreviewLoad {
  readonly generation: number;
  readonly input: LearnerInteractionPreviewDocument;
  readonly resolve: (result: LearnerInteractionPreviewLoadResult) => void;
  prepared: boolean;
}

/** Owns the disposable runtime mount while exposing only status and turn reports. */
export class LearnerInteractionPreviewPortOwner implements LearnerInteractionPreviewPort {
  readonly #closeRuntime: () => void;
  readonly #prepare: CreateLearnerInteractionPreviewPortOwnerInput["prepare"];
  readonly #snapshotListeners = new Set<() => void>();
  readonly #reportListeners = new Set<(report: LearnerInteractionTurnReport) => void>();
  #generation = 0;
  #pending: PendingPreviewLoad | null = null;
  #reports: LearnerInteractionPreviewReportsPort | null = null;
  #surfaceId: LearnerInteractionPreviewDocument["surfaceId"] | null = null;
  #unsubscribeReports: (() => void) | null = null;
  #snapshot: LearnerInteractionPreviewSnapshot = Object.freeze({ status: "idle" });

  constructor({ prepare, close }: CreateLearnerInteractionPreviewPortOwnerInput) {
    this.#prepare = prepare;
    this.#closeRuntime = close;
  }

  readonly getSnapshot = (): LearnerInteractionPreviewSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#snapshotListeners.add(listener);
    return () => this.#snapshotListeners.delete(listener);
  };

  readonly subscribeReports = (
    listener: (report: LearnerInteractionTurnReport) => void,
  ): (() => void) => {
    this.#reportListeners.add(listener);
    return () => this.#reportListeners.delete(listener);
  };

  async loadCurrentDocument(
    input: LearnerInteractionPreviewDocument,
  ): Promise<LearnerInteractionPreviewLoadResult> {
    const generation = ++this.#generation;
    const replacesOwnedRuntime = this.#pending !== null || this.#surfaceId !== null;
    this.#supersedePending();
    if (replacesOwnedRuntime) this.#closeRuntime();
    this.#disconnectReports();
    this.#surfaceId = input.surfaceId;
    this.#replaceSnapshot(Object.freeze({ status: "loading", surfaceId: input.surfaceId }));

    const completion = new Promise<LearnerInteractionPreviewLoadResult>((resolve) => {
      this.#pending = { generation, input, resolve, prepared: false };
    });
    const prepared = await this.#prepare(input);
    const pending = this.#pending;
    if (!pending || pending.generation !== generation) return completion;
    if (prepared.isErr()) {
      this.#pending = null;
      this.#surfaceId = null;
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

  connect(port: LearnerInteractionPreviewReportsPort | null): void {
    this.#disconnectReports();
    if (!port) return;
    if (!this.#pending && this.#surfaceId === null) {
      throw new Error("Author Preview connected reports without a pending load.");
    }
    this.#reports = port;
    this.#unsubscribeReports = port.subscribeReports(this.#publishReport);
    this.#settleConnectedLoad();
  }

  close(): void {
    this.#generation += 1;
    this.#supersedePending();
    this.#disconnectReports();
    this.#surfaceId = null;
    this.#closeRuntime();
    this.#replaceSnapshot(Object.freeze({ status: "idle" }));
  }

  #settleConnectedLoad(): void {
    const pending = this.#pending;
    if (!pending?.prepared || !this.#reports) return;
    this.#pending = null;
    this.#replaceSnapshot(Object.freeze({ status: "ready", surfaceId: pending.input.surfaceId }));
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

  #disconnectReports(): void {
    this.#unsubscribeReports?.();
    this.#unsubscribeReports = null;
    this.#reports = null;
  }

  readonly #publishReport = (report: LearnerInteractionTurnReport): void => {
    for (const listener of this.#reportListeners) listener(report);
  };

  #replaceSnapshot(snapshot: LearnerInteractionPreviewSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#snapshotListeners) listener();
  }
}

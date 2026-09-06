import { ScaffoldDocumentContentSchema, type ScaffoldDocumentContent } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { Result, type Result as ResultType } from "better-result";

import type { CompilationSnapshot } from "@/authoring/publication/build-compilation-snapshot";
import type {
  LearnerContentPreparationError,
  LearnerContentPreparationResult,
} from "@/authoring/publication/prepare-learner-content";
import { checkLearnerInteractionPublication } from "@/authoring/publication/learner-interaction-publication";
import type { CourseDocumentAuthoringFailure } from "@/document/authoring/CourseDocumentEditor";
import type { LearnerInteractionCompileDiagnostic } from "@/learner-interaction/model";
import type {
  ArtifactRevision,
  LearnerPublicationPayload,
  LearnerPublicationPort,
  LearnerPublicationStatus,
  LearnerPublicationStatusFailure,
  LearnerPublicationStatusResult,
  LearnerPublishFailure,
} from "@/host/ports";
import { CourseDocumentAttrsSchema } from "@/schemas/course-document";

import type { AuthoringSaveFailure, AuthoringSaveSnapshot } from "./authoring-save-controller";
import type { AuthoringDocumentSnapshot, AuthoringDocumentState } from "./use-authoring-document";

export type ScaffoldAuthoringPublishState =
  | "loading"
  | "not-published"
  | "published"
  | "unpublished"
  | "unsaved"
  | "publishing"
  | "invalid"
  | "unavailable-content"
  | "requires-scaffold-plus"
  | "unsupported-core-format"
  | "projection-warning"
  | "payload-too-large"
  | "stale-artifact-revision"
  | "forbidden"
  | "invalid-payload"
  | "error";

export interface PublishingSourceRevision {
  readonly localRevision: number;
  readonly artifactRevision: ArtifactRevision;
}

export type AuthoringPublishFailure =
  | { readonly reason: "session-closed" }
  | { readonly reason: "status-not-loaded" }
  | { readonly reason: "publication-in-flight"; readonly source: PublishingSourceRevision }
  | { readonly reason: "invalid-document"; readonly failure: CourseDocumentAuthoringFailure }
  | {
      readonly reason: "save-busy";
      readonly activity: Exclude<AuthoringSaveSnapshot["activity"], "idle">;
      readonly localRevision: number;
    }
  | {
      readonly reason: "save-failed";
      readonly localRevision: number;
      readonly failure: AuthoringSaveFailure;
    }
  | {
      readonly reason: "unsaved";
      readonly localRevision: number;
      readonly savedLocalRevision: number | null;
    }
  | {
      readonly reason: "saved-revision-stale";
      readonly savedArtifactRevision: ArtifactRevision;
      readonly currentArtifactRevision: ArtifactRevision;
    }
  | LearnerContentPreparationError
  | {
      readonly reason: "learner-interaction-invalid";
      readonly diagnostics: readonly LearnerInteractionCompileDiagnostic[];
    }
  | {
      readonly reason: "publication-failed";
      readonly failure: LearnerPublishFailure;
    }
  | {
      readonly reason: "publication-not-activated";
      readonly sourceArtifactRevision: ArtifactRevision;
      readonly publishedArtifactRevision: ArtifactRevision | null;
    };

export type AuthoringPublishResult = ResultType<LearnerPublicationStatus, AuthoringPublishFailure>;

export type AuthoringPublicationStatusLoadFailure = {
  readonly reason: "status-load-failed";
  readonly failure: LearnerPublicationStatusFailure;
};

export interface AuthoringPublicationSnapshot {
  readonly publishState: ScaffoldAuthoringPublishState;
  readonly status: LearnerPublicationStatus | null;
  readonly inFlight: PublishingSourceRevision | null;
  readonly lastFailure: AuthoringPublishFailure | AuthoringPublicationStatusLoadFailure | null;
}

export interface AuthoringPublicationDocument {
  getSnapshot(): AuthoringDocumentState;
  subscribe(listener: () => void): () => void;
  capture(): ResultType<AuthoringDocumentSnapshot, CourseDocumentAuthoringFailure>;
}

export interface AuthoringPublicationSaving {
  getSnapshot(): AuthoringSaveSnapshot;
  subscribe(listener: () => void): () => void;
  seedInitialSavedRevision(revision: ArtifactRevision): void;
}

export interface CreateAuthoringPublicationControllerInput {
  readonly document: AuthoringPublicationDocument;
  readonly saving: AuthoringPublicationSaving;
  readonly publication: LearnerPublicationPort;
  readonly initialSavedArtifactRevision: ArtifactRevision | null;
  readonly prepareLearnerContent: (
    document: ScaffoldDocumentContent,
  ) => LearnerContentPreparationResult;
  readonly buildCompilationSnapshot: (
    document: ScaffoldDocumentContent,
    revision: number,
  ) => CompilationSnapshot;
}

export interface AuthoringPublicationController {
  getSnapshot(): AuthoringPublicationSnapshot;
  subscribe(listener: () => void): () => void;
  loadStatus(): Promise<LearnerPublicationStatusResult>;
  publish(): Promise<AuthoringPublishResult>;
  dispose(): void;
}

export class DefaultAuthoringPublicationController implements AuthoringPublicationController {
  readonly #buildCompilationSnapshot: CreateAuthoringPublicationControllerInput["buildCompilationSnapshot"];
  readonly #document: AuthoringPublicationDocument;
  readonly #initialSavedArtifactRevision: ArtifactRevision | null;
  readonly #listeners = new Set<() => void>();
  readonly #prepareLearnerContent: CreateAuthoringPublicationControllerInput["prepareLearnerContent"];
  readonly #publication: LearnerPublicationPort;
  readonly #saving: AuthoringPublicationSaving;
  readonly #unsubscribeDocument: () => void;
  readonly #unsubscribeSaving: () => void;
  #disposed = false;
  #inFlight: PublishingSourceRevision | null = null;
  #lastFailure: AuthoringPublicationSnapshot["lastFailure"] = null;
  #loadStatusPromise: Promise<LearnerPublicationStatusResult> | null = null;
  #snapshot: AuthoringPublicationSnapshot;
  #status: LearnerPublicationStatus | null = null;

  constructor({
    buildCompilationSnapshot,
    document,
    initialSavedArtifactRevision,
    prepareLearnerContent,
    publication,
    saving,
  }: CreateAuthoringPublicationControllerInput) {
    this.#buildCompilationSnapshot = buildCompilationSnapshot;
    this.#document = document;
    this.#initialSavedArtifactRevision = initialSavedArtifactRevision;
    this.#prepareLearnerContent = prepareLearnerContent;
    this.#publication = publication;
    this.#saving = saving;
    this.#snapshot = this.#createSnapshot();
    this.#unsubscribeDocument = document.subscribe(this.#observeInputs);
    this.#unsubscribeSaving = saving.subscribe(this.#observeSaving);
  }

  readonly getSnapshot = (): AuthoringPublicationSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  loadStatus(): Promise<LearnerPublicationStatusResult> {
    this.#loadStatusPromise ??= this.#loadStatus();
    return this.#loadStatusPromise;
  }

  async publish(): Promise<AuthoringPublishResult> {
    if (this.#disposed) return Result.err(Object.freeze({ reason: "session-closed" as const }));
    if (this.#inFlight) {
      return this.#fail(
        Object.freeze({ reason: "publication-in-flight" as const, source: this.#inFlight }),
      );
    }

    const beforeCapture = this.#publicationEligibility();
    if (beforeCapture) return this.#fail(beforeCapture);

    const captured = this.#document.capture();
    if (captured.isErr()) {
      return this.#fail(
        Object.freeze({ reason: "invalid-document" as const, failure: captured.error }),
      );
    }
    const afterCapture = this.#publicationEligibility(captured.value.revision);
    if (afterCapture) return this.#fail(afterCapture);

    const saved = this.#saving.getSnapshot().lastSaved;
    if (!saved) {
      throw new Error("Publication eligibility lost its saved revision.");
    }
    const checkedInput = ScaffoldDocumentContentSchema.parse(captured.value.artifact.content);
    const preparation = this.#prepareLearnerContent(checkedInput);
    if (preparation.isErr()) return this.#fail(preparation.error);

    const compilation = this.#buildCompilationSnapshot(
      preparation.value.canonicalDocument,
      captured.value.revision,
    );
    if (compilation.revision !== captured.value.revision) {
      throw new Error("Compilation snapshot revision did not match its captured document.");
    }
    const interactionPublication = checkLearnerInteractionPublication({
      document: preparation.value.canonicalDocument,
      courseStructure: compilation.courseStructure,
      semanticSnapshot: compilation.documentTree,
      controlCapabilities: compilation.controlCapabilities,
    });
    if (interactionPublication.status === "diagnostic") {
      return this.#fail(
        Object.freeze({
          reason: "learner-interaction-invalid" as const,
          diagnostics: Object.freeze([...interactionPublication.diagnostics]),
        }),
      );
    }

    const courseAttrs = CourseDocumentAttrsSchema.parse(
      (preparation.value.canonicalDocument as JSONContent).content?.[0]?.attrs,
    );
    const source = Object.freeze({
      localRevision: captured.value.revision,
      artifactRevision: saved.artifactRevision,
    });
    const payload: LearnerPublicationPayload = Object.freeze({
      sourceArtifactRevision: source.artifactRevision,
      artifact: Object.freeze({
        id: captured.value.artifact.id,
        title: captured.value.artifact.title,
        mode: captured.value.artifact.mode,
        requiresScaffoldPlus: courseAttrs.requiresScaffoldPlus,
      }),
      learnerContent: preparation.value.learnerContent,
      assessmentTargets: preparation.value.assessmentTargets,
      assessmentGroups: preparation.value.assessmentGroups,
    });

    this.#lastFailure = null;
    this.#inFlight = source;
    this.#refreshSnapshot();
    let outcome;
    try {
      outcome = await this.#publication.publish(payload);
    } catch (error) {
      if (!this.#disposed) {
        this.#inFlight = null;
        this.#refreshSnapshot();
      }
      throw error;
    }
    if (this.#disposed) {
      return Result.err(Object.freeze({ reason: "session-closed" as const }));
    }

    this.#inFlight = null;
    if (outcome.isErr()) {
      return this.#fail(
        Object.freeze({ reason: "publication-failed" as const, failure: outcome.error }),
      );
    }

    this.#status = this.#statusWithAuthoritativeSavedRevision(outcome.value);
    if (outcome.value.publishedArtifactRevision !== source.artifactRevision) {
      return this.#fail(
        Object.freeze({
          reason: "publication-not-activated" as const,
          sourceArtifactRevision: source.artifactRevision,
          publishedArtifactRevision: outcome.value.publishedArtifactRevision,
        }),
      );
    }
    this.#lastFailure = null;
    this.#refreshSnapshot();
    return Result.ok(this.#status);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribeDocument();
    this.#unsubscribeSaving();
    this.#inFlight = null;
    this.#listeners.clear();
  }

  async #loadStatus(): Promise<LearnerPublicationStatusResult> {
    const outcome = await this.#publication.getStatus();
    if (this.#disposed) return outcome;
    if (outcome.isErr()) {
      this.#lastFailure = Object.freeze({
        reason: "status-load-failed",
        failure: outcome.error,
      });
      this.#refreshSnapshot();
      return outcome;
    }

    const initialRevision =
      this.#initialSavedArtifactRevision ?? outcome.value.currentArtifactRevision;
    this.#saving.seedInitialSavedRevision(initialRevision);
    this.#status = this.#statusWithAuthoritativeSavedRevision(outcome.value);
    this.#lastFailure = null;
    this.#refreshSnapshot();
    return Result.ok(this.#status);
  }

  readonly #observeInputs = (): void => {
    if (this.#disposed) return;
    if (!this.#inFlight && this.#lastFailure?.reason !== "status-load-failed") {
      this.#lastFailure = null;
    }
    this.#refreshSnapshot();
  };

  readonly #observeSaving = (): void => {
    if (this.#disposed) return;
    if (this.#status) this.#status = this.#statusWithAuthoritativeSavedRevision(this.#status);
    if (!this.#inFlight && this.#lastFailure?.reason !== "status-load-failed") {
      this.#lastFailure = null;
    }
    this.#refreshSnapshot();
  };

  #statusWithAuthoritativeSavedRevision(
    status: LearnerPublicationStatus,
  ): LearnerPublicationStatus {
    const savedRevision = this.#saving.getSnapshot().lastSaved?.artifactRevision;
    return Object.freeze({
      ...status,
      currentArtifactRevision: savedRevision ?? status.currentArtifactRevision,
    });
  }

  #publicationEligibility(capturedRevision?: number): AuthoringPublishFailure | null {
    const document = this.#document.getSnapshot();
    if (document.status === "invalid") {
      return Object.freeze({ reason: "invalid-document", failure: document.failure });
    }
    if (!this.#status) return Object.freeze({ reason: "status-not-loaded" });

    const saving = this.#saving.getSnapshot();
    if (saving.lastFailure) {
      return Object.freeze({
        reason: "save-failed",
        localRevision: document.snapshot.revision,
        failure: saving.lastFailure,
      });
    }
    if (saving.activity !== "idle") {
      return Object.freeze({
        reason: "save-busy",
        activity: saving.activity,
        localRevision: document.snapshot.revision,
      });
    }
    const expectedRevision = capturedRevision ?? document.snapshot.revision;
    if (!saving.lastSaved || saving.lastSaved.localRevision !== expectedRevision) {
      return Object.freeze({
        reason: "unsaved",
        localRevision: expectedRevision,
        savedLocalRevision: saving.lastSaved?.localRevision ?? null,
      });
    }
    if (saving.lastSaved.artifactRevision !== this.#status.currentArtifactRevision) {
      return Object.freeze({
        reason: "saved-revision-stale",
        savedArtifactRevision: saving.lastSaved.artifactRevision,
        currentArtifactRevision: this.#status.currentArtifactRevision,
      });
    }
    return null;
  }

  #fail(failure: AuthoringPublishFailure): AuthoringPublishResult {
    this.#lastFailure = failure;
    this.#refreshSnapshot();
    return Result.err(failure);
  }

  #createSnapshot(): AuthoringPublicationSnapshot {
    return Object.freeze({
      publishState: this.#derivePublishState(),
      status: this.#status,
      inFlight: this.#inFlight,
      lastFailure: this.#lastFailure,
    });
  }

  #derivePublishState(): ScaffoldAuthoringPublishState {
    const document = this.#document.getSnapshot();
    if (document.status === "invalid") return "invalid";
    if (this.#inFlight) return "publishing";
    if (!this.#status) return this.#lastFailure ? "error" : "loading";

    const saving = this.#saving.getSnapshot();
    if (
      saving.lastFailure ||
      saving.activity !== "idle" ||
      !saving.lastSaved ||
      saving.lastSaved.localRevision !== document.snapshot.revision
    ) {
      return "unsaved";
    }
    if (saving.lastSaved.artifactRevision !== this.#status.currentArtifactRevision) {
      return "stale-artifact-revision";
    }
    if (this.#lastFailure) return publishStateForFailure(this.#lastFailure);
    if (this.#status.publishedArtifactRevision === null) return "not-published";
    return this.#status.publishedArtifactRevision === this.#status.currentArtifactRevision
      ? "published"
      : "unpublished";
  }

  #refreshSnapshot(): void {
    this.#snapshot = this.#createSnapshot();
    for (const listener of this.#listeners) listener();
  }
}

export function createAuthoringPublicationController(
  input: CreateAuthoringPublicationControllerInput,
): AuthoringPublicationController {
  return new DefaultAuthoringPublicationController(input);
}

function publishStateForFailure(
  failure: AuthoringPublicationSnapshot["lastFailure"],
): ScaffoldAuthoringPublishState {
  if (!failure) return "error";
  switch (failure.reason) {
    case "invalid":
    case "unavailable-content":
    case "requires-scaffold-plus":
    case "unsupported-core-format":
    case "projection-warning":
    case "payload-too-large":
      return failure.reason;
    case "invalid-document":
    case "learner-interaction-invalid":
      return "invalid";
    case "saved-revision-stale":
      return "stale-artifact-revision";
    case "publication-failed":
      switch (failure.failure.reason) {
        case "stale-artifact-revision":
        case "forbidden":
        case "invalid-payload":
          return failure.failure.reason;
        default:
          return "error";
      }
    case "save-busy":
    case "save-failed":
    case "unsaved":
      return "unsaved";
    case "publication-in-flight":
      return "publishing";
    default:
      return "error";
  }
}

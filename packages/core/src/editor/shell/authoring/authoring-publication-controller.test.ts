import { ScaffoldDocumentContentSchema, type ScaffoldDocumentContent } from "@scaffold/contracts";
import { Result } from "better-result";
import { describe, expect, it, vi } from "vite-plus/test";

import { buildCompilationSnapshot } from "@/authoring/publication/build-compilation-snapshot";
import type { PreparedLearnerContent } from "@/authoring/publication/prepare-learner-content";
import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import type { CourseDocumentAuthoringFailure } from "@/document/authoring/CourseDocumentEditor";
import { createScaffoldDocumentContent } from "@/format/artifact";
import type {
  LearnerPublicationPort,
  LearnerPublicationStatus,
  LearnerPublicationStatusResult,
  LearnerPublishResult,
} from "@/host/ports";
import { learnerPublicationStatusFailed, learnerPublishFailed } from "@/host/ports";
import type { AuthoringSaveSnapshot } from "./authoring-save-controller";
import {
  createAuthoringPublicationController,
  type AuthoringPublicationDocument,
  type AuthoringPublicationSaving,
} from "./authoring-publication-controller";
import type { AuthoringDocumentSnapshot, AuthoringDocumentState } from "./use-authoring-document";

const application = createScaffoldApplication();
const authoring = getCourseDocumentAuthoringEnvironmentState(
  createCourseDocumentAuthoringEnvironment({ composition: application.authoring }),
);

describe("AuthoringPublicationController", () => {
  it("refuses publication before the one host status read completes", async () => {
    const harness = createHarness();

    const result = await harness.controller.publish();

    expect(result).toMatchObject({ error: { reason: "status-not-loaded" } });
    expect(harness.publication.publish).not.toHaveBeenCalled();
  });

  it("loads host status once and prefers the supplied initial saved revision", async () => {
    const harness = createHarness({
      initialSavedArtifactRevision: "initial-revision",
      hostStatus: status("host-revision"),
    });

    const first = harness.controller.loadStatus();
    const second = harness.controller.loadStatus();
    expect(first).toBe(second);
    await first;

    expect(harness.publication.getStatus).toHaveBeenCalledTimes(1);
    expect(harness.saving.seedCalls).toEqual(["initial-revision"]);
    expect(harness.saving.getSnapshot().lastSaved).toEqual({
      localRevision: 0,
      artifactRevision: "initial-revision",
    });
    expect(harness.controller.getSnapshot()).toMatchObject({
      publishState: "not-published",
      status: { currentArtifactRevision: "initial-revision" },
    });
  });

  it("falls back to host status for the initial seed without overwriting a racing save", async () => {
    const hostStatus = deferred<LearnerPublicationStatusResult>();
    const harness = createHarness({ getStatus: vi.fn(() => hostStatus.promise) });

    const loading = harness.controller.loadStatus();
    harness.document.setRevision(1);
    harness.saving.set({
      currentLocalRevision: 1,
      lastSaved: { localRevision: 1, artifactRevision: "saved-during-load" },
    });
    hostStatus.resolve(Result.ok(status("old-host-revision")));
    await loading;

    expect(harness.saving.seedCalls).toEqual(["old-host-revision"]);
    expect(harness.saving.getSnapshot().lastSaved?.artifactRevision).toBe("saved-during-load");
    expect(harness.controller.getSnapshot()).toMatchObject({
      publishState: "not-published",
      status: { currentArtifactRevision: "saved-during-load" },
    });
  });

  it("retains a typed status-read failure and leaves unexpected defects observable", async () => {
    const cause = new DOMException("read aborted", "AbortError");
    const expected = createHarness({
      getStatus: vi.fn(async () =>
        learnerPublicationStatusFailed({
          reason: "read-aborted",
          artifactId: "artifact-1",
          cause,
        }),
      ),
    });
    const result = await expected.controller.loadStatus();
    expect(result.isErr()).toBe(true);
    expect(expected.controller.getSnapshot()).toMatchObject({
      publishState: "error",
      lastFailure: {
        reason: "status-load-failed",
        failure: { reason: "read-aborted", artifactId: "artifact-1", cause },
      },
    });

    const defect = new Error("broken publication status invariant");
    const unexpected = createHarness({
      getStatus: vi.fn(async () => {
        throw defect;
      }),
    });
    await expect(unexpected.controller.loadStatus()).rejects.toBe(defect);
  });

  it.each([
    {
      name: "an unsaved edit",
      arrange: (harness: Harness) => harness.document.setRevision(1),
      reason: "unsaved",
    },
    {
      name: "scheduled saving",
      arrange: (harness: Harness) => harness.saving.set({ activity: "scheduled" }),
      reason: "save-busy",
    },
    {
      name: "a failed save",
      arrange: (harness: Harness) =>
        harness.saving.set({
          lastFailure: {
            reason: "persistence-failed",
            requestedRevision: 0,
            failure: {
              reason: "write-aborted",
              artifactId: "artifact-1",
              cause: new Error("write aborted"),
            },
          },
        }),
      reason: "save-failed",
    },
  ])("refuses $name without implicitly saving or publishing", async ({ arrange, reason }) => {
    const harness = createHarness();
    await harness.controller.loadStatus();
    arrange(harness);

    const result = await harness.controller.publish();

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error(`expected ${reason} refusal`);
    expect(result.error.reason).toBe(reason);
    expect(harness.publication.publish).not.toHaveBeenCalled();
  });

  it("refuses a saved revision that is stale against the host status", async () => {
    const harness = createHarness({
      hostStatus: status("newer-host-revision"),
    });
    await harness.controller.loadStatus();
    harness.saving.set(
      {
        lastSaved: { localRevision: 0, artifactRevision: "saved-revision" },
      },
      false,
    );

    const result = await harness.controller.publish();

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("expected stale saved revision refusal");
    expect(result.error).toEqual({
      reason: "saved-revision-stale",
      savedArtifactRevision: "saved-revision",
      currentArtifactRevision: "newer-host-revision",
    });
    expect(harness.publication.publish).not.toHaveBeenCalled();
  });

  it("retains an invalid document failure without capturing or publishing", async () => {
    const harness = createHarness();
    await harness.controller.loadStatus();
    const failure = {
      status: "canonicalization-failed" as const,
      issues: [{ code: "invalid_document", message: "Invalid document", path: [] }],
    };
    harness.document.invalidate(failure);

    const result = await harness.controller.publish();

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("expected invalid document refusal");
    expect(result.error).toEqual({ reason: "invalid-document", failure });
    expect(harness.document.captureCalls).toBe(0);
    expect(harness.publication.publish).not.toHaveBeenCalled();
  });

  it("publishes one captured revision and builds every derived view from its checked JSON", async () => {
    const canonical = document("capturesurf1");
    const prepare = vi.fn((_input: ScaffoldDocumentContent) => Result.ok(prepared(canonical)));
    const build = vi.fn((input: ScaffoldDocumentContent, revision: number) =>
      buildCompilationSnapshot(
        input,
        revision,
        authoring.schema,
        application.authoring.documentTree,
      ),
    );
    const harness = createHarness({
      content: document("originalsr01"),
      prepare,
      build,
    });
    await harness.controller.loadStatus();

    const result = await harness.controller.publish();

    expect(result.isOk()).toBe(true);
    expect(harness.document.captureCalls).toBe(1);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledWith(canonical, 0);
    expect(harness.publication.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceArtifactRevision: "revision-0",
        artifact: expect.objectContaining({ id: "artifact-1", title: "Lesson" }),
        learnerContent: canonical,
      }),
    );
    expect(harness.controller.getSnapshot().publishState).toBe("published");
  });

  it("retains an expected host refusal and rethrows an unexpected adapter defect", async () => {
    const cause = new Error("permission denied");
    const expected = createHarness({
      publish: vi.fn(async () =>
        learnerPublishFailed({ reason: "forbidden", artifactId: "artifact-1", cause }),
      ),
    });
    await expected.controller.loadStatus();
    const result = await expected.controller.publish();
    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("expected host refusal");
    expect(result.error).toEqual({
      reason: "publication-failed",
      failure: { reason: "forbidden", artifactId: "artifact-1", cause },
    });
    expect(expected.controller.getSnapshot().publishState).toBe("forbidden");

    const defect = new Error("adapter invariant failed");
    const unexpected = createHarness({
      publish: vi.fn(async () => {
        throw defect;
      }),
    });
    await unexpected.controller.loadStatus();
    await expect(unexpected.controller.publish()).rejects.toBe(defect);
    expect(unexpected.controller.getSnapshot().inFlight).toBeNull();
  });

  it("retains a successful host response that did not activate the captured source", async () => {
    const harness = createHarness({
      publish: vi.fn(async () => Result.ok(status("revision-0", null))),
    });
    await harness.controller.loadStatus();

    const result = await harness.controller.publish();

    expect(result).toMatchObject({
      error: {
        reason: "publication-not-activated",
        sourceArtifactRevision: "revision-0",
        publishedArtifactRevision: null,
      },
    });
    expect(harness.controller.getSnapshot().publishState).toBe("error");
  });

  it("keeps an in-flight publication attached to its capture while later edits stay dirty", async () => {
    const publication = deferred<LearnerPublishResult>();
    const harness = createHarness({ publish: vi.fn(() => publication.promise) });
    await harness.controller.loadStatus();

    const publishing = harness.controller.publish();
    expect(harness.controller.getSnapshot()).toMatchObject({
      publishState: "publishing",
      inFlight: { localRevision: 0, artifactRevision: "revision-0" },
    });
    const duplicate = await harness.controller.publish();
    expect(duplicate.isErr()).toBe(true);
    if (duplicate.isOk()) throw new Error("expected in-flight refusal");
    expect(duplicate.error.reason).toBe("publication-in-flight");

    harness.document.setRevision(1);
    publication.resolve(Result.ok(status("revision-0", "revision-0")));
    expect((await publishing).isOk()).toBe(true);
    expect(harness.controller.getSnapshot().publishState).toBe("unsaved");
  });

  it("discards completion after disposal or document-owner replacement", async () => {
    const publication = deferred<LearnerPublishResult>();
    const harness = createHarness({ publish: vi.fn(() => publication.promise) });
    await harness.controller.loadStatus();
    const listener = vi.fn();
    harness.controller.subscribe(listener);
    const publishing = harness.controller.publish();
    const snapshotAtDisposal = harness.controller.getSnapshot();
    const replacement = createHarness({ hostStatus: status("replacement-revision") });
    await replacement.controller.loadStatus();
    const replacementSnapshot = replacement.controller.getSnapshot();

    harness.controller.dispose();
    publication.resolve(Result.ok(status("revision-0", "revision-0")));
    const result = await publishing;

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("expected disposed publication refusal");
    expect(result.error.reason).toBe("session-closed");
    expect(harness.controller.getSnapshot()).toBe(snapshotAtDisposal);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(replacement.controller.getSnapshot()).toBe(replacementSnapshot);
    expect(replacement.controller.getSnapshot().status?.publishedArtifactRevision).toBeNull();
    replacement.controller.dispose();
  });
});

interface Harness {
  readonly controller: ReturnType<typeof createAuthoringPublicationController>;
  readonly document: FakeDocument;
  readonly saving: FakeSaving;
  readonly publication: {
    readonly getStatus: ReturnType<typeof vi.fn<LearnerPublicationPort["getStatus"]>>;
    readonly publish: ReturnType<typeof vi.fn<LearnerPublicationPort["publish"]>>;
  };
}

function createHarness({
  build,
  content = document("authorsurf01"),
  getStatus = vi.fn(async () => Result.ok(status("revision-0"))),
  hostStatus,
  initialSavedArtifactRevision = null,
  prepare = vi.fn((input: ScaffoldDocumentContent) => Result.ok(prepared(input))),
  publish = vi.fn(async (payload) =>
    Result.ok(status(payload.sourceArtifactRevision, payload.sourceArtifactRevision)),
  ),
}: {
  readonly build?: Parameters<
    typeof createAuthoringPublicationController
  >[0]["buildCompilationSnapshot"];
  readonly content?: ScaffoldDocumentContent;
  readonly getStatus?: LearnerPublicationPort["getStatus"];
  readonly hostStatus?: LearnerPublicationStatus;
  readonly initialSavedArtifactRevision?: string | null;
  readonly prepare?: Parameters<
    typeof createAuthoringPublicationController
  >[0]["prepareLearnerContent"];
  readonly publish?: LearnerPublicationPort["publish"];
} = {}): Harness {
  const documentOwner = new FakeDocument(content);
  const saving = new FakeSaving(documentOwner.getSnapshot());
  const publication = {
    getStatus: vi.fn(hostStatus ? async () => Result.ok(hostStatus) : getStatus),
    publish: vi.fn(publish),
  };
  const controller = createAuthoringPublicationController({
    document: documentOwner,
    saving,
    publication,
    initialSavedArtifactRevision,
    prepareLearnerContent: prepare,
    buildCompilationSnapshot:
      build ??
      ((input, revision) =>
        buildCompilationSnapshot(
          input,
          revision,
          authoring.schema,
          application.authoring.documentTree,
        )),
  });
  return { controller, document: documentOwner, saving, publication };
}

class FakeDocument implements AuthoringPublicationDocument {
  readonly #listeners = new Set<() => void>();
  readonly #content: ScaffoldDocumentContent;
  captureCalls = 0;
  #state: AuthoringDocumentState;

  constructor(content: ScaffoldDocumentContent) {
    this.#content = content;
    this.#state = this.validState(0);
  }

  getSnapshot = () => this.#state;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  capture = () => {
    this.captureCalls += 1;
    if (this.#state.status === "invalid") return Result.err(this.#state.failure);
    return Result.ok(structuredClone(this.#state.snapshot));
  };

  setRevision(revision: number): void {
    this.#state = this.validState(revision);
    for (const listener of this.#listeners) listener();
  }

  invalidate(failure: CourseDocumentAuthoringFailure): void {
    this.#state = { status: "invalid", revision: this.revision() + 1, failure };
    for (const listener of this.#listeners) listener();
  }

  private revision(): number {
    return this.#state.status === "valid" ? this.#state.snapshot.revision : this.#state.revision;
  }

  private validState(revision: number): AuthoringDocumentState {
    const snapshot: AuthoringDocumentSnapshot = {
      revision,
      artifact: {
        id: "artifact-1",
        title: "Lesson",
        mode: "page",
        content: structuredClone(this.#content),
      },
    };
    return { status: "valid", snapshot };
  }
}

class FakeSaving implements AuthoringPublicationSaving {
  readonly #listeners = new Set<() => void>();
  readonly #initialLocalRevision: number;
  readonly seedCalls: string[] = [];
  #snapshot: AuthoringSaveSnapshot;

  constructor(documentState: AuthoringDocumentState) {
    this.#initialLocalRevision =
      documentState.status === "valid" ? documentState.snapshot.revision : documentState.revision;
    this.#snapshot = {
      currentLocalRevision: this.#initialLocalRevision,
      documentStatus: documentState.status,
      lastSaved: null,
      activity: "idle",
      lastFailure: null,
    };
  }

  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  seedInitialSavedRevision = (artifactRevision: string) => {
    this.seedCalls.push(artifactRevision);
    if (
      this.#snapshot.lastSaved ||
      this.#snapshot.currentLocalRevision !== this.#initialLocalRevision
    ) {
      return;
    }
    this.set({
      lastSaved: { localRevision: this.#initialLocalRevision, artifactRevision },
    });
  };

  set(changes: Partial<AuthoringSaveSnapshot>, emit = true): void {
    this.#snapshot = { ...this.#snapshot, ...changes };
    if (emit) for (const listener of this.#listeners) listener();
  }
}

function document(surfaceId: string): ScaffoldDocumentContent {
  return ScaffoldDocumentContentSchema.parse(
    createScaffoldDocumentContent({ mode: "page", surfaceId }),
  );
}

function prepared(canonicalDocument: ScaffoldDocumentContent): PreparedLearnerContent {
  return {
    canonicalDocument,
    learnerContent: canonicalDocument,
    assessmentTargets: [],
    assessmentGroups: [],
  };
}

function status(
  currentArtifactRevision: string,
  publishedArtifactRevision: string | null = null,
): LearnerPublicationStatus {
  return {
    currentArtifactRevision,
    publishedArtifactRevision,
    publishedAt: publishedArtifactRevision ? "2026-09-05T12:00:00.000Z" : null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

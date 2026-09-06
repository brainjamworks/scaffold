// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { Result } from "better-result";
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ScaffoldDocumentContent } from "@scaffold/contracts";
import { createScaffoldDocumentContent } from "@/format/artifact";
import type { LearnerPublicationPort, LearnerPublicationStatusResult } from "@/host/ports";

import type { AuthoringSaveSnapshot } from "./authoring-save-controller";
import {
  DefaultAuthoringPublicationController,
  type AuthoringPublicationDocument,
  type AuthoringPublicationSaving,
} from "./authoring-publication-controller";
import type { AuthoringDocumentState } from "./use-authoring-document";
import { useAuthoringPublication } from "./use-authoring-publication";

const prepareLearnerContent = (document: ScaffoldDocumentContent) =>
  Result.ok({
    canonicalDocument: document,
    learnerContent: document,
    assessmentGroups: [],
    assessmentTargets: [],
  });
const buildCompilationSnapshot = vi.fn() as never;

describe("useAuthoringPublication", () => {
  it("waits for the current saving owner and loads status once without ordinary rerender churn", async () => {
    const document = new FakeDocument();
    const saving = new FakeSaving();
    const getStatus = vi.fn(async () => Result.ok(status("revision-0")));
    const publication = port(getStatus);
    const hook = renderHook(
      ({ currentSaving, tick }: { currentSaving: FakeSaving | null; tick: number }) => {
        void tick;
        return useAuthoringPublication({
          document,
          saving: currentSaving,
          publication,
          initialSavedArtifactRevision: "entry-revision",
          prepareLearnerContent,
          buildCompilationSnapshot,
        });
      },
      { initialProps: { currentSaving: null as FakeSaving | null, tick: 0 } },
    );

    expect(hook.result.current).toEqual({ status: "initializing" });
    hook.rerender({ currentSaving: saving, tick: 0 });
    await waitFor(() => expect(hook.result.current.status).toBe("ready"));
    if (hook.result.current.status !== "ready") throw new Error("expected publication owner");
    const controller = hook.result.current.controller;
    await waitFor(() => expect(getStatus).toHaveBeenCalledOnce());
    expect(saving.seedCalls).toEqual(["entry-revision"]);

    hook.rerender({ currentSaving: saving, tick: 1 });
    expect(hook.result.current).toMatchObject({ status: "ready", controller });
    expect(getStatus).toHaveBeenCalledOnce();
  });

  it("uses initializing during owner replacement and preserves an in-flight status seed race", async () => {
    const document = new FakeDocument();
    const firstSaving = new FakeSaving();
    const secondSaving = new FakeSaving();
    const firstStatus = deferred<LearnerPublicationStatusResult>();
    const firstPort = port(vi.fn(() => firstStatus.promise));
    const secondStatus = deferred<LearnerPublicationStatusResult>();
    const secondPort = port(vi.fn(() => secondStatus.promise));
    const rendered: string[] = [];
    const hook = renderHook(
      ({ publication, saving }) => {
        const binding = useAuthoringPublication({
          document,
          saving,
          publication,
          initialSavedArtifactRevision: null,
          prepareLearnerContent,
          buildCompilationSnapshot,
        });
        rendered.push(binding.status);
        return binding;
      },
      { initialProps: { publication: firstPort, saving: firstSaving } },
    );
    if (hook.result.current.status !== "ready") throw new Error("expected first owner");
    const firstController = hook.result.current.controller;

    hook.rerender({ publication: secondPort, saving: secondSaving });
    expect(rendered).toContain("initializing");
    if (hook.result.current.status !== "ready") throw new Error("expected second owner");
    expect(hook.result.current.controller).not.toBe(firstController);

    secondSaving.set({
      currentLocalRevision: 1,
      lastSaved: { localRevision: 1, artifactRevision: "racing-save" },
    });
    secondStatus.resolve(Result.ok(status("older-host-revision")));
    await act(async () => secondStatus.promise);
    expect(secondSaving.seedCalls).toEqual(["older-host-revision"]);
    expect(secondSaving.getSnapshot().lastSaved?.artifactRevision).toBe("racing-save");

    firstStatus.resolve(Result.ok(status("stale-first-status")));
    await act(async () => firstStatus.promise);
    expect(hook.result.current.controller).not.toBe(firstController);
  });

  it("disposes each committed publication owner in StrictMode and on unmount", () => {
    const dispose = vi.spyOn(DefaultAuthoringPublicationController.prototype, "dispose");
    const document = new FakeDocument();
    const saving = new FakeSaving();
    const publication = port(vi.fn(async () => Result.ok(status("revision-0"))));
    const hook = renderHook(
      () =>
        useAuthoringPublication({
          document,
          saving,
          publication,
          initialSavedArtifactRevision: null,
          prepareLearnerContent,
          buildCompilationSnapshot,
        }),
      { wrapper: StrictWrapper },
    );

    expect(document.listenerCount).toBe(1);
    expect(saving.listenerCount).toBe(1);
    const disposedBeforeUnmount = dispose.mock.calls.length;
    hook.unmount();
    expect(document.listenerCount).toBe(0);
    expect(saving.listenerCount).toBe(0);
    expect(dispose).toHaveBeenCalledTimes(disposedBeforeUnmount + 1);
  });
});

function StrictWrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

class FakeDocument implements AuthoringPublicationDocument {
  readonly #listeners = new Set<() => void>();
  readonly #content = createScaffoldDocumentContent({ mode: "page" });
  readonly #state: AuthoringDocumentState = {
    status: "valid",
    snapshot: {
      revision: 0,
      artifact: { id: "publication", title: "Publication", mode: "page", content: this.#content },
    },
  };

  get listenerCount() {
    return this.#listeners.size;
  }

  getSnapshot = () => this.#state;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  capture = () => {
    if (this.#state.status === "invalid") throw new Error("expected valid document");
    return Result.ok(this.#state.snapshot);
  };
}

class FakeSaving implements AuthoringPublicationSaving {
  readonly #listeners = new Set<() => void>();
  readonly seedCalls: string[] = [];
  #snapshot: AuthoringSaveSnapshot = {
    currentLocalRevision: 0,
    documentStatus: "valid",
    lastSaved: null,
    activity: "idle",
    lastFailure: null,
  };

  get listenerCount() {
    return this.#listeners.size;
  }

  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  seedInitialSavedRevision = (artifactRevision: string) => {
    this.seedCalls.push(artifactRevision);
    if (this.#snapshot.lastSaved || this.#snapshot.currentLocalRevision !== 0) return;
    this.set({ lastSaved: { localRevision: 0, artifactRevision } });
  };

  set(changes: Partial<AuthoringSaveSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...changes };
    for (const listener of this.#listeners) listener();
  }
}

function port(getStatus: LearnerPublicationPort["getStatus"]): LearnerPublicationPort {
  return {
    getStatus,
    publish: async () => Result.ok(status("revision-0", "revision-0")),
  };
}

function status(currentArtifactRevision: string, publishedArtifactRevision: string | null = null) {
  return {
    currentArtifactRevision,
    publishedArtifactRevision,
    publishedAt: publishedArtifactRevision ? "2026-09-06T00:00:00.000Z" : null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { Result } from "better-result";
import { StrictMode, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ArtifactPersistencePort, ArtifactPersistenceResult } from "@/host/ports";

import { DefaultAuthoringSaveController } from "./authoring-save-controller";
import type { AuthoringDocumentBinding, AuthoringDocumentState } from "./use-authoring-document";
import { useAuthoringSave } from "./use-authoring-save";

afterEach(() => vi.useRealTimers());

describe("useAuthoringSave", () => {
  it("binds one real save owner to document updates without rerender churn", async () => {
    vi.useFakeTimers();
    const document = new FakeDocument("first");
    const saveArtifact = vi.fn(async () => Result.ok({ artifactRevision: "saved-1" }));
    const persistence = { saveArtifact };
    const hook = renderHook(
      ({ tick }: { tick: number }) => {
        void tick;
        return useAuthoringSave({ document, persistence });
      },
      { initialProps: { tick: 0 }, wrapper: StrictWrapper },
    );

    expect(hook.result.current.status).toBe("ready");
    if (hook.result.current.status !== "ready") throw new Error("expected ready save owner");
    const controller = hook.result.current.controller;

    hook.rerender({ tick: 1 });
    expect(hook.result.current).toMatchObject({ status: "ready", controller });
    expect(saveArtifact).not.toHaveBeenCalled();

    act(() => document.set(valid(1, "Edited")));
    expect(hook.result.current).toMatchObject({
      status: "ready",
      snapshot: { currentLocalRevision: 1, activity: "scheduled" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(saveArtifact).toHaveBeenCalledTimes(1);
    expect(hook.result.current).toMatchObject({
      status: "ready",
      snapshot: { activity: "idle", lastSaved: { localRevision: 1 } },
    });
  });

  it("exposes initializing rather than a stale owner while document and port identities rebind", async () => {
    const firstDocument = new FakeDocument("first");
    const secondDocument = new FakeDocument("second");
    const pending = deferred<ArtifactPersistenceResult>();
    const firstPersistence: ArtifactPersistencePort = { saveArtifact: () => pending.promise };
    const secondPersistence: ArtifactPersistencePort = {
      saveArtifact: async () => Result.ok({ artifactRevision: "saved-second" }),
    };
    const renderStates: string[] = [];
    const hook = renderHook(
      ({ document, persistence }) => {
        const binding = useAuthoringSave({ document, persistence });
        renderStates.push(binding.status);
        return binding;
      },
      {
        initialProps: { document: firstDocument, persistence: firstPersistence },
      },
    );
    if (hook.result.current.status !== "ready") throw new Error("expected first save owner");
    const firstOwner = hook.result.current.controller;
    const firstSave = firstOwner.saveNow();

    hook.rerender({ document: secondDocument, persistence: secondPersistence });

    expect(renderStates).toContain("initializing");
    expect(hook.result.current.status).toBe("ready");
    if (hook.result.current.status !== "ready") throw new Error("expected replacement save owner");
    expect(hook.result.current.controller).not.toBe(firstOwner);
    await expect(firstSave).resolves.toMatchObject({ error: { reason: "session-closed" } });

    pending.resolve(Result.ok({ artifactRevision: "stale-save" }));
    await act(async () => Promise.resolve());
    expect(hook.result.current.controller).not.toBe(firstOwner);
  });

  it("unsubscribes and disposes committed owners under StrictMode and unmount", () => {
    const dispose = vi.spyOn(DefaultAuthoringSaveController.prototype, "dispose");
    const document = new FakeDocument("strict");
    const persistence = {
      saveArtifact: async () => Result.ok({ artifactRevision: "saved" }),
    };
    const hook = renderHook(() => useAuthoringSave({ document, persistence }), {
      wrapper: StrictWrapper,
    });

    expect(document.listenerCount).toBe(1);
    const disposedBeforeUnmount = dispose.mock.calls.length;
    hook.unmount();
    expect(document.listenerCount).toBe(0);
    expect(dispose).toHaveBeenCalledTimes(disposedBeforeUnmount + 1);
  });
});

function StrictWrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

class FakeDocument implements AuthoringDocumentBinding {
  readonly editor = null;
  readonly theme = null;
  readonly title = "Draft";
  readonly #listeners = new Set<() => void>();
  #state: AuthoringDocumentState;

  constructor(id: string) {
    this.#state = valid(0, id);
  }

  get listenerCount() {
    return this.#listeners.size;
  }

  getSnapshot = () => this.#state;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  capture = () => {
    throw new Error("capture is not used by the save binding");
  };
  setTitle() {}
  acknowledgeSavedTitle() {}
  acceptCanonicalUpdate() {}
  reportDocumentError() {}
  setEditor() {}

  set(state: AuthoringDocumentState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}

function valid(revision: number, id: string): AuthoringDocumentState {
  return {
    status: "valid",
    snapshot: {
      revision,
      artifact: { id, title: id, mode: "page", content: { type: "doc" } },
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { Result } from "better-result";
import { StrictMode, useSyncExternalStore, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ArtifactPersistenceResult } from "@/host/ports";

import {
  createAuthoringSaveController,
  type AuthoringSaveController,
} from "./authoring-save-controller";
import type { AuthoringDocumentState } from "./use-authoring-document";
import { useAuthoringSaveLabel } from "./use-authoring-save-label";

afterEach(() => vi.useRealTimers());

describe("useAuthoringSaveLabel", () => {
  it("shows successful completion for two seconds and lets new activity override it", async () => {
    vi.useFakeTimers();
    const persistence = vi.fn(async () => Result.ok({ artifactRevision: "saved-1" }));
    const controller = createAuthoringSaveController(valid(0), { saveArtifact: persistence }, noop);
    const hook = renderLabel(controller);

    let save!: ReturnType<AuthoringSaveController["saveNow"]>;
    act(() => {
      save = controller.saveNow();
    });
    expect(hook.result.current).toBe("saving");
    await act(async () => save);
    expect(hook.result.current).toBe("saved");

    act(() => {
      vi.advanceTimersByTime(1_999);
    });
    expect(hook.result.current).toBe("saved");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(hook.result.current).toBe("idle");

    act(() => controller.observeDocument(valid(1)));
    expect(hook.result.current).toBe("saving");
  });

  it("lets a current failure override success and does not mirror owner state", async () => {
    vi.useFakeTimers();
    const second = deferred<ArtifactPersistenceResult>();
    const saveArtifact = vi
      .fn()
      .mockResolvedValueOnce(Result.ok({ artifactRevision: "saved-1" }))
      .mockImplementationOnce(() => second.promise);
    const controller = createAuthoringSaveController(valid(0), { saveArtifact }, noop);
    const hook = renderLabel(controller);

    await act(async () => controller.saveNow());
    expect(hook.result.current).toBe("saved");
    act(() => controller.observeDocument(valid(1)));
    let failed!: ReturnType<AuthoringSaveController["saveNow"]>;
    act(() => {
      failed = controller.saveNow();
    });
    second.resolve(
      Result.err({
        reason: "write-aborted",
        artifactId: "save-label",
        cause: new Error("aborted"),
      }),
    );
    await act(async () => failed);

    expect(hook.result.current).toBe("error");
    expect(controller.getSnapshot().lastFailure).toMatchObject({
      reason: "persistence-failed",
      requestedRevision: 1,
    });
  });

  it("derives an invalid-document error directly from the save owner", () => {
    const controller = createAuthoringSaveController(
      valid(0),
      { saveArtifact: async () => Result.ok({ artifactRevision: "unused" }) },
      noop,
    );
    controller.observeDocument({
      status: "invalid",
      revision: 1,
      failure: { status: "canonicalization-failed", issues: [] },
    });

    const hook = renderLabel(controller);

    expect(hook.result.current).toBe("error");
  });

  it("cancels success timers on owner replacement and StrictMode unmount", async () => {
    vi.useFakeTimers();
    const first = createAuthoringSaveController(
      valid(0),
      { saveArtifact: async () => Result.ok({ artifactRevision: "saved-first" }) },
      noop,
    );
    const second = createAuthoringSaveController(
      valid(0),
      { saveArtifact: async () => Result.ok({ artifactRevision: "saved-second" }) },
      noop,
    );
    const hook = renderHook(({ controller }) => useSubscribedSaveLabel(controller), {
      initialProps: { controller: first },
      wrapper: StrictWrapper,
    });
    await act(async () => first.saveNow());
    expect(hook.result.current).toBe("saved");
    expect(vi.getTimerCount()).toBe(1);

    hook.rerender({ controller: second });
    expect(hook.result.current).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);

    await act(async () => second.saveNow());
    expect(hook.result.current).toBe("saved");
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

function StrictWrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

function renderLabel(controller: AuthoringSaveController) {
  return renderHook(() => useSubscribedSaveLabel(controller));
}

function useSubscribedSaveLabel(controller: AuthoringSaveController) {
  const snapshot = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
    () => controller.getSnapshot(),
  );
  return useAuthoringSaveLabel({ status: "ready", controller, snapshot });
}

function valid(revision: number): AuthoringDocumentState {
  return {
    status: "valid",
    snapshot: {
      revision,
      artifact: {
        id: "save-label",
        title: `Revision ${revision}`,
        mode: "page",
        content: { type: "doc" },
      },
    },
  };
}

function noop() {}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { Result } from "better-result";
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldDocumentContent } from "@/format/artifact";

import type { PreparedAuthorPreview } from "./author-preview-preparation";
import {
  AuthorPreviewSessionController,
  type CreateAuthorPreviewSessionControllerInput,
} from "./author-preview-session-controller";
import type { AuthoringDocumentState } from "./use-authoring-document";
import { useAuthorPreview } from "./use-author-preview";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("hookpreview1");

describe("useAuthorPreview", () => {
  it("keeps the attempt when the prepare callback changes and uses the latest callback afterward", async () => {
    const document = new FakeDocument("first");
    const firstPreparation = deferred<ReturnType<typeof Result.ok<PreparedAuthorPreview>>>();
    const firstPrepare = vi.fn(() => firstPreparation.promise);
    const secondPrepare = vi.fn(async (_input, retainedServices) =>
      Result.ok(prepared(retainedServices ?? undefined)),
    );
    const hook = renderHook(({ prepare }) => useAuthorPreview({ document, prepare }), {
      initialProps: {
        prepare: firstPrepare as CreateAuthorPreviewSessionControllerInput["prepare"],
      },
    });
    if (hook.result.current.status !== "ready") throw new Error("expected preview owner");
    const session = hook.result.current.session;
    let entry!: ReturnType<AuthorPreviewSessionController["enter"]>;
    act(() => {
      entry = session.enter(valid(0, "first").snapshot, SURFACE_ID);
    });
    expect(hook.result.current).toMatchObject({
      status: "ready",
      snapshot: { status: "entering" },
    });

    hook.rerender({ prepare: secondPrepare });
    expect(hook.result.current).toMatchObject({ status: "ready", session });
    expect(firstPrepare).toHaveBeenCalledOnce();
    expect(secondPrepare).not.toHaveBeenCalled();

    firstPreparation.resolve(Result.ok(prepared()));
    await act(async () => entry);
    act(() => document.set(valid(1, "first", { schemaVersion: 1 })));
    await act(async () => Promise.resolve());
    expect(secondPrepare).toHaveBeenCalledOnce();
    expect(hook.result.current.session).toBe(session);
  });

  it("replaces the session with the document and stale async work cannot reactivate it", async () => {
    const firstDocument = new FakeDocument("first");
    const secondDocument = new FakeDocument("second");
    const pending = deferred<ReturnType<typeof Result.ok<PreparedAuthorPreview>>>();
    const prepare = vi.fn(() => pending.promise);
    const rendered: string[] = [];
    const hook = renderHook(
      ({ document }) => {
        const binding = useAuthorPreview({ document, prepare });
        rendered.push(binding.status);
        return binding;
      },
      { initialProps: { document: firstDocument } },
    );
    if (hook.result.current.status !== "ready") throw new Error("expected first preview owner");
    const firstSession = hook.result.current.session;
    const entry = firstSession.enter(valid(0, "first").snapshot, SURFACE_ID);

    hook.rerender({ document: secondDocument });
    expect(rendered).toContain("initializing");
    if (hook.result.current.status !== "ready") throw new Error("expected second preview owner");
    expect(hook.result.current.session).not.toBe(firstSession);
    expect(hook.result.current.snapshot).toEqual({ status: "editing", failure: null });
    expect(firstDocument.listenerCount).toBe(0);

    pending.resolve(Result.ok(prepared()));
    await expect(entry).resolves.toMatchObject({
      error: { reason: "preview-load-superseded", surfaceId: SURFACE_ID },
    });
    expect(hook.result.current.snapshot).toEqual({ status: "editing", failure: null });
  });

  it("subscribes once and cleans up committed sessions under StrictMode and unmount", () => {
    const dispose = vi.spyOn(AuthorPreviewSessionController.prototype, "dispose");
    const document = new FakeDocument("strict");
    const hook = renderHook(
      () => useAuthorPreview({ document, prepare: async () => Result.ok(prepared()) }),
      { wrapper: StrictWrapper },
    );

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

class FakeDocument {
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

  set(state: AuthoringDocumentState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}

function valid(
  revision: number,
  id: string,
  learnerInteractions: unknown = null,
): Extract<AuthoringDocumentState, { status: "valid" }> {
  const content = createScaffoldDocumentContent({ mode: "page", surfaceId: SURFACE_ID });
  if (learnerInteractions !== null) {
    content.content![0]!.attrs = { ...content.content![0]!.attrs, learnerInteractions };
  }
  return {
    status: "valid",
    snapshot: {
      revision,
      artifact: { id, title: id, mode: "page", content },
    },
  };
}

function prepared(services?: PreparedAuthorPreview["services"]): PreparedAuthorPreview {
  return {
    content: {
      learnerContent: createScaffoldDocumentContent({ mode: "page" }),
      assessmentGroups: [],
      assessmentTargets: [],
    },
    services: services ?? ({} as PreparedAuthorPreview["services"]),
    program: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { LearnerActivityRecord, LearnerActivitySnapshot } from "@scaffold/contracts";
import type { LearnerActivityPort } from "../../host/ports/learner-activity";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import {
  LearnerActivityReadinessGate,
  LearnerActivityRuntimeProvider,
  useScopedLearnerActivityApi,
} from "./LearnerActivityRuntimeProvider";
import type { LearnerActivityStoreApi } from "./types";
import { useLearnerActivityRuntime } from "./react-hooks";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function snapshot(
  artifactId = "artifact-one",
  activities: LearnerActivitySnapshot["activities"] = {},
): LearnerActivitySnapshot {
  return {
    snapshotVersion: 1,
    artifactId,
    activities,
  };
}

function record(data: LearnerActivityRecord["data"]): LearnerActivityRecord {
  return {
    activityKind: "checklist",
    data,
    completed: false,
    updatedAt: "2026-07-17T08:00:00Z",
  };
}

function port(load: LearnerActivityPort["load"]): LearnerActivityPort {
  return {
    load,
    save: vi.fn(async ({ record: value }) => ({
      ...value,
      updatedAt: "2026-07-17T08:30:00Z",
    })),
  };
}

function StoreProbe({ onStore }: { onStore: (store: LearnerActivityStoreApi | null) => void }) {
  const store = useScopedLearnerActivityApi();

  useEffect(() => {
    onStore(store);
  }, [onStore, store]);

  return null;
}

function RuntimeRoot({
  artifactId = "artifact-one",
  initialSnapshot,
  learnerActivityPort,
  onStore,
  children = <p>Runtime ready</p>,
}: {
  artifactId?: string | null;
  initialSnapshot?: unknown;
  learnerActivityPort: LearnerActivityPort | null;
  onStore: (store: LearnerActivityStoreApi | null) => void;
  children?: ReactNode;
}) {
  return (
    <ScaffoldServicesProvider ports={{ learnerActivity: learnerActivityPort }}>
      <ScaffoldArtifactIdentityProvider artifactId={artifactId}>
        <LearnerActivityRuntimeProvider
          {...(initialSnapshot === undefined ? {} : { initialSnapshot })}
        >
          <StoreProbe onStore={onStore} />
          <LearnerActivityReadinessGate>{children}</LearnerActivityReadinessGate>
        </LearnerActivityRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>
    </ScaffoldServicesProvider>
  );
}

function ActivityProbe({ blockId, label }: { blockId: string | null; label: string }) {
  const runtime = useLearnerActivityRuntime({
    blockId,
    activityKind: "checklist",
    initial: { data: { checked: false }, completed: false },
  });

  return (
    <section aria-label={label}>
      <p>{JSON.stringify(runtime.activity?.data ?? null)}</p>
      <p>{runtime.persistence.status}</p>
      <button type="button" onClick={() => runtime.patchData({ checked: true })}>
        Check {label}
      </button>
    </section>
  );
}

describe("LearnerActivityRuntimeProvider", () => {
  it("keeps its store live through StrictMode effect replay", async () => {
    const stores: LearnerActivityStoreApi[] = [];

    render(
      <StrictMode>
        <RuntimeRoot
          learnerActivityPort={null}
          onStore={(nextStore) => {
            if (nextStore && !stores.includes(nextStore)) stores.push(nextStore);
          }}
        />
      </StrictMode>,
    );

    await waitFor(() => expect(stores).toHaveLength(1));
    await Promise.resolve();
    const store = stores[0];
    if (!store) throw new Error("expected a learner activity store");

    expect(
      store.getState().ensureActivity({
        blockId: "block-one",
        activityKind: "checklist",
        initial: { data: { checked: false }, completed: false },
      }),
    ).toBe(true);
  });

  it("hydrates bootstrap synchronously and suppresses the initial port load", async () => {
    const load = vi.fn(async () => snapshot());
    const stores: LearnerActivityStoreApi[] = [];
    const initial = snapshot("artifact-one", { "block-one": record({ checked: true }) });

    render(
      <RuntimeRoot
        initialSnapshot={initial}
        learnerActivityPort={port(load)}
        onStore={(store) => {
          if (store) stores.push(store);
        }}
      />,
    );

    expect(screen.getByText("Runtime ready")).toBeInTheDocument();
    await waitFor(() => expect(stores).toHaveLength(1));
    expect(stores[0]?.getState().activities).toEqual(initial.activities);
    expect(load).not.toHaveBeenCalled();
  });

  it("loads once without bootstrap and gates children until the snapshot resolves", async () => {
    const pending = deferred<LearnerActivitySnapshot | null>();
    const load = vi.fn(() => pending.promise);
    const loaded = snapshot("artifact-one", { "block-one": record({ checked: true }) });

    render(<RuntimeRoot learnerActivityPort={port(load)} onStore={() => {}} />);

    expect(screen.queryByText("Runtime ready")).toBeNull();
    expect(screen.getByTestId("learner-activity-runtime-loading")).toBeInTheDocument();
    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith({ artifactId: "artifact-one" });

    pending.resolve(loaded);

    expect(await screen.findByText("Runtime ready")).toBeInTheDocument();
    expect(load).toHaveBeenCalledOnce();
  });

  it("treats a null load as an empty ready snapshot", async () => {
    const stores: LearnerActivityStoreApi[] = [];

    render(
      <RuntimeRoot
        learnerActivityPort={port(async () => null)}
        onStore={(store) => {
          if (store) stores.push(store);
        }}
      />,
    );

    expect(await screen.findByText("Runtime ready")).toBeInTheDocument();
    expect(stores[0]?.getState()).toMatchObject({
      hydration: { status: "ready", error: null },
      activities: {},
    });
  });

  it("is ready with persistence unavailable when no port exists", async () => {
    const stores: LearnerActivityStoreApi[] = [];

    render(
      <RuntimeRoot
        learnerActivityPort={null}
        onStore={(store) => {
          if (store) stores.push(store);
        }}
      />,
    );

    expect(screen.getByText("Runtime ready")).toBeInTheDocument();
    await waitFor(() => expect(stores).toHaveLength(1));
    stores[0]?.getState().ensureActivity({
      blockId: "block-one",
      activityKind: "checklist",
      initial: { data: {}, completed: false },
    });
    expect(stores[0]?.getState().saves["block-one"]?.status).toBe("unavailable");
  });

  it("gates children and exposes an explicit hydration error after load rejection", async () => {
    render(
      <RuntimeRoot
        learnerActivityPort={port(async () => Promise.reject(new Error("load denied")))}
        onStore={() => {}}
      />,
    );

    const error = await screen.findByTestId("learner-activity-runtime-error");
    expect(error.textContent).toContain("load denied");
    expect(screen.queryByText("Runtime ready")).toBeNull();
  });

  it("rejects invalid loaded data without partially mounting runtime children", async () => {
    render(
      <RuntimeRoot
        learnerActivityPort={port(async () => ({
          ...snapshot(),
          activities: {
            "block-one": { ...record({ checked: true }), updatedAt: "invalid" },
          },
        }))}
        onStore={() => {}}
      />,
    );

    expect(await screen.findByTestId("learner-activity-runtime-error")).toBeInTheDocument();
    expect(screen.queryByText("Runtime ready")).toBeNull();
  });

  it("retains one store and does not reload while artifact and port identities stay stable", async () => {
    const load = vi.fn(async () => null);
    const stablePort = port(load);
    const stores: LearnerActivityStoreApi[] = [];
    const onStore = (store: LearnerActivityStoreApi | null) => {
      if (store) stores.push(store);
    };
    const mounted = render(<RuntimeRoot learnerActivityPort={stablePort} onStore={onStore} />);

    await screen.findByText("Runtime ready");
    mounted.rerender(<RuntimeRoot learnerActivityPort={stablePort} onStore={onStore} />);

    expect(stores).toHaveLength(1);
    expect(load).toHaveBeenCalledOnce();
  });

  it("applies the current bootstrap to a fresh port-replacement scope", async () => {
    const firstLoad = vi.fn(async () => null);
    const secondLoad = vi.fn(async () => snapshot());
    const firstPort = port(firstLoad);
    const secondPort = port(secondLoad);
    const firstSnapshot = snapshot("artifact-one", {
      "block-one": record({ scope: "first" }),
    });
    const secondSnapshot = snapshot("artifact-one", {
      "block-one": record({ scope: "second" }),
    });
    const stores: LearnerActivityStoreApi[] = [];
    const onStore = (store: LearnerActivityStoreApi | null) => {
      if (store) stores.push(store);
    };
    const mounted = render(
      <RuntimeRoot
        initialSnapshot={firstSnapshot}
        learnerActivityPort={firstPort}
        onStore={onStore}
      />,
    );

    await waitFor(() => expect(stores).toHaveLength(1));
    mounted.rerender(
      <RuntimeRoot
        initialSnapshot={secondSnapshot}
        learnerActivityPort={secondPort}
        onStore={onStore}
      />,
    );

    await waitFor(() => expect(stores).toHaveLength(2));
    expect(firstLoad).not.toHaveBeenCalled();
    expect(secondLoad).not.toHaveBeenCalled();
    expect(stores[1]).not.toBe(stores[0]);
    expect(stores[1]?.getState().activities).toEqual(secondSnapshot.activities);
  });

  it("uses a matching bootstrap again after artifact identity changes", async () => {
    const load = vi.fn(async () => null);
    const runtimePort = port(load);
    const stores: LearnerActivityStoreApi[] = [];
    const onStore = (store: LearnerActivityStoreApi | null) => {
      if (store) stores.push(store);
    };
    const mounted = render(
      <RuntimeRoot
        artifactId="artifact-one"
        initialSnapshot={snapshot("artifact-one")}
        learnerActivityPort={runtimePort}
        onStore={onStore}
      />,
    );

    mounted.rerender(
      <RuntimeRoot
        artifactId="artifact-two"
        initialSnapshot={snapshot("artifact-two", {
          "block-two": record({ restored: true }),
        })}
        learnerActivityPort={runtimePort}
        onStore={onStore}
      />,
    );

    await waitFor(() => expect(stores).toHaveLength(2));
    expect(stores[1]?.getState().activities["block-two"]?.data).toEqual({ restored: true });
    expect(load).not.toHaveBeenCalled();
  });

  it("makes a stale load completion inert after replacement", async () => {
    const stale = deferred<LearnerActivitySnapshot | null>();
    const stores: LearnerActivityStoreApi[] = [];
    const onStore = (store: LearnerActivityStoreApi | null) => {
      if (store) stores.push(store);
    };
    const mounted = render(
      <RuntimeRoot learnerActivityPort={port(() => stale.promise)} onStore={onStore} />,
    );

    await waitFor(() => expect(stores).toHaveLength(1));
    mounted.rerender(
      <RuntimeRoot learnerActivityPort={port(async () => null)} onStore={onStore} />,
    );
    await waitFor(() => expect(stores).toHaveLength(2));

    stale.resolve(snapshot("artifact-one", { "block-one": record({ stale: true }) }));
    await Promise.resolve();
    await Promise.resolve();

    expect(stores[0]?.getState()).toMatchObject({
      activities: {},
      hydration: { status: "loading", error: null },
    });
    expect(stores[1]?.getState().activities).toEqual({});
    expect(stores[1]?.getState().hydration).toEqual({ status: "ready", error: null });
  });

  it("ignores a stale load rejection after replacement", async () => {
    const stale = deferred<LearnerActivitySnapshot | null>();
    const stores: LearnerActivityStoreApi[] = [];
    const onStore = (store: LearnerActivityStoreApi | null) => {
      if (store) stores.push(store);
    };
    const mounted = render(
      <RuntimeRoot learnerActivityPort={port(() => stale.promise)} onStore={onStore} />,
    );

    await waitFor(() => expect(stores).toHaveLength(1));
    mounted.rerender(
      <RuntimeRoot learnerActivityPort={port(async () => null)} onStore={onStore} />,
    );
    await waitFor(() => expect(stores).toHaveLength(2));

    stale.reject(new Error("obsolete load failed"));
    await Promise.resolve();
    await Promise.resolve();

    expect(stores[0]?.getState().hydration).toEqual({ status: "loading", error: null });
    expect(stores[1]?.getState().hydration).toEqual({ status: "ready", error: null });
  });

  it("creates isolated stores for simultaneous same-artifact roots", async () => {
    const stores: Array<LearnerActivityStoreApi | null> = [null, null];
    const first = render(
      <RuntimeRoot
        learnerActivityPort={null}
        onStore={(store) => {
          stores[0] = store;
        }}
      />,
    );
    render(
      <RuntimeRoot
        learnerActivityPort={null}
        onStore={(store) => {
          stores[1] = store;
        }}
      />,
    );

    await waitFor(() => expect(stores[0]).not.toBeNull());
    await waitFor(() => expect(stores[1]).not.toBeNull());
    stores[0]?.getState().ensureActivity({
      blockId: "block-one",
      activityKind: "checklist",
      initial: { data: { root: 1 }, completed: false },
    });

    expect(stores[0]).not.toBe(stores[1]);
    expect(stores[1]?.getState().activities).toEqual({});

    first.unmount();
    expect(stores[0]?.getState().activities["block-one"]?.data).toEqual({ root: 1 });
    expect(
      stores[1]?.getState().ensureActivity({
        blockId: "block-two",
        activityKind: "checklist",
        initial: { data: { root: 2 }, completed: false },
      }),
    ).toBe(true);
    expect(stores[1]?.getState().activities["block-two"]?.data).toEqual({ root: 2 });
  });

  it("keeps simultaneous different-artifact roots isolated even when block ids match", async () => {
    const stores: Array<LearnerActivityStoreApi | null> = [null, null];
    const first = render(
      <RuntimeRoot
        artifactId="artifact-one"
        learnerActivityPort={null}
        onStore={(store) => {
          stores[0] = store;
        }}
      />,
    );
    render(
      <RuntimeRoot
        artifactId="artifact-two"
        learnerActivityPort={null}
        onStore={(store) => {
          stores[1] = store;
        }}
      />,
    );

    await waitFor(() => expect(stores[0]).not.toBeNull());
    await waitFor(() => expect(stores[1]).not.toBeNull());
    stores[0]?.getState().ensureActivity({
      blockId: "shared-block",
      activityKind: "checklist",
      initial: { data: { artifact: "one" }, completed: false },
    });
    stores[1]?.getState().ensureActivity({
      blockId: "shared-block",
      activityKind: "checklist",
      initial: { data: { artifact: "two" }, completed: false },
    });

    expect(stores[0]?.getState().artifactId).toBe("artifact-one");
    expect(stores[1]?.getState().artifactId).toBe("artifact-two");
    expect(stores[0]?.getState().activities["shared-block"]?.data).toEqual({ artifact: "one" });
    expect(stores[1]?.getState().activities["shared-block"]?.data).toEqual({ artifact: "two" });

    first.unmount();
    expect(stores[0]?.getState().activities["shared-block"]?.data).toEqual({ artifact: "one" });
    expect(stores[1]?.getState().activities["shared-block"]?.data).toEqual({ artifact: "two" });
  });

  it("creates a fresh isolated store on remount", async () => {
    const stores: LearnerActivityStoreApi[] = [];
    const first = render(
      <RuntimeRoot
        learnerActivityPort={null}
        onStore={(store) => {
          if (store) stores.push(store);
        }}
      />,
    );
    await waitFor(() => expect(stores).toHaveLength(1));
    stores[0]?.getState().ensureActivity({
      blockId: "block-one",
      activityKind: "checklist",
      initial: { data: { old: true }, completed: false },
    });
    first.unmount();

    render(
      <RuntimeRoot
        learnerActivityPort={null}
        onStore={(store) => {
          if (store) stores.push(store);
        }}
      />,
    );

    await waitFor(() => expect(stores).toHaveLength(2));
    expect(stores[1]?.getState().activities).toEqual({});
  });

  it("reports hook use outside the provider explicitly", () => {
    expect(() => render(<StoreProbe onStore={() => {}} />)).toThrow(
      "Learner activity store hooks must be used inside a LearnerActivityRuntimeProvider.",
    );
  });

  it("shares one block record across consumers without deleting it on consumer unmount", async () => {
    const user = userEvent.setup();
    const Root = ({ first }: { first: boolean }) => (
      <RuntimeRoot learnerActivityPort={null} onStore={() => {}}>
        {first ? <ActivityProbe blockId="block-one" label="first" /> : null}
        <ActivityProbe blockId="block-one" label="second" />
      </RuntimeRoot>
    );
    const mounted = render(<Root first />);

    await waitFor(() =>
      expect(screen.getByRole("region", { name: "second" }).textContent).toContain(
        '{"checked":false}',
      ),
    );
    await user.click(screen.getByRole("button", { name: "Check first" }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "second" }).textContent).toContain(
        '{"checked":true}',
      ),
    );

    mounted.rerender(<Root first={false} />);

    expect(screen.getByRole("region", { name: "second" }).textContent).toContain(
      '{"checked":true}',
    );
  });

  it("reports unsafe block identity without creating an unscoped record", async () => {
    const user = userEvent.setup();
    const stores: LearnerActivityStoreApi[] = [];

    render(
      <RuntimeRoot
        learnerActivityPort={null}
        onStore={(store) => {
          if (store) stores.push(store);
        }}
      >
        <ActivityProbe blockId=" " label="unsafe" />
      </RuntimeRoot>,
    );

    await user.click(screen.getByRole("button", { name: "Check unsafe" }));
    await waitFor(() => expect(stores).toHaveLength(1));
    expect(stores[0]?.getState().activities).toEqual({});
  });
});

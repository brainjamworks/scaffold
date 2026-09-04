// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, useEffect, useRef, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useSurfaceWorkspaceRequest } from "../workspaces/surface-workspace-request";
import {
  ShellLayoutProvider,
  useShellLayout,
  useShellLayoutStore,
} from "./ShellLayoutProvider";
import { createShellLayoutStore } from "./shell-layout-store";

afterEach(() => {
  cleanup();
});

const SURFACE_A = EmbeddedNodeIdSchema.parse("surface00001");
const SURFACE_B = EmbeddedNodeIdSchema.parse("surface00002");

describe("createShellLayoutStore", () => {
  it("starts with closed docks and no bottom panel", () => {
    const store = createShellLayoutStore();

    expect(store.getState().leftDock).toBeNull();
    expect(store.getState().rightDock).toBeNull();
    expect(store.getState().bottomPanel).toBeNull();
  });

  it("honours a partial initial state", () => {
    const store = createShellLayoutStore({ rightDock: "agent" });

    expect(store.getState().leftDock).toBeNull();
    expect(store.getState().rightDock).toBe("agent");
    expect(store.getState().bottomPanel).toBeNull();
  });

  it("toggles each dock independently", () => {
    const store = createShellLayoutStore();

    store.getState().toggleLeftDock("outline");
    expect(store.getState().leftDock).toBe("outline");
    expect(store.getState().rightDock).toBeNull();

    store.getState().toggleRightDock("agent");
    expect(store.getState().leftDock).toBe("outline");
    expect(store.getState().rightDock).toBe("agent");

    store.getState().toggleLeftDock("outline");
    expect(store.getState().leftDock).toBeNull();
    expect(store.getState().rightDock).toBe("agent");

    store.getState().toggleRightDock("agent");
    expect(store.getState().rightDock).toBeNull();
  });

  it("sets and clears each dock directly", () => {
    const store = createShellLayoutStore();

    store.getState().setLeftDock("outline");
    store.getState().setRightDock("agent");
    expect(store.getState().leftDock).toBe("outline");
    expect(store.getState().rightDock).toBe("agent");

    store.getState().setLeftDock(null);
    store.getState().setRightDock(null);
    expect(store.getState().leftDock).toBeNull();
    expect(store.getState().rightDock).toBeNull();
  });

  it("increments the bottom-panel nonce on every open, starting at 1", () => {
    const store = createShellLayoutStore();

    store.getState().openBottomPanel("timeline", SURFACE_A);
    expect(store.getState().bottomPanel).toEqual({
      workspace: "timeline",
      surfaceId: SURFACE_A,
      nonce: 1,
    });

    store.getState().openBottomPanel("timeline", SURFACE_A);
    expect(store.getState().bottomPanel?.nonce).toBe(2);

    store.getState().openBottomPanel("interactions", SURFACE_B);
    expect(store.getState().bottomPanel).toEqual({
      workspace: "interactions",
      surfaceId: SURFACE_B,
      nonce: 3,
    });
  });

  it("closeBottomPanel nulls the panel and keeps the docks", () => {
    const store = createShellLayoutStore({
      leftDock: "outline",
      rightDock: "agent",
    });
    store.getState().openBottomPanel("timeline", SURFACE_A);

    store.getState().closeBottomPanel();

    expect(store.getState().bottomPanel).toBeNull();
    expect(store.getState().leftDock).toBe("outline");
    expect(store.getState().rightDock).toBe("agent");
  });

  it("enterPreview clears both docks but keeps the bottom panel", () => {
    const store = createShellLayoutStore({
      leftDock: "outline",
      rightDock: "agent",
    });
    store.getState().openBottomPanel("timeline", SURFACE_A);
    const panel = store.getState().bottomPanel;

    store.getState().enterPreview();

    expect(store.getState().leftDock).toBeNull();
    expect(store.getState().rightDock).toBeNull();
    expect(store.getState().bottomPanel).toBe(panel);
  });

  it("keeps snapshots referentially stable between changes", () => {
    const store = createShellLayoutStore();
    const before = store.getState();

    expect(store.getState()).toBe(before);

    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().toggleLeftDock("outline");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState()).not.toBe(before);
    expect(store.getState().bottomPanel).toBe(before.bottomPanel);
  });
});

function withProvider(store: ReturnType<typeof createShellLayoutStore>, child: ReactNode) {
  return createElement(ShellLayoutProvider, { store }, child);
}

function ControlledAgentHarness({
  agentOpen,
  onAgentOpenChange,
  store,
}: {
  agentOpen: boolean;
  onAgentOpenChange: (open: boolean) => void;
  store: ReturnType<typeof createShellLayoutStore>;
}) {
  const agentOpenRef = useRef(agentOpen);
  agentOpenRef.current = agentOpen;
  useEffect(() => {
    const wanted = agentOpen ? "agent" : null;
    if (store.getState().rightDock !== wanted) {
      store.getState().setRightDock(wanted);
    }
  }, [store, agentOpen]);
  useEffect(() => {
    return store.subscribe((state) => {
      const open = state.rightDock === "agent";
      if (open !== agentOpenRef.current) {
        onAgentOpenChange(open);
      }
    });
  }, [store, onAgentOpenChange]);
  const open = useShellLayout((state) => state.rightDock === "agent");
  const toggleRightDock = useShellLayout((state) => state.toggleRightDock);
  return createElement(
    "button",
    { type: "button", onClick: () => toggleRightDock("agent") },
    open ? "Hide agent" : "Show agent",
  );
}

describe("ShellLayoutProvider", () => {
  it("throws outside a provider", () => {
    const Probe = () => {
      useShellLayoutStore();
      return null;
    };

    expect(() => render(createElement(Probe))).toThrow(
      "Shell layout hooks must be used inside a ShellLayoutProvider.",
    );
  });

  it("selects layout slices and re-renders on change", () => {
    const store = createShellLayoutStore();
    const LeftDockLabel = () => {
      const leftDock = useShellLayout((state) => state.leftDock);
      const toggleLeftDock = useShellLayout((state) => state.toggleLeftDock);
      return createElement(
        "button",
        { type: "button", onClick: () => toggleLeftDock("outline") },
        leftDock === "outline" ? "Hide outline" : "Show outline",
      );
    };

    render(withProvider(store, createElement(LeftDockLabel)));

    fireEvent.click(screen.getByRole("button", { name: "Show outline" }));
    expect(screen.getByRole("button", { name: "Hide outline" })).toBeInTheDocument();
    expect(store.getState().leftDock).toBe("outline");
  });
});

describe("host-controlled agent dock", () => {
  function renderHarness(agentOpen: boolean, onAgentOpenChange: (open: boolean) => void) {
    const store = createShellLayoutStore({ rightDock: agentOpen ? "agent" : null });
    const view = render(
      withProvider(
        store,
        createElement(ControlledAgentHarness, { agentOpen, onAgentOpenChange, store }),
      ),
    );
    return { store, view };
  }

  it("follows the host prop without echoing back", () => {
    const onAgentOpenChange = vi.fn();
    const { store, view } = renderHarness(false, onAgentOpenChange);
    expect(screen.getByRole("button", { name: "Show agent" })).toBeInTheDocument();

    view.rerender(
      withProvider(
        store,
        createElement(ControlledAgentHarness, { agentOpen: true, onAgentOpenChange, store }),
      ),
    );
    expect(screen.getByRole("button", { name: "Hide agent" })).toBeInTheDocument();
    expect(store.getState().rightDock).toBe("agent");
    expect(onAgentOpenChange).not.toHaveBeenCalled();
  });

  it("reports store changes once and absorbs the host echo", () => {
    const onAgentOpenChange = vi.fn();
    const { store, view } = renderHarness(false, onAgentOpenChange);

    fireEvent.click(screen.getByRole("button", { name: "Show agent" }));
    expect(onAgentOpenChange).toHaveBeenCalledTimes(1);
    expect(onAgentOpenChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("button", { name: "Hide agent" })).toBeInTheDocument();

    view.rerender(
      withProvider(
        store,
        createElement(ControlledAgentHarness, {
          agentOpen: true,
          onAgentOpenChange,
          store,
        }),
      ),
    );
    expect(onAgentOpenChange).toHaveBeenCalledTimes(1);
    expect(store.getState().rightDock).toBe("agent");

    fireEvent.click(screen.getByRole("button", { name: "Hide agent" }));
    expect(onAgentOpenChange).toHaveBeenCalledTimes(2);
    expect(onAgentOpenChange).toHaveBeenLastCalledWith(false);
  });
});

describe("useSurfaceWorkspaceRequest", () => {
  it("returns null outside a ShellLayoutProvider", () => {
    let port: unknown = "unset";
    const Probe = () => {
      port = useSurfaceWorkspaceRequest();
      return null;
    };

    render(createElement(Probe));

    expect(port).toBeNull();
  });

  it("opens the bottom panel through the store", () => {
    const store = createShellLayoutStore();
    let port: ReturnType<typeof useSurfaceWorkspaceRequest> = null;
    const Probe = () => {
      port = useSurfaceWorkspaceRequest();
      return null;
    };

    const { rerender } = render(withProvider(store, createElement(Probe)));
    const first = port;
    rerender(withProvider(store, createElement(Probe)));

    expect(first).not.toBeNull();
    expect(port).toBe(first);
    port?.open("interactions", SURFACE_B);
    expect(store.getState().bottomPanel).toEqual({
      workspace: "interactions",
      surfaceId: SURFACE_B,
      nonce: 1,
    });
  });
});

// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vite-plus/test";

import { zIndex } from "@/ui/overlays/z-index";

import {
  OverlayBoundaryResolutionProvider,
  pendingOverlayBoundaryResolution,
  useOverlayBoundary,
  type OverlayBoundaryResolution,
} from "./portal-host-context";

function Scope({
  children,
  resolution,
}: {
  children: ReactNode;
  resolution: OverlayBoundaryResolution;
}) {
  return (
    <OverlayBoundaryResolutionProvider resolution={resolution}>
      {children}
    </OverlayBoundaryResolutionProvider>
  );
}

function BoundaryResolutionProbe() {
  const resolution = useOverlayBoundary();

  return <output data-testid="boundary-resolution">{formatBoundaryResolution(resolution)}</output>;
}

function formatBoundaryResolution(resolution: OverlayBoundaryResolution): string {
  if (resolution.status !== "ready") return resolution.status;
  const { environment } = resolution;
  return [
    "ready",
    environment.host.getAttribute("data-host"),
    environment.kind,
    environment.strategy,
    String(environment.ownerDocument === environment.host.ownerDocument),
    String(environment.ownerWindow === environment.host.ownerDocument.defaultView),
  ].join(":");
}

function readyResolution(host: HTMLElement): OverlayBoundaryResolution {
  const { ownerDocument } = host;
  const ownerWindow = ownerDocument.defaultView;
  if (ownerWindow === null) throw new Error("Expected host owner window");

  return {
    status: "ready",
    environment: {
      collisionBoundary: null,
      host,
      kind: "viewport",
      ownerDocument,
      ownerWindow,
      strategy: "fixed",
    },
  };
}

describe("overlay boundary resolution", () => {
  it("reserves a nested modal layer above workspace content and below popovers", () => {
    expect(zIndex.nestedModal).toBeGreaterThan(zIndex.modalContent);
    expect(zIndex.nestedModal).toBeLessThan(zIndex.popover);
  });

  it("distinguishes an unscoped consumer from a pending scope", () => {
    const { rerender } = render(<BoundaryResolutionProbe />);

    expect(screen.getByText("unscoped")).toBeInTheDocument();

    rerender(
      <Scope resolution={pendingOverlayBoundaryResolution}>
        <BoundaryResolutionProbe />
      </Scope>,
    );

    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("resolves a ready scope to its host", () => {
    const host = document.createElement("div");
    host.dataset.host = "workspace";

    render(
      <Scope resolution={readyResolution(host)}>
        <BoundaryResolutionProbe />
      </Scope>,
    );

    expect(screen.getByText("ready:workspace:viewport:fixed:true:true")).toBeInTheDocument();
  });

  it("keeps the nearest pending scope authoritative over a ready outer scope", () => {
    const host = document.createElement("div");
    host.dataset.host = "outer";

    render(
      <Scope resolution={readyResolution(host)}>
        <Scope resolution={pendingOverlayBoundaryResolution}>
          <BoundaryResolutionProbe />
        </Scope>
      </Scope>,
    );

    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("uses the nearest ready host in nested scopes", () => {
    const outerHost = document.createElement("div");
    outerHost.dataset.host = "outer";
    const innerHost = document.createElement("div");
    innerHost.dataset.host = "inner";

    render(
      <Scope resolution={readyResolution(outerHost)}>
        <BoundaryResolutionProbe />
        <Scope resolution={readyResolution(innerHost)}>
          <BoundaryResolutionProbe />
        </Scope>
      </Scope>,
    );

    expect(screen.getByText("ready:outer:viewport:fixed:true:true")).toBeInTheDocument();
    expect(screen.getByText("ready:inner:viewport:fixed:true:true")).toBeInTheDocument();
  });
});

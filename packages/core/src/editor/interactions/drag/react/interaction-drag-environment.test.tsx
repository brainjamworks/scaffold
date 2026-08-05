// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  createScaledCanvasCoordinateSpace,
  createViewportCoordinateSpace,
} from "../dom/dom-coordinate-space";
import { TestInteractionDragEnvironment } from "../testing/TestInteractionDragEnvironment";
import {
  InteractionDragEnvironmentProvider,
  useInteractionDragEnvironmentResolution,
  useReadyInteractionDragEnvironment,
} from "./interaction-drag-environment";
import {
  OverlayBoundaryResolutionProvider,
  type OverlayBoundaryResolution,
} from "@/ui/overlays/portal-host-context";

describe("InteractionDragEnvironmentProvider", () => {
  it("distinguishes unscoped, pending root, and pending overlay integration", () => {
    const root = connectedElement("root", { left: 0, top: 0, width: 200, height: 100 });
    const coordinateSpace = createViewportCoordinateSpace({
      getRoot: () => root,
      ownerDocument: document,
    });
    const { rerender } = render(<ResolutionProbe />);

    expect(screen.getByTestId("resolution")).toHaveTextContent("unscoped:unscoped");

    rerender(
      <OverlayBoundaryResolutionProvider resolution={readyBoundary()}>
        <InteractionDragEnvironmentProvider coordinateRoot={null} coordinateSpace={coordinateSpace}>
          <ResolutionProbe />
        </InteractionDragEnvironmentProvider>
      </OverlayBoundaryResolutionProvider>,
    );
    expect(screen.getByTestId("resolution")).toHaveTextContent("pending:root");

    rerender(
      <InteractionDragEnvironmentProvider coordinateRoot={root} coordinateSpace={coordinateSpace}>
        <ResolutionProbe />
      </InteractionDragEnvironmentProvider>,
    );
    expect(screen.getByTestId("resolution")).toHaveTextContent("pending:overlay-boundary");
  });

  it("publishes one ready browsing context and reuses a contained host with fixed drag strategy", () => {
    const root = connectedElement("root", { left: 20, top: 30, width: 400, height: 300 });
    const host = connectedElement("host", { left: 0, top: 0, width: 800, height: 600 });
    const collisionBoundary = connectedElement("collision", {
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    });
    const coordinateSpace = createViewportCoordinateSpace({
      getRoot: () => root,
      ownerDocument: document,
    });

    render(
      <OverlayBoundaryResolutionProvider
        resolution={readyBoundary({ collisionBoundary, host, kind: "contained" })}
      >
        <InteractionDragEnvironmentProvider coordinateRoot={root} coordinateSpace={coordinateSpace}>
          <ResolutionProbe />
        </InteractionDragEnvironmentProvider>
      </OverlayBoundaryResolutionProvider>,
    );

    const probe = screen.getByTestId("resolution");
    expect(probe).toHaveTextContent("ready:ready");
    expect(probe.dataset.host).toBe("host");
    expect(probe.dataset.strategy).toBe("fixed");
    expect(probe.dataset.strictReady).toBe("true");
  });

  it("fails closed when a scaled overlay host is inside the transformed root", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const root = connectedElement("root", { left: 0, top: 0, width: 512, height: 288 });
    root.style.transform = "matrix(0.5, 0, 0, 0.5, 0, 0)";
    const host = connectedElement("host", { left: 0, top: 0, width: 512, height: 288 });
    root.append(host);
    const collisionBoundary = connectedElement("collision", {
      left: 0,
      top: 0,
      width: 512,
      height: 288,
    });
    const coordinateSpace = createScaledCanvasCoordinateSpace({
      getRoot: () => root,
      ownerDocument: document,
      localSize: { width: 1024, height: 576 },
    });

    renderEnvironment({ collisionBoundary, coordinateSpace, host, root });

    expect(screen.getByTestId("resolution")).toHaveTextContent("pending:invalid");
  });

  it("rejects cross-document elements and environment loss", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const root = connectedElement("root", { left: 0, top: 0, width: 200, height: 100 });
    const coordinateSpace = createViewportCoordinateSpace({
      getRoot: () => root,
      ownerDocument: document,
    });
    const foreignDocument = document.implementation.createHTMLDocument("foreign");
    const foreignHost = foreignDocument.createElement("div");
    foreignDocument.body.append(foreignHost);
    const collisionBoundary = connectedElement("collision", {
      left: 0,
      top: 0,
      width: 200,
      height: 100,
    });
    const { rerender } = renderEnvironment({
      collisionBoundary,
      coordinateSpace,
      host: foreignHost,
      root,
    });

    expect(screen.getByTestId("resolution")).toHaveTextContent("pending:invalid");

    const host = connectedElement("host", { left: 0, top: 0, width: 200, height: 100 });
    rerender(environmentTree({ collisionBoundary, coordinateSpace, host, root }));
    expect(screen.getByTestId("resolution")).toHaveTextContent("ready:ready");

    host.remove();
    rerender(environmentTree({ collisionBoundary, coordinateSpace, host, root }));
    expect(screen.getByTestId("resolution")).toHaveTextContent("pending:invalid");
  });

  it("resolves replacement roots instead of retaining stale fixture geometry", () => {
    const firstRoot = connectedElement("first", { left: 0, top: 0, width: 200, height: 100 });
    const secondRoot = connectedElement("second", { left: 50, top: 40, width: 300, height: 200 });
    const host = connectedElement("host", { left: 0, top: 0, width: 600, height: 400 });
    const collisionBoundary = connectedElement("collision", {
      left: 0,
      top: 0,
      width: 600,
      height: 400,
    });
    const firstSpace = createViewportCoordinateSpace({
      getRoot: () => firstRoot,
      ownerDocument: document,
    });
    const { rerender } = renderEnvironment({
      collisionBoundary,
      coordinateSpace: firstSpace,
      host,
      root: firstRoot,
    });

    const secondSpace = createViewportCoordinateSpace({
      getRoot: () => secondRoot,
      ownerDocument: document,
    });
    rerender(environmentTree({ collisionBoundary, coordinateSpace: secondSpace, host, root: secondRoot }));

    expect(screen.getByTestId("resolution").dataset.root).toBe("second");
  });

  it("requires an explicit fixture and never falls back to document.body", () => {
    const root = connectedElement("fixture", { left: 10, top: 20, width: 512, height: 288 });
    root.style.transform = "matrix(0.5, 0, 0, 0.5, 0, 0)";
    const host = connectedElement("fixture-host", {
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    });
    const collisionBoundary = connectedElement("fixture-collision", {
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    });

    const { rerender } = render(<ResolutionProbe />);
    expect(screen.getByTestId("resolution").dataset.host).toBeUndefined();

    rerender(
      <TestInteractionDragEnvironment
        collisionBoundary={collisionBoundary}
        coordinateKind="scaled-canvas"
        localSize={{ width: 1024, height: 576 }}
        overlayHost={host}
        root={root}
      >
        <ResolutionProbe />
      </TestInteractionDragEnvironment>,
    );
    expect(screen.getByTestId("resolution")).toHaveTextContent("ready:ready");
    expect(screen.getByTestId("resolution").dataset.host).toBe("fixture-host");
  });
});

function ResolutionProbe() {
  const resolution = useInteractionDragEnvironmentResolution();
  const ready = useReadyInteractionDragEnvironment();
  return (
    <output
      data-testid="resolution"
      data-host={resolution.status === "ready" ? resolution.environment.overlayHost.dataset.testId : undefined}
      data-root={resolution.status === "ready" ? resolution.environment.coordinateRoot.dataset.testId : undefined}
      data-strategy={resolution.status === "ready" ? resolution.environment.positionStrategy : undefined}
      data-strict-ready={String(ready !== null)}
    >
      {resolution.status}:{resolution.status === "pending" ? resolution.reason : resolution.status}
    </output>
  );
}

function renderEnvironment(input: EnvironmentInput) {
  return render(environmentTree(input));
}

function environmentTree({ collisionBoundary, coordinateSpace, host, root }: EnvironmentInput) {
  return (
    <OverlayBoundaryResolutionProvider
      resolution={readyBoundary({ collisionBoundary, host, kind: "viewport" })}
    >
      <InteractionDragEnvironmentProvider coordinateRoot={root} coordinateSpace={coordinateSpace}>
        <ResolutionProbe />
      </InteractionDragEnvironmentProvider>
    </OverlayBoundaryResolutionProvider>
  );
}

interface EnvironmentInput {
  collisionBoundary: HTMLElement;
  coordinateSpace: ReturnType<typeof createViewportCoordinateSpace>;
  host: HTMLElement;
  root: HTMLElement;
}

function readyBoundary(input?: {
  collisionBoundary?: HTMLElement;
  host?: HTMLElement;
  kind?: "viewport" | "contained";
}): OverlayBoundaryResolution {
  const host = input?.host ?? connectedElement("host", { left: 0, top: 0, width: 800, height: 600 });
  const collisionBoundary =
    input?.collisionBoundary ??
    connectedElement("collision", { left: 0, top: 0, width: 800, height: 600 });
  return {
    status: "ready",
    environment: {
      collisionBoundary,
      host,
      kind: input?.kind ?? "viewport",
      ownerDocument: host.ownerDocument,
      ownerWindow: host.ownerDocument.defaultView!,
      strategy: input?.kind === "contained" ? "absolute" : "fixed",
    },
  };
}

function connectedElement(
  testId: string,
  rect: { left: number; top: number; width: number; height: number },
): HTMLElement {
  const element = document.createElement("div");
  element.dataset.testId = testId;
  element.getBoundingClientRect = () => ({
    ...rect,
    bottom: rect.top + rect.height,
    right: rect.left + rect.width,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
  document.body.append(element);
  return element;
}

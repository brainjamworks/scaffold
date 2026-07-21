// @vitest-environment happy-dom

import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vite-plus/test";

import { zIndex } from "@/ui/overlays/z-index";
import {
  useOverlayBoundary,
  type OverlayBoundaryEnvironment,
  type OverlayBoundaryKind,
} from "@/ui/overlays/portal-host-context";

import { OverlayBoundary } from "./OverlayBoundary";

function BoundaryProbe({ label }: { label: string }) {
  const resolution = useOverlayBoundary();

  if (resolution.status !== "ready") {
    return <output data-testid={label}>{resolution.status}</output>;
  }

  const { environment } = resolution;
  return (
    <output
      data-testid={label}
      data-host={environment.host.dataset.host}
      data-kind={environment.kind}
      data-owner-document={String(environment.ownerDocument === environment.host.ownerDocument)}
      data-owner-window={String(
        environment.ownerWindow === environment.host.ownerDocument.defaultView,
      )}
      data-strategy={environment.strategy}
    >
      ready
    </output>
  );
}

function BoundaryHarness({
  children,
  collisionBoundary,
  container,
  kind,
}: {
  children: ReactNode;
  collisionBoundary?: Element | null;
  container: Element | null;
  kind: OverlayBoundaryKind;
}) {
  return (
    <OverlayBoundary
      container={container}
      {...(collisionBoundary === undefined ? {} : { collisionBoundary })}
      kind={kind}
    >
      {children}
    </OverlayBoundary>
  );
}

function EnvironmentCapture({
  onReady,
}: {
  onReady: (environment: OverlayBoundaryEnvironment) => void;
}) {
  const resolution = useOverlayBoundary();
  if (resolution.status === "ready") onReady(resolution.environment);
  return null;
}

describe("OverlayBoundary", () => {
  it("distinguishes an unscoped consumer from a scoped boundary whose host is pending", () => {
    const { rerender } = render(<BoundaryProbe label="resolution" />);

    expect(screen.getByTestId("resolution").textContent).toBe("unscoped");

    rerender(
      <BoundaryHarness container={null} kind="viewport">
        <BoundaryProbe label="resolution" />
      </BoundaryHarness>,
    );

    expect(screen.getByTestId("resolution").textContent).toBe("pending");
    expect(document.querySelector("[data-scaffold-overlay-host]")).toBeNull();
  });

  it("publishes a ready viewport environment from the container owner document", async () => {
    const container = document.createElement("section");
    document.body.append(container);

    render(
      <BoundaryHarness container={container} kind="viewport">
        <BoundaryProbe label="viewport" />
      </BoundaryHarness>,
    );

    await waitFor(() => expect(screen.getByTestId("viewport").textContent).toBe("ready"));

    const probe = screen.getByTestId("viewport");
    const host = container.querySelector<HTMLElement>("[data-scaffold-overlay-host]");

    expect(host).not.toBeNull();
    expect(host).not.toBe(container);
    expect(probe.dataset.kind).toBe("viewport");
    expect(probe.dataset.ownerDocument).toBe("true");
    expect(probe.dataset.ownerWindow).toBe("true");
    expect(probe.dataset.strategy).toBe("fixed");

    container.remove();
  });

  it("uses absolute strategy and the container as the default contained collision boundary", async () => {
    const container = document.createElement("section");
    document.body.append(container);
    let environment: OverlayBoundaryEnvironment | undefined;

    render(
      <BoundaryHarness container={container} kind="contained">
        <EnvironmentCapture onReady={(nextEnvironment) => (environment = nextEnvironment)} />
      </BoundaryHarness>,
    );

    await waitFor(() => expect(environment).toBeDefined());
    expect(environment?.kind).toBe("contained");
    expect(environment?.strategy).toBe("absolute");
    expect(environment?.collisionBoundary).toBe(container);

    container.remove();
  });

  it("preserves an explicit collision boundary", async () => {
    const container = document.createElement("section");
    const collisionBoundary = document.createElement("div");
    container.append(collisionBoundary);
    document.body.append(container);
    let environment: OverlayBoundaryEnvironment | undefined;

    render(
      <BoundaryHarness container={container} collisionBoundary={collisionBoundary} kind="contained">
        <EnvironmentCapture onReady={(nextEnvironment) => (environment = nextEnvironment)} />
      </BoundaryHarness>,
    );

    await waitFor(() => expect(environment).toBeDefined());
    expect(environment?.collisionBoundary).toBe(collisionBoundary);

    container.remove();
  });

  it("resolves the nearest ready boundary", async () => {
    const outerContainer = document.createElement("section");
    const innerContainer = document.createElement("div");
    outerContainer.append(innerContainer);
    document.body.append(outerContainer);
    let outerEnvironment: OverlayBoundaryEnvironment | undefined;
    let innerEnvironment: OverlayBoundaryEnvironment | undefined;

    render(
      <BoundaryHarness container={outerContainer} kind="viewport">
        <EnvironmentCapture onReady={(nextEnvironment) => (outerEnvironment = nextEnvironment)} />
        <BoundaryHarness container={innerContainer} kind="contained">
          <EnvironmentCapture onReady={(nextEnvironment) => (innerEnvironment = nextEnvironment)} />
        </BoundaryHarness>
      </BoundaryHarness>,
    );

    await waitFor(() => {
      expect(outerEnvironment).toBeDefined();
      expect(innerEnvironment).toBeDefined();
    });

    const outerHost = outerContainer.querySelector<HTMLElement>(
      ":scope > [data-scaffold-overlay-host]",
    );
    const innerHost = innerContainer.querySelector<HTMLElement>(
      ":scope > [data-scaffold-overlay-host]",
    );

    expect(outerHost).not.toBeNull();
    expect(innerHost).not.toBeNull();
    expect(outerHost).not.toBe(innerHost);
    expect(outerEnvironment?.host).toBe(outerHost);
    expect(innerEnvironment?.host).toBe(innerHost);

    outerContainer.remove();
  });

  it("creates one pointer-transparent out-of-flow host with interactive descendants", async () => {
    const container = document.createElement("section");
    document.body.append(container);

    render(
      <BoundaryHarness container={container} kind="viewport">
        <BoundaryProbe label="styled" />
      </BoundaryHarness>,
    );

    await waitFor(() => expect(screen.getByTestId("styled").textContent).toBe("ready"));

    const hosts = container.querySelectorAll<HTMLElement>("[data-scaffold-overlay-host]");
    const host = hosts.item(0);

    expect(hosts).toHaveLength(1);
    expect(host.style.position).toBe("fixed");
    expect(host.style.pointerEvents).toBe("none");
    expect(host.style.overflow).toBe("clip");
    expect(host.classList.contains("sc-overlay-boundary-host")).toBe(true);

    const interactiveChild = document.createElement("button");
    host.append(interactiveChild);
    expect(interactiveChild.closest(".sc-overlay-boundary-host")).toBe(host);

    container.remove();
  });

  it("elevates viewport hosts above editor chrome without stacking contained hosts", async () => {
    const viewportContainer = document.createElement("section");
    const containedContainer = document.createElement("section");
    document.body.append(viewportContainer, containedContainer);

    render(
      <>
        <BoundaryHarness container={viewportContainer} kind="viewport">
          <BoundaryProbe label="viewport-stacking" />
        </BoundaryHarness>
        <BoundaryHarness container={containedContainer} kind="contained">
          <BoundaryProbe label="contained-stacking" />
        </BoundaryHarness>
      </>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("viewport-stacking").textContent).toBe("ready");
      expect(screen.getByTestId("contained-stacking").textContent).toBe("ready");
    });

    const viewportHost = viewportContainer.querySelector<HTMLElement>(
      "[data-scaffold-overlay-host]",
    );
    const containedHost = containedContainer.querySelector<HTMLElement>(
      "[data-scaffold-overlay-host]",
    );

    expect(viewportHost?.style.zIndex).toBe(String(zIndex.overlayHost));
    expect(zIndex.overlayHost).toBeGreaterThan(zIndex.editorTextBubble);
    expect(zIndex.overlayHost).toBeLessThan(zIndex.modalBackdrop);
    expect(containedHost?.style.zIndex).toBe("");

    viewportContainer.remove();
    containedContainer.remove();
  });

  it("removes only its owned host when retargeted and unmounted", async () => {
    const firstContainer = document.createElement("section");
    const secondContainer = document.createElement("section");
    const retainedChild = document.createElement("div");
    firstContainer.append(retainedChild);
    document.body.append(firstContainer, secondContainer);

    const { rerender, unmount } = render(
      <BoundaryHarness container={firstContainer} kind="viewport">
        <BoundaryProbe label="retarget" />
      </BoundaryHarness>,
    );

    await waitFor(() => {
      expect(firstContainer.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(1);
    });
    const firstHost = firstContainer.querySelector("[data-scaffold-overlay-host]");

    rerender(
      <BoundaryHarness container={secondContainer} kind="viewport">
        <BoundaryProbe label="retarget" />
      </BoundaryHarness>,
    );

    await waitFor(() => {
      expect(firstContainer.querySelector("[data-scaffold-overlay-host]")).toBeNull();
      expect(secondContainer.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(1);
    });
    expect(firstHost?.isConnected).toBe(false);
    expect(retainedChild.isConnected).toBe(true);

    const secondHost = secondContainer.querySelector("[data-scaffold-overlay-host]");
    unmount();

    expect(secondHost?.isConnected).toBe(false);
    expect(secondContainer.querySelector("[data-scaffold-overlay-host]")).toBeNull();

    firstContainer.remove();
    secondContainer.remove();
  });
});

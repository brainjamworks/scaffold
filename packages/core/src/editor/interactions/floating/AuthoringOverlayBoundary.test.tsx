// @vitest-environment happy-dom

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { isOverlayTargetOwnedBy } from "@/editor/interactions/dom/overlay-ownership";
import {
  OverlayBoundaryResolutionProvider,
  useOverlayBoundary,
  type OverlayBoundaryEnvironment,
} from "@/ui/overlays/portal-host-context";

import { AuthoringOverlayBoundary, AuthoringOverlayOwnership } from "./AuthoringOverlayBoundary";

function BoundaryProbe() {
  const resolution = useOverlayBoundary();
  return <div data-testid="boundary-probe" data-status={resolution.status} />;
}

describe("AuthoringOverlayBoundary", () => {
  it("registers an existing resolved host without creating another portal host", async () => {
    const ownerRoot = document.createElement("div");
    const existingHost = document.createElement("div");
    const target = document.createElement("button");
    existingHost.append(target);
    document.body.append(ownerRoot, existingHost);

    const environment: OverlayBoundaryEnvironment = {
      host: existingHost,
      collisionBoundary: null,
      kind: "viewport",
      ownerDocument: document,
      ownerWindow: window,
      strategy: "fixed",
    };
    const { unmount } = render(
      <OverlayBoundaryResolutionProvider resolution={{ status: "ready", environment }}>
        <AuthoringOverlayOwnership ownerRoot={ownerRoot}>
          <div data-testid="existing-host-owner" />
        </AuthoringOverlayOwnership>
      </OverlayBoundaryResolutionProvider>,
    );

    await waitFor(() => expect(isOverlayTargetOwnedBy(ownerRoot, target)).toBe(true));
    expect(existingHost.querySelector("[data-scaffold-overlay-host]")).toBeNull();

    unmount();
    expect(isOverlayTargetOwnedBy(ownerRoot, target)).toBe(false);
    ownerRoot.remove();
    existingHost.remove();
  });

  it("creates and registers one contained host for a ready editor root", async () => {
    const ownerRoot = document.createElement("div");
    document.body.append(ownerRoot);

    const { unmount } = render(
      <AuthoringOverlayBoundary ownerRoot={ownerRoot}>
        <BoundaryProbe />
      </AuthoringOverlayBoundary>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("boundary-probe").dataset.status).toBe("ready");
    });

    const hosts = ownerRoot.querySelectorAll<HTMLElement>(":scope > [data-scaffold-overlay-host]");
    expect(hosts).toHaveLength(1);
    const host = hosts[0];
    expect(host?.dataset.kind).toBe("contained");

    const target = document.createElement("button");
    host?.append(target);
    expect(isOverlayTargetOwnedBy(ownerRoot, target)).toBe(true);

    unmount();

    expect(ownerRoot.querySelector("[data-scaffold-overlay-host]")).toBeNull();
    expect(isOverlayTargetOwnedBy(ownerRoot, target)).toBe(false);
    ownerRoot.remove();
  });

  it("uses a broader physical container without widening the editor collision boundary", async () => {
    const container = document.createElement("div");
    const ownerRoot = document.createElement("div");
    container.append(ownerRoot);
    document.body.append(container);
    const environments: OverlayBoundaryEnvironment[] = [];

    function EnvironmentProbe() {
      const resolution = useOverlayBoundary();
      if (resolution.status === "ready") environments.push(resolution.environment);
      return <div data-testid="separate-container-probe" data-status={resolution.status} />;
    }

    const { unmount } = render(
      <AuthoringOverlayBoundary container={container} ownerRoot={ownerRoot}>
        <EnvironmentProbe />
      </AuthoringOverlayBoundary>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("separate-container-probe").dataset.status).toBe("ready");
    });

    const host = container.querySelector<HTMLElement>(":scope > [data-scaffold-overlay-host]");
    const environment = environments.at(-1);
    expect(host).not.toBeNull();
    expect(ownerRoot.querySelector("[data-scaffold-overlay-host]")).toBeNull();
    expect(environment?.host).toBe(host);
    expect(environment?.collisionBoundary).toBe(ownerRoot);

    const target = document.createElement("button");
    host?.append(target);
    expect(isOverlayTargetOwnedBy(ownerRoot, target)).toBe(true);

    unmount();
    expect(container.querySelector("[data-scaffold-overlay-host]")).toBeNull();
    container.remove();
  });

  it("separates interaction ownership from explicit viewport collision geometry", async () => {
    const container = document.createElement("div");
    const collisionBoundary = document.createElement("section");
    const ownerRoot = document.createElement("div");
    container.append(collisionBoundary, ownerRoot);
    document.body.append(container);
    const environments: OverlayBoundaryEnvironment[] = [];

    function EnvironmentProbe() {
      const resolution = useOverlayBoundary();
      if (resolution.status === "ready") environments.push(resolution.environment);
      return <div data-testid="viewport-boundary-probe" data-status={resolution.status} />;
    }

    const { unmount } = render(
      <AuthoringOverlayBoundary
        collisionBoundary={collisionBoundary}
        container={container}
        kind="viewport"
        ownerRoot={ownerRoot}
      >
        <EnvironmentProbe />
      </AuthoringOverlayBoundary>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("viewport-boundary-probe").dataset.status).toBe("ready");
    });

    const host = container.querySelector<HTMLElement>(":scope > [data-scaffold-overlay-host]");
    const environment = environments.at(-1);
    expect(host?.dataset.kind).toBe("viewport");
    expect(environment?.collisionBoundary).toBe(collisionBoundary);

    const target = document.createElement("button");
    host?.append(target);
    expect(isOverlayTargetOwnedBy(ownerRoot, target)).toBe(true);

    unmount();
    container.remove();
  });

  it("stays pending and creates no host without a concrete editor root", () => {
    const container = document.createElement("div");
    document.body.append(container);

    render(
      <AuthoringOverlayBoundary container={container} ownerRoot={null}>
        <BoundaryProbe />
      </AuthoringOverlayBoundary>,
    );

    expect(screen.getByTestId("boundary-probe").dataset.status).toBe("pending");
    expect(container.querySelector("[data-scaffold-overlay-host]")).toBeNull();
    container.remove();
  });
});

// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import {
  OverlayBoundaryResolutionProvider,
  pendingOverlayBoundaryResolution,
  type OverlayBoundaryEnvironment,
} from "@/ui/overlays/portal-host-context";

import {
  applyAuthoringOverlaySizeVariables,
  authoringOverlayMiddlewareOptions,
  useAuthoringOverlayEnvironment,
  type AuthoringOverlayEnvironment,
} from "./useAuthoringOverlayEnvironment";

function EnvironmentProbe({
  onResolve,
  resolveDirectHost,
}: {
  onResolve: (environment: AuthoringOverlayEnvironment | null) => void;
  resolveDirectHost: () => HTMLElement | null;
}) {
  onResolve(useAuthoringOverlayEnvironment(resolveDirectHost));
  return null;
}

describe("useAuthoringOverlayEnvironment", () => {
  it("uses the nearest ready boundary host and strategy", () => {
    const directHost = document.createElement("div");
    const boundaryHost = document.createElement("div");
    const collisionBoundary = document.createElement("section");
    const environment: OverlayBoundaryEnvironment = {
      host: boundaryHost,
      collisionBoundary,
      kind: "viewport",
      ownerDocument: document,
      ownerWindow: window,
      strategy: "fixed",
    };
    const resolutions: Array<AuthoringOverlayEnvironment | null> = [];

    render(
      <OverlayBoundaryResolutionProvider resolution={{ status: "ready", environment }}>
        <EnvironmentProbe
          resolveDirectHost={() => directHost}
          onResolve={(next) => {
            resolutions.push(next);
          }}
        />
      </OverlayBoundaryResolutionProvider>,
    );

    expect(resolutions.at(-1)?.appendTo).toBe(boundaryHost);
    expect(resolutions.at(-1)?.collisionBoundary).toBe(collisionBoundary);
    expect(resolutions.at(-1)?.strategy).toBe("fixed");
  });

  it("resolves nothing while a scoped boundary is pending", () => {
    const directHost = document.createElement("div");
    const resolutions: Array<AuthoringOverlayEnvironment | null> = [];

    render(
      <OverlayBoundaryResolutionProvider resolution={pendingOverlayBoundaryResolution}>
        <EnvironmentProbe
          resolveDirectHost={() => directHost}
          onResolve={(next) => {
            resolutions.push(next);
          }}
        />
      </OverlayBoundaryResolutionProvider>,
    );

    expect(resolutions.at(-1)).toBeNull();
  });

  it("preserves the direct host only when no boundary scopes the consumer", () => {
    const directHost = document.createElement("div");
    const resolutions: Array<AuthoringOverlayEnvironment | null> = [];

    render(
      <EnvironmentProbe
        resolveDirectHost={() => directHost}
        onResolve={(next) => {
          resolutions.push(next);
        }}
      />,
    );

    expect(resolutions.at(-1)?.appendTo).toBe(directHost);
    expect(resolutions.at(-1)?.collisionBoundary).toBeNull();
    expect(resolutions.at(-1)?.strategy).toBe("absolute");
  });

  it("maps Tiptap size middleware values to the common overlay variables", () => {
    const directHost = document.createElement("div");

    render(<EnvironmentProbe resolveDirectHost={() => directHost} onResolve={() => undefined} />);

    const floating = document.createElement("div");
    applyAuthoringOverlaySizeVariables({
      availableHeight: 180,
      availableWidth: 320,
      floating,
      referenceHeight: 28,
      referenceWidth: 96,
    });

    expect(floating.style.getPropertyValue("--sc-overlay-available-inline-size")).toBe("320px");
    expect(floating.style.getPropertyValue("--sc-overlay-available-block-size")).toBe("180px");
    expect(floating.style.getPropertyValue("--sc-overlay-anchor-inline-size")).toBe("96px");
    expect(floating.style.getPropertyValue("--sc-overlay-anchor-block-size")).toBe("28px");
  });

  it("feeds an explicit boundary to every overflow-aware middleware", () => {
    const appendTo = document.createElement("div");
    const collisionBoundary = document.createElement("section");
    const environment: AuthoringOverlayEnvironment = {
      appendTo,
      collisionBoundary,
      size: {},
      strategy: "absolute",
    };

    expect(authoringOverlayMiddlewareOptions(environment)).toEqual({
      flip: { boundary: collisionBoundary },
      shift: { boundary: collisionBoundary, padding: 8 },
      size: { boundary: collisionBoundary, padding: 8 },
    });
  });
});

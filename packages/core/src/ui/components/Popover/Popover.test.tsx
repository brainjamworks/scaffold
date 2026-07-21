// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import * as Popover from "./Popover";
import { OverlayBoundary } from "../OverlayBoundary/OverlayBoundary";

const popoverMock = vi.hoisted(() => ({
  contentProps: [] as Array<Record<string, unknown>>,
  portalProps: [] as Array<Record<string, unknown>>,
}));

interface MockPrimitiveProps {
  children?: React.ReactNode;
  [key: string]: unknown;
}

vi.mock("@radix-ui/react-popover", async () => {
  const React = await import("react");
  const ReactDOM = await import("react-dom");

  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  const Content = React.forwardRef<HTMLDivElement, MockPrimitiveProps>(function MockPopoverContent(
    { children, ...props },
    ref,
  ) {
    popoverMock.contentProps.push(props);

    return React.createElement(
      "div",
      {
        ref,
        "data-testid": "mock-popover-content",
      },
      children as React.ReactNode,
    );
  });

  function Portal({ children, ...props }: MockPrimitiveProps) {
    popoverMock.portalProps.push(props);
    const container =
      (props.container as Element | DocumentFragment | null | undefined) ?? document.body;
    return ReactDOM.createPortal(children as React.ReactNode, container);
  }

  return {
    Anchor: Passthrough,
    Arrow: "span",
    Close: "button",
    Content,
    Portal,
    Root: Passthrough,
    Trigger: Passthrough,
  };
});

afterEach(() => {
  cleanup();
  popoverMock.contentProps.length = 0;
  popoverMock.portalProps.length = 0;
});

describe("Popover", () => {
  it("exports the Scaffold popover namespace parts", () => {
    expect(Popover.Root).toBeDefined();
    expect(Popover.Trigger).toBeDefined();
    expect(Popover.Anchor).toBeDefined();
    expect(Popover.Portal).toBeDefined();
    expect(Popover.Content).toBeDefined();
    expect(Popover.Arrow).toBeDefined();
    expect(Popover.Close).toBeDefined();
  });

  it("defaults content to stable detached-anchor positioning", () => {
    render(<Popover.Content aria-label="Stable popover">Stable content</Popover.Content>);

    expect(screen.getByText("Stable content")).not.toBeNull();
    expect(popoverMock.contentProps.at(-1)).toEqual(
      expect.objectContaining({
        "aria-label": "Stable popover",
        hideWhenDetached: true,
        updatePositionStrategy: "always",
      }),
    );
  });

  it("preserves explicit positioning overrides", () => {
    render(
      <Popover.Content hideWhenDetached={false} updatePositionStrategy="optimized">
        Override content
      </Popover.Content>,
    );

    expect(popoverMock.contentProps.at(-1)).toEqual(
      expect.objectContaining({
        hideWhenDetached: false,
        updatePositionStrategy: "optimized",
      }),
    );
  });

  it("forwards content refs", () => {
    const ref = { current: null as HTMLDivElement | null };

    render(<Popover.Content ref={ref}>Ref content</Popover.Content>);

    expect(ref.current).toBe(screen.getByTestId("mock-popover-content"));
  });

  it("passes content styling, placement, collision, focus, dismissal, and mounting props through", () => {
    const collisionBoundary = document.createElement("section");
    const onCloseAutoFocus = vi.fn();
    const onEscapeKeyDown = vi.fn();
    const onFocusOutside = vi.fn();
    const onInteractOutside = vi.fn();
    const onOpenAutoFocus = vi.fn();
    const onPointerDownOutside = vi.fn();

    render(
      <Popover.Content
        align="end"
        alignOffset={3}
        arrowPadding={5}
        asChild
        avoidCollisions={false}
        className="scaffold-popover"
        collisionBoundary={collisionBoundary}
        collisionPadding={{ top: 12 }}
        forceMount
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={onEscapeKeyDown}
        onFocusOutside={onFocusOutside}
        onInteractOutside={onInteractOutside}
        onOpenAutoFocus={onOpenAutoFocus}
        onPointerDownOutside={onPointerDownOutside}
        side="left"
        sideOffset={8}
        sticky="always"
        style={{ minWidth: 240 }}
      >
        Pass-through content
      </Popover.Content>,
    );

    const contentProps = popoverMock.contentProps.at(-1);

    expect(contentProps).toEqual(
      expect.objectContaining({
        align: "end",
        alignOffset: 3,
        arrowPadding: 5,
        asChild: true,
        avoidCollisions: false,
        collisionBoundary,
        collisionPadding: { top: 12 },
        forceMount: true,
        onCloseAutoFocus,
        onEscapeKeyDown,
        onFocusOutside,
        onInteractOutside,
        onOpenAutoFocus,
        onPointerDownOutside,
        side: "left",
        sideOffset: 8,
        sticky: "always",
      }),
    );
    expect(contentProps?.className).toContain("scaffold-popover");
    expect(contentProps?.style).toEqual(expect.objectContaining({ minWidth: 240 }));
  });

  it("defaults collision geometry to the ready overlay boundary", async () => {
    const container = document.createElement("section");
    const collisionBoundary = document.createElement("div");
    container.append(collisionBoundary);
    document.body.append(container);

    render(
      <OverlayBoundary container={container} collisionBoundary={collisionBoundary} kind="contained">
        <Popover.Content>Boundary geometry</Popover.Content>
      </OverlayBoundary>,
    );

    await waitFor(() => {
      expect(popoverMock.contentProps.at(-1)?.collisionBoundary).toBe(collisionBoundary);
    });

    container.remove();
  });

  it("preserves an explicit collision boundary ahead of the environment default", async () => {
    const container = document.createElement("section");
    const environmentBoundary = document.createElement("div");
    const explicitBoundary = document.createElement("aside");
    container.append(environmentBoundary, explicitBoundary);
    document.body.append(container);

    render(
      <OverlayBoundary
        container={container}
        collisionBoundary={environmentBoundary}
        kind="contained"
      >
        <Popover.Content collisionBoundary={explicitBoundary}>Override geometry</Popover.Content>
      </OverlayBoundary>,
    );

    await waitFor(() => {
      expect(popoverMock.contentProps.at(-1)?.collisionBoundary).toBe(explicitBoundary);
    });

    container.remove();
  });

  it("publishes common geometry variables and marks content as hidden until positioned", () => {
    render(<Popover.Content>Common geometry</Popover.Content>);

    const contentProps = popoverMock.contentProps.at(-1);
    const style = contentProps?.style;

    expect(style).toEqual(
      expect.objectContaining({
        "--sc-overlay-anchor-block-size": "var(--radix-popover-trigger-height)",
        "--sc-overlay-anchor-inline-size": "var(--radix-popover-trigger-width)",
        "--sc-overlay-available-block-size": "var(--radix-popover-content-available-height)",
        "--sc-overlay-available-inline-size": "var(--radix-popover-content-available-width)",
      }),
    );
    expect(contentProps?.className).toContain("sc-overlay-positioned-content");
  });

  it("keeps Radix body portal behavior when no container is provided", () => {
    render(
      <Popover.Portal>
        <span>Default portal content</span>
      </Popover.Portal>,
    );

    expect(screen.getByText("Default portal content").parentElement).toBe(document.body);
    expect(popoverMock.portalProps.at(-1)).not.toHaveProperty("container");
  });

  it("keeps an explicit portal container for an unscoped consumer", () => {
    const container = document.createElement("div");
    document.body.append(container);

    render(
      <Popover.Portal container={container}>
        <span>Container portal content</span>
      </Popover.Portal>,
    );

    expect(screen.getByText("Container portal content").parentElement).toBe(container);
    expect(popoverMock.portalProps.at(-1)).toEqual(expect.objectContaining({ container }));

    container.remove();
  });

  it("waits instead of using an explicit container while a boundary is pending", () => {
    const explicitContainer = document.createElement("div");
    document.body.append(explicitContainer);

    render(
      <OverlayBoundary container={null} kind="viewport">
        <Popover.Portal container={explicitContainer}>Pending portal content</Popover.Portal>
      </OverlayBoundary>,
    );

    expect(screen.queryByText("Pending portal content")).toBeNull();

    explicitContainer.remove();
  });

  it("portals into a ready scoped host", () => {
    const container = document.createElement("div");
    document.body.append(container);

    render(
      <OverlayBoundary container={container} kind="viewport">
        <Popover.Portal>
          <span>Scoped portal content</span>
        </Popover.Portal>
      </OverlayBoundary>,
    );

    const host = container.querySelector(":scope > [data-scaffold-overlay-host]");
    expect(host).not.toBeNull();
    expect(screen.getByText("Scoped portal content").parentElement).toBe(host);
    expect(popoverMock.portalProps.at(-1)).toEqual(expect.objectContaining({ container: host }));

    container.remove();
  });

  it("uses the ready boundary host instead of an explicit portal container", async () => {
    const boundaryContainer = document.createElement("section");
    const explicitContainer = document.createElement("div");
    document.body.append(boundaryContainer, explicitContainer);

    render(
      <OverlayBoundary container={boundaryContainer} kind="viewport">
        <Popover.Portal container={explicitContainer}>
          <span>Boundary portal content</span>
        </Popover.Portal>
      </OverlayBoundary>,
    );

    const content = await screen.findByText("Boundary portal content");
    const host = boundaryContainer.querySelector("[data-scaffold-overlay-host]");

    expect(host).not.toBeNull();
    expect(content.parentElement).toBe(host);
    expect(popoverMock.portalProps.at(-1)).toEqual(expect.objectContaining({ container: host }));

    boundaryContainer.remove();
    explicitContainer.remove();
  });
});

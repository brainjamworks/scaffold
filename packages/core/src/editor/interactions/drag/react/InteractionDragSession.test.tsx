// @vitest-environment happy-dom

import { act, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const dndHarness = vi.hoisted(() => ({
  contextProps: null as Record<string, unknown> | null,
  dragOverlayProps: null as Record<string, unknown> | null,
  collisionInput: null as { droppableContainers: unknown[] } | null,
  draggableData: new Map<string, unknown>(),
  droppableData: new Map<string, unknown>(),
  sortableTransform: null as { x: number; y: number; scaleX: number; scaleY: number } | null,
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: (props: Record<string, unknown> & { children?: ReactNode }) => {
    dndHarness.contextProps = props;
    return props.children;
  },
  DragOverlay: (props: Record<string, unknown> & { children?: ReactNode }) => {
    dndHarness.dragOverlayProps = props;
    return props.children ? <div data-mock-drag-overlay="">{props.children}</div> : null;
  },
  KeyboardSensor: class KeyboardSensor {},
  PointerSensor: class PointerSensor {},
  closestCenter: vi.fn(() => []),
  pointerWithin: vi.fn((input: { droppableContainers: unknown[] }) => {
    dndHarness.collisionInput = input;
    return [];
  }),
  useDraggable: ({ data, id }: { data: unknown; id: string }) => {
    dndHarness.draggableData.set(String(id), data);
    return {
      attributes: {
        role: "button",
        tabIndex: 0,
        "aria-disabled": false,
        "aria-pressed": false,
        "aria-roledescription": "draggable",
        "aria-describedby": "dnd-description",
      },
      isDragging: false,
      listeners: { onKeyDown: vi.fn(), onPointerDown: vi.fn() },
      setActivatorNodeRef: vi.fn(),
      setNodeRef: vi.fn(),
    };
  },
  useDroppable: ({ data, id }: { data: unknown; id: string }) => {
    dndHarness.droppableData.set(String(id), data);
    return { isOver: false, setNodeRef: vi.fn() };
  },
  useSensor: (sensor: { name: string }, options: unknown) => ({ options, sensor: sensor.name }),
  useSensors: (...sensors: unknown[]) => sensors,
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => children,
  horizontalListSortingStrategy: vi.fn(),
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: ({ data, id }: { data: unknown; id: string }) => {
    dndHarness.draggableData.set(String(id), data);
    dndHarness.droppableData.set(String(id), data);
    return {
      attributes: {
        role: "button",
        tabIndex: 0,
        "aria-disabled": false,
        "aria-pressed": false,
        "aria-roledescription": "sortable",
        "aria-describedby": "dnd-description",
      },
      isDragging: false,
      isOver: false,
      listeners: { onKeyDown: vi.fn(), onPointerDown: vi.fn() },
      setActivatorNodeRef: vi.fn(),
      setNodeRef: vi.fn(),
      transform: dndHarness.sortableTransform,
      transition: "transform 160ms ease",
    };
  },
  verticalListSortingStrategy: vi.fn(),
}));

import { createScaledCanvasCoordinateSpace } from "../dom/dom-coordinate-space";
import { createCoordinateSpaceSnapshot } from "../model/coordinate-space";
import { OverlayBoundaryResolutionProvider } from "@/ui/overlays/portal-host-context";
import { InteractionDragActivationArea } from "./InteractionDragActivationArea";
import { InteractionDragSession } from "./InteractionDragSession";
import { InteractionDragEnvironmentProvider } from "./interaction-drag-environment";
import { useInteractionDragSource } from "./use-interaction-drag-source";
import { useInteractionDropTarget } from "./use-interaction-drop-target";
import {
  normalizeInteractionSortableTransform,
  useInteractionSortable,
} from "./use-interaction-sortable";

beforeEach(() => {
  dndHarness.contextProps = null;
  dndHarness.dragOverlayProps = null;
  dndHarness.collisionInput = null;
  dndHarness.draggableData.clear();
  dndHarness.droppableData.clear();
  dndHarness.sortableTransform = null;
});

describe("InteractionDragSession", () => {
  it("normalizes pointer events, renders one client-space preview, and exposes a source placeholder", async () => {
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const fixture = createFixtureGeometry(0.5);

    render(
      <FixtureEnvironment fixture={fixture}>
        <InteractionDragSession
          accessibilityMode="draggable"
          collisionPolicy="pointer"
          labels={{ draggable: "Card", instructions: "Move the card" }}
          onEnd={onEnd}
          onMove={onMove}
          onStart={onStart}
          profile="pointer"
          renderPreview={(data: SourceData) => <button>Preview {data.title}</button>}
          sessionId="fixture-pointer"
        >
          <Source id="source" title="Alpha" />
          <Target id="target" title="Destination" />
        </InteractionDragSession>
      </FixtureEnvironment>,
    );

    document.dispatchEvent(pointerEvent("pointermove", 160, 120));
    const active = {
      ...activeRecord("source"),
      rect: { current: { initial: null as DOMRect | null, translated: null } },
    };
    act(() => {
      callback("onDragStart")({
        active,
        activatorEvent: pointerEvent("pointerdown", 140, 100),
      });
    });

    expect(screen.getByTestId("source")).not.toHaveAttribute("data-interaction-drag-placeholder");
    expect(fixture.overlayHost.querySelector("[data-interaction-drag-overlay]")).toBeNull();

    active.rect.current.initial = clientRect(100, 80, 80, 40);
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        clientDelta: { space: "client-delta", x: 0, y: 0 },
        clientPoint: { space: "client", x: 160, y: 120 },
        input: "pointer",
        localDelta: { space: "local-delta", x: 0, y: 0 },
      }),
    );
    expect(screen.getByTestId("source")).toHaveAttribute("data-interaction-drag-placeholder", "");
    const overlay = fixture.overlayHost.querySelector<HTMLElement>(
      "[data-interaction-drag-overlay]",
    );
    expect(overlay).not.toBeNull();
    expect(screen.getByTestId("source")).not.toHaveAttribute("aria-hidden");
    expect(overlay?.style.width).toBe("80px");
    expect(overlay?.style.height).toBe("40px");
    expect(overlay).toHaveAttribute("inert");
    expect(overlay?.querySelector("button")).toHaveAttribute("tabindex", "-1");

    document.dispatchEvent(pointerEvent("pointermove", 190, 145));
    moveDrag("source", "target", { x: 20, y: 10 });
    expect(onMove).toHaveBeenLastCalledWith(
      expect.objectContaining({
        clientDelta: { space: "client-delta", x: 20, y: 10 },
        clientPoint: { space: "client", x: 190, y: 145 },
        localDelta: { space: "local-delta", x: 40, y: 20 },
        over: { data: { title: "Destination" }, id: "target" },
      }),
    );

    endDrag("source", "target", { x: 20, y: 10 });
    expect(onEnd).toHaveBeenCalledOnce();
    expect(screen.getByTestId("source")).not.toHaveAttribute("data-interaction-drag-placeholder");
    expect(fixture.overlayHost.querySelector("[data-interaction-drag-overlay]")).toBeNull();
  });

  it("does not activate after the ready overlay host disconnects without a provider rerender", () => {
    const onStart = vi.fn();
    const fixture = createFixtureGeometry(1);
    render(
      <FixtureEnvironment fixture={fixture}>
        <InteractionDragSession
          accessibilityMode="draggable"
          collisionPolicy="pointer"
          labels={{ draggable: "Card" }}
          onEnd={vi.fn()}
          onStart={onStart}
          profile="pointer"
          renderPreview={() => <span>Preview</span>}
          sessionId="fixture-detached-host"
        >
          <Source id="source" title="Alpha" />
        </InteractionDragSession>
      </FixtureEnvironment>,
    );

    fixture.overlayHost.remove();
    startDragWithoutMeasurement("source", pointerEvent("pointerdown", 140, 100));

    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByTestId("source")).not.toHaveAttribute("data-interaction-drag-placeholder");
    expect(fixture.overlayHost.querySelector("[data-interaction-drag-overlay]")).toBeNull();
  });

  it("passes the owner-document pointer to feature collision resolvers", async () => {
    const resolveCollision = vi.fn(() => "target");
    const fixture = createFixtureGeometry(1);
    render(
      <FixtureEnvironment fixture={fixture}>
        <InteractionDragSession
          accessibilityMode="draggable"
          collisionPolicy="feature-resolver"
          labels={{ draggable: "Card" }}
          onEnd={vi.fn()}
          profile="pointer"
          resolveCollision={resolveCollision}
          sessionId="fixture-authoritative-collision-pointer"
        >
          <Source id="source" title="Alpha" />
          <Target id="target" title="Destination" />
        </InteractionDragSession>
      </FixtureEnvironment>,
    );

    document.dispatchEvent(pointerEvent("pointermove", 190, 145));
    await startDrag("source", pointerEvent("pointerdown", 140, 100));
    const collisionDetection = dndHarness.contextProps?.["collisionDetection"] as (
      input: unknown,
    ) => unknown;

    collisionDetection({
      active: activeRecord("source"),
      collisionRect: clientRect(180, 135, 20, 20),
      droppableContainers: [
        { data: { current: dndHarness.droppableData.get("target") }, id: "target" },
      ],
      droppableRects: new Map([["target", clientRect(180, 135, 100, 60)]]),
      pointerCoordinates: { x: 140, y: 100 },
    });

    expect(resolveCollision).toHaveBeenCalledWith(
      expect.objectContaining({ clientPoint: { space: "client", x: 190, y: 145 } }),
    );
  });

  it("publishes null coordinate fields for keyboard sorting and restores focus on cancellation", async () => {
    const onStart = vi.fn();
    const onCancel = vi.fn();
    const fixture = createFixtureGeometry(1);
    render(
      <FixtureEnvironment fixture={fixture}>
        <InteractionDragSession
          accessibilityMode="sortable"
          collisionPolicy="closest-center"
          labels={{ draggable: "Question", instructions: "Use arrow keys to reorder" }}
          onCancel={onCancel}
          onEnd={vi.fn()}
          onStart={onStart}
          profile="sortable-vertical"
          sessionId="fixture-sortable"
          sortableItems={["source", "target"]}
        >
          <Sortable id="source" title="First" />
          <Sortable id="target" title="Second" />
        </InteractionDragSession>
      </FixtureEnvironment>,
    );
    const source = screen.getByTestId("sortable-source");
    source.focus();

    await startDrag("source", new KeyboardEvent("keydown", { code: "Space" }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        clientDelta: null,
        clientPoint: null,
        input: "keyboard",
        localDelta: null,
      }),
    );
    expect(dndHarness.contextProps?.["sensors"] as unknown[]).toHaveLength(2);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).toHaveBeenCalledWith("escape");
    expect(document.activeElement).toBe(source);
  });

  it("re-emits the latest genuine pointer after coordinate invalidation", async () => {
    const onMove = vi.fn();
    const fixture = createFixtureGeometry(0.5);
    render(
      <FixtureEnvironment fixture={fixture}>
        <InteractionDragSession
          accessibilityMode="draggable"
          collisionPolicy="pointer"
          labels={{ draggable: "Card" }}
          onEnd={vi.fn()}
          onMove={onMove}
          profile="pointer"
          sessionId="fixture-invalidation"
        >
          <Source id="source" title="Alpha" />
          <Target id="target" title="Destination" />
        </InteractionDragSession>
      </FixtureEnvironment>,
    );
    document.dispatchEvent(pointerEvent("pointermove", 190, 145));
    await startDrag("source", pointerEvent("pointerdown", 140, 100));
    moveDrag("source", "target", { x: 20, y: 10 });
    expect(onMove).toHaveBeenLastCalledWith(
      expect.objectContaining({ localDelta: { space: "local-delta", x: 40, y: 20 } }),
    );

    fixture.setScale(1);
    document.dispatchEvent(new Event("scroll"));
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    expect(onMove).toHaveBeenLastCalledWith(
      expect.objectContaining({
        clientPoint: { space: "client", x: 190, y: 145 },
        localDelta: { space: "local-delta", x: 20, y: 10 },
      }),
    );
  });

  it("keeps dnd roles and keyboard listeners out of selection-alternative mode", () => {
    const fixture = createFixtureGeometry(1);
    render(
      <FixtureEnvironment fixture={fixture}>
        <InteractionDragSession
          accessibilityMode="selection-alternative"
          collisionPolicy="pointer"
          labels={{ draggable: "Matching item" }}
          onEnd={vi.fn()}
          profile="pointer"
          sessionId="fixture-selection"
        >
          <Source id="source" title="Alpha" />
        </InteractionDragSession>
      </FixtureEnvironment>,
    );

    const source = screen.getByTestId("source");
    expect(source.dataset.activatorKeys).toBe("onPointerDown");
    expect(dndHarness.contextProps?.["sensors"] as unknown[]).toHaveLength(1);
    const accessibility = dndHarness.contextProps?.["accessibility"] as {
      announcements: { onDragStart: () => string | undefined };
    };
    expect(accessibility.announcements.onDragStart()).toBeUndefined();
  });

  it("refreshes the environment boundary and fails closed when it becomes invalid", async () => {
    const onCancel = vi.fn();
    const fixture = createFixtureGeometry(1);
    render(
      <FixtureEnvironment fixture={fixture}>
        <InteractionDragSession
          accessibilityMode="draggable"
          collisionPolicy="pointer"
          labels={{ draggable: "Card" }}
          onCancel={onCancel}
          onEnd={vi.fn()}
          profile="pointer"
          sessionId="fixture-collision-boundary"
        >
          <Source id="source" title="Alpha" />
          <Target id="inside" title="Inside" />
          <Target id="outside" title="Outside" />
        </InteractionDragSession>
      </FixtureEnvironment>,
    );
    await startDrag("source", pointerEvent("pointerdown", 20, 20));
    const collisionDetection = dndHarness.contextProps?.["collisionDetection"] as (
      input: unknown,
    ) => unknown;
    const droppableContainers = ["inside", "outside"].map((id) => ({
      data: { current: dndHarness.droppableData.get(id) },
      id,
    }));

    fixture.setCollisionBoundaryRect(clientRect(1500, 0, 300, 800));
    document.dispatchEvent(new Event("scroll"));
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    collisionDetection({
      active: activeRecord("source"),
      collisionRect: clientRect(0, 0, 20, 20),
      droppableContainers,
      droppableRects: new Map([
        ["inside", clientRect(1580, 100, 100, 60)],
        ["outside", clientRect(300, 100, 100, 60)],
      ]),
      pointerCoordinates: { x: 1600, y: 120 },
    });

    expect(dndHarness.collisionInput?.droppableContainers).toEqual([droppableContainers[0]]);

    fixture.setCollisionBoundaryRect(clientRect(1500, 0, 0, 800));
    document.dispatchEvent(new Event("scroll"));
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(onCancel).toHaveBeenCalledWith("environment-lost");
  });

  it.each([
    [
      "owner-window-blur",
      (fixture: FixtureGeometry) =>
        fixture.root.ownerDocument.defaultView!.dispatchEvent(new Event("blur")),
    ],
    ["dnd-kit", () => cancelFromDndKit("source")],
  ] as const)("cancels an active pointer session for %s", async (reason, cancel) => {
    const onCancel = vi.fn();
    const fixture = createFixtureGeometry(1);
    render(
      <FixtureEnvironment fixture={fixture}>
        <InteractionDragSession
          accessibilityMode="draggable"
          collisionPolicy="pointer"
          labels={{ draggable: "Card" }}
          onCancel={onCancel}
          onEnd={vi.fn()}
          profile="pointer"
          sessionId={`fixture-${reason}`}
        >
          <Source id="source" title="Alpha" />
        </InteractionDragSession>
      </FixtureEnvironment>,
    );
    document.dispatchEvent(pointerEvent("pointermove", 20, 20));
    await startDrag("source", pointerEvent("pointerdown", 20, 20));

    act(() => {
      cancel(fixture);
    });

    expect(onCancel).toHaveBeenCalledWith(reason);
  });

  it("cancels for source removal and environment loss", async () => {
    const onCancel = vi.fn();
    const fixture = createFixtureGeometry(1);
    render(<CancelableFixture fixture={fixture} onCancel={onCancel} />);
    document.dispatchEvent(pointerEvent("pointermove", 20, 20));
    await startDrag("source", pointerEvent("pointerdown", 20, 20));

    act(() => screen.getByRole("button", { name: "Remove source" }).click());
    expect(onCancel).toHaveBeenLastCalledWith("source-removed");

    act(() => screen.getByRole("button", { name: "Restore source" }).click());
    await startDrag("source", pointerEvent("pointerdown", 20, 20));
    fixture.overlayHost.remove();
    moveDrag("source", "source", { x: 5, y: 5 });
    expect(onCancel).toHaveBeenLastCalledWith("environment-lost");
  });

  it("cancels an active session on unmount", async () => {
    const onCancel = vi.fn();
    const fixture = createFixtureGeometry(1);
    const view = render(
      <FixtureEnvironment fixture={fixture}>
        <InteractionDragSession
          accessibilityMode="draggable"
          collisionPolicy="pointer"
          labels={{ draggable: "Card" }}
          onCancel={onCancel}
          onEnd={vi.fn()}
          profile="pointer"
          sessionId="fixture-unmount"
        >
          <Source id="source" title="Alpha" />
        </InteractionDragSession>
      </FixtureEnvironment>,
    );
    document.dispatchEvent(pointerEvent("pointermove", 20, 20));
    await startDrag("source", pointerEvent("pointerdown", 20, 20));

    view.unmount();

    expect(onCancel).toHaveBeenCalledWith("unmount");
  });

  it("cancels an invalid drop without invoking the feature commit", async () => {
    const onCancel = vi.fn();
    const onEnd = vi.fn();
    const fixture = createFixtureGeometry(1);
    render(
      <FixtureEnvironment fixture={fixture}>
        <InteractionDragSession
          accessibilityMode="draggable"
          collisionPolicy="pointer"
          labels={{ draggable: "Card" }}
          onCancel={onCancel}
          onEnd={onEnd}
          profile="pointer"
          sessionId="fixture-invalid-drop"
        >
          <Source id="source" title="Alpha" />
        </InteractionDragSession>
      </FixtureEnvironment>,
    );
    document.dispatchEvent(pointerEvent("pointermove", 20, 20));
    await startDrag("source", pointerEvent("pointerdown", 20, 20));

    act(() => {
      callback("onDragEnd")({
        active: activeRecord("source"),
        activatorEvent: pointerEvent("pointerdown", 20, 20),
        collisions: [],
        delta: { x: 5, y: 5 },
        over: null,
      });
    });

    expect(onCancel).toHaveBeenCalledWith("invalid-drop");
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("disables drop animation when the owner window prefers reduced motion", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    const fixture = createFixtureGeometry(1);
    render(
      <FixtureEnvironment fixture={fixture}>
        <InteractionDragSession
          accessibilityMode="draggable"
          collisionPolicy="pointer"
          labels={{ draggable: "Card" }}
          onEnd={vi.fn()}
          profile="pointer"
          renderPreview={(data: SourceData) => <span>{data.title}</span>}
          sessionId="fixture-reduced-motion"
        >
          <Source id="source" title="Alpha" />
        </InteractionDragSession>
      </FixtureEnvironment>,
    );
    document.dispatchEvent(pointerEvent("pointermove", 20, 20));
    await startDrag("source", pointerEvent("pointerdown", 20, 20));

    expect(dndHarness.dragOverlayProps?.["dropAnimation"]).toBeNull();
  });
});

describe("drag registration adapters", () => {
  it("normalizes sortable translation from client pixels to local units", () => {
    const snapshot = createCoordinateSpaceSnapshot({
      kind: "scaled-canvas",
      revision: 0,
      clientRect: { left: 100, top: 50, width: 512, height: 288 },
      localSize: { width: 1024, height: 576 },
    })!;

    expect(
      normalizeInteractionSortableTransform({ x: 40, y: 20, scaleX: 1, scaleY: 1 }, snapshot),
    ).toEqual({ x: 80, y: 40, scaleX: 1, scaleY: 1 });
    expect(normalizeInteractionSortableTransform(null, snapshot)).toBeNull();
  });

  it("applies activation sizing per axis and fails closed for invalid safe bounds", () => {
    const fixture = createFixtureGeometry(0.5);
    const { rerender } = render(
      <FixtureEnvironment fixture={fixture}>
        <InteractionDragActivationArea safeLocalHeight={100} safeLocalWidth={30}>
          Handle
        </InteractionDragActivationArea>
      </FixtureEnvironment>,
    );
    const area = screen.getByText("Handle");
    expect(area.style.getPropertyValue("--sc-interaction-drag-target-min-width")).toBe("30px");
    expect(area.style.getPropertyValue("--sc-interaction-drag-target-min-height")).toBe("55px");
    expect(area.dataset.interactionDragPreferredWidth).toBe("false");

    rerender(
      <FixtureEnvironment fixture={fixture}>
        <InteractionDragActivationArea safeLocalHeight={100} safeLocalWidth={0}>
          Handle
        </InteractionDragActivationArea>
      </FixtureEnvironment>,
    );
    expect(screen.getByText("Handle").dataset.interactionDragActivationValid).toBe("false");
  });
});

interface SourceData {
  title: string;
}

function Source({ id, title }: { id: string; title: string }) {
  const drag = useInteractionDragSource({ data: { title }, id, label: title });
  return (
    <div
      ref={drag.setNodeRef}
      data-testid={id}
      data-activator-keys={Object.keys(drag.activatorProps).sort().join(",")}
      {...drag.activatorProps}
      {...drag.sourceProps}
    >
      {title}
    </div>
  );
}

function Target({ id, title }: { id: string; title: string }) {
  const drop = useInteractionDropTarget({ data: { title }, id });
  return <div ref={drop.setNodeRef}>{title}</div>;
}

function Sortable({ id, title }: { id: string; title: string }) {
  const sortable = useInteractionSortable({ data: { title }, id, label: title });
  return (
    <div
      ref={sortable.setNodeRef}
      data-testid={`sortable-${id}`}
      {...sortable.activatorProps}
      {...sortable.sourceProps}
    >
      {title}
    </div>
  );
}

function CancelableFixture({
  fixture,
  onCancel,
}: {
  fixture: FixtureGeometry;
  onCancel: (reason: string) => void;
}) {
  const [showSource, setShowSource] = useState(true);
  return (
    <FixtureEnvironment fixture={fixture}>
      <button onClick={() => setShowSource((shown) => !shown)} type="button">
        {showSource ? "Remove source" : "Restore source"}
      </button>
      <InteractionDragSession
        accessibilityMode="draggable"
        collisionPolicy="pointer"
        labels={{ draggable: "Card" }}
        onCancel={onCancel}
        onEnd={vi.fn()}
        profile="pointer"
        sessionId="fixture-removal"
      >
        {showSource ? <Source id="source" title="Alpha" /> : null}
      </InteractionDragSession>
    </FixtureEnvironment>
  );
}

interface FixtureGeometry {
  collisionBoundary: HTMLElement;
  coordinateSpace: ReturnType<typeof createScaledCanvasCoordinateSpace>;
  overlayHost: HTMLElement;
  root: HTMLElement;
  setCollisionBoundaryRect(rect: DOMRect): void;
  setScale(scale: number): void;
}

function FixtureEnvironment({
  children,
  fixture,
}: {
  children: ReactNode;
  fixture: FixtureGeometry;
}) {
  const ownerDocument = fixture.root.ownerDocument;
  return (
    <OverlayBoundaryResolutionProvider
      resolution={
        fixture.overlayHost.isConnected
          ? {
              status: "ready",
              environment: {
                collisionBoundary: fixture.collisionBoundary,
                host: fixture.overlayHost,
                kind: "viewport",
                ownerDocument,
                ownerWindow: ownerDocument.defaultView!,
                strategy: "fixed",
              },
            }
          : { status: "pending" }
      }
    >
      <InteractionDragEnvironmentProvider
        coordinateRoot={fixture.root}
        coordinateSpace={fixture.coordinateSpace}
      >
        {children}
      </InteractionDragEnvironmentProvider>
    </OverlayBoundaryResolutionProvider>
  );
}

function createFixtureGeometry(scale: number): FixtureGeometry {
  const root = document.createElement("div");
  const overlayHost = document.createElement("div");
  const collisionBoundary = document.createElement("div");
  let currentScale = scale;
  let collisionBoundaryRect = clientRect(0, 0, 1200, 800);
  root.style.transform = `matrix(${currentScale}, 0, 0, ${currentScale}, 0, 0)`;
  root.getBoundingClientRect = () => clientRect(100, 50, 1024 * currentScale, 576 * currentScale);
  overlayHost.getBoundingClientRect = () => clientRect(0, 0, 1200, 800);
  collisionBoundary.getBoundingClientRect = () => collisionBoundaryRect;
  document.body.append(root, overlayHost, collisionBoundary);
  return {
    collisionBoundary,
    coordinateSpace: createScaledCanvasCoordinateSpace({
      getRoot: () => root,
      localSize: { width: 1024, height: 576 },
      ownerDocument: document,
    }),
    overlayHost,
    root,
    setCollisionBoundaryRect(rect) {
      collisionBoundaryRect = rect;
    },
    setScale(nextScale) {
      currentScale = nextScale;
      root.style.transform = `matrix(${currentScale}, 0, 0, ${currentScale}, 0, 0)`;
    },
  };
}

async function startDrag(id: string, activatorEvent: Event) {
  const active = startDragWithoutMeasurement(id, activatorEvent);
  active.rect.current.initial = clientRect(140, 100, 80, 40);
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  return active;
}

function startDragWithoutMeasurement(id: string, activatorEvent: Event) {
  const active = activeRecord(id);
  act(() => {
    callback("onDragStart")({
      active,
      activatorEvent,
    });
  });
  return active;
}

function moveDrag(activeId: string, overId: string, delta: { x: number; y: number }) {
  act(() => {
    callback("onDragMove")({
      active: activeRecord(activeId),
      activatorEvent: pointerEvent("pointerdown", 0, 0),
      collisions: [],
      delta,
      over: overRecord(overId),
    });
  });
}

function endDrag(activeId: string, overId: string, delta: { x: number; y: number }) {
  act(() => {
    callback("onDragEnd")({
      active: activeRecord(activeId),
      activatorEvent: pointerEvent("pointerdown", 0, 0),
      collisions: [],
      delta,
      over: overRecord(overId),
    });
  });
}

function cancelFromDndKit(activeId: string) {
  callback("onDragCancel")({
    active: activeRecord(activeId),
    activatorEvent: pointerEvent("pointerdown", 0, 0),
    collisions: [],
    delta: { x: 0, y: 0 },
    over: null,
  });
}

function activeRecord(id: string) {
  return {
    data: { current: dndHarness.draggableData.get(id) },
    id,
    rect: { current: { initial: null as DOMRect | null, translated: null } },
  };
}

function overRecord(id: string) {
  return {
    data: { current: dndHarness.droppableData.get(id) },
    disabled: false,
    id,
    rect: clientRect(300, 100, 100, 60),
  };
}

function callback(name: string): (event: unknown) => void {
  const handler = dndHarness.contextProps?.[name];
  if (typeof handler !== "function") throw new Error(`Missing dnd callback ${name}`);
  return handler as (event: unknown) => void;
}

function pointerEvent(type: string, clientX: number, clientY: number): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  return event;
}

function clientRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Translate,
} from "@dnd-kit/core";
import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";
import { setEmptyInsertionRowMovementDragActive } from "@/editor/suggestions/empty-row/EmptyInsertionRowExtension";
import {
  AuthoringChromeKind,
  AUTHORING_MOVE_HANDLE_ATTR,
  AUTHORING_MOVE_POS_ATTR,
  authoringChromeAttributes,
  isAuthoringChromeSessionActive,
} from "@/editor/interactions/dom/authoring-chrome";
import { resolveAuthoringInteractionRoot } from "@/editor/interactions/dom/authoring-root";
import { useInteractionCommands } from "@/editor/interactions/targets/facade/interaction-provider";
import { zIndex } from "@/ui/overlays/z-index";
import { iconXs } from "@/ui/tokens/icon-sizes";

import { EditorFloatingContent } from "@/editor/interactions/floating/EditorFloatingContent";
import {
  EditorFloatingLayer,
  useEditorFloatingLayerRoot,
} from "@/editor/interactions/floating/EditorFloatingLayer";
import { createElementFloatingAnchor } from "@/editor/interactions/floating/floating-anchor";
import {
  isEditorResizeGestureActive,
  RESIZE_GESTURE_ACTIVE_CHANGE_EVENT,
} from "@/editor/interactions/gesture/editor-resize-gesture";
import {
  applyKeyboardContainedMovementIntent,
  applyKeyboardMovementIntent,
  applyContainedMovementIntent,
  applyMovementIntent,
  canApplyMovementIntent,
  type KeyboardMovementDirection,
} from "../prosemirror/commands";
import { DropIndicator } from "./DropIndicator";
import {
  deriveContainedMovementCandidate,
  deriveMovementCandidate,
  type MovementCandidate,
} from "./movement-candidate";
import {
  resolveContainedMovementSourceContext,
  type MovementNodeContext,
} from "../model/movement-policy";
import { MoveContainedAfterTarget, MoveContainedBeforeTarget } from "../model/movement-intents";
import { MovementKeyboardProvider } from "./movement-keyboard-context";
import {
  resolveEditorMovementTarget,
  resolveEditorMovementTargetAtPos,
  useEditorMovementTarget,
  type EditorMovementTarget,
} from "./use-editor-movement-target";
import "./movement-handles.css";

const MOVEMENT_HANDLE_ID = "scaffold-editor-movement-handle";
const MOVEMENT_HANDLE_INSET = 8;

export interface EditorMovementLayerProps {
  blockDefinitions: BlockDefinitionLookup;
  children?: ReactNode;
  editor: Editor;
  surfaceVariants: SurfaceVariantLookup;
}

type Point = {
  x: number;
  y: number;
};

export function EditorMovementLayer({
  blockDefinitions,
  children,
  editor,
  surfaceVariants,
}: EditorMovementLayerProps) {
  const target = useEditorMovementTarget(editor, blockDefinitions);
  const commands = useInteractionCommands();
  const resizeGestureActive = useEditorResizeGestureState(editor);
  const movementHandleTarget = resolveMovementHandleChromeTarget(
    editor,
    target,
    resizeGestureActive,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  );
  const [candidate, setCandidate] = useState<MovementCandidate | null>(null);
  const latestTargetRef = useRef<EditorMovementTarget | null>(target);
  const activeSourceRef = useRef<MovementNodeContext | null>(null);
  const candidateRef = useRef<MovementCandidate | null>(null);
  const containedSourceActiveRef = useRef(false);
  const startPointRef = useRef<Point | null>(null);
  const [keyboardMovementStatus, setKeyboardMovementStatus] = useState("");

  useEffect(() => {
    if (target) {
      latestTargetRef.current = target;
    }
  }, [target]);

  const clearMovement = () => {
    commands.endGesture();
    setEmptyInsertionRowMovementDragActive(editor, false);
    activeSourceRef.current = null;
    candidateRef.current = null;
    containedSourceActiveRef.current = false;
    startPointRef.current = null;
    setCandidate(null);
  };

  const setMovementCandidate = (nextCandidate: MovementCandidate | null) => {
    candidateRef.current = nextCandidate;
    setCandidate(nextCandidate);
  };

  const primeMovementSource = (
    sourcePos: number | null,
    activatorEvent: Event | null,
    containedMovement: boolean,
  ): EditorMovementTarget | null => {
    if (activeSourceRef.current && startPointRef.current) {
      return latestTargetRef.current;
    }

    if (containedMovement) {
      if (sourcePos === null) return null;
      const context = resolveContainedMovementSourceContext(editor.state.doc, sourcePos);
      if (!context) return null;
      activeSourceRef.current = context;
      containedSourceActiveRef.current = true;
      startPointRef.current = pointFromEvent(activatorEvent) ?? null;
      return null;
    }

    const nextTarget =
      (sourcePos !== null
        ? resolveEditorMovementTargetAtPos(editor, sourcePos, blockDefinitions)
        : null) ??
      target ??
      latestTargetRef.current ??
      resolveCurrentTarget(editor, blockDefinitions);

    if (!nextTarget) return null;

    activeSourceRef.current = nextTarget.context;
    startPointRef.current = pointFromEvent(activatorEvent) ?? rectCenter(nextTarget.rect);
    latestTargetRef.current = nextTarget;
    return nextTarget;
  };

  const resolveCandidate = (
    delta: Translate,
    sourcePos: number | null,
    activatorEvent: Event | null,
  ): MovementCandidate | null => {
    const containedMovement = containedSourceActiveRef.current;
    primeMovementSource(sourcePos, activatorEvent, containedMovement);

    const source = activeSourceRef.current;
    const startPoint = startPointRef.current;
    if (!source || !startPoint) return null;

    const point = {
      x: startPoint.x + delta.x,
      y: startPoint.y + delta.y,
    };

    if (containedSourceActiveRef.current) {
      return deriveContainedMovementCandidate({
        point,
        sourcePos: source.pos,
        view: editor.view,
      });
    }

    return deriveMovementCandidate({
      blockDefinitions,
      canApplyMovementResult: (context, intent) =>
        canApplyMovementIntent(editor, context.pos, intent, blockDefinitions, surfaceVariants),
      point,
      sourcePos: source.pos,
      view: editor.view,
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (!isStructureMovementDragEventSource(event)) return;

    setEmptyInsertionRowMovementDragActive(editor, true);
    const handleSourcePos = sourcePosFromDragEvent(event);
    const containedMovement = isContainedMovementDragEventSource(event);
    const nextTarget = primeMovementSource(
      handleSourcePos,
      event.activatorEvent,
      containedMovement,
    );
    if (!nextTarget && !containedSourceActiveRef.current) {
      clearMovement();
      return;
    }

    if (nextTarget) {
      commands.beginGesture(nextTarget.targetRef);
    }
    setMovementCandidate(null);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    if (!isStructureMovementDragEventSource(event)) return;

    const nextCandidate = resolveCandidate(
      event.delta,
      sourcePosFromDragEvent(event),
      event.activatorEvent,
    );
    setMovementCandidate(nextCandidate);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!isStructureMovementDragEventSource(event)) return;

    const resolvedCandidate = resolveCandidate(
      event.delta,
      sourcePosFromDragEvent(event),
      event.activatorEvent,
    );
    const nextCandidate = resolvedCandidate ?? candidateRef.current;
    if (nextCandidate) {
      if (isContainedMoveIntent(nextCandidate.intent)) {
        applyContainedMovementIntent(editor, nextCandidate.source.pos, nextCandidate.intent);
      } else {
        applyMovementIntent(
          editor,
          nextCandidate.source.pos,
          nextCandidate.intent,
          blockDefinitions,
          surfaceVariants,
        );
      }
    }
    clearMovement();
  };

  const handleDragCancel = () => {
    clearMovement();
  };

  const handleKeyboardMove = (sourcePos: number, direction: KeyboardMovementDirection) => {
    const result = applyKeyboardMovementIntent(
      editor,
      sourcePos,
      direction,
      blockDefinitions,
      surfaceVariants,
    );
    setKeyboardMovementStatus(result.status);
  };

  const handleContainedKeyboardMove = (sourcePos: number, direction: KeyboardMovementDirection) => {
    const result = applyKeyboardContainedMovementIntent(editor, sourcePos, direction);
    setKeyboardMovementStatus(result.status);
  };

  const movementChromeLayer = (
    <div
      aria-hidden={!movementHandleTarget}
      data-testid="scaffold-editor-movement-layer"
      data-scaffold-editor-movement-layer=""
      className="sc-editor-movement-layer"
      style={{ zIndex: zIndex.interactive }}
    >
      <MovementHandle
        blockDefinitions={blockDefinitions}
        editor={editor}
        onKeyboardMove={handleKeyboardMove}
        target={movementHandleTarget}
      />
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="scaffold-movement-status"
        className="sc-sr-only"
      >
        {keyboardMovementStatus}
      </div>
      <MovementDropIndicator candidate={candidate} />
      <DragOverlay dropAnimation={null}>
        <div className="sc-editor-movement-overlay-ghost" />
      </DragOverlay>
    </div>
  );

  return (
    <DndContext
      sensors={sensors}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onDragStart={handleDragStart}
    >
      <EditorFloatingLayer editor={editor}>
        <MovementKeyboardProvider value={{ moveContained: handleContainedKeyboardMove }}>
          {children}
          <EditorMovementChromePortal>{movementChromeLayer}</EditorMovementChromePortal>
        </MovementKeyboardProvider>
      </EditorFloatingLayer>
    </DndContext>
  );
}

function EditorMovementChromePortal({ children }: { children: ReactNode }) {
  const portalRoot = useEditorFloatingLayerRoot();
  return portalRoot ? createPortal(children, portalRoot) : null;
}

function useEditorResizeGestureState(editor: Editor): boolean {
  const [active, setActive] = useState(() => isEditorResizeGestureActive(editor));

  useEffect(() => {
    const editorDom = editor.view.dom;
    const update = () => {
      setActive(isEditorResizeGestureActive(editor));
    };

    editorDom.addEventListener(RESIZE_GESTURE_ACTIVE_CHANGE_EVENT, update);
    editor.on("transaction", update);
    update();

    return () => {
      editorDom.removeEventListener(RESIZE_GESTURE_ACTIVE_CHANGE_EVENT, update);
      editor.off("transaction", update);
    };
  }, [editor]);

  return active;
}

function resolveMovementHandleChromeTarget(
  editor: Editor,
  target: EditorMovementTarget | null,
  resizeGestureActive: boolean,
): EditorMovementTarget | null {
  if (!target) return null;
  if (!editor.isEditable) return null;
  if (!isAuthoringChromeSessionActive(resolveAuthoringInteractionRoot(editor.view.dom))) {
    return null;
  }
  if (resizeGestureActive) return null;

  return target;
}

export function sourcePosFromDragEvent(
  event: DragStartEvent | DragMoveEvent | DragEndEvent,
): number | null {
  const getSourcePos = event.active.data.current?.["getSourcePos"];
  if (typeof getSourcePos === "function") {
    try {
      const resolvedSourcePos = getSourcePos();
      if (Number.isInteger(resolvedSourcePos)) return resolvedSourcePos;
    } catch {
      // ProseMirror can dispose a NodeView during transactions. Fall back to
      // the last rendered position so drag cancellation remains harmless.
    }
  }

  const sourcePos = event.active.data.current?.["sourcePos"];
  return Number.isInteger(sourcePos) ? sourcePos : null;
}

export function isStructureMovementDragEventSource(
  event: Pick<DragStartEvent | DragMoveEvent | DragEndEvent, "active">,
): boolean {
  if (isContainedMovementDragEventSource(event)) return true;
  const current = event.active.data.current;
  return (
    typeof current?.["getSourcePos"] === "function" || Number.isInteger(current?.["sourcePos"])
  );
}

export function resolveLiveMovementSourcePos(
  editor: Editor,
  fallbackPos: number,
  blockDefinitions: BlockDefinitionLookup,
): number {
  return resolveCurrentTarget(editor, blockDefinitions)?.context.pos ?? fallbackPos;
}

function isContainedMovementDragEventSource(
  event: Pick<DragStartEvent | DragMoveEvent | DragEndEvent, "active">,
): boolean {
  return event.active.data.current?.["containedMovement"] === true;
}

function isContainedMoveIntent(
  intent: MovementCandidate["intent"],
): intent is MoveContainedBeforeTarget | MoveContainedAfterTarget {
  return intent instanceof MoveContainedBeforeTarget || intent instanceof MoveContainedAfterTarget;
}

function pointFromEvent(event: Event | null): Point | null {
  if (event && "clientX" in event && "clientY" in event) {
    return {
      x: Number(event.clientX),
      y: Number(event.clientY),
    };
  }

  return null;
}

function MovementHandle({
  blockDefinitions,
  editor,
  onKeyboardMove,
  target,
}: {
  blockDefinitions: BlockDefinitionLookup;
  editor: Editor;
  onKeyboardMove: (sourcePos: number, direction: KeyboardMovementDirection) => void;
  target: EditorMovementTarget | null;
}) {
  const descriptionId = useId();
  const anchor = useMemo(
    () => createElementFloatingAnchor(target?.element ?? null),
    [target?.element],
  );
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform } = useDraggable({
    id: MOVEMENT_HANDLE_ID,
    disabled: !target,
    ...(target
      ? {
          data: {
            getSourcePos: () =>
              resolveLiveMovementSourcePos(editor, target.context.pos, blockDefinitions),
            sourcePos: target.context.pos,
          },
        }
      : {}),
  });

  if (!target) return null;
  const label = movementHandleLabel(target.context);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    event.stopPropagation();
    onKeyboardMove(
      resolveLiveMovementSourcePos(editor, target.context.pos, blockDefinitions),
      event.key === "ArrowUp" ? "backward" : "forward",
    );
  };

  return (
    <EditorFloatingContent
      anchor={anchor}
      offset={MOVEMENT_HANDLE_INSET}
      open
      placement="left-start"
      style={movementHandleStyle(transform)}
    >
      <button
        {...attributes}
        {...listeners}
        ref={(node) => {
          setNodeRef(node);
          setActivatorNodeRef(node);
        }}
        aria-describedby={descriptionId}
        aria-keyshortcuts="ArrowUp ArrowDown"
        aria-label={`Move ${label}`}
        contentEditable={false}
        {...authoringChromeAttributes(AuthoringChromeKind.Handle)}
        {...{ [AUTHORING_MOVE_HANDLE_ATTR]: "" }}
        {...{ [AUTHORING_MOVE_POS_ATTR]: target.context.pos }}
        onMouseDown={(event) => event.preventDefault()}
        onKeyDown={handleKeyDown}
        className="sc-editor-movement-handle"
        type="button"
      >
        <span id={descriptionId} className="sc-sr-only">
          Press Arrow Up or Arrow Down to move this {label}.
        </span>
        <DotsSixVertical size={iconXs} weight="bold" aria-hidden />
      </button>
    </EditorFloatingContent>
  );
}

function movementHandleStyle(transform: Translate | null): CSSProperties {
  return {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  };
}

function movementHandleLabel(context: MovementNodeContext): string {
  if (context.nodeType.name === "layout") return "layout";
  if (context.nodeType.name === "section") return "section";
  return "block";
}

export function MovementDropIndicator({ candidate }: { candidate: MovementCandidate | null }) {
  if (!candidate) return null;

  const rect = candidate.target.rect;
  return (
    <div
      aria-hidden
      contentEditable={false}
      data-testid="scaffold-drop-indicator-frame"
      className="sc-drop-indicator-frame"
      style={{
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      }}
    >
      <DropIndicator intent={candidate.intent} />
    </div>
  );
}

function resolveCurrentTarget(
  editor: Editor,
  blockDefinitions: BlockDefinitionLookup,
): EditorMovementTarget | null {
  return resolveEditorMovementTarget(editor, blockDefinitions);
}

function rectCenter(rect: DOMRect): Point {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

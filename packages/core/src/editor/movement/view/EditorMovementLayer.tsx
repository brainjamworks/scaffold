import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
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
import type {
  DragKeyboardDirection,
  InteractionDragEvent,
} from "@/editor/interactions/drag/model/interaction-drag-event";
import { InteractionDragActivationArea } from "@/editor/interactions/drag/react/InteractionDragActivationArea";
import { InteractionDragSession } from "@/editor/interactions/drag/react/InteractionDragSession";
import { useInteractionDragEnvironmentResolution } from "@/editor/interactions/drag/react/interaction-drag-environment";
import { useInteractionDropTarget } from "@/editor/interactions/drag/react/use-interaction-drop-target";
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
  applyContainedMovementIntent,
  applyMovementIntent,
  canApplyContainedMovementIntent,
  canApplyMovementIntent,
} from "../prosemirror/commands";
import { DropIndicator } from "./DropIndicator";
import type { MovementCandidate } from "./movement-candidate";
import {
  canStartStructureMovement,
  createStructureMovementPolicy,
  resolveContainedMovementSourceContext,
  resolveMovementNodeContext,
  type MovementNodeContext,
} from "../model/movement-policy";
import type { MovementTargetQuerySource } from "./movement-target-index";
import {
  createMovementTargetIndexController,
  type MovementKeyboardDirection,
  type MovementTargetIndexController,
} from "./movement-target-index-controller";
import {
  InsertAfterTarget,
  InsertBeforeTarget,
  MoveContainedAfterTarget,
  MoveContainedBeforeTarget,
} from "../model/movement-intents";
import {
  AUTHORING_MOVEMENT_ACTIVATION_ID_ATTR,
  AuthoringMovementSnapshotPreview,
  captureAuthoringMovementSnapshot,
  useAuthoringMovementDragSource,
  type AuthoringContainedMovementProjection,
  type AuthoringContainedMovementStrategy,
  type AuthoringMovementDragData,
  type AuthoringMovementSnapshot,
} from "./authoring-movement-presentation";
import {
  resolveEditorMovementTarget,
  resolveEditorMovementTargetAtPos,
  useEditorMovementTarget,
  type EditorMovementTarget,
} from "./use-editor-movement-target";
import "./movement-handles.css";

const MOVEMENT_HANDLE_ID = "scaffold-editor-movement-handle";
const MOVEMENT_HANDLE_INSET = 8;
const COMMITTED_KEYBOARD_FOCUS_RESTORE_FRAMES = 16;

export interface EditorMovementLayerProps {
  blockDefinitions: BlockDefinitionLookup;
  children?: ReactNode;
  editor: Editor;
  surfaceVariants: SurfaceVariantLookup;
}

interface AuthoringMovementDropData {
  readonly movementSurface: true;
}

interface ActiveKeyboardMovement {
  readonly activationId: string;
  readonly axis: AuthoringMovementDragData["axis"];
  destinationIndex: number;
  destinationDescription: string | null;
  readonly initialIndex: number;
  readonly label: string;
  readonly total: number;
}

export function EditorMovementLayer({
  blockDefinitions,
  children,
  editor,
  surfaceVariants,
}: EditorMovementLayerProps) {
  const target = useEditorMovementTarget(editor, blockDefinitions);
  const commands = useInteractionCommands();
  const environmentResolution = useInteractionDragEnvironmentResolution();
  const movementEnvironment =
    environmentResolution.status === "ready" ? environmentResolution.environment : null;
  const resizeGestureActive = useEditorResizeGestureState(editor);
  const movementHandleTarget = resolveMovementHandleChromeTarget(
    editor,
    target,
    resizeGestureActive,
  );
  const movementSessionId = useId();
  const [candidate, setCandidate] = useState<MovementCandidate | null>(null);
  const [dropIndicatorSuppressed, setDropIndicatorSuppressed] = useState(false);
  const latestTargetRef = useRef<EditorMovementTarget | null>(target);
  const activeSourceRef = useRef<MovementNodeContext | null>(null);
  const activeSnapshotRef = useRef<AuthoringMovementSnapshot | null>(null);
  const activeProjectionRef = useRef<AuthoringContainedMovementProjection | null>(null);
  const activeContainedStrategyRef = useRef<AuthoringContainedMovementStrategy | null>(null);
  const activeKeyboardMovementRef = useRef<ActiveKeyboardMovement | null>(null);
  const containedSourceActiveRef = useRef(false);
  const movementControllerRef = useRef<MovementTargetIndexController | null>(null);
  const movementEnvironmentRef = useRef(movementEnvironment);
  const [keyboardMovementStatus, setKeyboardMovementStatus] = useState("");
  movementEnvironmentRef.current = movementEnvironment;

  useEffect(() => {
    if (target) {
      latestTargetRef.current = target;
    }
  }, [target]);

  const clearMovement = () => {
    movementControllerRef.current?.dispose();
    movementControllerRef.current = null;
    activeProjectionRef.current?.clear();
    activeProjectionRef.current = null;
    activeContainedStrategyRef.current = null;
    setDropIndicatorSuppressed(false);
    commands.endGesture();
    setEmptyInsertionRowMovementDragActive(editor, false);
    activeSourceRef.current = null;
    activeSnapshotRef.current = null;
    activeKeyboardMovementRef.current = null;
    containedSourceActiveRef.current = false;
    setCandidate(null);
  };

  const primeMovementSource = (
    sourcePos: number | null,
    containedMovement: boolean,
  ): EditorMovementTarget | null => {
    if (activeSourceRef.current) {
      return latestTargetRef.current;
    }

    if (containedMovement) {
      if (sourcePos === null) return null;
      const context = resolveContainedMovementSourceContext(editor.state.doc, sourcePos);
      if (!context) return null;
      activeSourceRef.current = context;
      containedSourceActiveRef.current = true;
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
    latestTargetRef.current = nextTarget;
    return nextTarget;
  };

  const handleDragStart = (
    event: InteractionDragEvent<AuthoringMovementDragData, AuthoringMovementDropData>,
  ) => {
    setEmptyInsertionRowMovementDragActive(editor, true);
    const presentationElement = event.active.data.getPresentationElement();
    activeSnapshotRef.current = presentationElement
      ? captureAuthoringMovementSnapshot(presentationElement)
      : null;
    if (!activeSnapshotRef.current) {
      clearMovement();
      return;
    }
    const nextTarget = primeMovementSource(
      resolveMovementSourcePos(event.active.data),
      event.active.data.containedMovement,
    );
    if (!nextTarget && !containedSourceActiveRef.current) {
      clearMovement();
      return;
    }
    const activeSource = activeSourceRef.current;
    let projectionStarted = false;
    if (event.active.data.projection && activeSource) {
      const projection = event.active.data.projection;
      if (projection.start(activeSource.index)) {
        activeProjectionRef.current = projection;
        projectionStarted = true;
      }
    }
    setDropIndicatorSuppressed(event.active.data.containedMovement || projectionStarted);
    activeContainedStrategyRef.current = event.active.data.containedMovement
      ? (event.active.data.strategy ?? null)
      : null;

    commands.dismissInteraction();
    if (nextTarget) {
      commands.beginGesture(nextTarget.targetRef);
    }
    const environment = movementEnvironmentRef.current;
    if (!environment) {
      clearMovement();
      return;
    }

    let controller: MovementTargetIndexController | null = null;
    controller = createMovementTargetIndexController({
      blockDefinitions,
      ...(activeContainedStrategyRef.current
        ? {
            canNavigateContainedKeyboard: (source, current, movementTarget, direction) =>
              activeContainedStrategyRef.current?.canNavigateKeyboard?.(
                source,
                current,
                movementTarget,
                direction,
              ) ?? true,
            canTargetContained: (source, movementTarget) =>
              activeContainedStrategyRef.current?.canTarget(source, movementTarget) ?? false,
          }
        : {}),
      canApplyMovementResult: (context, intent) =>
        isContainedMoveIntent(intent)
          ? (activeContainedStrategyRef.current?.canApply(editor, context, intent) ??
            canApplyContainedMovementIntent(editor, context.pos, intent))
          : canApplyMovementIntent(editor, context.pos, intent, blockDefinitions, surfaceVariants),
      coordinateSpace: environment.coordinateSpace,
      isEnvironmentValid: () =>
        movementEnvironmentRef.current === environment &&
        environment.coordinateRoot.isConnected &&
        environment.overlayHost.isConnected,
      onCancel: () => {
        if (movementControllerRef.current === controller) clearMovement();
      },
      onCandidateChange: (nextCandidate) => {
        setCandidate(nextCandidate);
        const projection = activeProjectionRef.current;
        const source = activeSourceRef.current;
        if (projection && source) {
          const sameOwner =
            nextCandidate?.target.context.parent === source.parent &&
            nextCandidate.target.context.parentPos === source.parentPos;
          projection.project(
            sameOwner
              ? movementProjectionDestinationIndex(nextCandidate, source.index)
              : source.index,
          );
          if (!sameOwner && nextCandidate) {
            projection.projectAcrossOwners?.(nextCandidate, environment.overlayHost);
          }
        }
      },
      ownerDocument: environment.ownerDocument,
      resolveKeyboardOrigin: () => {
        const element = event.active.data.getPresentationElement();
        if (!element?.isConnected) return null;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : null;
      },
      resolveSource: () => resolveMovementIndexSource(editor, event.active.data, blockDefinitions),
      subscribeDocumentStructure: (listener) => {
        const handleTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
          if (transaction.docChanged) listener();
        };
        editor.on("transaction", handleTransaction);
        return () => editor.off("transaction", handleTransaction);
      },
      view: editor.view,
    });
    movementControllerRef.current = controller;
    setCandidate(null);
    controller.start(event.input === "pointer" ? event.clientPoint : null);
    if (event.input === "keyboard" && activeSource?.parent) {
      activeKeyboardMovementRef.current = {
        activationId: event.active.id,
        axis: event.active.data.axis,
        destinationIndex: activeSource.index,
        destinationDescription: null,
        initialIndex: activeSource.index,
        label: event.active.data.label,
        total: activeSource.parent.childCount,
      };
      setKeyboardMovementStatus(
        `Picked up ${event.active.data.label}. Current position ${activeSource.index + 1} of ${activeSource.parent.childCount}.`,
      );
    }
  };

  const handleDragMove = (
    event: InteractionDragEvent<AuthoringMovementDragData, AuthoringMovementDropData>,
  ) => {
    if (event.input === "pointer") {
      if (event.clientPoint) movementControllerRef.current?.updatePoint(event.clientPoint);
      return;
    }
    const spatial = event.active.data.strategy?.keyboardNavigation === "spatial";
    const spatialDirection = spatial ? event.keyboardDirection : null;
    const linearDirection = spatial
      ? null
      : keyboardMovementDirection(event.keyboardDirection, event.active.data.axis);
    if (!spatialDirection && !linearDirection) return;
    const navigation = spatialDirection
      ? movementControllerRef.current?.moveKeyboardSpatial(spatialDirection)
      : movementControllerRef.current?.moveKeyboard(linearDirection!);
    const activeKeyboard = activeKeyboardMovementRef.current;
    if (!navigation || !activeKeyboard) return;
    if (!navigation.changed) {
      if (spatial) {
        setKeyboardMovementStatus(
          `No available destination ${spatialDirection} of ${activeKeyboard.label}.`,
        );
      } else {
        const boundary = linearDirection === "backward" ? "first" : "last";
        setKeyboardMovementStatus(`${capitalize(activeKeyboard.label)} is already ${boundary}.`);
      }
      return;
    }
    activeKeyboard.destinationIndex = navigation.destinationIndex;
    const destinationDescription =
      navigation.candidate && event.active.data.strategy?.describeDestination
        ? event.active.data.strategy.describeDestination(
            editor,
            navigation.candidate.source,
            navigation.candidate.intent,
          )
        : null;
    activeKeyboard.destinationDescription = destinationDescription;
    setKeyboardMovementStatus(
      destinationDescription
        ? `Destination ${destinationDescription} for ${activeKeyboard.label}. Press Space or Enter to drop.`
        : `Destination position ${navigation.destinationIndex + 1} of ${navigation.total} for ${activeKeyboard.label}. Press Space or Enter to drop.`,
    );
  };

  const handleDragEnd = (
    event: InteractionDragEvent<AuthoringMovementDragData, AuthoringMovementDropData>,
  ) => {
    const nextCandidate =
      event.input === "pointer" && event.clientPoint
        ? (movementControllerRef.current?.revalidate(event.clientPoint) ?? null)
        : (movementControllerRef.current?.getCandidate() ?? null);
    let moved = false;
    if (nextCandidate) {
      if (isContainedMoveIntent(nextCandidate.intent)) {
        moved =
          activeContainedStrategyRef.current?.apply(
            editor,
            nextCandidate.source,
            nextCandidate.intent,
          ) ?? applyContainedMovementIntent(editor, nextCandidate.source.pos, nextCandidate.intent);
      } else {
        moved = applyMovementIntent(
          editor,
          nextCandidate.source.pos,
          nextCandidate.intent,
          blockDefinitions,
          surfaceVariants,
        );
      }
    }
    const activeKeyboard = activeKeyboardMovementRef.current;
    clearMovement();
    if (event.input === "keyboard" && activeKeyboard) {
      if (moved) {
        restoreKeyboardMovementFocus(editor.view.dom.ownerDocument, activeKeyboard.activationId);
        if (activeKeyboard.destinationDescription) {
          setKeyboardMovementStatus(
            `Moved ${activeKeyboard.label} to ${activeKeyboard.destinationDescription}.`,
          );
        } else {
          const direction =
            activeKeyboard.destinationIndex < activeKeyboard.initialIndex ? "backward" : "forward";
          setKeyboardMovementStatus(
            `Moved ${activeKeyboard.label} ${keyboardDirectionLabel(activeKeyboard.axis, direction)}. Position ${activeKeyboard.destinationIndex + 1} of ${activeKeyboard.total}.`,
          );
        }
      } else {
        setKeyboardMovementStatus(`Dropped ${activeKeyboard.label} without moving.`);
      }
    }
  };

  const handleDragCancel = () => {
    const activeKeyboard = activeKeyboardMovementRef.current;
    clearMovement();
    if (activeKeyboard) {
      restoreKeyboardMovementFocus(editor.view.dom.ownerDocument, activeKeyboard.activationId);
      setKeyboardMovementStatus(`Cancelled moving ${activeKeyboard.label}.`);
    }
  };

  useEffect(
    () => () => {
      movementControllerRef.current?.dispose();
      movementControllerRef.current = null;
      activeProjectionRef.current?.clear();
      activeProjectionRef.current = null;
      setEmptyInsertionRowMovementDragActive(editor, false);
    },
    [editor],
  );

  const movementChromeLayer = (
    <MovementChromeLayer
      blockDefinitions={blockDefinitions}
      candidate={dropIndicatorSuppressed ? null : candidate}
      editor={editor}
      keyboardMovementStatus={keyboardMovementStatus}
      target={movementHandleTarget}
    />
  );

  return (
    <InteractionDragSession<AuthoringMovementDragData, AuthoringMovementDropData>
      accessibilityMode="draggable"
      collisionPolicy="feature-resolver"
      labels={{
        cancelled: "",
        draggable: "Authoring movement handle",
        dropped: "",
        instructions:
          "Press Space or Enter to pick up. Use the available arrow keys to choose a destination. Press Space or Enter to drop, or Escape to cancel.",
        moved: "",
      }}
      onCancel={handleDragCancel}
      onEnd={handleDragEnd}
      onMove={handleDragMove}
      onStart={handleDragStart}
      previewOverflow="visible"
      profile="pointer-keyboard"
      renderPreview={() => {
        const snapshot = activeSnapshotRef.current;
        return snapshot ? <AuthoringMovementSnapshotPreview snapshot={snapshot} /> : null;
      }}
      resolvePreviewSize={() => {
        const snapshot = activeSnapshotRef.current;
        return snapshot ? { height: snapshot.height, width: snapshot.width } : null;
      }}
      resolveCollision={({ candidates }) =>
        candidates.find((candidate) => candidate.data.movementSurface)?.id ?? null
      }
      sessionId={`authoring-movement-${movementSessionId}`}
    >
      <EditorFloatingLayer editor={editor}>
        {children}
        <EditorMovementChromePortal>{movementChromeLayer}</EditorMovementChromePortal>
      </EditorFloatingLayer>
    </InteractionDragSession>
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

export function resolveMovementSourcePos(
  source: Pick<AuthoringMovementDragData, "getSourcePos" | "sourcePos">,
): number | null {
  const getSourcePos = source.getSourcePos;
  if (typeof getSourcePos === "function") {
    try {
      const resolvedSourcePos = getSourcePos();
      if (typeof resolvedSourcePos === "number" && Number.isInteger(resolvedSourcePos)) {
        return resolvedSourcePos;
      }
    } catch {
      // ProseMirror can dispose a NodeView during transactions. Fall back to
      // the last rendered position so drag cancellation remains harmless.
    }
  }

  const sourcePos = source.sourcePos;
  return typeof sourcePos === "number" && Number.isInteger(sourcePos) ? sourcePos : null;
}

export function resolveLiveMovementSourcePos(
  editor: Editor,
  fallbackPos: number,
  blockDefinitions: BlockDefinitionLookup,
): number {
  return resolveCurrentTarget(editor, blockDefinitions)?.context.pos ?? fallbackPos;
}

function resolveMovementIndexSource(
  editor: Editor,
  sourceData: AuthoringMovementDragData,
  blockDefinitions: BlockDefinitionLookup,
): MovementTargetQuerySource | null {
  const sourcePos = resolveMovementSourcePos(sourceData);
  if (sourcePos === null) return null;
  if (sourceData.containedMovement) {
    const context = resolveContainedMovementSourceContext(editor.state.doc, sourcePos);
    return context ? { context, kind: "contained" } : null;
  }

  const context = resolveMovementNodeContext(editor.state.doc, sourcePos);
  const policy = createStructureMovementPolicy(editor.state.schema, blockDefinitions);
  return canStartStructureMovement(policy, context) && context
    ? { context, kind: "structure" }
    : null;
}

function isContainedMoveIntent(
  intent: MovementCandidate["intent"],
): intent is MoveContainedBeforeTarget | MoveContainedAfterTarget {
  return intent instanceof MoveContainedBeforeTarget || intent instanceof MoveContainedAfterTarget;
}

function movementProjectionDestinationIndex(
  candidate: MovementCandidate | null,
  sourceIndex: number,
): number {
  if (!candidate) return sourceIndex;
  const targetIndex = candidate.intent.target.context.index;
  if (
    candidate.intent instanceof InsertBeforeTarget ||
    candidate.intent instanceof MoveContainedBeforeTarget
  ) {
    return targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
  }
  if (
    candidate.intent instanceof InsertAfterTarget ||
    candidate.intent instanceof MoveContainedAfterTarget
  ) {
    return targetIndex > sourceIndex ? targetIndex : targetIndex + 1;
  }
  return sourceIndex;
}

function keyboardMovementDirection(
  direction: DragKeyboardDirection | null,
  axis: AuthoringMovementDragData["axis"],
): MovementKeyboardDirection | null {
  if (direction === (axis === "horizontal" ? "left" : "up")) return "backward";
  if (direction === (axis === "horizontal" ? "right" : "down")) return "forward";
  return null;
}

function keyboardDirectionLabel(
  axis: AuthoringMovementDragData["axis"],
  direction: MovementKeyboardDirection,
): "down" | "left" | "right" | "up" {
  if (axis === "horizontal") return direction === "backward" ? "left" : "right";
  return direction === "backward" ? "up" : "down";
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function restoreKeyboardMovementFocus(ownerDocument: Document, activationId: string): void {
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) return;
  let remainingFrames = COMMITTED_KEYBOARD_FOCUS_RESTORE_FRAMES;
  const restore = () => {
    let nextMatch: HTMLElement | null = null;
    for (const element of ownerDocument.querySelectorAll<HTMLElement>(
      `[${AUTHORING_MOVEMENT_ACTIVATION_ID_ATTR}]`,
    )) {
      if (element.getAttribute(AUTHORING_MOVEMENT_ACTIVATION_ID_ATTR) !== activationId) continue;
      nextMatch = element;
      break;
    }
    if (
      nextMatch &&
      (ownerDocument.activeElement === ownerDocument.body ||
        ownerDocument.activeElement === nextMatch)
    ) {
      try {
        nextMatch.focus({ preventScroll: true });
      } catch {
        nextMatch.focus();
      }
    }
    remainingFrames -= 1;
    if (remainingFrames > 0) ownerWindow.requestAnimationFrame(restore);
  };
  ownerWindow.requestAnimationFrame(restore);
}

function MovementChromeLayer({
  blockDefinitions,
  candidate,
  editor,
  keyboardMovementStatus,
  target,
}: {
  blockDefinitions: BlockDefinitionLookup;
  candidate: MovementCandidate | null;
  editor: Editor;
  keyboardMovementStatus: string;
  target: EditorMovementTarget | null;
}) {
  const { targetRef: dropSurfaceRef } = useInteractionDropTarget<AuthoringMovementDropData>({
    data: { movementSurface: true },
    id: "scaffold-authoring-movement-surface",
  });
  useEffect(() => {
    dropSurfaceRef(editor.view.dom);
    return () => dropSurfaceRef(null);
  }, [dropSurfaceRef, editor]);

  return (
    <div
      aria-hidden={!target}
      data-testid="scaffold-editor-movement-layer"
      data-scaffold-editor-movement-layer=""
      className="sc-app-movement-layer"
      style={{ zIndex: zIndex.interactive }}
    >
      <MovementHandle blockDefinitions={blockDefinitions} editor={editor} target={target} />
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
    </div>
  );
}

function MovementHandle({
  blockDefinitions,
  editor,
  target,
}: {
  blockDefinitions: BlockDefinitionLookup;
  editor: Editor;
  target: EditorMovementTarget | null;
}) {
  const descriptionId = useId();
  const anchor = useMemo(
    () => createElementFloatingAnchor(target?.element ?? null),
    [target?.element],
  );
  const label = target ? movementHandleLabel(target.context) : "block";
  const drag = useAuthoringMovementDragSource({
    axis: "vertical",
    containedMovement: false,
    getPresentationElement: () => {
      const element = target?.element;
      const HTMLElementConstructor = element?.ownerDocument.defaultView?.HTMLElement;
      return HTMLElementConstructor && element instanceof HTMLElementConstructor ? element : null;
    },
    ...(target
      ? {
          getSourcePos: () =>
            resolveLiveMovementSourcePos(editor, target.context.pos, blockDefinitions),
        }
      : {}),
    id: MOVEMENT_HANDLE_ID,
    disabled: !target,
    label,
    sourcePos: target?.context.pos,
  });

  if (!target) return null;

  return (
    <EditorFloatingContent
      anchor={anchor}
      offset={MOVEMENT_HANDLE_INSET}
      open
      placement="left-start"
    >
      <InteractionDragActivationArea
        ref={drag.handleRef}
        aria-describedby={descriptionId}
        aria-keyshortcuts="Space Enter ArrowUp ArrowDown Escape"
        aria-label={`Move ${label}`}
        contentEditable={false}
        {...authoringChromeAttributes(AuthoringChromeKind.Handle)}
        {...{ [AUTHORING_MOVEMENT_ACTIVATION_ID_ATTR]: drag.activationId }}
        {...{ [AUTHORING_MOVE_HANDLE_ATTR]: "" }}
        {...{ [AUTHORING_MOVE_POS_ATTR]: target.context.pos }}
        onMouseDown={(event) => event.preventDefault()}
        safeLocalHeight={44}
        safeLocalWidth={44}
        className="sc-app-movement-layer__handle"
      >
        <span id={descriptionId} className="sc-sr-only">
          Press Space or Enter to pick up this {label}. Use Arrow Up or Arrow Down to choose a
          destination. Press Space or Enter to drop, or Escape to cancel.
        </span>
        <span aria-hidden className="sc-app-movement-layer__handle-visual">
          <DotsSixVertical size={iconXs} weight="bold" />
        </span>
      </InteractionDragActivationArea>
    </EditorFloatingContent>
  );
}

function movementHandleLabel(context: MovementNodeContext): string {
  if (context.nodeType.name === "layout") return "layout";
  if (context.nodeType.name === "section") return "section";
  return "block";
}

export function MovementDropIndicator({ candidate }: { candidate: MovementCandidate | null }) {
  if (!candidate || isContainedMoveIntent(candidate.intent)) return null;

  const rect = candidate.target.rect;
  return (
    <div
      aria-hidden
      contentEditable={false}
      data-movement-target-key={candidate.key}
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

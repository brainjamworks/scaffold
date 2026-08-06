import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";
import {
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
import type { InteractionDragEvent } from "@/editor/interactions/drag/model/interaction-drag-event";
import { InteractionDragActivationArea } from "@/editor/interactions/drag/react/InteractionDragActivationArea";
import { InteractionDragSession } from "@/editor/interactions/drag/react/InteractionDragSession";
import { useInteractionDragEnvironmentResolution } from "@/editor/interactions/drag/react/interaction-drag-environment";
import { useInteractionDragSource } from "@/editor/interactions/drag/react/use-interaction-drag-source";
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
  applyKeyboardContainedMovementIntent,
  applyKeyboardMovementIntent,
  applyContainedMovementIntent,
  applyMovementIntent,
  canApplyMovementIntent,
  type KeyboardMovementDirection,
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
  type MovementTargetIndexController,
} from "./movement-target-index-controller";
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

export interface AuthoringMovementDragData {
  readonly containedMovement: boolean;
  readonly getSourcePos?: () => number | null | undefined;
  readonly label: string;
  readonly previewKind: "block" | "contained";
  readonly sourcePos: number | null | undefined;
}

interface AuthoringMovementDropData {
  readonly movementSurface: true;
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
  const latestTargetRef = useRef<EditorMovementTarget | null>(target);
  const activeSourceRef = useRef<MovementNodeContext | null>(null);
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
    commands.endGesture();
    setEmptyInsertionRowMovementDragActive(editor, false);
    activeSourceRef.current = null;
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
    const nextTarget = primeMovementSource(
      resolveMovementSourcePos(event.active.data),
      event.active.data.containedMovement,
    );
    if (!nextTarget && !containedSourceActiveRef.current) {
      clearMovement();
      return;
    }

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
      canApplyMovementResult: (context, intent) =>
        canApplyMovementIntent(editor, context.pos, intent, blockDefinitions, surfaceVariants),
      coordinateSpace: environment.coordinateSpace,
      isEnvironmentValid: () =>
        movementEnvironmentRef.current === environment &&
        environment.coordinateRoot.isConnected &&
        environment.overlayHost.isConnected,
      onCancel: () => {
        if (movementControllerRef.current === controller) clearMovement();
      },
      onCandidateChange: setCandidate,
      ownerDocument: environment.ownerDocument,
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
  };

  const handleDragMove = (
    event: InteractionDragEvent<AuthoringMovementDragData, AuthoringMovementDropData>,
  ) => {
    if (event.input !== "pointer" || !event.clientPoint) return;
    movementControllerRef.current?.updatePoint(event.clientPoint);
  };

  const handleDragEnd = (
    event: InteractionDragEvent<AuthoringMovementDragData, AuthoringMovementDropData>,
  ) => {
    const nextCandidate =
      event.input === "pointer" && event.clientPoint
        ? (movementControllerRef.current?.revalidate(event.clientPoint) ?? null)
        : null;
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

  useEffect(
    () => () => {
      movementControllerRef.current?.dispose();
      movementControllerRef.current = null;
      setEmptyInsertionRowMovementDragActive(editor, false);
    },
    [editor],
  );

  const movementChromeLayer = (
    <MovementChromeLayer
      blockDefinitions={blockDefinitions}
      candidate={candidate}
      editor={editor}
      keyboardMovementStatus={keyboardMovementStatus}
      onKeyboardMove={handleKeyboardMove}
      target={movementHandleTarget}
    />
  );

  return (
    <InteractionDragSession<AuthoringMovementDragData, AuthoringMovementDropData>
      accessibilityMode="selection-alternative"
      collisionPolicy="feature-resolver"
      labels={{ draggable: "Authoring movement handle" }}
      onCancel={handleDragCancel}
      onEnd={handleDragEnd}
      onMove={handleDragMove}
      onStart={handleDragStart}
      profile="pointer"
      renderPreview={renderMovementPreview}
      resolveCollision={({ candidates }) =>
        candidates.find((candidate) => candidate.data.movementSurface)?.id ?? null
      }
      sessionId={`authoring-movement-${movementSessionId}`}
    >
      <EditorFloatingLayer editor={editor}>
        <MovementKeyboardProvider value={{ moveContained: handleContainedKeyboardMove }}>
          {children}
          <EditorMovementChromePortal>{movementChromeLayer}</EditorMovementChromePortal>
        </MovementKeyboardProvider>
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

function MovementChromeLayer({
  blockDefinitions,
  candidate,
  editor,
  keyboardMovementStatus,
  onKeyboardMove,
  target,
}: {
  blockDefinitions: BlockDefinitionLookup;
  candidate: MovementCandidate | null;
  editor: Editor;
  keyboardMovementStatus: string;
  onKeyboardMove: (sourcePos: number, direction: KeyboardMovementDirection) => void;
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
      className="sc-editor-movement-layer"
      style={{ zIndex: zIndex.interactive }}
    >
      <MovementHandle
        blockDefinitions={blockDefinitions}
        editor={editor}
        onKeyboardMove={onKeyboardMove}
        target={target}
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
    </div>
  );
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
  const label = target ? movementHandleLabel(target.context) : "block";
  const drag = useInteractionDragSource<AuthoringMovementDragData>({
    data: {
      containedMovement: false,
      ...(target
        ? {
            getSourcePos: () =>
              resolveLiveMovementSourcePos(editor, target.context.pos, blockDefinitions),
          }
        : {}),
      label,
      previewKind: "block",
      sourcePos: target?.context.pos,
    },
    id: MOVEMENT_HANDLE_ID,
    disabled: !target,
    label: `Move ${label}`,
  });

  if (!target) return null;

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
    >
      <InteractionDragActivationArea
        ref={drag.sourceRef}
        aria-describedby={descriptionId}
        aria-keyshortcuts="ArrowUp ArrowDown"
        aria-label={`Move ${label}`}
        contentEditable={false}
        {...authoringChromeAttributes(AuthoringChromeKind.Handle)}
        {...{ [AUTHORING_MOVE_HANDLE_ATTR]: "" }}
        {...{ [AUTHORING_MOVE_POS_ATTR]: target.context.pos }}
        data-interaction-drag-placeholder={drag.isPlaceholder ? "" : undefined}
        onMouseDown={(event) => event.preventDefault()}
        onKeyDown={handleKeyDown}
        safeLocalHeight={44}
        safeLocalWidth={44}
        className={`sc-editor-movement-handle${drag.isPlaceholder ? " sc-movement-handle--placeholder" : ""}`}
      >
        <span id={descriptionId} className="sc-sr-only">
          Press Arrow Up or Arrow Down to move this {label}.
        </span>
        <span aria-hidden className="sc-editor-movement-handle__visual">
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

function renderMovementPreview(active: AuthoringMovementDragData): ReactNode {
  return (
    <div
      data-authoring-movement-preview={active.previewKind}
      className={`sc-authoring-movement-preview sc-authoring-movement-preview--${active.previewKind}`}
    >
      <DotsSixVertical size={iconXs} weight="bold" aria-hidden />
      <span className="sc-sr-only">Moving {active.label}</span>
    </div>
  );
}

export function MovementDropIndicator({ candidate }: { candidate: MovementCandidate | null }) {
  if (!candidate) return null;

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

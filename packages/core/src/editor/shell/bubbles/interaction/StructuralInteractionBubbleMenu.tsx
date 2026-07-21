import type { Placement } from "@floating-ui/dom";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";

import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import type {
  AlignmentTargetPort,
  AlignmentTargetSnapshot,
} from "@/editor/interactions/alignment/alignment-target";
import {
  createBubbleVirtualElement,
  createBubbleVirtualElementFromRect,
  setBubblePlacementReady,
  syncBubbleFloatingRoot,
  useBubbleMenuScrollPositionSync,
  type BubbleVirtualElement,
} from "@/editor/interactions/bubble";
import { isEditorResizeGestureActive } from "@/editor/interactions/gesture/editor-resize-gesture";
import {
  AUTHORING_EDITOR_FLOATING_LAYER_KIND,
  resolveEditorFloatingLayerRoot,
} from "@/editor/interactions/floating/EditorFloatingLayer";
import {
  resolveStructuralFloatingTriggerRect,
  type StructuralFloatingGeometry,
  type StructuralFloatingTriggerSize,
} from "@/editor/interactions/floating/structural-floating-geometry";
import {
  authoringOverlayMiddlewareOptions,
  useAuthoringOverlayEnvironment,
} from "@/editor/interactions/floating/useAuthoringOverlayEnvironment";
import {
  AuthoringChromeKind,
  authoringChromeAttributes,
} from "@/editor/interactions/dom/authoring-chrome";
import { AUTHORING_ANCHOR_ATTR } from "@/editor/interactions/dom/authoring-frame";
import {
  AUTHORING_INTERACTION_ROOT_ATTR,
  findDataAnchorElementWithin,
  resolveAuthoringInteractionRoot,
} from "@/editor/interactions/dom/authoring-root";
import type { InteractionOwnerSnapshot } from "@/editor/interactions/targets/model/interaction-owner-state";
import {
  useInteractionStore,
  useInteractionSnapshot,
} from "@/editor/interactions/targets/facade/interaction-provider";
import {
  resolveStructuralChromeFrameElement,
  resolveStructuralChromeTargetFromSnapshot,
  type StructuralChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import { structuralMenuAnchorId } from "@/editor/interactions/interaction-bubble/structural-bubble-anchor";
import { MenuSeparator } from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";
import { zIndex } from "@/ui/overlays/z-index";

import type { StructuralInteractionBubbleRendererMap } from "@/editor/interactions/interaction-bubble";

import {
  handleInteractionBubbleToolbarKeyDown,
  interactionBubbleRootA11yAttributes,
} from "./interaction-bubble-toolbar";
import { AlignmentControls } from "./AlignmentControls";
import { InteractionBubbleToolbarViewport } from "./InteractionBubbleToolbarViewport";
import {
  defaultStructuralInteractionBubbleTriggerSize,
  resolveStructuralInteractionBubbleGeometry,
} from "./structural-interaction-bubble-geometry";

import "./block-bubble.css";

type BubbleShouldShowInput = Parameters<
  NonNullable<ComponentProps<typeof BubbleMenu>["shouldShow"]>
>[0];

export interface StructuralInteractionBubbleModel {
  content: ReactNode;
  descriptor: StructuralChromeTargetDescriptor;
  placement: Placement;
  targetKey: string;
}

export interface StructuralInteractionBubbleMenuProps {
  alignmentTargetPort: AlignmentTargetPort;
  editor: Editor;
  pluginKey: string;
  renderers: StructuralInteractionBubbleRendererMap;
}

export function resolveStructuralInteractionBubbleModel(
  editor: Editor,
  snapshot: InteractionOwnerSnapshot,
  alignmentTargetPort: AlignmentTargetPort,
  renderers: StructuralInteractionBubbleRendererMap,
): StructuralInteractionBubbleModel | null {
  if (!editor.isEditable) return null;
  if (isEditorResizeGestureActive(editor)) return null;

  const descriptor = resolveStructuralChromeTargetFromSnapshot(
    editor.state,
    snapshot,
    "arrangementMenu",
  );
  if (!descriptor) return null;

  const ownerContent =
    renderers.get(descriptor.kind)?.({
      descriptor,
      editor,
    }) ?? null;
  const alignmentSnapshot = alignmentTargetPort.snapshot(editor.state, descriptor);
  if (!hasAlignmentContent(alignmentSnapshot) && ownerContent === null) return null;

  return {
    content: (
      <StructuralInteractionBubbleContent
        descriptor={descriptor}
        editor={editor}
        alignmentTargetPort={alignmentTargetPort}
        ownerContent={ownerContent}
      />
    ),
    descriptor,
    placement: resolveStructuralBubblePlacement(descriptor),
    targetKey: descriptor.targetKey,
  };
}

interface StructuralInteractionBubbleContentProps {
  alignmentTargetPort: AlignmentTargetPort;
  descriptor: StructuralChromeTargetDescriptor;
  editor: Editor;
  ownerContent: ReactNode;
}

function StructuralInteractionBubbleContent({
  alignmentTargetPort,
  descriptor,
  editor,
  ownerContent,
}: StructuralInteractionBubbleContentProps) {
  const alignmentSnapshot = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      alignmentTargetPort.snapshot(currentEditor.state, descriptor),
  });
  const commonContent = hasAlignmentContent(alignmentSnapshot);

  return (
    <>
      {commonContent ? (
        <AlignmentControls
          snapshot={alignmentSnapshot}
          onHorizontalChange={(value) =>
            alignmentTargetPort.setHorizontal(editor, descriptor.target, value)
          }
          onVerticalChange={(value) =>
            alignmentTargetPort.setVertical(editor, descriptor.target, value)
          }
        />
      ) : null}
      {commonContent && ownerContent !== null ? <MenuSeparator /> : null}
      {ownerContent}
    </>
  );
}

function hasAlignmentContent(snapshot: AlignmentTargetSnapshot): boolean {
  return snapshot.horizontal.kind !== "unavailable" || snapshot.vertical.kind !== "unavailable";
}

export function resolveStructuralBubblePlacement(
  descriptor: StructuralChromeTargetDescriptor,
): Placement {
  switch (descriptor.kind) {
    case "grid":
      return "top-start";
    case "section":
      return "top";
    case "cell":
    case "layout":
    case "region":
    case "surface":
      return "top-end";
  }
}

export function resolveStructuralBubbleAnchorVirtualElement(
  editor: Editor,
  descriptor: StructuralChromeTargetDescriptor | null,
): BubbleVirtualElement | null {
  if (!descriptor) return null;

  const interactionRoot = resolveAuthoringInteractionRoot(editor.view.dom);
  const frameElement = resolveStructuralChromeFrameElement(interactionRoot, descriptor);
  const geometry = resolveStructuralInteractionBubbleGeometry(descriptor.kind);

  if (frameElement && geometry) {
    return createBubbleVirtualElementFromRect({
      contextElement: frameElement,
      getBoundingClientRect: () =>
        resolveStructuralFloatingTriggerRect({
          frameRect: frameElement.getBoundingClientRect(),
          geometry,
          size: resolveStructuralBubbleTriggerSize(editor, interactionRoot, descriptor, geometry),
        }),
    });
  }

  const anchorElement =
    findDataAnchorElementWithin(
      interactionRoot,
      AUTHORING_ANCHOR_ATTR,
      structuralMenuAnchorId(descriptor.kind, descriptor.id) ?? undefined,
    ) ?? frameElement;

  return createBubbleVirtualElement(anchorElement);
}

function resolveStructuralBubbleTriggerSize(
  editor: Editor,
  interactionRoot: Element,
  descriptor: StructuralChromeTargetDescriptor,
  geometry: StructuralFloatingGeometry,
): StructuralFloatingTriggerSize {
  if (editor.isDestroyed) return defaultStructuralInteractionBubbleTriggerSize(geometry);

  const anchorId = structuralMenuAnchorId(descriptor.kind, descriptor.id);
  const floatingLayerRoot = resolveEditorFloatingLayerRoot(
    editor,
    AUTHORING_EDITOR_FLOATING_LAYER_KIND,
  );
  const trigger =
    findDataAnchorElementWithin(floatingLayerRoot, AUTHORING_ANCHOR_ATTR, anchorId ?? undefined) ??
    findInteractionRootOwnedAnchor(interactionRoot, AUTHORING_ANCHOR_ATTR, anchorId ?? undefined);
  const rect = trigger?.getBoundingClientRect();

  if (rect && rect.width > 0 && rect.height > 0) {
    return {
      height: rect.height,
      width: rect.width,
    };
  }

  return defaultStructuralInteractionBubbleTriggerSize(geometry);
}

function findInteractionRootOwnedAnchor(
  interactionRoot: Element,
  attribute: string,
  anchorId: string | undefined,
): Element | null {
  if (!anchorId) return null;

  return (
    Array.from(interactionRoot.querySelectorAll(`[${attribute}]`)).find(
      (candidate) =>
        candidate.getAttribute(attribute) === anchorId &&
        candidate.closest(`[${AUTHORING_INTERACTION_ROOT_ATTR}]`) === interactionRoot,
    ) ?? null
  );
}

export function StructuralInteractionBubbleMenu({
  alignmentTargetPort,
  editor,
  pluginKey,
  renderers,
}: StructuralInteractionBubbleMenuProps) {
  const bubbleMenuElementRef = useRef<HTMLDivElement | null>(null);
  const store = useInteractionStore();
  const snapshot = useInteractionSnapshot();
  const appendToEditorParent = useCallback(
    () => editor.view.dom.parentElement ?? editor.view.dom,
    [editor],
  );
  const overlayEnvironment = useAuthoringOverlayEnvironment(appendToEditorParent);

  const model = resolveStructuralInteractionBubbleModel(
    editor,
    snapshot,
    alignmentTargetPort,
    renderers,
  );
  const hasModel = model !== null;
  const modelTargetKey = model?.targetKey ?? null;
  const placement = model?.placement ?? "top-end";

  useBubbleMenuScrollPositionSync(editor, pluginKey);

  useEffect(() => {
    const element = bubbleMenuElementRef.current;
    if (!element) return;
    syncBubbleFloatingRoot(element);
  });

  // interaction owner state can change without a ProseMirror selection move.
  useLayoutEffect(() => {
    const element = bubbleMenuElementRef.current;
    if (element) setBubblePlacementReady(element, false);
    if (editor.isDestroyed) return;
    if (!hasModel) {
      editor.view.dispatch(editor.state.tr.setMeta(pluginKey, "hide"));
      return;
    }

    editor.view.dispatch(editor.state.tr.setMeta(pluginKey, "show"));
    if (editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(pluginKey, "updatePosition"));
  }, [editor, hasModel, modelTargetKey, pluginKey]);

  const getReferencedVirtualElement = useCallback(
    () =>
      resolveStructuralBubbleAnchorVirtualElement(
        editor,
        resolveStructuralInteractionBubbleModel(
          editor,
          store.getState().snapshot,
          alignmentTargetPort,
          renderers,
        )?.descriptor ?? null,
      ),
    [alignmentTargetPort, editor, renderers, store],
  );

  const shouldShow = useCallback(
    (input: BubbleShouldShowInput) => {
      const visible =
        resolveStructuralInteractionBubbleModel(
          input.editor,
          store.getState().snapshot,
          alignmentTargetPort,
          renderers,
        ) !== null;
      const element = bubbleMenuElementRef.current;
      if (visible && element) setBubblePlacementReady(element, false);
      return visible;
    },
    [alignmentTargetPort, renderers, store],
  );

  if (overlayEnvironment === null) return null;

  return (
    <BubbleMenu
      ref={bubbleMenuElementRef}
      editor={editor}
      pluginKey={pluginKey}
      updateDelay={0}
      resizeDelay={0}
      appendTo={overlayEnvironment.appendTo}
      shouldShow={shouldShow}
      getReferencedVirtualElement={getReferencedVirtualElement}
      options={{
        strategy: overlayEnvironment.strategy,
        placement,
        offset: 8,
        ...authoringOverlayMiddlewareOptions(overlayEnvironment),
        onShow: () => {
          const element = bubbleMenuElementRef.current;
          if (!element) return;
          syncBubbleFloatingRoot(element);
          setBubblePlacementReady(element, false);
        },
        onUpdate: () => {
          const element = bubbleMenuElementRef.current;
          if (element) setBubblePlacementReady(element, true);
        },
        onHide: () => {
          const element = bubbleMenuElementRef.current;
          if (element) setBubblePlacementReady(element, false);
        },
      }}
    >
      <div key={model?.targetKey ?? "none"}>
        {model ? (
          <Tooltip.Provider delayDuration={350}>
            <InteractionBubbleToolbarViewport
              contentEditable={false}
              {...interactionBubbleRootA11yAttributes()}
              onKeyDown={handleInteractionBubbleToolbarKeyDown}
              {...authoringChromeAttributes(AuthoringChromeKind.Menu)}
              data-scaffold-interaction-bubble
              className="sc-interaction-bubble"
              style={{ zIndex: zIndex.editorBubble }}
            >
              {model.content}
            </InteractionBubbleToolbarViewport>
          </Tooltip.Provider>
        ) : null}
      </div>
    </BubbleMenu>
  );
}

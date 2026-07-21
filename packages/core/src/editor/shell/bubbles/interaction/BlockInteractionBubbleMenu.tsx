import { GearSixIcon as Gear } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useCallback, useEffect, useLayoutEffect, useRef, type ComponentProps } from "react";

import * as Tooltip from "@/ui/components/Tooltip/Tooltip";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { isEditorResizeGestureActive } from "@/editor/interactions/gesture/editor-resize-gesture";
import {
  createBubbleVirtualElement,
  setBubblePlacementReady,
  syncBubbleFloatingRoot,
  useBubbleMenuScrollPositionSync,
  type BubbleVirtualElement,
} from "@/editor/interactions/bubble";
import {
  authoringOverlayMiddlewareOptions,
  useAuthoringOverlayEnvironment,
} from "@/editor/interactions/floating/useAuthoringOverlayEnvironment";
import type { AlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import {
  AuthoringChromeKind,
  authoringChromeAttributes,
} from "@/editor/interactions/dom/authoring-chrome";
import { ConfigurationMenuControls } from "@/editor/shell/bubbles/interaction/menu-controls/ConfigurationMenuControls";
import {
  MenuControls,
  MenuIconButton,
} from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";
import {
  sameInteractionTarget,
  type InteractionOwnerSnapshot,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import {
  useInteractionCommands,
  useInteractionStore,
  useInteractionSnapshot,
} from "@/editor/interactions/targets/facade/interaction-provider";
import {
  resolveBlockChromeFrameElement,
  resolveBlockChromeTargetDescriptor,
  resolveBlockChromeTargetFromSnapshot,
  type BlockChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";
import { DeleteBlock } from "@/editor/shell/bubbles/block/actions/DeleteBlock";
import { DuplicateBlock } from "@/editor/shell/bubbles/block/actions/DuplicateBlock";
import { zIndex } from "@/ui/overlays/z-index";

import {
  handleInteractionBubbleToolbarKeyDown,
  interactionBubbleRootA11yAttributes,
} from "./interaction-bubble-toolbar";
import { AlignmentControls } from "./AlignmentControls";
import { InteractionBubbleToolbarViewport } from "./InteractionBubbleToolbarViewport";

import "./block-bubble.css";

type BubbleShouldShowInput = Parameters<
  NonNullable<ComponentProps<typeof BubbleMenu>["shouldShow"]>
>[0];

export interface BlockInteractionBubbleModel {
  descriptor: BlockChromeTargetDescriptor;
  targetKey: string;
}

export interface BlockInteractionBubbleMenuProps {
  alignmentTargetPort: AlignmentTargetPort;
  blockDefinitions: BlockDefinitionLookup;
  editor: Editor;
  pluginKey: string;
}

export function resolveBlockInteractionBubbleModel(
  editor: Editor,
  snapshot: InteractionOwnerSnapshot,
  blockDefinitions: BlockDefinitionLookup,
): BlockInteractionBubbleModel | null {
  if (!editor.isEditable) return null;
  if (isEditorResizeGestureActive(editor)) return null;

  const descriptor = resolveBlockChromeTargetFromSnapshot(
    editor.state,
    snapshot,
    "blockBubble",
    blockDefinitions,
  );
  if (!descriptor) return null;

  return { descriptor, targetKey: descriptor.targetKey };
}

export function resolveBlockBubbleAnchorVirtualElement(
  editor: Editor,
  descriptor: BlockChromeTargetDescriptor | null,
): BubbleVirtualElement | null {
  if (!descriptor) return null;

  return createBubbleVirtualElement(resolveBlockChromeFrameElement(editor.view.dom, descriptor));
}

export function BlockInteractionBubbleMenu({
  alignmentTargetPort,
  blockDefinitions,
  editor,
  pluginKey,
}: BlockInteractionBubbleMenuProps) {
  const bubbleMenuElementRef = useRef<HTMLDivElement | null>(null);
  const store = useInteractionStore();
  const snapshot = useInteractionSnapshot();
  const appendToEditorParent = useCallback(
    () => editor.view.dom.parentElement ?? editor.view.dom,
    [editor],
  );
  const overlayEnvironment = useAuthoringOverlayEnvironment(appendToEditorParent);

  const model = resolveBlockInteractionBubbleModel(editor, snapshot, blockDefinitions);
  const hasModel = model !== null;
  const modelTargetKey = model?.targetKey ?? null;

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
      resolveBlockBubbleAnchorVirtualElement(
        editor,
        resolveBlockInteractionBubbleModel(editor, store.getState().snapshot, blockDefinitions)
          ?.descriptor ?? null,
      ),
    [blockDefinitions, editor, store],
  );

  const shouldShow = useCallback(
    (input: BubbleShouldShowInput) => {
      const visible =
        resolveBlockInteractionBubbleModel(
          input.editor,
          store.getState().snapshot,
          blockDefinitions,
        ) !== null;
      const element = bubbleMenuElementRef.current;
      if (visible && element) setBubblePlacementReady(element, false);
      return visible;
    },
    [blockDefinitions, store],
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
        placement: "top-end",
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
              {...authoringChromeAttributes(AuthoringChromeKind.Bubble)}
              data-scaffold-interaction-bubble
              className="sc-interaction-bubble"
              style={{ zIndex: zIndex.editorBubble }}
            >
              <BlockInteractionBubbleMenuContent
                alignmentTargetPort={alignmentTargetPort}
                blockDefinitions={blockDefinitions}
                descriptor={model.descriptor}
                editor={editor}
              />
            </InteractionBubbleToolbarViewport>
          </Tooltip.Provider>
        ) : null}
      </div>
    </BubbleMenu>
  );
}

export interface BlockInteractionBubbleMenuContentProps {
  alignmentTargetPort: AlignmentTargetPort;
  blockDefinitions: BlockDefinitionLookup;
  descriptor: BlockChromeTargetDescriptor;
  editor: Editor;
}

export function BlockInteractionBubbleMenuContent({
  alignmentTargetPort,
  blockDefinitions,
  descriptor,
  editor,
}: BlockInteractionBubbleMenuContentProps) {
  const commands = useInteractionCommands();
  const settingsOwnerTarget = useInteractionSnapshot().owners.settingsOwner.target;
  const alignmentSnapshot = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const liveDescriptor = resolveBlockChromeTargetDescriptor(
        currentEditor.state,
        descriptor.target,
        blockDefinitions,
      );
      return liveDescriptor
        ? alignmentTargetPort.snapshot(currentEditor.state, liveDescriptor)
        : null;
    },
  });

  const { blockId, definition, nodeType, pos } = descriptor;
  const authoringControls = definition.authoringControls
    ? definition.authoringControls.controls({
        editor,
        nodeType,
        pos,
        ...(blockId !== null ? { targetId: blockId } : {}),
      })
    : [];
  const quickMenu = definition.quickMenu;
  const quickMenuControls = quickMenu?.controls ?? [];
  const settingsSheetOpen = Boolean(
    settingsOwnerTarget && sameInteractionTarget(settingsOwnerTarget, descriptor.target),
  );

  return (
    <>
      <DuplicateBlock editor={editor} pos={pos} />
      <DeleteBlock editor={editor} pos={pos} />
      {descriptor.capabilities.supportsResize ? (
        <>
          <MenuDivider />
          {alignmentSnapshot ? (
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
        </>
      ) : null}
      {authoringControls.length > 0 ? (
        <>
          <MenuDivider />
          <MenuControls controls={authoringControls} />
        </>
      ) : null}
      {quickMenuControls.length > 0 ? (
        <>
          <MenuDivider />
          <ConfigurationMenuControls
            editor={editor}
            nodeType={nodeType}
            pos={pos}
            targetId={blockId}
            attr={quickMenu?.attr ?? "options"}
            {...(quickMenu?.schema ? { schema: quickMenu.schema } : {})}
            controls={quickMenuControls}
          />
        </>
      ) : null}
      {descriptor.capabilities.supportsSettings ? <MenuDivider /> : null}
      {descriptor.capabilities.supportsSettings ? (
        <MenuIconButton
          active={settingsSheetOpen}
          icon={Gear}
          label="Open block settings"
          onClick={() => {
            commands.openSettings(descriptor.target);
          }}
        />
      ) : null}
    </>
  );
}

function MenuDivider() {
  return <span aria-hidden="true" className="sc-block-bubble-divider" />;
}

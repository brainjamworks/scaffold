import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";
import { useEffect, useMemo, useState, type MouseEvent } from "react";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import {
  AuthoringChromeKind,
  authoringChromeAttributes,
  isAuthoringChromeSessionActive,
} from "@/editor/interactions/dom/authoring-chrome";
import {
  AUTHORING_ANCHOR_ATTR,
  AUTHORING_FRAME_ATTR,
} from "@/editor/interactions/dom/authoring-frame";
import { resolveAuthoringInteractionRoot } from "@/editor/interactions/dom/authoring-root";
import { useInteractionCommands } from "@/editor/interactions/targets/facade/interaction-provider";
import type { InteractionTargetRef } from "@/editor/interactions/targets/model/interaction-owner-state";
import {
  resolveStructuralChromeFrameElement,
  resolveStructuralChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import { EditorFloatingContent } from "@/editor/interactions/floating/EditorFloatingContent";
import {
  createStructuralFloatingAnchor,
  resolveStructuralFloatingContentStyle,
  STRUCTURAL_FLOATING_POINT_PLACEMENT,
} from "@/editor/interactions/floating/structural-floating-geometry";
import { iconXs } from "@/ui/tokens/icon-sizes";

import type { FloatingControl } from "./floating-control";

interface FloatingControlViewProps {
  control: FloatingControl;
  editor: Editor;
}

export function FloatingControlView({ control, editor }: FloatingControlViewProps) {
  const [, setAnchorSignal] = useState(0);
  const commands = useInteractionCommands();
  const targetState = editor.isEditable ? control.resolveState(editor) : null;
  const interactionRoot = resolveAuthoringInteractionRoot(editor.view.dom);
  const chromeSessionActive = isAuthoringChromeSessionActive(interactionRoot);
  const targetKey = targetState?.key ?? null;
  const anchorElement =
    chromeSessionActive && targetState
      ? resolveStructuralTargetAnchorElement(editor, interactionRoot, targetState.target)
      : null;
  const controlGeometry = useMemo(
    () => ({
      ...(control.alignment !== undefined ? { alignment: control.alignment } : {}),
      ...(control.blockOffset !== undefined ? { blockOffset: control.blockOffset } : {}),
      ...(control.inlineOffset !== undefined ? { inlineOffset: control.inlineOffset } : {}),
      ...(control.placement !== undefined ? { placement: control.placement } : {}),
    }),
    [control.alignment, control.blockOffset, control.inlineOffset, control.placement],
  );
  const anchor = useMemo(
    () =>
      createStructuralFloatingAnchor(anchorElement, controlGeometry, {
        root: interactionRoot,
      }),
    [anchorElement, controlGeometry, interactionRoot],
  );
  const contentStyle = useMemo(
    () => resolveStructuralFloatingContentStyle(controlGeometry),
    [controlGeometry],
  );

  useEffect(() => {
    if (!targetKey) return;
    if (typeof MutationObserver === "undefined") return;

    const syncAnchorSignal = () => setAnchorSignal((value) => value + 1);
    const mutationObserver = new MutationObserver(syncAnchorSignal);
    mutationObserver.observe(interactionRoot, {
      attributeFilter: [AUTHORING_FRAME_ATTR, "data-id"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      mutationObserver.disconnect();
    };
  }, [interactionRoot, targetKey]);

  if (!chromeSessionActive || !targetState || !anchorElement) return null;
  const Icon = control.icon ?? DotsThreeVertical;

  const openMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!isValidEditorDocPos(editor, targetState.pos)) return;
    control.open({ commands, editor, state: targetState });
  };

  return (
    <EditorFloatingContent
      anchor={anchor}
      open
      placement={STRUCTURAL_FLOATING_POINT_PLACEMENT}
      {...(contentStyle ? { style: contentStyle } : {})}
    >
      <button
        type="button"
        contentEditable={false}
        {...authoringChromeAttributes(AuthoringChromeKind.Trigger)}
        {...control.dataAttributes}
        {...(targetState.anchorId ? { [AUTHORING_ANCHOR_ATTR]: targetState.anchorId } : {})}
        aria-label={control.label}
        disabled={targetState.disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={openMenu}
        className={control.className}
      >
        <Icon size={iconXs} />
      </button>
    </EditorFloatingContent>
  );
}

function resolveStructuralTargetAnchorElement(
  editor: Editor,
  root: Element,
  target: InteractionTargetRef,
): Element | null {
  const descriptor = resolveStructuralChromeTargetDescriptor(editor.state, target);
  return resolveStructuralChromeFrameElement(root, descriptor);
}

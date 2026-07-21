import { DotsThreeIcon as DotsThree, PlusIcon as Plus } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";
import type { MouseEvent, ReactNode } from "react";

import * as Slot from "@/ui/components/Slot/Slot";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import "@/editor/suggestions/insert/ghost-add.css";
import { StructureMovementHandle } from "@/editor/drag/view/StructureMovementHandle";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import {
  AuthoringChromeKind,
  authoringChromeAttributes,
} from "@/editor/interactions/dom/authoring-chrome";
import { AUTHORING_ANCHOR_ATTR } from "@/editor/interactions/dom/authoring-frame";
import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { createInteractionOwnerCommandPorts } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-command-ports";
import { cn } from "@/lib/cn";
import { iconSm, iconXs } from "@/ui/tokens/icon-sizes";

import { builtInLayoutRegistry } from "../model/built-in-layout-definitions";
import { appendLayoutSectionAt } from "../model/layout-commands";
import {
  createLayoutArrangementAnchorId,
  layoutSectionPositionAt,
} from "../model/layout-arrangement-helpers";

interface LayoutNodeChromeProps {
  editor: Editor;
  getPos: (() => number | undefined) | boolean;
  layoutId?: unknown;
}

interface LayoutAddGhostProps extends LayoutNodeChromeProps {
  asChild?: boolean;
  children?: ReactNode;
  className?: string;
  label: string;
  onSectionAdded?: (input: { layoutPos: number; sectionId?: string; sectionIndex: number }) => void;
  presentation?:
    | "inline"
    | "full-width"
    | "flow-item"
    | "icon"
    | "tab"
    | "tab-pills"
    | "tab-underline";
}

interface SectionMovementHandleProps {
  className?: string;
  editor: Editor;
  getPos?: (() => number | undefined) | boolean;
  layoutPos?: number | null;
  sectionIndex?: number;
  sectionId?: unknown;
}

interface SectionActionTriggerProps {
  blockDefinitions: BlockDefinitionLookup;
  className?: string;
  editor: Editor;
  getPos?: (() => number | undefined) | boolean;
  layoutPos?: number | null;
  sectionIndex?: number;
  sectionId?: unknown;
}

interface SectionTargetInput {
  editor: Editor;
  getPos?: (() => number | undefined) | boolean | undefined;
  layoutPos?: number | null | undefined;
  sectionIndex?: number | undefined;
  sectionId?: unknown | undefined;
}

/**
 * NodeView command bridge: layout tab/page chrome activates the parent
 * layout as the explicit owner through the view command port. It never
 * creates a structural NodeSelection.
 */
export function activateLayoutInteractionTarget({
  blockDefinitions,
  editor,
  layoutPos,
}: {
  blockDefinitions: BlockDefinitionLookup;
  editor: Editor;
  layoutPos: number | null;
}): boolean {
  if (layoutPos === null) return false;
  if (!isValidEditorDocPos(editor, layoutPos)) return false;

  const layout = editor.state.doc.nodeAt(layoutPos);
  if (!layout || layout.type.name !== "layout") return false;
  const layoutId = readStableStringId(layout.attrs["id"]);

  return createInteractionOwnerCommandPorts(editor.view, blockDefinitions).activateStructuralTarget(
    {
      ...(layoutId ? { id: layoutId } : {}),
      kind: InteractionTargetKind.Layout,
      pos: layoutPos,
    },
  );
}

export function LayoutAddGhost({
  asChild = false,
  children,
  className,
  editor,
  getPos,
  label,
  layoutId,
  onSectionAdded,
  presentation = "inline",
}: LayoutAddGhostProps) {
  const anchorId = createLayoutArrangementAnchorId("layout-add-section", layoutId);
  const Component = asChild ? Slot.Slot : "button";

  const addSection = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const pos = resolveNodeViewPos(getPos);
    if (pos === null) return;
    if (!isValidEditorDocPos(editor, pos)) return;
    const previousLayout = editor.state.doc.nodeAt(pos);
    if (!previousLayout || previousLayout.type.name !== "layout") return;
    const previousCount = previousLayout.childCount;

    if (!appendLayoutSectionAt(editor, pos, builtInLayoutRegistry)) return;

    const nextLayout = editor.state.doc.nodeAt(pos);
    if (!nextLayout || nextLayout.type.name !== "layout") return;
    const sectionIndex = Math.max(previousCount, nextLayout.childCount - 1);
    const section = nextLayout.child(sectionIndex);
    const sectionId = typeof section?.attrs["id"] === "string" ? section.attrs["id"] : undefined;

    onSectionAdded?.({
      layoutPos: pos,
      ...(sectionId ? { sectionId } : {}),
      sectionIndex,
    });
  };

  return (
    <Component
      type={asChild ? undefined : "button"}
      contentEditable={false}
      {...authoringChromeAttributes(AuthoringChromeKind.Trigger)}
      data-layout-add-ghost=""
      {...(anchorId ? { [AUTHORING_ANCHOR_ATTR]: anchorId } : {})}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={addSection}
      className={cn(
        // Visual contract: border, hover, focus, transition, font.
        // Defined in editor/suggestions/insert/ghost-add.css.
        "sc-ghost-add",
        // Geometry / placement per presentation. No visual rules here.
        "sc-layout-add-ghost",
        presentation === "inline" && "sc-layout-add-ghost--inline",
        presentation === "full-width" && "sc-layout-add-ghost--full-width",
        presentation === "flow-item" && "sc-layout-add-ghost--flow-item",
        presentation === "icon" && "sc-layout-add-ghost--icon",
        presentation === "tab" && "sc-layout-add-ghost--tab",
        presentation === "tab-pills" && "sc-layout-add-ghost--tab-pills",
        presentation === "tab-underline" && "sc-layout-add-ghost--tab-underline",
        className,
      )}
    >
      {children ?? (
        <>
          <span
            aria-hidden
            className={cn(
              "sc-ghost-add__icon",
              presentation === "flow-item" && "sc-layout-add-ghost__icon--flow-item",
            )}
          >
            <Plus size={iconSm} aria-hidden />
          </span>
          {presentation === "icon" ? null : <span>{label}</span>}
        </>
      )}
    </Component>
  );
}

export function SectionMovementHandle({
  className,
  editor,
  getPos,
  layoutPos,
  sectionIndex,
  sectionId,
}: SectionMovementHandleProps) {
  const sectionPos = resolveSectionMovementPos({
    editor,
    getPos,
    layoutPos,
    sectionIndex,
  });

  return (
    <StructureMovementHandle
      label="section"
      variant="bare"
      sourcePos={sectionPos}
      getSourcePos={() =>
        resolveSectionMovementPos({
          editor,
          getPos,
          layoutPos,
          sectionIndex,
        })
      }
      sourceKey={typeof sectionId === "string" && sectionId.length > 0 ? sectionId : sectionPos}
      className={cn("sc-layout-section-movement-handle", className)}
    />
  );
}

export function SectionActionTrigger({
  blockDefinitions,
  className,
  editor,
  getPos,
  layoutPos,
  sectionIndex,
  sectionId,
}: SectionActionTriggerProps) {
  const anchorId = createLayoutArrangementAnchorId("section-menu", sectionId);

  const openSectionMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const target = resolveSectionTargetRef({
      editor,
      getPos,
      layoutPos,
      sectionIndex,
      sectionId,
    });
    if (!target) return;
    createInteractionOwnerCommandPorts(editor.view, blockDefinitions).toggleMenu(target);
  };

  return (
    <button
      type="button"
      contentEditable={false}
      {...authoringChromeAttributes(AuthoringChromeKind.Trigger)}
      data-layout-section-menu-trigger=""
      {...(anchorId ? { [AUTHORING_ANCHOR_ATTR]: anchorId } : {})}
      aria-label="Section options"
      onMouseDown={(event) => event.preventDefault()}
      onClick={openSectionMenu}
      className={cn("sc-layout-section-action-trigger", className)}
    >
      <DotsThree size={iconXs} />
    </button>
  );
}

function resolveSectionTargetRef({
  editor,
  getPos,
  layoutPos,
  sectionIndex,
  sectionId,
}: SectionTargetInput): InteractionTargetRef | null {
  const sectionPos = resolveSectionMovementPos({
    editor,
    getPos,
    layoutPos,
    sectionIndex,
  });
  if (sectionPos === null) return null;
  if (!isValidEditorDocPos(editor, sectionPos)) return null;

  const section = editor.state.doc.nodeAt(sectionPos);
  if (!section || section.type.name !== "section") return null;
  const stableSectionId = readStableStringId(sectionId) ?? readStableStringId(section.attrs["id"]);

  return {
    ...(stableSectionId ? { id: stableSectionId } : {}),
    kind: InteractionTargetKind.Section,
    pos: sectionPos,
  };
}

function resolveNodeViewPos(getPos: (() => number | undefined) | boolean): number | null {
  if (typeof getPos !== "function") return null;

  try {
    const pos = getPos();
    return typeof pos === "number" && Number.isFinite(pos) ? pos : null;
  } catch {
    return null;
  }
}

function resolveSectionMovementPos({
  editor,
  getPos,
  layoutPos,
  sectionIndex,
}: {
  editor: Editor;
  getPos?: (() => number | undefined) | boolean | undefined;
  layoutPos?: number | null | undefined;
  sectionIndex?: number | undefined;
}): number | null {
  if (getPos !== undefined) {
    return resolveNodeViewPos(getPos);
  }

  if (
    typeof layoutPos !== "number" ||
    !Number.isFinite(layoutPos) ||
    typeof sectionIndex !== "number" ||
    !Number.isInteger(sectionIndex)
  ) {
    return null;
  }

  return layoutSectionPositionAt(editor.state.doc, layoutPos, sectionIndex);
}

function readStableStringId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

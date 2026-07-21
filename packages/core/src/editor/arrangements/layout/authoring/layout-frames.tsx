import { NodeViewWrapper } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { ReactNode } from "react";
import { useStore } from "zustand";

import {
  authoringChromeActiveAttributes,
  structuralAuthoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";
import { shouldRenderAuthoringChrome } from "@/editor/interactions/dom/authoring-chrome";
import {
  InteractionTargetKind,
  type InteractionOwnerSnapshot,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import {
  resolveStructuralChromeTargetDescriptor,
  resolveStructuralChromeTargetFromSnapshot,
} from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import type { EditorState } from "@tiptap/pm/state";
import {
  boundedPlacementAttributes,
  type BoundedPlacement,
} from "@/editor/frame/model/bounded-placement";
import { cn } from "@/lib/cn";
import { VerticalContentPositionSchema } from "@/schemas/course-document";

import type { LayoutComponentProps } from "./layout-view-definition";

import "@/editor/frame/view/bounded-placement.css";

interface LayoutAuthoringFrameProps {
  boundedPlacement?: BoundedPlacement;
  children: ReactNode;
  className?: string;
  editable: boolean;
  editor: LayoutComponentProps["editor"];
  getPos: LayoutComponentProps["getPos"];
  isEmpty?: boolean;
  layoutId: unknown;
  variant: string;
}

interface SectionAuthoringFrameProps {
  children: ReactNode;
  className?: string;
  isEmpty?: boolean;
  node: ProseMirrorNode;
  sectionId: unknown;
  variant: string;
}

export function LayoutAuthoringFrame({
  boundedPlacement,
  children,
  className,
  editable,
  editor,
  getPos,
  isEmpty,
  layoutId,
  variant,
}: LayoutAuthoringFrameProps) {
  const layoutPos = resolveLayoutPos(getPos);
  const showLayoutOutline = useLayoutChromeActive({
    editable,
    editor,
    layoutPos,
  });

  return (
    <NodeViewWrapper
      data-empty={isEmpty ? "true" : undefined}
      data-layout-kind={variant === "layout" ? undefined : variant}
      {...boundedPlacementAttributes(boundedPlacement)}
      {...structuralAuthoringFrameAttributes({
        definition: variant,
        id: layoutId,
        nodeType: "layout",
        frameKind: "layout",
      })}
      {...authoringChromeActiveAttributes(showLayoutOutline)}
      className={cn("sc-layout-frame", "sc-layout-frame--authoring", className)}
    >
      {children}
      {editable ? <LayoutOutlineChrome /> : null}
    </NodeViewWrapper>
  );
}

export function SectionAuthoringFrame({
  children,
  className,
  isEmpty,
  node,
  sectionId,
  variant,
}: SectionAuthoringFrameProps) {
  return (
    <NodeViewWrapper
      data-empty={isEmpty ? "true" : undefined}
      data-layout-kind={variant === "section" ? undefined : variant}
      data-vertical-content-position={readVerticalPosition(node.attrs["verticalPosition"])}
      {...structuralAuthoringFrameAttributes({
        definition: variant,
        id: sectionId,
        nodeType: "section",
        frameKind: "section",
      })}
      className={cn("sc-layout-section", "sc-layout-section-authoring", className)}
    >
      {children}
    </NodeViewWrapper>
  );
}

function readVerticalPosition(value: unknown) {
  const parsed = VerticalContentPositionSchema.safeParse(value);
  return parsed.success ? parsed.data : "top";
}

export function LayoutOutlineChrome() {
  return (
    <div
      aria-hidden="true"
      contentEditable={false}
      data-layout-outline=""
      className="sc-layout-outline"
    />
  );
}

export function useLayoutChromeActive({
  editable,
  editor,
  layoutPos,
}: {
  editable: boolean;
  editor: LayoutComponentProps["editor"];
  layoutPos: number | null;
}): boolean {
  const snapshot = useStore(getInteractionFacadeStoreForEditor(editor), (state) => state.snapshot);

  if (!editable || layoutPos === null) return false;
  if (isVisibleLayoutOutlineAt(editor.state, snapshot, layoutPos)) return true;

  // Sections carry no outline of their own; generic layout chrome
  // represents the parent layout while a section menu owns the moment.
  return shouldRenderAuthoringChrome(
    editor.view.dom,
    isSectionOwnerInsideLayout(editor.state, snapshot, layoutPos),
  );
}

function isVisibleLayoutOutlineAt(
  state: EditorState,
  snapshot: InteractionOwnerSnapshot,
  layoutPos: number,
): boolean {
  const outline = resolveStructuralChromeTargetFromSnapshot(state, snapshot, "outline");
  return outline?.kind === InteractionTargetKind.Layout && outline.pos === layoutPos;
}

function isSectionOwnerInsideLayout(
  state: EditorState,
  snapshot: InteractionOwnerSnapshot,
  layoutPos: number,
): boolean {
  const ownerRef = snapshot.owners.menuOwner.target ?? snapshot.owners.explicitOwner.target;
  if (ownerRef?.kind !== InteractionTargetKind.Section) return false;

  const section = resolveStructuralChromeTargetDescriptor(state, ownerRef);
  return section?.kind === InteractionTargetKind.Section && section.layoutPos === layoutPos;
}

function resolveLayoutPos(getPos: LayoutComponentProps["getPos"]): number | null {
  try {
    const pos = getPos();
    return typeof pos === "number" ? pos : null;
  } catch {
    return null;
  }
}

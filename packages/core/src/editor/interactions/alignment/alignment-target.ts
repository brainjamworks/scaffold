import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  normalizeBlockFrame,
  setBlockFrameHorizontalAlignmentInTransaction,
} from "@/editor/frame/model/block-frame";
import {
  setAllGridCellsVerticalPositionAt,
  setGridCellVerticalPositionAt,
} from "@/editor/arrangements/grid/model/grid-commands";
import {
  isGridCellVerticalPosition,
  type GridCellVerticalPosition,
} from "@/editor/arrangements/grid/model/grid-model";
import { setLayoutSectionVerticalPositionAt } from "@/editor/arrangements/layout/model/layout-commands";
import { isActiveBoundedContainerAtPosition } from "@/editor/bounded-containers/model/bounded-container-structure-policy";
import {
  readRegionVerticalPosition,
  setRegionVerticalPositionInTransaction,
} from "@/editor/surfaces/model/region-vertical-position";
import { readSurfaceVerticalPosition } from "@/editor/surfaces/model/surface-settings";
import { setSurfaceVerticalPositionInTransaction } from "@/editor/surfaces/model/commands/surface-settings-command";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";
import {
  VerticalContentPositionSchema,
  type HorizontalAlignment,
  type VerticalContentPosition,
} from "@/schemas/course-document";

import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "../targets/model/interaction-owner-state";
import {
  resolveBlockChromeTargetDescriptor,
  type BlockChromeTargetDescriptor,
} from "../targets/prosemirror/projection/block-chrome-target-projection";
import {
  resolveStructuralChromeTargetDescriptor,
  type StructuralChromeTargetDescriptor,
} from "../targets/prosemirror/projection/structural-chrome-target-projection";
import {
  aggregateHorizontalParticipants,
  collectOwnedHorizontalParticipants,
  setOwnedHorizontalAlignmentInTransaction,
} from "./owned-content-alignment";

export type AlignmentAxisState<TValue extends string> =
  | { kind: "value"; value: TValue }
  | { kind: "indeterminate"; reason: "mixed" | "outside-command-set" }
  | { kind: "unavailable" };

export interface AlignmentTargetSnapshot {
  target: InteractionTargetRef;
  horizontal: AlignmentAxisState<HorizontalAlignment>;
  vertical: AlignmentAxisState<VerticalContentPosition>;
}

export interface AlignmentTargetPort {
  snapshot(
    state: EditorState,
    descriptor: BlockChromeTargetDescriptor | StructuralChromeTargetDescriptor,
  ): AlignmentTargetSnapshot;
  setHorizontal(editor: Editor, target: InteractionTargetRef, value: HorizontalAlignment): boolean;
  setVertical(
    editor: Editor,
    target: InteractionTargetRef,
    value: VerticalContentPosition,
  ): boolean;
}

const unavailable = { kind: "unavailable" } as const;

export function createAlignmentTargetPort({
  blockDefinitions,
  surfaceVariants,
}: {
  blockDefinitions: BlockDefinitionLookup;
  surfaceVariants: SurfaceVariantLookup;
}): AlignmentTargetPort {
  return {
    snapshot(state, descriptor) {
      if (isOwnedHorizontalStructuralTarget(descriptor.target.kind)) {
        const live = resolveStructuralChromeTargetDescriptor(state, descriptor.target);
        if (!live || !isOwnedHorizontalStructuralTarget(live.kind)) {
          return { target: descriptor.target, horizontal: unavailable, vertical: unavailable };
        }

        return {
          target: live.target,
          horizontal: aggregateHorizontalParticipants(
            collectOwnedHorizontalParticipants(state.doc, live.pos, blockDefinitions),
          ),
          vertical: verticalStateForOwnedStructuralTarget(
            state.doc,
            live,
            blockDefinitions,
            surfaceVariants,
          ),
        };
      }

      if (descriptor.target.kind === InteractionTargetKind.Grid) {
        const live = resolveStructuralChromeTargetDescriptor(state, descriptor.target);
        if (live?.kind !== InteractionTargetKind.Grid) {
          return { target: descriptor.target, horizontal: unavailable, vertical: unavailable };
        }

        return {
          target: live.target,
          horizontal: unavailable,
          vertical: aggregateGridCellVerticalPositions(live.node),
        };
      }

      if (descriptor.target.kind !== InteractionTargetKind.Block) {
        return { target: descriptor.target, horizontal: unavailable, vertical: unavailable };
      }

      const blockDescriptor = descriptor as BlockChromeTargetDescriptor;
      if (!blockDescriptor.capabilities?.supportsResize) {
        return { target: descriptor.target, horizontal: unavailable, vertical: unavailable };
      }

      const frame = normalizeBlockFrame(blockDescriptor.node.attrs["frame"]);
      const value: HorizontalAlignment =
        frame.align === "center" ? "center" : frame.align === "end" ? "right" : "left";

      return {
        target: descriptor.target,
        horizontal: { kind: "value", value },
        vertical: unavailable,
      };
    },

    setHorizontal(editor, target, value) {
      if (isOwnedHorizontalStructuralTarget(target.kind)) {
        const descriptor = resolveStructuralChromeTargetDescriptor(editor.state, target);
        if (!descriptor || !isOwnedHorizontalStructuralTarget(descriptor.kind)) return false;
        const participants = collectOwnedHorizontalParticipants(
          editor.state.doc,
          descriptor.pos,
          blockDefinitions,
        );
        const tr = setOwnedHorizontalAlignmentInTransaction(
          editor.state.tr,
          participants,
          value,
          blockDefinitions,
        );
        if (!tr) return false;

        editor.view.dispatch(tr);
        return true;
      }

      const descriptor = resolveBlockChromeTargetDescriptor(editor.state, target, blockDefinitions);
      if (!descriptor?.capabilities.supportsResize) return false;

      const tr = setBlockFrameHorizontalAlignmentInTransaction(
        editor.state.tr,
        descriptor.pos,
        value,
      );
      if (!tr) return false;

      editor.view.dispatch(tr);
      return true;
    },

    setVertical(editor, target, value) {
      const descriptor = resolveStructuralChromeTargetDescriptor(editor.state, target);
      if (!descriptor) return false;

      switch (descriptor.kind) {
        case InteractionTargetKind.Region: {
          const tr = setRegionVerticalPositionInTransaction(editor.state.tr, descriptor.pos, value);
          if (!tr || tr.doc.eq(editor.state.doc)) return false;
          try {
            editor.view.dispatch(tr.scrollIntoView());
            return true;
          } catch {
            return false;
          }
        }
        case InteractionTargetKind.Surface: {
          const tr = setSurfaceVerticalPositionInTransaction(
            editor.state.tr,
            descriptor.pos,
            value,
            surfaceVariants,
          );
          if (!tr || tr.doc.eq(editor.state.doc)) return false;
          editor.view.dispatch(tr);
          return true;
        }
        case InteractionTargetKind.Cell:
          return setGridCellVerticalPositionAt(
            editor,
            descriptor.gridPos,
            descriptor.cellIndex,
            value,
          );
        case InteractionTargetKind.Grid:
          return setAllGridCellsVerticalPositionAt(editor, descriptor.pos, value);
        case InteractionTargetKind.Section:
          if (
            !isActiveBoundedContainerAtPosition({
              blockDefinitions,
              containerType: "section",
              doc: editor.state.doc,
              pos: descriptor.pos,
            })
          ) {
            return false;
          }
          return setLayoutSectionVerticalPositionAt(
            editor,
            descriptor.pos,
            value,
            blockDefinitions,
          );
        default:
          return false;
      }
    },
  };
}

function verticalStateForOwnedStructuralTarget(
  doc: ProseMirrorNode,
  descriptor: StructuralChromeTargetDescriptor,
  blockDefinitions: BlockDefinitionLookup,
  surfaceVariants: SurfaceVariantLookup,
): AlignmentAxisState<VerticalContentPosition> {
  if (descriptor.kind === InteractionTargetKind.Surface) {
    const variant = descriptor.node.attrs["variant"];
    const definition = typeof variant === "string" ? surfaceVariants.get(variant) : undefined;
    const value = readSurfaceVerticalPosition(descriptor.node.attrs["settings"], definition);
    return value === null ? unavailable : { kind: "value", value };
  }
  if (descriptor.kind === InteractionTargetKind.Region) {
    return { kind: "value", value: readRegionVerticalPosition(descriptor.node) };
  }
  if (descriptor.kind === InteractionTargetKind.Cell) {
    return {
      kind: "value",
      value: readGridCellVerticalPosition(descriptor.node.attrs["verticalPosition"]),
    };
  }
  if (
    descriptor.kind === InteractionTargetKind.Section &&
    isActiveBoundedContainerAtPosition({
      blockDefinitions,
      containerType: "section",
      doc,
      pos: descriptor.pos,
    })
  ) {
    const parsed = VerticalContentPositionSchema.safeParse(
      descriptor.node.attrs["verticalPosition"],
    );
    return { kind: "value", value: parsed.success ? parsed.data : "top" };
  }
  return unavailable;
}

function aggregateGridCellVerticalPositions(
  grid: StructuralChromeTargetDescriptor["node"],
): AlignmentAxisState<VerticalContentPosition> {
  let value: GridCellVerticalPosition | null = null;

  for (let index = 0; index < grid.childCount; index += 1) {
    const cell = grid.child(index);
    if (cell.type.name !== "cell") return unavailable;
    const next = readGridCellVerticalPosition(cell.attrs["verticalPosition"]);
    if (value === null) {
      value = next;
    } else if (next !== value) {
      return { kind: "indeterminate", reason: "mixed" };
    }
  }

  return value === null ? unavailable : { kind: "value", value };
}

function readGridCellVerticalPosition(value: unknown): GridCellVerticalPosition {
  return isGridCellVerticalPosition(value) ? value : "top";
}

function isOwnedHorizontalStructuralTarget(
  kind: InteractionTargetRef["kind"],
): kind is
  | typeof InteractionTargetKind.Region
  | typeof InteractionTargetKind.Cell
  | typeof InteractionTargetKind.Section
  | typeof InteractionTargetKind.Surface {
  return (
    kind === InteractionTargetKind.Region ||
    kind === InteractionTargetKind.Cell ||
    kind === InteractionTargetKind.Section ||
    kind === InteractionTargetKind.Surface
  );
}

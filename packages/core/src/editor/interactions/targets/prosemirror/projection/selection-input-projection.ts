import type { Selection } from "@tiptap/pm/state";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { resolveCourseSelectionProjection } from "@/editor/selection/course-selection-projection";
import { CourseSelectionMode } from "@/editor/selection/selection-facts";

import {
  InteractionSelectionMode,
  type InteractionSelectionMode as InteractionSelectionModeValue,
  type InteractionSelectionState,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";
import { projectBlockTargetRef } from "./target-ref-projection";

export function projectInteractionSelectionInput(
  selection: Selection,
  blockDefinitions: BlockDefinitionLookup,
): InteractionSelectionState {
  const projection = resolveCourseSelectionProjection(selection, blockDefinitions);

  return {
    mode: mapSelectionMode(projection.facts.selectionMode),
    objectSelectedTarget: projection.objectSelectedBlock
      ? projectBlockTargetRef(projection.objectSelectedBlock)
      : null,
    range: {
      empty: projection.facts.empty,
      from: projection.facts.range.from,
      to: projection.facts.range.to,
    },
  };
}

export function projectSelectionOwnerTarget(
  selection: Selection,
  blockDefinitions: BlockDefinitionLookup,
): InteractionTargetRef | null {
  const { selectionOwnerBlock } = resolveCourseSelectionProjection(selection, blockDefinitions);
  return selectionOwnerBlock ? projectBlockTargetRef(selectionOwnerBlock) : null;
}

function mapSelectionMode(mode: CourseSelectionMode): InteractionSelectionModeValue {
  switch (mode) {
    case CourseSelectionMode.AllSelection:
      return InteractionSelectionMode.AllSelection;
    case CourseSelectionMode.NodeSelection:
      return InteractionSelectionMode.NodeSelection;
    case CourseSelectionMode.OtherSelection:
      return InteractionSelectionMode.OtherSelection;
    case CourseSelectionMode.TextCaret:
      return InteractionSelectionMode.TextCaret;
    case CourseSelectionMode.TextRange:
      return InteractionSelectionMode.TextRange;
  }
}

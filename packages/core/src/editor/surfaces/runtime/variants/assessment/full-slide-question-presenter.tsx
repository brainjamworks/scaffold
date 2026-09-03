import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { SURFACE_CATEGORISE_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-categorise-question-node";
import { SURFACE_DROPDOWN_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-dropdown-question-node";
import { SURFACE_DRAG_DROP_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-drag-drop-question-node";
import { SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-fill-blanks-question-node";
import { SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-image-hotspot-question-node";
import { SURFACE_MATCHING_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-matching-question-node";
import { SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-multiple-choice-question-node";
import { SURFACE_MULTISELECT_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-multiselect-question-node";
import { SURFACE_SEQUENCING_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-sequencing-question-node";

import { CategoriseFullSlideQuestionPresenter } from "../../../variants/slide-categorise-question/runtime";
import { DropdownFullSlideQuestionPresenter } from "../../../variants/slide-dropdown-question/runtime";
import { DragDropFullSlideQuestionPresenter } from "./slide-drag-drop-question";
import { FillBlanksFullSlideQuestionPresenter } from "./slide-fill-blanks-question";
import { ImageHotspotFullSlideQuestionPresenter } from "../../../variants/slide-image-hotspot-question/runtime";
import { MatchingFullSlideQuestionPresenter } from "../../../variants/slide-matching-question/runtime";
import { MultipleChoiceFullSlideQuestionPresenter } from "./slide-multiple-choice-question";
import { MultiselectFullSlideQuestionPresenter } from "./slide-multiselect-question";
import { SequencingFullSlideQuestionPresenter } from "../../../variants/slide-sequencing-question/runtime";

interface FullSlideQuestionPresenterProps {
  readonly editor: Editor;
  readonly question: ProseMirrorNode;
  readonly visible: boolean;
}

/**
 * Presentation registry only: each family retains its own projection, codec,
 * runtime registration and Course interaction component.
 */
export function FullSlideQuestionPresenter({
  editor,
  question,
  visible,
}: FullSlideQuestionPresenterProps) {
  const props = { editor, question, visible };
  switch (question.type.name) {
    case SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE:
      return <MultipleChoiceFullSlideQuestionPresenter {...props} />;
    case SURFACE_MULTISELECT_QUESTION_NODE_TYPE:
      return <MultiselectFullSlideQuestionPresenter {...props} />;
    case SURFACE_DROPDOWN_QUESTION_NODE_TYPE:
      return <DropdownFullSlideQuestionPresenter {...props} />;
    case SURFACE_DRAG_DROP_QUESTION_NODE_TYPE:
      return <DragDropFullSlideQuestionPresenter {...props} />;
    case SURFACE_FILL_BLANKS_QUESTION_NODE_TYPE:
      return <FillBlanksFullSlideQuestionPresenter {...props} />;
    case SURFACE_CATEGORISE_QUESTION_NODE_TYPE:
      return <CategoriseFullSlideQuestionPresenter {...props} />;
    case SURFACE_SEQUENCING_QUESTION_NODE_TYPE:
      return <SequencingFullSlideQuestionPresenter {...props} />;
    case SURFACE_MATCHING_QUESTION_NODE_TYPE:
      return <MatchingFullSlideQuestionPresenter {...props} />;
    case SURFACE_IMAGE_HOTSPOT_QUESTION_NODE_TYPE:
      return <ImageHotspotFullSlideQuestionPresenter {...props} />;
    default:
      throw new Error(`Quiz cannot present unsupported question type "${question.type.name}".`);
  }
}

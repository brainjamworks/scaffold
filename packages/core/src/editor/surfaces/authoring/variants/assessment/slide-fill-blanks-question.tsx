import { BracketsCurlyIcon as BracketsCurly } from "@phosphor-icons/react";
import { useEditorState } from "@tiptap/react";

import {
  applyFillBlankToEditor,
  canApplyFillBlankToEditor,
} from "@/editor/blocks/assessment/fill-blanks/commands";
import { Button } from "@/ui/components/Button/Button";
import { iconXs } from "@/ui/tokens/icon-sizes";

import "../../../view/variants/assessment/slide-fill-blanks-question.css";
import type { SurfaceAuthoringViewProps } from "../../surface-authoring-view-registry";
import { AssessmentSlideSurfaceAuthoringFrame } from "../../views/AssessmentSlideSurfaceAuthoringFrame";

export function SlideFillBlanksQuestionSurfaceAuthoringView(props: SurfaceAuthoringViewProps) {
  const canCreateBlank = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => canApplyFillBlankToEditor(editor),
  });

  return (
    <AssessmentSlideSurfaceAuthoringFrame
      {...props}
      variantClassName="sc-fill-blanks-slide-surface-view sc-fill-blanks-slide-surface-authoring-view sc-slide-fill-blanks-question-surface-view sc-slide-fill-blanks-question-surface-authoring-view"
    >
      <div className="sc-app-fill-blanks-slide__authoring-actions" contentEditable={false}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="sc-app-fill-blanks-slide__create-blank"
          disabled={!canCreateBlank}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyFillBlankToEditor(props.editor)}
        >
          <BracketsCurly size={iconXs} weight="bold" aria-hidden />
          <span>Create blank</span>
        </Button>
      </div>
    </AssessmentSlideSurfaceAuthoringFrame>
  );
}

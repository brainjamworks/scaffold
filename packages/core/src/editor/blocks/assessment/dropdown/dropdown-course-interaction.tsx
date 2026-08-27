import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";

import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { assessmentPromptDomId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";

import {
  describeDropdownAccessibilityState,
  type DropdownChoiceState,
} from "./dropdown-choice-shared";
import type { DropdownCourseContent } from "./dropdown-course-content";
import { DropdownCourseSelect, type DropdownCourseOption } from "./DropdownCourseSelect";

export interface DropdownCourseInteractionProps {
  readonly assessmentTargetId: string | null | undefined;
  readonly content: DropdownCourseContent;
  readonly presentation: "inline" | "full-slide";
  readonly promptHasText: boolean;
}

/** Dropdown-specific Course presenter shared by inline and Surface adapters. */
export function DropdownCourseInteraction({
  assessmentTargetId,
  content,
  presentation,
  promptHasText,
}: DropdownCourseInteractionProps) {
  const assessment = useAssessmentRuntimeById(assessmentTargetId, "single-select");
  const dropdown = assessment?.interaction.kind === "single-select" ? assessment.interaction : null;
  const selectedId = dropdown?.selectedIds[0] ?? "";
  const problem = assessment?.problem ?? null;
  const answerKeyVisible = problem?.answerKeyVisible ?? false;
  const selectedChoice = content.choices.find((choice) => choice.id === selectedId) ?? null;
  const state = selectedChoice && dropdown ? dropdown.stateFor(selectedChoice.id) : null;
  const locked = problem?.interactionLocked ?? false;
  const placeholder = problem?.state.placeholder || "Select...";
  const label = problem?.state.legend.trim() ?? "";
  const promptId = assessmentPromptDomId(assessmentTargetId ?? null);
  const showFeedback = Boolean(
    selectedChoice &&
    dropdown &&
    (problem?.state.submitted ||
      answerKeyVisible ||
      (problem?.state.feedbackMode === "immediate" && problem.feedbackResult)),
  );
  const selectedFeedback = AssessmentFeedbackContentSchema.safeParse(
    selectedChoice ? assessment?.feedback.items?.[selectedChoice.id]?.feedback : null,
  );
  const accessibilityDescription = describeDropdownAccessibilityState({
    hasFeedback: showFeedback && selectedFeedback.success,
    selected: selectedChoice !== null,
    state: state as DropdownChoiceState,
    submitted: problem?.state.submitted ?? false,
  });
  const correctChoiceId = answerKeyVisible
    ? (dropdown?.revealedSelectedId ??
      content.choices.find((choice) => dropdown?.stateFor(choice.id) === "missed")?.id ??
      (state === "correct" ? selectedId : null))
    : null;
  const correctChoice = content.choices.find((choice) => choice.id === correctChoiceId) ?? null;
  const correctFeedback = AssessmentFeedbackContentSchema.safeParse(
    correctChoice ? assessment?.feedback.items?.[correctChoice.id]?.feedback : null,
  );
  const immediateResult =
    problem?.state.feedbackMode === "immediate" ? (problem.feedbackResult ?? null) : null;
  const immediateAnnouncement = immediateResult
    ? `Answer checked. ${immediateResult.isCorrect ? "Correct." : "Incorrect."}${
        selectedFeedback.success ? " Feedback available." : ""
      }`
    : null;
  const options: DropdownCourseOption[] = content.choices.map((choice) => ({
    id: choice.id,
    text: choice.text,
    content: renderChoiceContent(choice),
  }));

  return (
    <div className="sc-course-dropdown-interaction" data-dropdown-presentation={presentation}>
      <div className="sc-course-dropdown-interaction__focal">
        <DropdownCourseSelect
          accessibilityDescription={accessibilityDescription}
          correctAnswer={
            correctChoice
              ? {
                  content: renderChoiceContent(correctChoice),
                  ...(correctChoice.id !== selectedChoice?.id && correctFeedback.success
                    ? {
                        feedbackControl: (
                          <RichFeedbackRuntimePopover feedback={correctFeedback.data} />
                        ),
                      }
                    : {}),
                }
              : null
          }
          disabled={locked}
          feedbackControl={
            showFeedback && selectedFeedback.success ? (
              <RichFeedbackRuntimePopover feedback={selectedFeedback.data} />
            ) : null
          }
          immediateAnnouncement={immediateAnnouncement}
          label={label}
          name={problem?.state.responseName}
          onValueChange={(next) => dropdown?.select(next)}
          options={options}
          placeholder={placeholder}
          promptHasText={promptHasText}
          promptId={promptId}
          state={state}
          value={selectedId}
        />
      </div>
    </div>
  );
}

function renderChoiceContent(choice: DropdownCourseContent["choices"][number]) {
  return choice.html ? (
    <span
      className="sc-course-dropdown-select__option-content"
      dangerouslySetInnerHTML={{ __html: choice.html }}
    />
  ) : (
    choice.text
  );
}

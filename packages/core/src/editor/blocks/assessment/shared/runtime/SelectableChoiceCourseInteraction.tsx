import { assessmentPromptDomId } from "@/editor/assessment/shared/model/assessment-prosemirror";
import { BoundedScrollHint } from "@/editor/bounded-containers/view/bounded-scroll";

import { describeMultiSelectLimitState } from "./assessment-interaction-runtime";
import { SelectableChoiceCourseOption } from "./SelectableChoiceCourseOption";
import type { SelectableChoiceCourseContent } from "./selectable-choice-course-content";
import { useAssessmentRuntimeById } from "./use-assessment-runtime";

export interface SelectableChoiceCourseInteractionProps {
  readonly assessmentTargetId: string | null | undefined;
  readonly content: SelectableChoiceCourseContent;
  readonly interactionKind: "single-select" | "multi-select";
  readonly presentation: "inline" | "full-slide";
}

export function SelectableChoiceCourseInteraction({
  assessmentTargetId,
  content,
  interactionKind,
  presentation,
}: SelectableChoiceCourseInteractionProps) {
  const assessment = useAssessmentRuntimeById(assessmentTargetId, interactionKind);
  const legend = assessment?.problem?.state.legend.trim() ?? "";
  const promptId = assessmentPromptDomId(assessmentTargetId ?? null);
  const density = choiceDensity(content.choices.length);
  const multiselect =
    assessment?.interaction.kind === "multi-select" ? assessment.interaction : null;
  const selectionGuidance =
    multiselect?.maxSelections === null || multiselect?.maxSelections === undefined
      ? null
      : `Choose up to ${multiselect.maxSelections} answers.`;
  const limitStatus = multiselect
    ? describeMultiSelectLimitState({
        maxSelections: multiselect.maxSelections,
        selectedCount: multiselect.selectedCount,
      })
    : null;
  const familyClass =
    interactionKind === "single-select"
      ? "sc-course-mcq-interaction"
      : "sc-course-multiselect-interaction";

  return (
    <div
      {...(presentation === "full-slide" ? { "data-bounded-scroll-frame": "" } : {})}
      data-selectable-choice-presentation={presentation}
      {...(interactionKind === "single-select"
        ? { "data-mcq-presentation": presentation }
        : { "data-multiselect-presentation": presentation })}
      className={`sc-course-selectable-choice-interaction ${familyClass}`}
    >
      <div
        {...(presentation === "full-slide" ? { "data-bounded-scroll": "" } : {})}
        data-selectable-choice-scroll=""
        {...(interactionKind === "single-select" ? { "data-mcq-choice-scroll": "" } : {})}
        className={`sc-course-selectable-choice-interaction__viewport ${familyClass}__viewport`}
      >
        <fieldset
          className={`sc-course-selectable-choice-interaction__fieldset ${familyClass}__fieldset`}
          aria-labelledby={legend ? undefined : promptId}
        >
          {legend ? (
            <legend
              className={`sc-course-selectable-choice-interaction__legend ${familyClass}__legend${presentation === "full-slide" ? " sc-sr-only" : ""}`}
            >
              {legend}
            </legend>
          ) : null}
          {selectionGuidance ? (
            <p className="sc-course-selectable-choice-interaction__guidance">{selectionGuidance}</p>
          ) : null}
          {limitStatus ? (
            <p
              className="sc-course-selectable-choice-interaction__limit-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {limitStatus}
            </p>
          ) : null}
          <div
            data-selectable-choice-count={String(content.choices.length)}
            data-selectable-choice-density={density}
            {...(interactionKind === "single-select"
              ? {
                  "data-mcq-choice-count": String(content.choices.length),
                  "data-mcq-choice-density": density,
                }
              : {
                  "data-multiselect-choice-count": String(content.choices.length),
                  "data-multiselect-choice-density": density,
                })}
            className={`sc-course-selectable-choice-interaction__list ${familyClass}__list`}
          >
            {content.choices.map((choice, index) => (
              <SelectableChoiceCourseOption
                key={choice.id}
                assessmentTargetId={assessmentTargetId}
                choiceId={choice.id}
                choiceText={choice.label}
                fallbackChoiceLabel={`Choice ${index + 1}`}
                {...(presentation === "full-slide" ? { ordinal: optionOrdinal(index) } : {})}
              >
                <div
                  className={`sc-course-selectable-choice-interaction__choice-content ${familyClass}__choice-content`}
                  dangerouslySetInnerHTML={{ __html: choice.html }}
                />
              </SelectableChoiceCourseOption>
            ))}
          </div>
        </fieldset>
      </div>
      {presentation === "full-slide" ? <BoundedScrollHint /> : null}
    </div>
  );
}

function choiceDensity(count: number): "sparse" | "standard" | "dense" {
  if (count <= 2) return "sparse";
  if (count >= 6) return "dense";
  return "standard";
}

function optionOrdinal(index: number): string {
  let value = index + 1;
  let ordinal = "";

  while (value > 0) {
    value -= 1;
    ordinal = String.fromCharCode(65 + (value % 26)) + ordinal;
    value = Math.floor(value / 26);
  }

  return ordinal;
}

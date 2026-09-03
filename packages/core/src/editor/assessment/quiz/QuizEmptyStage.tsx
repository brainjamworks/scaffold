import type { InsertAction } from "@/editor/insertion/insert-action";
import { useId } from "react";

/**
 * Authoring view when the quiz has zero questions. Renders the
 * full question-type picker as a grid of cards (icon + title + 1-line
 * description). Distinct from the `+ Add` popover in the strip, which
 * reuses the same items in a more compact layout.
 */
export function QuizEmptyStage({
  items,
  onAdd,
}: {
  items: readonly InsertAction[];
  onAdd: (item: InsertAction) => void;
}) {
  const titleId = useId();

  return (
    <div
      className="sc-app-quiz__empty"
      contentEditable={false}
      data-testid="quiz-add-question-stage"
    >
      <p id={titleId} className="sc-app-quiz__empty-title">
        Pick a question type
      </p>
      <div className="sc-app-quiz__empty-grid" role="group" aria-labelledby={titleId}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className="sc-app-quiz__empty-card"
              onClick={() => onAdd(item)}
            >
              <span className="sc-app-quiz__empty-card-icon" aria-hidden>
                <Icon size={16} weight="regular" />
              </span>
              <span className="sc-app-quiz__empty-card-title">{item.title}</span>
              <span className="sc-app-quiz__empty-card-desc">{item.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

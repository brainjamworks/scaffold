import type { InsertAction } from "@/editor/insertion/insert-action";

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
  return (
    <div className="sc-quiz__empty" contentEditable={false} data-testid="quiz-add-question-stage">
      <h3 className="sc-quiz__empty-title">Pick a question type</h3>
      <div className="sc-quiz__empty-grid">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className="sc-quiz__empty-card"
              onClick={() => onAdd(item)}
            >
              <span className="sc-quiz__empty-card-icon" aria-hidden>
                <Icon size={16} weight="regular" />
              </span>
              <span className="sc-quiz__empty-card-title">{item.title}</span>
              <span className="sc-quiz__empty-card-desc">{item.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

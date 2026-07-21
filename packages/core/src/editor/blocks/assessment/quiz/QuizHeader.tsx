import { ListChecksIcon as ListChecks } from "@phosphor-icons/react";
import { type ReactNode } from "react";

/**
 * Top strip of the quiz card. Brand mark + meta (`Quiz · N
 * questions · X pts`) on the left; timer (when active) on the right.
 * No actions live here — quiz-level chrome (settings / duplicate /
 * delete) is delivered through the standard block bubble menu.
 */
export function QuizHeader({
  count,
  points,
  timer,
}: {
  count: number;
  points: number;
  timer: ReactNode;
}) {
  return (
    <header className="sc-quiz__header" contentEditable={false}>
      <div className="sc-quiz__brand">
        <span className="sc-quiz__brand-mark" aria-hidden>
          <ListChecks size={16} weight="regular" />
        </span>
        <span className="sc-quiz__brand-label">Quiz</span>
        <span className="sc-quiz__brand-meta">
          <span className="sc-quiz__brand-sep">·</span>
          <span className="sc-quiz__brand-count">
            {count === 1 ? "1 question" : `${count} questions`}
          </span>
          {points > 0 ? (
            <>
              <span className="sc-quiz__brand-sep">·</span>
              <span className="sc-quiz__brand-points">
                {points} {points === 1 ? "pt" : "pts"}
              </span>
            </>
          ) : null}
        </span>
      </div>
      {timer ? <div className="sc-quiz__header-actions">{timer}</div> : null}
    </header>
  );
}

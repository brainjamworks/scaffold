import { LightbulbIcon as Lightbulb, TrashIcon as Trash } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { iconSm, iconXs } from "@/ui/tokens/icon-sizes";

import "./assessment-hints.css";

interface HintItemProps {
  /** 1-based hint index. */
  index: number;
  /** Author mode. Author: always visible + trash on hover. Runtime:
   *  visible only when `index <= hintsShown`. */
  isEditable: boolean;
  /** Reveal-counter passed by the parent bridge. Author mode ignores it. */
  hintsShown: number;
  /** Author-mode delete. */
  onDelete: () => void;
  /** Author-mode compact trigger + popover editor. */
  popoverEditor?: ReactNode;
  /** Content slot — NodeViewContent (author) or static HTML (runtime). */
  children?: ReactNode;
}

/**
 * Single hint banner. Same chrome both modes; visibility branches by
 * isEditable + hintsShown.
 *
 * Soft-pattern surface: warning tint + 1.5px warning border + ink
 * text — same "colour-as-signal" treatment as the choice rows.
 */
export function HintItem({
  index,
  isEditable,
  hintsShown,
  onDelete,
  popoverEditor,
  children,
}: HintItemProps) {
  if (!isEditable && index > hintsShown) return null;

  const body = popoverEditor ? (
    <div className="sc-assessment-hint__body sc-assessment-hint__body--compact">
      {popoverEditor}
    </div>
  ) : (
    <div className="sc-assessment-hint__body">
      <div className="sc-assessment-hint__title">Hint {index}</div>
      <div className="sc-assessment-hint__content">{children}</div>
    </div>
  );

  return (
    <div
      className={
        popoverEditor ? "sc-assessment-hint sc-assessment-hint--compact" : "sc-assessment-hint"
      }
    >
      <span className="sc-assessment-hint__icon" aria-hidden>
        <Lightbulb size={iconXs} weight="fill" />
      </span>
      {body}
      {isEditable && !popoverEditor && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete hint ${index}`}
          className="sc-assessment-hint__delete"
        >
          <Trash size={iconSm} />
        </button>
      )}
    </div>
  );
}

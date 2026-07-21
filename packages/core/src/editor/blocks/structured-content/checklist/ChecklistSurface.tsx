import type { ReactNode } from "react";

export interface ChecklistProgress {
  completed: number;
  total: number;
}

export interface ChecklistResetAction {
  label: string;
  onClick: () => void;
  text: string;
}

export function ChecklistSection({
  children,
  listEnd,
  progress,
  resetAction,
}: {
  children: ReactNode;
  listEnd?: ReactNode;
  progress?: ChecklistProgress | null;
  resetAction?: ChecklistResetAction | null;
}) {
  const showHeader = Boolean(progress || resetAction);

  return (
    <section className="sc-checklist__section" aria-label="Checklist">
      {showHeader ? (
        <header contentEditable={false} className="sc-checklist__header">
          {progress ? (
            <span className="sc-checklist__progress">
              <span className="sc-checklist__progress-count">{progress.completed}</span>
              <span className="sc-checklist__progress-divider">/</span>
              <span className="sc-checklist__progress-total">{progress.total}</span>
              <span className="sc-checklist__progress-label">complete</span>
            </span>
          ) : (
            <span />
          )}
          {resetAction ? (
            <button
              type="button"
              className="sc-checklist__reset"
              onClick={resetAction.onClick}
              aria-label={resetAction.label}
            >
              {resetAction.text}
            </button>
          ) : null}
        </header>
      ) : null}

      <ul role="list" className="sc-checklist__list">
        {children}
        {listEnd ?? null}
      </ul>
    </section>
  );
}

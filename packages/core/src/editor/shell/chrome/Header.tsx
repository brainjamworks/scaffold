import { type ReactNode } from "react";

import { Wordmark } from "@/ui/components/Mark/Mark";
import { Pill, type PillVariant } from "@/ui/components/Pill/Pill";
import "./Header.css";

interface HeaderProps {
  /** Document title — editable. Persistence is adapter-side via port. */
  title: string;
  onTitleChange: (next: string) => void;
  /** Optional left slot (brand mark / logo lockup). */
  brand?: ReactNode;
  /** Optional right-aligned slot (share, present, settings, account). */
  actions?: ReactNode;
  /** Save state indicator — renders as a JetBrains Mono pill. */
  saveState?: "idle" | "saving" | "saved" | "error";
}

const SAVE_LABEL: Record<NonNullable<HeaderProps["saveState"]>, string> = {
  idle: "",
  saving: "Saving",
  saved: "Saved",
  error: "Save failed",
};

/* Triple-in-reserve mapping: saving stays neutral, saved uses the
 * affirmation teal pair, error uses the destructive coral pair. */
const SAVE_VARIANT: Record<NonNullable<HeaderProps["saveState"]>, PillVariant> = {
  idle: "neutral",
  saving: "neutral",
  saved: "success",
  error: "error",
};

export function Header({ title, onTitleChange, brand, actions, saveState = "idle" }: HeaderProps) {
  const saveLabel = SAVE_LABEL[saveState];

  return (
    <header className="sc-editor-header">
      <div className="sc-editor-header-inner">
        <div className="sc-editor-header-brand">
          {brand ?? <Wordmark surface="light" markSize={24} />}
        </div>

        <span aria-hidden="true" className="sc-editor-header-divider" />

        <input
          id="scaffold-document-title"
          name="scaffold-document-title"
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled"
          aria-label="Document title"
          className="sc-editor-header-title"
        />

        {saveLabel && (
          <Pill
            variant={SAVE_VARIANT[saveState]}
            size="md"
            tabular
            case="upper"
            className="sc-editor-header-save-pill"
            aria-live="polite"
          >
            {saveState === "saving" && (
              <span aria-hidden="true" className="sc-editor-header-save-dot" />
            )}
            {saveLabel}
          </Pill>
        )}

        {actions && <div className="sc-editor-header-actions">{actions}</div>}
      </div>
    </header>
  );
}

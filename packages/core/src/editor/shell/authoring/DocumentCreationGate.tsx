import type { CourseMode } from "@/schemas/course-document";

import "./DocumentCreationGate.css";

export type DocumentCreationMode = Extract<CourseMode, "page" | "slideshow">;
export type DocumentCreationState = "idle" | "creating" | "error";

export interface DocumentCreationGateProps {
  onCreate: (mode: DocumentCreationMode) => void;
  state: DocumentCreationState;
}

const DOCUMENT_CREATION_MODES: Array<{
  mode: DocumentCreationMode;
  label: string;
  actionLabel: string;
  description: string;
  note?: string;
}> = [
  {
    mode: "page",
    label: "Page",
    actionLabel: "Create page",
    description: "Create a scrolling lesson with text, media, and assessments.",
  },
  {
    mode: "slideshow",
    label: "Slideshow (Beta)",
    actionLabel: "Create slideshow (beta)",
    description: "Create a presentation with a sequence of slides.",
    note: "Slideshow is currently in beta. You can use it now, but features and layouts may change.",
  },
];

export function DocumentCreationGate({ onCreate, state }: DocumentCreationGateProps) {
  const disabled = state === "creating";

  return (
    <div className="sc-document-creation-gate" data-testid="document-creation-gate">
      <section
        aria-labelledby="sc-document-creation-gate-title"
        aria-modal="true"
        className="sc-document-creation-gate__dialog"
        role="dialog"
      >
        <div className="sc-document-creation-gate__header">
          <h2 id="sc-document-creation-gate-title">Create document</h2>
          <p className="sc-document-creation-gate__intro">
            Choose how learners will move through your content.
          </p>
        </div>

        <div className="sc-document-creation-gate__options">
          {DOCUMENT_CREATION_MODES.map((option) => (
            <button
              aria-describedby={`sc-document-creation-gate-${option.mode}-description`}
              aria-label={option.actionLabel}
              className="sc-document-creation-gate__option"
              disabled={disabled}
              key={option.mode}
              onClick={() => onCreate(option.mode)}
              type="button"
            >
              <span className="sc-document-creation-gate__option-label">{option.label}</span>
              <span
                className="sc-document-creation-gate__option-description"
                id={`sc-document-creation-gate-${option.mode}-description`}
              >
                <span>{option.description}</span>
                {option.note ? (
                  <span className="sc-document-creation-gate__option-note">{option.note}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>

        {state === "creating" ? (
          <p className="sc-document-creation-gate__status" role="status">
            Creating document...
          </p>
        ) : null}

        {state === "error" ? (
          <p className="sc-document-creation-gate__error" role="alert">
            Document could not be created. Try again.
          </p>
        ) : null}
      </section>
    </div>
  );
}

import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react";

import type { CourseMode } from "@/schemas/course-document";
import { Pill } from "@/ui/components/app/Pill/Pill";

import "./DocumentCreationGate.css";

export type DocumentCreationMode = Extract<CourseMode, "page" | "slideshow">;
export type DocumentCreationState = "idle" | "creating" | "error";
export type DocumentCreationRequest = { readonly mode: DocumentCreationMode };

export interface DocumentCreationGateProps {
  onCreate: (request: DocumentCreationRequest) => void;
  state: DocumentCreationState;
}

const DOCUMENT_CREATION_MODES: Array<{
  mode: DocumentCreationMode;
  label: string;
  actionLabel: string;
  description: string;
  badge?: string;
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
    label: "Slideshow",
    actionLabel: "Create slideshow (beta)",
    description: "Create a presentation with a sequence of slides.",
    badge: "Beta",
    note: "Slideshow is currently in beta. You can use it now, but features and layouts may change.",
  },
];

export function DocumentCreationGate({ onCreate, state }: DocumentCreationGateProps) {
  const disabled = state === "creating";

  return (
    <main
      aria-labelledby="sc-document-creation-gate-title"
      className="sc-document-creation-gate"
      data-testid="document-creation-gate"
    >
      <section className="sc-document-creation-gate__content">
        <div className="sc-document-creation-gate__header">
          <h1 id="sc-document-creation-gate-title">Choose a format</h1>
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
              data-mode={option.mode}
              disabled={disabled}
              key={option.mode}
              onClick={() => onCreate({ mode: option.mode })}
              type="button"
            >
              <DocumentFormatPreview mode={option.mode} />
              <span className="sc-document-creation-gate__option-copy">
                <span className="sc-document-creation-gate__option-heading">
                  <span className="sc-document-creation-gate__option-label">{option.label}</span>
                  {option.badge ? (
                    <Pill size="sm" variant="neutral">
                      {option.badge}
                    </Pill>
                  ) : null}
                </span>
                <span
                  className="sc-document-creation-gate__option-description"
                  id={`sc-document-creation-gate-${option.mode}-description`}
                >
                  <span>{option.description}</span>
                  {option.note ? (
                    <span className="sc-document-creation-gate__option-note">{option.note}</span>
                  ) : null}
                </span>
              </span>
              <ArrowRight
                aria-hidden
                className="sc-document-creation-gate__option-arrow"
                size={20}
              />
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
    </main>
  );
}

function DocumentFormatPreview({ mode }: { mode: DocumentCreationMode }) {
  return (
    <span aria-hidden className="sc-document-creation-gate__format-preview" data-mode={mode}>
      {mode === "page" ? (
        <span className="sc-document-creation-gate__page-sheet">
          <span />
          <span />
          <span />
          <span />
        </span>
      ) : (
        <span className="sc-document-creation-gate__slide-frame">
          <span className="sc-document-creation-gate__slide-title" />
          <span className="sc-document-creation-gate__slide-columns">
            <span />
            <span />
          </span>
          <span className="sc-document-creation-gate__slide-progress" />
        </span>
      )}
    </span>
  );
}

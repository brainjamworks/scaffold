import { normalizeControlDefinition, type ControlDefinition } from "@/document/control-binding";

const definition = normalizeControlDefinition({
  owner: {
    events: [
      { type: "evaluated", label: "Answer evaluated" },
      { type: "submitted", label: "Answer submitted" },
    ],
    states: [
      {
        key: "phase",
        label: "Phase",
        valueType: {
          kind: "enum",
          options: [
            { value: "unanswered", label: "Unanswered" },
            { value: "ready", label: "Ready" },
            { value: "evaluated", label: "Evaluated" },
            { value: "submitted", label: "Submitted" },
          ],
        },
      },
      {
        key: "result",
        label: "Result",
        valueType: {
          kind: "enum",
          options: [
            { value: "ungraded", label: "Ungraded" },
            { value: "correct", label: "Correct" },
            { value: "incorrect", label: "Incorrect" },
          ],
        },
      },
    ],
  },
} satisfies ControlDefinition);

if (!definition) {
  throw new Error("Assessment Control Definition must not normalize to empty.");
}

/** Shared root-only vocabulary for public assessment owners. */
export const assessmentControlDefinition = definition;

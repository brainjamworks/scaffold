import { normalizeControlDefinition, type ControlDefinition } from "@/document/control-binding";

const definition = normalizeControlDefinition({
  owner: {
    events: [
      { type: "started", label: "Quiz started" },
      { type: "finished", label: "Quiz finished" },
    ],
    states: [
      {
        key: "status",
        label: "Status",
        valueType: {
          kind: "enum",
          options: [
            { value: "not-started", label: "Not started" },
            { value: "in-progress", label: "In progress" },
            { value: "completed", label: "Completed" },
            { value: "expired", label: "Expired" },
          ],
        },
      },
      {
        key: "outcome",
        label: "Outcome",
        valueType: {
          kind: "enum",
          options: [
            { value: "unavailable", label: "Unavailable" },
            { value: "passed", label: "Passed" },
            { value: "failed", label: "Failed" },
          ],
        },
      },
    ],
  },
} satisfies ControlDefinition);

if (!definition) {
  throw new Error("Quiz Control Definition must not normalize to empty.");
}

/** Root-only observation vocabulary for one runtime Quiz. */
export const quizControlDefinition = definition;

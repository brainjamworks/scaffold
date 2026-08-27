import { describe, expect, it } from "vite-plus/test";

import { quizBlockDefinition } from "./quiz-definition";

describe("Quiz Control Definition", () => {
  it("advertises only the approved root lifecycle observations", () => {
    expect(quizBlockDefinition.control).toEqual({
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
    });
    expect(quizBlockDefinition.control?.owner?.commands).toBeUndefined();
    expect(quizBlockDefinition.control?.semanticChildren).toBeUndefined();
  });
});

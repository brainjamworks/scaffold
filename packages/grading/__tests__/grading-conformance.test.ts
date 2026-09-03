import { describe, expect, it } from "vite-plus/test";

import {
  AssessmentResponseValueSchema,
  AssessmentResultSchema,
  AssessmentTargetContractSchema,
} from "@scaffold/contracts";

import corpus from "../fixtures/assessment-grading.json" with { type: "json" };
import { gradeAssessment } from "../src/index";

describe("@scaffold/grading assessment conformance corpus", () => {
  expect(corpus.cases).toHaveLength(33);

  for (const testCase of corpus.cases) {
    it(testCase.id, () => {
      const target = AssessmentTargetContractSchema.parse(testCase.target);
      const response = AssessmentResponseValueSchema.parse(testCase.response);
      const expected = AssessmentResultSchema.parse(testCase.expected);
      const actual = AssessmentResultSchema.parse(gradeAssessment(target, response));

      expect(actual.score).toEqual(expected.score);
      expect(actual.isCorrect).toBe(expected.isCorrect);
      expect(actual.feedback).toEqual(expected.feedback);
      expect(actual.items).toEqual(expected.items);
    });
  }
});

import { EmbeddedDataIdSchema, EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  validateLearnerInteractionRuleDraft,
  type LearnerInteractionRuleDraft,
} from "./learner-interaction-rule-draft";

const RULE_ID = EmbeddedDataIdSchema.parse("rule00000001");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");

describe("validateLearnerInteractionRuleDraft", () => {
  it("reports each permitted structurally incomplete state as plain typed data", () => {
    const draft: LearnerInteractionRuleDraft = {
      ruleId: null,
      isEnabled: true,
      when: null,
      conditions: [],
      commands: [],
    };

    expect(validateLearnerInteractionRuleDraft(draft)).toEqual([
      { reason: "when-required" },
      { reason: "then-required" },
    ]);
  });

  it("accepts a complete draft without changing its existing rule identity", () => {
    const draft: LearnerInteractionRuleDraft = {
      ruleId: RULE_ID,
      isEnabled: false,
      when: { targetId: TARGET_ID, type: "selected" },
      conditions: [{ targetId: TARGET_ID, key: "ready", operator: "equals", value: true }],
      commands: [{ kind: "reveal-target", targetId: TARGET_ID }],
    };

    expect(validateLearnerInteractionRuleDraft(draft)).toEqual([]);
    expect(draft.ruleId).toBe(RULE_ID);
  });
});

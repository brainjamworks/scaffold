import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import {
  ControlCommandReferenceV1Schema,
  ControlEventReferenceV1Schema,
  ControlStatePredicateV1Schema,
  LearnerInteractionConfigurationV1Schema,
  type LearnerInteractionConfigurationV1,
} from "./learner-interaction";

const SURFACE_ID = "surface00001";
const SECOND_SURFACE_ID = "surface00002";
const TARGET_ID = "target000001";
const RULE_ID = "rule00000001";

function validConfiguration() {
  return {
    schemaVersion: 1,
    surfaces: [
      {
        surfaceId: SURFACE_ID,
        rules: [
          {
            id: RULE_ID,
            isEnabled: true,
            when: { targetId: TARGET_ID, type: "selected" },
            conditions: [
              {
                targetId: TARGET_ID,
                key: "selection",
                operator: "equals",
                value: "second",
              },
            ],
            commands: [{ kind: "reveal-target", targetId: TARGET_ID }],
          },
        ],
      },
    ],
  } as const;
}

describe("learner interaction contracts", () => {
  it("parses a complete V1 configuration and preserves its portable shape", () => {
    const parsed = LearnerInteractionConfigurationV1Schema.parse(validConfiguration());

    expect(parsed).toEqual(validConfiguration());
    expectTypeOf(parsed).toEqualTypeOf<LearnerInteractionConfigurationV1>();
  });

  it("accepts every closed V1 command variant in authored order", () => {
    const configuration = validConfiguration();
    const parsed = LearnerInteractionConfigurationV1Schema.parse({
      ...configuration,
      surfaces: [
        {
          ...configuration.surfaces[0],
          rules: [
            {
              ...configuration.surfaces[0].rules[0],
              commands: [
                { kind: "reveal-target", targetId: TARGET_ID },
                {
                  kind: "target-command",
                  command: { targetId: TARGET_ID, type: "select", input: 2 },
                },
                { kind: "navigate-surface", surfaceId: SECOND_SURFACE_ID },
              ],
            },
          ],
        },
      ],
    });

    expect(parsed.surfaces[0]?.rules[0]?.commands.map((command) => command.kind)).toEqual([
      "reveal-target",
      "target-command",
      "navigate-surface",
    ]);
  });

  it("accepts finite primitive event, state and command reference values", () => {
    expect(
      ControlEventReferenceV1Schema.parse({ targetId: TARGET_ID, type: "  selected  " }),
    ).toEqual({ targetId: TARGET_ID, type: "selected" });
    expect(
      ControlStatePredicateV1Schema.parse({
        targetId: TARGET_ID,
        key: " complete ",
        operator: "not-equals",
        value: false,
      }),
    ).toEqual({ targetId: TARGET_ID, key: "complete", operator: "not-equals", value: false });
    expect(
      ControlCommandReferenceV1Schema.parse({
        targetId: TARGET_ID,
        type: " seek ",
        input: 1.5,
      }),
    ).toEqual({ targetId: TARGET_ID, type: "seek", input: 1.5 });
  });

  it("rejects blank capability names and non-finite control values", () => {
    expect(
      ControlEventReferenceV1Schema.safeParse({ targetId: TARGET_ID, type: "  " }).success,
    ).toBe(false);
    expect(
      ControlStatePredicateV1Schema.safeParse({
        targetId: TARGET_ID,
        key: "page",
        operator: "equals",
        value: Number.NaN,
      }).success,
    ).toBe(false);
    expect(
      ControlCommandReferenceV1Schema.safeParse({
        targetId: TARGET_ID,
        type: "seek",
        input: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false);
  });

  it("rejects an empty root, empty Surface group and incomplete rule", () => {
    expect(
      LearnerInteractionConfigurationV1Schema.safeParse({ schemaVersion: 1, surfaces: [] }).success,
    ).toBe(false);
    expect(
      LearnerInteractionConfigurationV1Schema.safeParse({
        schemaVersion: 1,
        surfaces: [{ surfaceId: SURFACE_ID, rules: [] }],
      }).success,
    ).toBe(false);

    const configuration = validConfiguration();
    const rule = configuration.surfaces[0].rules[0];
    const { when: _when, ...withoutWhen } = rule;
    expect(
      LearnerInteractionConfigurationV1Schema.safeParse({
        ...configuration,
        surfaces: [{ surfaceId: SURFACE_ID, rules: [withoutWhen] }],
      }).success,
    ).toBe(false);
    expect(
      LearnerInteractionConfigurationV1Schema.safeParse({
        ...configuration,
        surfaces: [{ surfaceId: SURFACE_ID, rules: [{ ...rule, commands: [] }] }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate Surface IDs at the later deterministic path", () => {
    const configuration = validConfiguration();
    const result = LearnerInteractionConfigurationV1Schema.safeParse({
      ...configuration,
      surfaces: [configuration.surfaces[0], configuration.surfaces[0]],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ["surfaces", 1, "surfaceId"] }),
      );
    }
  });

  it("rejects duplicate rule IDs within a Surface at the later deterministic path", () => {
    const configuration = validConfiguration();
    const rule = configuration.surfaces[0].rules[0];
    const result = LearnerInteractionConfigurationV1Schema.safeParse({
      ...configuration,
      surfaces: [{ surfaceId: SURFACE_ID, rules: [rule, rule] }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ["surfaces", 0, "rules", 1, "id"] }),
      );
    }
  });

  it("allows the same rule ID in different Surface groups", () => {
    const configuration = validConfiguration();

    expect(
      LearnerInteractionConfigurationV1Schema.safeParse({
        ...configuration,
        surfaces: [
          configuration.surfaces[0],
          { ...configuration.surfaces[0], surfaceId: SECOND_SURFACE_ID },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects unknown fields and command kinds", () => {
    const configuration = validConfiguration();
    const rule = configuration.surfaces[0].rules[0];

    expect(
      LearnerInteractionConfigurationV1Schema.safeParse({ ...configuration, cache: {} }).success,
    ).toBe(false);
    expect(
      LearnerInteractionConfigurationV1Schema.safeParse({
        ...configuration,
        surfaces: [
          {
            ...configuration.surfaces[0],
            rules: [{ ...rule, label: "Rule", commands: [{ kind: "delay", durationMs: 100 }] }],
          },
        ],
      }).success,
    ).toBe(false);
  });
});

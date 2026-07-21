import { ArticleIcon } from "@phosphor-icons/react";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import type { ConfigurationDefinition } from "./definition";
import { getQuickControlDescriptorId, type QuickControlDescriptor } from "./quick-menu";
import { deriveQuickMenuDefinition } from "./quick-menu-derivation";

describe("quick menu descriptors", () => {
  it("keeps stable ids for generic descriptor kinds", () => {
    const controls: QuickControlDescriptor[] = [
      { kind: "boolean", name: "isGraded", label: "Graded" },
      {
        kind: "select",
        name: "feedbackMode",
        label: "Feedback mode",
        presentation: "segmented",
        options: [
          { value: "on_submit", label: "On submit" },
          { value: "immediate", label: "Immediate" },
        ],
      },
      { kind: "number", name: "points", label: "Points", min: 0, step: 1 },
      { kind: "color", name: "accentColor", label: "Accent" },
    ];

    expect(controls.map(getQuickControlDescriptorId)).toEqual([
      "name:isGraded",
      "name:feedbackMode",
      "name:points",
      "name:accentColor",
    ]);
  });

  it("derives quick menu controls from placed configuration controls", () => {
    const schema = z.object({ points: z.number() });

    const quickMenu = deriveQuickMenuDefinition({
      attr: "settings",
      schema,
      controls: [
        {
          kind: "number",
          name: "points",
          label: "Points",
          min: 0,
          step: 1,
          placement: { quickMenu: { order: 2 } },
        },
        {
          kind: "text",
          name: "legend",
          label: "Legend",
        },
        {
          kind: "select",
          name: "feedbackMode",
          label: "Feedback mode",
          options: [{ value: "immediate", label: "Immediate" }],
          placement: { quickMenu: { presentation: "segmented", order: 1 } },
        },
      ],
    });

    expect(quickMenu?.schema).toBe(schema);
    expect(quickMenu).toMatchObject({
      attr: "settings",
      controls: [
        {
          kind: "select",
          name: "feedbackMode",
          label: "Feedback mode",
          presentation: "segmented",
          options: [{ value: "immediate", label: "Immediate" }],
        },
        {
          kind: "number",
          name: "points",
          label: "Points",
          min: 0,
          step: 1,
        },
      ],
    });
  });

  it("preserves icon-toggle presentation for boolean quick controls", () => {
    const quickMenu = deriveQuickMenuDefinition({
      attr: "settings",
      schema: z.object({ showAnswer: z.boolean() }),
      controls: [
        {
          kind: "boolean",
          name: "showAnswer",
          label: "Show answer",
          placement: { quickMenu: { presentation: "icon-toggle" } },
        },
      ],
    });

    expect(quickMenu?.controls).toMatchObject([
      {
        kind: "boolean",
        name: "showAnswer",
        presentation: "icon-toggle",
      },
    ]);
  });

  it("freezes owned projection records while preserving borrowed values", () => {
    const schema = z.object({ mode: z.string(), visible: z.boolean() });
    const options = [{ value: "compact", label: "Compact" }];
    const configuration = {
      attr: "settings",
      schema,
      controls: [
        {
          kind: "select",
          name: "mode",
          label: "Mode",
          options,
          placement: { quickMenu: { presentation: "segmented" } },
        },
        {
          kind: "boolean",
          name: "visible",
          label: "Visible",
          icon: ArticleIcon,
          placement: { quickMenu: { presentation: "icon-toggle" } },
        },
      ],
    } satisfies ConfigurationDefinition;

    const quickMenu = deriveQuickMenuDefinition(configuration);
    if (!quickMenu) throw new Error("Expected a quick-menu projection.");
    const selectControl = quickMenu.controls[0];
    const booleanControl = quickMenu.controls[1];

    expect(Object.isFrozen(quickMenu)).toBe(true);
    expect(Object.isFrozen(quickMenu.controls)).toBe(true);
    expect(quickMenu.controls.every(Object.isFrozen)).toBe(true);
    expect(quickMenu.schema).toBe(schema);
    expect(selectControl?.kind).toBe("select");
    expect(selectControl?.kind === "select" ? selectControl.options : undefined).toBe(options);
    expect(booleanControl?.kind).toBe("boolean");
    expect(booleanControl?.kind === "boolean" ? booleanControl.icon : undefined).toBe(ArticleIcon);
    expect(Object.isFrozen(configuration)).toBe(false);
    expect(Object.isFrozen(configuration.controls)).toBe(false);
    expect(Object.isFrozen(schema)).toBe(false);
    expect(Object.isFrozen(options)).toBe(false);
    expect(Object.isFrozen(ArticleIcon)).toBe(false);
  });
});

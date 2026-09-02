import { describe, expect, it } from "vite-plus/test";

import type {
  ControlCommandInputDefinition,
  ControlStateValueTypeDefinition,
  ControlValue,
} from "./control-definition";
import { isControlCommandInputValid, isControlValueValid } from "./control-value-validation";

describe("control value validation", () => {
  it("accepts only booleans for a boolean definition", () => {
    const definition = { kind: "boolean" } as const;

    expect(isControlValueValid(true, definition)).toBe(true);
    expect(isControlValueValid(false, definition)).toBe(true);
    for (const invalid of [undefined, 0, 1, "true"] as const) {
      expect(isControlValueValid(invalid, definition)).toBe(false);
    }
  });

  it("accepts only declared enum values", () => {
    const definition = {
      kind: "enum",
      options: [
        { value: "compact", label: "Compact" },
        { value: "expanded", label: "Expanded" },
      ],
    } as const satisfies ControlStateValueTypeDefinition;

    expect(isControlValueValid("compact", definition)).toBe(true);
    expect(isControlValueValid("expanded", definition)).toBe(true);
    for (const invalid of [undefined, "missing", true, 1] as const) {
      expect(isControlValueValid(invalid, definition)).toBe(false);
    }
  });

  it("accepts inclusive finite numeric bounds and aligned floating steps", () => {
    const definition = {
      kind: "number",
      min: 0.1,
      max: 0.5,
      step: 0.1,
      unitLabel: "seconds",
    } as const satisfies ControlStateValueTypeDefinition;

    expect(isControlValueValid(0.1, definition)).toBe(true);
    expect(isControlValueValid(0.1 + 0.1 + 0.1, definition)).toBe(true);
    expect(isControlValueValid(0.5, definition)).toBe(true);
    for (const invalid of [
      undefined,
      0,
      0.15,
      0.6,
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      "0.2",
    ]) {
      expect(isControlValueValid(invalid as ControlValue | undefined, definition)).toBe(false);
    }
  });

  it("validates runtime-bounded numbers without inventing a maximum", () => {
    const definition = {
      kind: "runtime-bounded-number",
      min: 1,
      step: 0.5,
      unitLabel: "page",
    } as const satisfies ControlCommandInputDefinition;

    expect(isControlValueValid(1, definition)).toBe(true);
    expect(isControlValueValid(100_000.5, definition)).toBe(true);
    for (const invalid of [0.5, 1.25, Number.NaN, Number.POSITIVE_INFINITY, "2"] as const) {
      expect(isControlValueValid(invalid, definition)).toBe(false);
    }
  });

  it("requires command input arity to match the declaration", () => {
    const booleanInput = { kind: "boolean" } as const;

    expect(isControlCommandInputValid(undefined, undefined, false)).toBe(true);
    expect(isControlCommandInputValid(undefined, undefined, true)).toBe(false);
    expect(isControlCommandInputValid(true, undefined, true)).toBe(false);
    expect(isControlCommandInputValid(undefined, booleanInput, false)).toBe(false);
    expect(isControlCommandInputValid(undefined, booleanInput, true)).toBe(false);
    expect(isControlCommandInputValid(true, booleanInput, true)).toBe(true);
  });
});

import type {
  ControlCommandInputDefinition,
  ControlStateValueTypeDefinition,
  ControlValue,
} from "./control-definition";

export function isControlValueValid(
  value: ControlValue | undefined,
  definition: ControlStateValueTypeDefinition,
): value is ControlValue {
  if (definition.kind === "boolean") return typeof value === "boolean";
  if (definition.kind === "enum") {
    return typeof value === "string" && definition.options.some((option) => option.value === value);
  }
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= definition.min &&
    (definition.kind === "runtime-bounded-number" || value <= definition.max) &&
    (definition.step === undefined || isStepAligned(value, definition.min, definition.step))
  );
}

export function isControlCommandInputValid(
  value: ControlValue | undefined,
  definition: ControlCommandInputDefinition | undefined,
  hasInput: boolean,
): boolean {
  if (definition === undefined) return !hasInput;
  return hasInput && isControlValueValid(value, definition);
}

function isStepAligned(value: number, min: number, step: number): boolean {
  const quotient = (value - min) / step;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(quotient)) * 8;
  return Math.abs(quotient - Math.round(quotient)) <= tolerance;
}

import type { UnavailableCapabilityKind } from "./document-establishment";

export interface UnavailableContentCompatibilityRootDescriptor {
  readonly kind: UnavailableCapabilityKind;
  readonly capabilityId: string | null;
  readonly label: string;
}

const COMPATIBILITY_ROOTS = Object.freeze({
  unavailable_block: Object.freeze({ kind: "block", label: "Unavailable Block" }),
  unavailable_layout: Object.freeze({ kind: "layout", label: "Unavailable Layout" }),
  unavailable_surface: Object.freeze({ kind: "surface", label: "Unavailable Surface" }),
} as const);

export function readUnavailableContentCompatibilityRoot(
  nodeType: string,
  attrs: Readonly<Record<string, unknown>>,
): UnavailableContentCompatibilityRootDescriptor | null {
  const root = COMPATIBILITY_ROOTS[nodeType as keyof typeof COMPATIBILITY_ROOTS];
  if (!root) return null;

  const capabilityId = readCapabilityId(attrs["capabilityId"]);
  return Object.freeze({
    kind: root.kind,
    capabilityId,
    label: capabilityId ? `${root.label}: ${capabilityId}` : root.label,
  });
}

function readCapabilityId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

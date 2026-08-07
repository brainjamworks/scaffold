import type { SemanticItemKind } from "./semantic-document-snapshot";

export const MAX_SEMANTIC_LABEL_LENGTH = 80;

export function normalizeSemanticLabel(value: string | undefined, fallback: string): string {
  const normalized = normalizeWhitespace(value);
  const selected = normalized || normalizeWhitespace(fallback) || "Item";
  if (selected.length <= MAX_SEMANTIC_LABEL_LENGTH) return selected;
  return `${selected.slice(0, MAX_SEMANTIC_LABEL_LENGTH - 1).trimEnd()}…`;
}

export function disambiguateSemanticLabels(labels: readonly string[]): readonly string[] {
  const normalized = labels.map((label) => normalizeSemanticLabel(label, "Item"));
  const totals = new Map<string, number>();
  for (const label of normalized) {
    const key = label.toLocaleLowerCase();
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }

  const ordinals = new Map<string, number>();
  return Object.freeze(
    normalized.map((label) => {
      const key = label.toLocaleLowerCase();
      if ((totals.get(key) ?? 0) < 2) return label;
      const ordinal = (ordinals.get(key) ?? 0) + 1;
      ordinals.set(key, ordinal);
      return appendOrdinal(label, ordinal);
    }),
  );
}

function appendOrdinal(label: string, ordinal: number): string {
  const suffix = ` ${ordinal}`;
  if (label.length + suffix.length <= MAX_SEMANTIC_LABEL_LENGTH) return `${label}${suffix}`;
  const contentLength = MAX_SEMANTIC_LABEL_LENGTH - suffix.length - 1;
  return `${label.slice(0, contentLength).trimEnd()}…${suffix}`;
}

export function semanticLabelFallback(kind: SemanticItemKind, nodeType: string): string {
  if (kind === "course-section") return "Course section";
  if (kind === "surface") return "Surface";
  if (kind === "layout") return "Layout";
  if (kind === "layout-section") return "Section";
  if (kind === "region") return "Region";
  if (kind === "grid") return "Grid";
  if (kind === "cell") return "Cell";
  if (kind === "block") return "Block";
  return richTextTypeFallback(nodeType);
}

export function richTextTypeFallback(nodeType: string): string {
  if (nodeType === "heading") return "Heading";
  if (nodeType === "paragraph") return "Paragraph";
  if (nodeType === "bulletList") return "Bullet list";
  if (nodeType === "orderedList") return "Ordered list";
  if (nodeType === "listItem") return "List item";
  if (nodeType === "blockquote") return "Block quote";
  if (nodeType === "codeBlock") return "Code block";
  const humanized = nodeType.replaceAll(/[-_]+/g, " ").trim();
  return humanized.length === 0
    ? "Published child"
    : `${humanized[0]?.toUpperCase()}${humanized.slice(1)}`;
}

function normalizeWhitespace(value: string | undefined): string {
  return typeof value === "string" ? value.replaceAll(/\s+/g, " ").trim() : "";
}

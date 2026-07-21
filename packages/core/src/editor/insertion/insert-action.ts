import type { Icon } from "@phosphor-icons/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { CheckedMutationIssue } from "@/document/model/commands/checked-transactions";

export type InsertCategory =
  | "content"
  | "display"
  | "media"
  | "data"
  | "assessment"
  | "activity"
  | "embed"
  | "layout";

export const INSERT_CATEGORY_LABELS = Object.freeze({
  content: "Content",
  display: "Display",
  media: "Media",
  data: "Data",
  assessment: "Assessment",
  activity: "Activity",
  embed: "Embeds",
  layout: "Containers",
}) satisfies Readonly<Record<InsertCategory, string>>;

export const INSERT_CATEGORY_ORDER = Object.freeze([
  "content",
  "display",
  "media",
  "data",
  "assessment",
  "activity",
  "embed",
  "layout",
] as const satisfies readonly InsertCategory[]);

export interface InsertAction {
  /** Stable authoring action identity. */
  readonly id: string;
  /** Tiptap node name created by this action. */
  readonly nodeType: string;
  /** Optional parent action id for variants that create the same node type. */
  readonly variantOf?: string;
  readonly title: string;
  readonly description: string;
  readonly icon: Icon;
  readonly category: InsertCategory;
  readonly keywords?: readonly string[];
  /** Fresh ProseMirror node JSON for every invocation. */
  readonly content: () => Record<string, unknown>;
  readonly validateNode?: (node: ProseMirrorNode) => CheckedMutationIssue | null;
}

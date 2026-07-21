import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import type { Icon } from "@phosphor-icons/react";

import type { ConfigurationDefinition } from "@/editor/configuration/definition";
import { deriveQuickMenuDefinition } from "@/editor/configuration/quick-menu-derivation";
import type { QuickMenuDefinition } from "@/editor/configuration/quick-menu";
import { deriveSettingsSheetDefinition } from "@/editor/configuration/settings-sheet-derivation";
import type { NodeSettingsSheetDefinition } from "@/editor/configuration/settings-sheet";
import type { BoundedPlacement } from "@/editor/frame/model/bounded-placement";
import type { InsertAction, InsertCategory } from "@/editor/insertion/insert-action";

export interface CreateLayoutContentInput {
  options?: Record<string, unknown>;
}

export interface CreateLayoutSectionInput {
  index: number;
  layout: ProseMirrorNode;
  options?: Record<string, unknown>;
}

export interface LayoutSectionDefinition {
  /** Label used by generic layout chrome, e.g. "event", "tab", "section". */
  readonly label: string;
  /** Label for the generic append affordance, e.g. "Add event". */
  readonly addLabel: string;
  readonly configuration?: ConfigurationDefinition;
  readonly create: (input: CreateLayoutSectionInput) => JSONContent;
}

export interface LayoutPlaceholderContext {
  editor: Editor;
  node: ProseMirrorNode;
  pos: number;
  ancestor: ProseMirrorNode;
  depth: number;
  $pos: ResolvedPos;
}

export type LayoutPlaceholderValue = string | ((context: LayoutPlaceholderContext) => string);

export type LayoutPlaceholderDefinition = Record<string, LayoutPlaceholderValue>;

export type LayoutBoundedSectionBehavior = "handoff" | "terminal-scroll";

export interface LayoutDefinition {
  /** Stable layout kind stored on `layout.attrs.variant`. */
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: Icon;
  /**
   * Product-facing insert category. The underlying ProseMirror node is still
   * `layout`; this controls where authors discover the preset.
   */
  readonly category?: InsertCategory;
  readonly keywords?: readonly string[];
  readonly boundedPlacement?: BoundedPlacement;
  /**
   * Controls whether a fill layout propagates its finite rectangle into each
   * section. Fill layouts hand off by default; terminal-scroll layouts keep
   * section content in normal flow inside a layout-owned scroll lane.
   */
  readonly boundedSectionBehavior?: LayoutBoundedSectionBehavior;
  readonly configuration?: ConfigurationDefinition;
  readonly createContent: (input?: CreateLayoutContentInput) => JSONContent;
  readonly placeholders?: LayoutPlaceholderDefinition;
  readonly section?: LayoutSectionDefinition;
}

export interface RegisteredLayoutSectionDefinition extends LayoutSectionDefinition {
  readonly quickMenu?: QuickMenuDefinition;
  readonly settingsSheet?: NodeSettingsSheetDefinition;
}

export interface RegisteredLayoutDefinition extends LayoutDefinition {
  readonly nodeType: "layout";
  readonly quickMenu?: QuickMenuDefinition;
  readonly settingsSheet?: NodeSettingsSheetDefinition;
  readonly section?: RegisteredLayoutSectionDefinition;
}

export function defineLayout(definition: LayoutDefinition): RegisteredLayoutDefinition {
  const quickMenu = deriveQuickMenuDefinition(definition.configuration);
  const settingsSheet = deriveSettingsSheetDefinition(definition.configuration);
  const sectionQuickMenu = deriveQuickMenuDefinition(definition.section?.configuration);
  const sectionSettingsSheet = deriveSettingsSheetDefinition(definition.section?.configuration);
  const layoutSettingsSheet = settingsSheet
    ? Object.freeze({ nodeType: "layout", ...settingsSheet })
    : undefined;
  const registeredSectionSettingsSheet = sectionSettingsSheet
    ? Object.freeze({ nodeType: "section", ...sectionSettingsSheet })
    : undefined;
  const section = definition.section
    ? Object.freeze({
        ...definition.section,
        ...(sectionQuickMenu ? { quickMenu: sectionQuickMenu } : {}),
        ...(registeredSectionSettingsSheet
          ? { settingsSheet: registeredSectionSettingsSheet }
          : {}),
      })
    : undefined;
  return Object.freeze({
    ...definition,
    nodeType: "layout",
    ...(quickMenu ? { quickMenu } : {}),
    ...(layoutSettingsSheet ? { settingsSheet: layoutSettingsSheet } : {}),
    ...(section ? { section } : {}),
  });
}

export function createLayoutInsertAction(definition: LayoutDefinition): InsertAction {
  return {
    id: definition.id,
    nodeType: "layout",
    category: definition.category ?? "layout",
    title: definition.title,
    description: definition.description,
    icon: definition.icon,
    ...(definition.keywords ? { keywords: [...definition.keywords] } : {}),
    content: () => ({ ...definition.createContent() }),
  };
}

export function getLayoutKindFromAttrs(attrs: Record<string, unknown>): string | null {
  const variant = attrs["variant"];
  if (typeof variant === "string" && variant.length > 0) return variant;
  return null;
}

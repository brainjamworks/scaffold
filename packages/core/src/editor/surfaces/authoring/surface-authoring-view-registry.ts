import type { NodeViewProps } from "@tiptap/react";
import type { ComponentType } from "react";

import type { ConfigurationDefinition } from "@/editor/configuration/definition";
import { deriveQuickMenuDefinition } from "@/editor/configuration/quick-menu-derivation";
import type { QuickMenuDefinition } from "@/editor/configuration/quick-menu";
import { deriveSettingsSheetDefinition } from "@/editor/configuration/settings-sheet-derivation";
import type { NodeSettingsSheetDefinition } from "@/editor/configuration/settings-sheet";
import type { SurfaceVariantRegistry } from "../model/surface-variant-registry";
import type { RegisteredSurfaceVariantDefinition } from "../model/surface-variant-definition";

export interface SurfaceAuthoringViewProps extends NodeViewProps {
  authoringView: RegisteredSurfaceAuthoringView;
  definition: RegisteredSurfaceVariantDefinition;
  isEmpty: boolean;
  variant: string;
}

export interface SurfaceAuthoringViewBinding {
  readonly variantId: string;
  readonly component: ComponentType<SurfaceAuthoringViewProps>;
  readonly configuration?: ConfigurationDefinition;
}

export interface RegisteredSurfaceAuthoringView {
  readonly variantId: string;
  readonly component: ComponentType<SurfaceAuthoringViewProps>;
  readonly nodeType: "surface";
  readonly quickMenu?: QuickMenuDefinition;
  readonly settingsSheet?: NodeSettingsSheetDefinition;
}

export interface SurfaceAuthoringViewMap {
  get(variantId: string): RegisteredSurfaceAuthoringView | undefined;
}

export interface SurfaceAuthoringChrome {
  readonly quickMenu?: QuickMenuDefinition;
  readonly settingsSheet?: NodeSettingsSheetDefinition;
}

export interface SurfaceAuthoringChromeResolver {
  resolve(variantId: string): SurfaceAuthoringChrome | undefined;
}

type SurfaceAuthoringRegistry = Pick<SurfaceVariantRegistry, "definitions" | "get">;

export function createSurfaceAuthoringViewMap({
  registry,
  bindings,
}: {
  registry: SurfaceAuthoringRegistry;
  bindings: readonly SurfaceAuthoringViewBinding[];
}): SurfaceAuthoringViewMap {
  const viewsByVariantId = new Map<string, RegisteredSurfaceAuthoringView>();

  for (const binding of bindings) {
    if (viewsByVariantId.has(binding.variantId)) {
      throw new Error(`Surface variant "${binding.variantId}" is already bound for authoring.`);
    }
    if (!registry.get(binding.variantId)) {
      throw new Error(`Surface authoring variant "${binding.variantId}" is not registered.`);
    }
    viewsByVariantId.set(binding.variantId, normalizeSurfaceAuthoringView(binding));
  }

  for (const definition of registry.definitions) {
    if (!viewsByVariantId.has(definition.id)) {
      throw new Error(`Surface variant "${definition.id}" has no authoring view binding.`);
    }
  }

  return Object.freeze({
    get: (variantId: string) => viewsByVariantId.get(variantId),
  });
}

export function createSurfaceAuthoringChromeResolver(
  views: SurfaceAuthoringViewMap,
): SurfaceAuthoringChromeResolver {
  return Object.freeze({
    resolve: (variantId: string) => {
      const view = views.get(variantId);
      if (!view) return undefined;
      return Object.freeze({
        ...(view.quickMenu ? { quickMenu: view.quickMenu } : {}),
        ...(view.settingsSheet ? { settingsSheet: view.settingsSheet } : {}),
      });
    },
  });
}

export function getSurfaceVariantFromAttrs(attrs: Record<string, unknown>): string | null {
  const variant = attrs["variant"];
  return typeof variant === "string" && variant.length > 0 ? variant : null;
}

function normalizeSurfaceAuthoringView(
  binding: SurfaceAuthoringViewBinding,
): RegisteredSurfaceAuthoringView {
  const quickMenu = deriveQuickMenuDefinition(binding.configuration);
  const settingsSheet = deriveSettingsSheetDefinition(binding.configuration);
  return Object.freeze({
    variantId: binding.variantId,
    component: binding.component,
    nodeType: "surface",
    ...(quickMenu ? { quickMenu: snapshotAuthoringChromeFact(quickMenu) } : {}),
    ...(settingsSheet
      ? {
          settingsSheet: snapshotAuthoringChromeFact({
            nodeType: "surface" as const,
            ...settingsSheet,
          }),
        }
      : {}),
  });
}

function snapshotAuthoringChromeFact<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(snapshotAuthoringChromeFact)) as T;
  }
  if (value === null || typeof value !== "object") return value;
  if (Object.getPrototypeOf(value) !== Object.prototype || "$$typeof" in value) return value;

  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        snapshotAuthoringChromeFact(nestedValue),
      ]),
    ),
  ) as T;
}

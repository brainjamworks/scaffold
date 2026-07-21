import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { LayoutViewRegistration, RegisteredLayoutView } from "./layout-view-definition";
import { getLayoutKindFromAttrs } from "../model/layout-definition";
import type { LayoutRegistry } from "../model/layout-registry";

export interface LayoutAuthoringViewRegistry {
  getById(id: string): RegisteredLayoutView | undefined;
  getForNode(node: ProseMirrorNode): RegisteredLayoutView | undefined;
}

export function createLayoutAuthoringViewRegistry(
  definitions: LayoutRegistry,
  views: readonly LayoutViewRegistration[],
): LayoutAuthoringViewRegistry {
  const duplicateIds = findDuplicateIds(views.map((view) => view.id));
  if (duplicateIds.length > 0) {
    throw new Error(`Layout authoring view IDs are duplicated: ${formatIds(duplicateIds)}.`);
  }

  const definitionIds = new Set(definitions.definitions.map((definition) => definition.id));
  const viewIds = new Set(views.map((view) => view.id));
  const missingIds = [...definitionIds].filter((id) => !viewIds.has(id)).sort();
  const extraIds = [...viewIds].filter((id) => !definitionIds.has(id)).sort();

  if (missingIds.length > 0 || extraIds.length > 0) {
    throw new Error(
      `Layout authoring view IDs do not match definitions. Missing: ${formatIds(missingIds)}. Extra: ${formatIds(extraIds)}.`,
    );
  }

  const viewsById = new Map<string, RegisteredLayoutView>();
  for (const view of views) {
    const registered = Object.freeze(normalizeLayoutView(view));
    viewsById.set(registered.id, registered);
  }
  Object.freeze(viewsById);

  return Object.freeze({
    getById: (id: string) => viewsById.get(id),
    getForNode: (node: ProseMirrorNode) => {
      if (node.type.name !== "layout") return undefined;
      const layoutKind = getLayoutKindFromAttrs(node.attrs);
      return layoutKind ? viewsById.get(layoutKind) : undefined;
    },
  });
}

function normalizeLayoutView(registration: LayoutViewRegistration): RegisteredLayoutView {
  return {
    ...registration,
    nodeType: "layout",
  };
}

function findDuplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }

  return [...duplicates].sort();
}

function formatIds(ids: readonly string[]): string {
  return ids.length > 0 ? ids.map((id) => `"${id}"`).join(", ") : "none";
}

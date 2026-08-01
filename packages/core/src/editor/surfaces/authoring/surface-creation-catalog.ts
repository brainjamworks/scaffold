import type { CourseMode } from "@/schemas/course-document";
import type {
  SurfaceCatalogueEntry,
  SurfaceCatalogueSection,
  SurfaceTemplatePreviewNode,
} from "../model/surface-variant-definition";
import type { SurfaceVariantRegistry } from "../model/surface-variant-registry";

export interface SurfaceCreationCatalogEntry {
  readonly variantId: string;
  readonly title: string;
  readonly description: string;
  readonly catalogue: SurfaceCatalogueEntry;
}

export interface SurfaceCreationCatalog {
  forMode(mode: CourseMode): readonly SurfaceCreationCatalogEntry[];
}

const EMPTY_CREATION_CATALOG: readonly SurfaceCreationCatalogEntry[] = Object.freeze([]);
const SECTION_ORDER: Readonly<Record<SurfaceCatalogueSection, number>> = {
  title: 0,
  content: 1,
  image: 2,
};

export function createSurfaceCreationCatalog(
  registry: SurfaceVariantRegistry,
): SurfaceCreationCatalog {
  const entriesByMode = new Map<CourseMode, SurfaceCreationCatalogEntry[]>();

  for (const definition of registry.definitions) {
    if (!definition.catalogue) continue;
    const entry = Object.freeze({
      variantId: definition.id,
      title: definition.title,
      description: definition.description,
      catalogue: copyCatalogueEntry(definition.catalogue),
    });
    for (const mode of definition.modes) {
      const entries = entriesByMode.get(mode) ?? [];
      entries.push(entry);
      entriesByMode.set(mode, entries);
    }
  }

  const immutableEntriesByMode = new Map<CourseMode, readonly SurfaceCreationCatalogEntry[]>();
  for (const [mode, entries] of entriesByMode) {
    immutableEntriesByMode.set(
      mode,
      Object.freeze(
        entries.sort(
          (left, right) =>
            SECTION_ORDER[left.catalogue.section] - SECTION_ORDER[right.catalogue.section] ||
            left.catalogue.order - right.catalogue.order,
        ),
      ),
    );
  }

  return Object.freeze({
    forMode: (mode: CourseMode) => immutableEntriesByMode.get(mode) ?? EMPTY_CREATION_CATALOG,
  });
}

function copyCatalogueEntry(catalogue: SurfaceCatalogueEntry): SurfaceCatalogueEntry {
  return Object.freeze({
    ...catalogue,
    preview: copyPreview(catalogue.preview),
  });
}

function copyPreview(preview: SurfaceTemplatePreviewNode): SurfaceTemplatePreviewNode {
  if (preview.kind === "slot") return Object.freeze({ ...preview });
  if (preview.kind === "overlay") {
    return Object.freeze({
      ...preview,
      base: copyPreview(preview.base),
      overlay: copyPreview(preview.overlay),
    });
  }
  return Object.freeze({
    ...preview,
    children: Object.freeze(preview.children.map(copyPreview)),
    ...(preview.proportions ? { proportions: Object.freeze([...preview.proportions]) } : {}),
  });
}

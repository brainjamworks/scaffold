import { Result } from "better-result";

import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { SemanticDocumentController } from "@/document/authoring/semantic-document/semantic-document-controller";
import type { SemanticNavigationResult } from "@/document/authoring/semantic-document";
import type { SemanticItem, SemanticLocation } from "@/document/model/semantic-document";

export class FakeWorkspaceSemanticController {
  readonly selectCalls: EmbeddedNodeId[] = [];
  readonly #selectionResults: Array<SemanticNavigationResult | Promise<SemanticNavigationResult>> =
    [];
  readonly #listeners = new Set<() => void>();
  #snapshot: ReturnType<SemanticDocumentController["getSnapshot"]>;

  constructor(
    surfaceIds: readonly EmbeddedNodeId[],
    options: {
      readonly courseSectionId?: EmbeddedNodeId;
      readonly selectedId?: EmbeddedNodeId | null;
    } = {},
  ) {
    const items: SemanticItem[] = surfaceIds.map((id, index) => ({
      id,
      kind: "surface" as const,
      nodeType: "surface",
      definitionId: index === 0 ? "slide-content" : "slide-cover",
      label: `Slide ${index + 1}`,
      summary: null,
      presentation: { actionIds: [], disabledReason: null },
      presentationContainer: null,
      children: [],
    }));
    const courseSection: SemanticItem | null = options.courseSectionId
      ? {
          id: options.courseSectionId,
          kind: "course-section" as const,
          nodeType: "courseSection",
          definitionId: null,
          label: "Section 1",
          summary: null,
          presentation: { actionIds: [], disabledReason: null },
          presentationContainer: null,
          children: items,
        }
      : null;
    const itemById = new Map<EmbeddedNodeId, SemanticItem>(items.map((item) => [item.id, item]));
    const parentById = new Map<EmbeddedNodeId, EmbeddedNodeId | null>(
      items.map((item) => [item.id, courseSection?.id ?? null]),
    );
    const locationById = new Map<EmbeddedNodeId, SemanticLocation>(
      items.map((item, index) => [
        item.id,
        {
          id: item.id,
          nodeType: "surface",
          from: index + 2,
          to: index + 3,
          selectionTarget: { kind: "node" as const, pos: index + 2 },
          surfaceId: item.id,
          authoringAnchorId: item.id,
          activationPath: [],
        },
      ]),
    );
    if (courseSection) {
      itemById.set(courseSection.id, courseSection);
      parentById.set(courseSection.id, null);
      locationById.set(courseSection.id, {
        id: courseSection.id,
        nodeType: "courseSection",
        from: 1,
        to: 2,
        selectionTarget: { kind: "node", pos: 1 },
        surfaceId: null,
        authoringAnchorId: null,
        activationPath: [],
      });
    }
    const semantics = {
      revision: 0,
      mode: "slideshow" as const,
      roots: courseSection ? [courseSection] : items,
      itemById,
      parentById,
      locationById,
      diagnostics: [],
    };
    const selectedId =
      options.selectedId === undefined ? (surfaceIds[0] ?? null) : options.selectedId;
    this.#snapshot = Object.freeze({
      semantics,
      selectedId,
      selectionOrigin: selectedId ? ("editor" as const) : null,
    });
  }

  readonly getSnapshot = () => this.#snapshot;
  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  readonly getControlCapabilityCatalogue = () => ({
    resolve: (targetId: EmbeddedNodeId) =>
      Result.ok({
        ownerId: targetId,
        targetId,
        capabilities: {
          events: [{ type: "activated", label: "Activated" }],
          commands: [{ type: "activate", label: "Activate" }],
        },
      }),
  });
  readonly select = async (id: EmbeddedNodeId): Promise<SemanticNavigationResult> => {
    this.selectCalls.push(id);
    const result = await (this.#selectionResults.shift() ?? ({ kind: "reached", id } as const));
    if (result.kind === "reached") this.publish(result.id, "presentation-timeline");
    if (result.kind === "reached-owner") this.publish(result.ownerId, "presentation-timeline");
    return result;
  };

  queueSelectionResult(result: SemanticNavigationResult | Promise<SemanticNavigationResult>) {
    this.#selectionResults.push(result);
  }

  publish(
    id: EmbeddedNodeId,
    selectionOrigin: "component" | "presentation-timeline" = "component",
  ) {
    this.#snapshot = Object.freeze({ ...this.#snapshot, selectedId: id, selectionOrigin });
    for (const listener of this.#listeners) listener();
  }
}

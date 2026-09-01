import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import type { EmbeddedNodeId } from "@scaffold/contracts";
import "./definition";
import "./definition-lookup";
import type {
  DocumentSemanticsDefinition,
  PublishedSemanticChild,
  SemanticActivationRelationship,
  SemanticChildProjectionInput,
  SemanticDefinitionOwnerInput,
  SemanticItemDescription,
} from "./definition";
import type {
  SemanticBlockDefinition,
  SemanticDefinitionLookup,
  SemanticLayoutDefinition,
  SemanticSurfaceDefinition,
} from "./definition-lookup";
import { normalizeDocumentSemanticsDefinition } from "./normalize-document-semantics-definition";

describe("semantic document definition contracts", () => {
  it("owns one immutable semantic-definition shell without changing callbacks", () => {
    const actionIds = ["reveal", "highlight"];
    const reconstructableCommandTypes = ["select", "select", "expand"];
    const describe = () => ({ label: "Owned" });
    const projectChildren = () => [];
    const input = {
      describe,
      presentation: { actionIds, reconstructableCommandTypes },
      projectChildren,
    };

    const normalized = normalizeDocumentSemanticsDefinition(input);

    expect(normalized).not.toBe(input);
    expect(normalized).toMatchObject({ describe, projectChildren });
    expect(normalized?.presentation?.actionIds).toEqual(actionIds);
    expect(normalized?.presentation?.actionIds).not.toBe(actionIds);
    expect(normalized?.presentation?.reconstructableCommandTypes).toEqual(
      reconstructableCommandTypes,
    );
    expect(normalized?.presentation?.reconstructableCommandTypes).not.toBe(
      reconstructableCommandTypes,
    );
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized?.presentation)).toBe(true);
    expect(Object.isFrozen(normalized?.presentation?.actionIds)).toBe(true);
    expect(Object.isFrozen(normalized?.presentation?.reconstructableCommandTypes)).toBe(true);
  });

  it("preserves omission of reconstructable command metadata", () => {
    const normalized = normalizeDocumentSemanticsDefinition({
      presentation: { actionIds: ["reveal"] },
    });

    expect(normalized?.presentation).not.toHaveProperty("reconstructableCommandTypes");
  });

  it("keeps description and child projection owner-bounded and owner-relative", () => {
    const owner = {} as ProseMirrorNode;
    const ownerId = "owner-node-1" as EmbeddedNodeId;
    const activation = Object.freeze({
      ownerId,
      childId: "child-node-1" as EmbeddedNodeId,
      ownerKind: "block" as const,
    }) satisfies SemanticActivationRelationship;
    const child = Object.freeze({
      relativePos: 3,
      semanticRole: "published-child" as const,
      label: "Front",
      summary: "Summary",
      activation: Object.freeze([activation]),
    }) satisfies PublishedSemanticChild;
    const semantics = Object.freeze({
      describe: ({
        owner: describedOwner,
        ownerId: describedOwnerId,
        definitionId,
      }: SemanticDefinitionOwnerInput) => {
        expect(describedOwner).toBe(owner);
        expect(describedOwnerId).toBe(ownerId);
        expect(definitionId).toBe("host-card");
        return Object.freeze({ label: "Card", summary: "Safe summary" });
      },
      projectChildren: ({
        owner: projectedOwner,
        ownerId: projectedOwnerId,
        definitionId,
      }: SemanticChildProjectionInput) => {
        expect(projectedOwner).toBe(owner);
        expect(projectedOwnerId).toBe(ownerId);
        expect(definitionId).toBe("host-card");
        return Object.freeze([child]);
      },
    }) satisfies DocumentSemanticsDefinition;
    const input = Object.freeze({
      owner,
      ownerId,
      definitionId: "host-card",
      helpers: Object.freeze({
        projectDirectOwnedMembers: () => Object.freeze([]),
        projectStandardRichText: () => Object.freeze([]),
        projectStructuralChildren: () => Object.freeze([]),
      }),
    }) satisfies SemanticChildProjectionInput;

    const description = semantics.describe(input);
    const children = semantics.projectChildren(input);

    expect(description).toEqual({ label: "Card", summary: "Safe summary" });
    expect(children).toEqual([child]);
    expect(Object.isFrozen(semantics)).toBe(true);
    expect(Object.isFrozen(children)).toBe(true);
    expect(Object.isFrozen(children[0]?.activation)).toBe(true);
    expectTypeOf(description).toMatchTypeOf<SemanticItemDescription>();
    expectTypeOf(children).toMatchTypeOf<readonly PublishedSemanticChild[]>();
  });

  it("exposes only narrow mounted semantic views through get lookups", () => {
    const block = Object.freeze({
      nodeType: "host_card",
      title: "Host card",
      isAssessment: false,
    }) satisfies SemanticBlockDefinition;
    const layout = Object.freeze({
      id: "host-layout",
      title: "Host layout",
      section: Object.freeze({ label: "Panel" }),
    }) satisfies SemanticLayoutDefinition;
    const surface = Object.freeze({
      id: "host-surface",
      title: "Host surface",
    }) satisfies SemanticSurfaceDefinition;
    const lookup = Object.freeze({
      blocks: Object.freeze({
        get: (nodeType: string) => (nodeType === block.nodeType ? block : undefined),
      }),
      layouts: Object.freeze({
        get: (variant: string) => (variant === layout.id ? layout : undefined),
      }),
      surfaces: Object.freeze({
        get: (variant: string) => (variant === surface.id ? surface : undefined),
      }),
    }) satisfies SemanticDefinitionLookup;

    expect(lookup.blocks.get("host_card")).toBe(block);
    expect(lookup.layouts.get("unmounted-layout")).toBeUndefined();
    expect(lookup.surfaces.get("host-surface")).toBe(surface);
    expect(Object.isFrozen(lookup)).toBe(true);
    expect(Object.isFrozen(lookup.blocks)).toBe(true);
  });
});

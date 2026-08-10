import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vite-plus/test";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import { InteractionOwnerCommandKind } from "../state/interaction-owner-command-model";
import { readInteractionOwnerCommandMeta } from "../state/interaction-owner-plugin-state";
import {
  createAuthoringInteractionNavigationTransaction,
  resolveAuthoringInteractionNavigationTarget,
} from "./interaction-navigation";

const blockDefinitions = createBlockRegistry([
  defineBlock({ nodeType: "figure_block", title: "Figure" }),
]);

const schema = new Schema({
  nodes: {
    doc: { content: "surface+" },
    text: { group: "inline" },
    paragraph: { attrs: { id: { default: null } }, content: "text*", group: "content" },
    surface: {
      attrs: { id: { default: null } },
      content: "(layout | grid | figure_block)+",
    },
    layout: { attrs: { id: { default: null } }, content: "section+" },
    section: { attrs: { id: { default: null } }, content: "paragraph+" },
    grid: { attrs: { id: { default: null } }, content: "cell+" },
    cell: { attrs: { id: { default: null } }, content: "paragraph+" },
    figure_block: { attrs: { id: { default: null } }, content: "annotation*" },
    annotation: { attrs: { id: { default: null } }, content: "paragraph*" },
  },
});

describe("authoring interaction navigation", () => {
  it("projects semantic descendants to their canonical authoring owners", () => {
    const state = stateFromFixture();

    expect(resolve(state, "page-prose")).toMatchObject({
      activation: "structural",
      target: { id: "layout-owner", kind: "layout" },
    });
    expect(resolve(state, "cell-prose")).toMatchObject({
      activation: "structural",
      target: { id: "grid-owner", kind: "grid" },
    });
    expect(resolve(state, "layout-owner")).toMatchObject({
      activation: "structural",
      target: { id: "layout-owner", kind: "layout" },
    });
    expect(resolve(state, "figure-owner")).toMatchObject({
      activation: "object",
      target: { id: "figure-owner", kind: "block" },
    });
  });

  it("uses non-destructive structural activation and canonical Block object selection", () => {
    const state = stateFromFixture();
    const layoutTarget = resolve(state, "page-prose");
    const figureTarget = resolve(state, "figure-owner");
    if (!layoutTarget || !figureTarget) throw new Error("expected navigation targets");

    const layoutTransaction = createAuthoringInteractionNavigationTransaction(state, layoutTarget);
    const figureTransaction = createAuthoringInteractionNavigationTransaction(state, figureTarget);
    if (!layoutTransaction || !figureTransaction) throw new Error("expected transactions");

    expect(layoutTransaction.selection).toBeInstanceOf(TextSelection);
    expect(layoutTransaction.selection).not.toBeInstanceOf(NodeSelection);
    expect(readInteractionOwnerCommandMeta(layoutTransaction)).toMatchObject({
      kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
      target: { id: "layout-owner", kind: "layout" },
    });
    expect(figureTransaction.selection).toBeInstanceOf(NodeSelection);
    expect(readInteractionOwnerCommandMeta(figureTransaction)).toMatchObject({
      kind: InteractionOwnerCommandKind.SelectObjectTarget,
      target: { id: "figure-owner", kind: "block" },
    });
  });
});

function resolve(state: EditorState, value: string) {
  const found = findById(state.doc, value);
  return resolveAuthoringInteractionNavigationTarget(
    state,
    {
      id: value as EmbeddedNodeId,
      nodeType: found.node.type.name,
      pos: found.pos,
    },
    blockDefinitions,
  );
}

function stateFromFixture(): EditorState {
  return EditorState.create({
    doc: schema.node("doc", null, [
      schema.node("surface", { id: "surface-owner" }, [
        schema.node("layout", { id: "layout-owner" }, [
          schema.node("section", { id: "page-owner" }, [
            schema.node("paragraph", { id: "page-prose" }, schema.text("Page prose")),
          ]),
        ]),
        schema.node("grid", { id: "grid-owner" }, [
          schema.node("cell", { id: "cell-owner" }, [
            schema.node("paragraph", { id: "cell-prose" }, schema.text("Cell prose")),
          ]),
        ]),
        schema.node("figure_block", { id: "figure-owner" }, [
          schema.node("annotation", { id: "annotation-owner" }, [
            schema.node("paragraph", { id: "annotation-prose" }, schema.text("Annotation prose")),
          ]),
        ]),
      ]),
    ]),
  });
}

function findById(doc: ProseMirrorNode, id: string): { node: ProseMirrorNode; pos: number } {
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    found = { node, pos };
    return false;
  });
  if (!found) throw new Error(`missing fixture node "${id}"`);
  return found;
}

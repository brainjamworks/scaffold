// @vitest-environment jsdom

import { Node, getSchema } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import {
  DOMParser as ProseMirrorDOMParser,
  DOMSerializer as ProseMirrorDOMSerializer,
  type Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { SurfaceNode } from "./surface-node";

const VALID_SURFACE_ID = "AbCdEf123_--";

const TestDocumentNode = Node.create({
  name: "doc",
  topNode: true,
  content: "surface+",
});

const TestBlockNode = Node.create({
  name: "test_block",
  group: "block arrangement",
  atom: true,

  parseHTML() {
    return [{ tag: "div[data-test-block]" }];
  },

  renderHTML() {
    return ["div", { "data-test-block": "" }];
  },
});

const TestRegionNode = Node.create({
  name: "region",
  content: "block+",
});

const schema = getSchema([
  TestDocumentNode,
  StarterKit.configure({ document: false }),
  SurfaceNode,
  TestRegionNode,
  TestBlockNode,
  UniqueID.configure({
    attributeName: "id",
    types: "all",
    updateDocument: false,
  }),
]);

describe("SurfaceNode identity", () => {
  it("keeps missing and malformed identity observable without synthesizing an ID", () => {
    const missing = parseSurface("<section data-surface><div data-test-block></div></section>");
    const malformed = parseSurface(
      '<section data-surface data-id="not-an-id"><div data-test-block></div></section>',
    );

    expect(missing.attrs["id"]).toBeNull();
    expect(serializeSurface(missing).getAttribute("data-id")).toBeNull();
    expect(malformed.attrs["id"]).toBe("not-an-id");
    expect(serializeSurface(malformed).getAttribute("data-id")).toBe("not-an-id");
  });

  it("round-trips a valid EmbeddedNodeId unchanged", () => {
    const surface = parseSurface(
      `<section data-surface data-id="${VALID_SURFACE_ID}"><div data-test-block></div></section>`,
    );
    const serialized = serializeSurface(surface);

    expect(surface.attrs["id"]).toBe(VALID_SURFACE_ID);
    expect(serialized.getAttribute("data-id")).toBe(VALID_SURFACE_ID);
    expect(serialized.getAttribute("data-surface-id")).toBeNull();
  });
});

function parseSurface(html: string): ProseMirrorNode {
  const container = document.createElement("div");
  container.innerHTML = html;
  const parsed = ProseMirrorDOMParser.fromSchema(schema).parse(container);
  const surface = parsed.firstChild;
  if (!surface) throw new Error("Expected a parsed Surface node.");
  return surface;
}

function serializeSurface(surface: ProseMirrorNode): HTMLElement {
  const container = document.createElement("div");
  container.appendChild(ProseMirrorDOMSerializer.fromSchema(schema).serializeNode(surface));
  const element = container.firstElementChild;
  if (!(element instanceof HTMLElement)) throw new Error("Expected a serialized Surface element.");
  return element;
}

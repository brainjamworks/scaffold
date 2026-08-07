import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { MAX_SEMANTIC_LABEL_LENGTH } from "./semantic-labels";
import { projectStandardRichText } from "./rich-text-publication";

const IDS = {
  root: id("root00000001"),
  heading: id("heading00001"),
  emptyParagraph: id("emptypara001"),
  repeatedParagraph1: id("repeatpara01"),
  repeatedParagraph2: id("repeatpara02"),
  longHeading: id("longheading1"),
  bulletList: id("bulletlist01"),
  bulletItem: id("bulletitem01"),
  bulletParagraph: id("bulletpara01"),
  nestedList: id("nestedlist01"),
  nestedItem: id("nesteditem01"),
  nestedParagraph: id("nestedpara01"),
  blockquote: id("quote0000001"),
  quoteParagraph: id("quotepara001"),
  codeBlock: id("code00000001"),
  divider: id("divider00001"),
} as const;

const schema = new Schema({
  nodes: {
    doc: { content: "content_root" },
    text: { group: "inline" },
    content_root: {
      content: "block*",
      attrs: { id: { default: null } },
    },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null } },
    },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null } },
    },
    bulletList: {
      group: "block",
      content: "listItem+",
      attrs: { id: { default: null } },
    },
    orderedList: {
      group: "block",
      content: "listItem+",
      attrs: { id: { default: null } },
    },
    listItem: {
      content: "paragraph block*",
      attrs: { id: { default: null } },
    },
    blockquote: {
      group: "block",
      content: "block+",
      attrs: { id: { default: null } },
    },
    codeBlock: {
      group: "block",
      content: "text*",
      marks: "",
      attrs: { id: { default: null } },
    },
    horizontalRule: {
      group: "block",
      atom: true,
      attrs: { id: { default: null } },
    },
  },
});

describe("standard rich-text semantic publication", () => {
  it("publishes only the approved block profile with normalized bounded labels", () => {
    const owner = contentRoot([
      textblock("heading", IDS.heading, "  Welcome\n to   Scaffold "),
      textblock("paragraph", IDS.emptyParagraph, ""),
      textblock("paragraph", IDS.repeatedParagraph1, "Repeat"),
      textblock("paragraph", IDS.repeatedParagraph2, "Repeat"),
      textblock("heading", IDS.longHeading, "A".repeat(200)),
      schema.node("horizontalRule", { id: IDS.divider }),
      textblock("codeBlock", IDS.codeBlock, "const value = 1;"),
    ]);

    const candidates = projectStandardRichText({ owner });

    expect(candidates.map(({ relativePos }) => owner.nodeAt(relativePos)?.attrs["id"])).toEqual([
      IDS.heading,
      IDS.emptyParagraph,
      IDS.repeatedParagraph1,
      IDS.repeatedParagraph2,
      IDS.longHeading,
      IDS.codeBlock,
    ]);
    expect(candidates.map(({ label }) => label)).toEqual([
      "Welcome to Scaffold",
      "Paragraph",
      "Repeat",
      "Repeat",
      `${"A".repeat(MAX_SEMANTIC_LABEL_LENGTH - 1)}…`,
      "const value = 1;",
    ]);
    expect(candidates.every(({ semanticRole }) => semanticRole === "rich-text")).toBe(true);
    expect(Object.isFrozen(candidates)).toBe(true);
    expect(candidates.every(Object.isFrozen)).toBe(true);
  });

  it("models lists and blockquotes as nested grouping items without duplicate leading paragraphs", () => {
    const nestedList = schema.node("bulletList", { id: IDS.nestedList }, [
      schema.node("listItem", { id: IDS.nestedItem }, [
        textblock("paragraph", IDS.nestedParagraph, "Nested item"),
      ]),
    ]);
    const bulletList = schema.node("bulletList", { id: IDS.bulletList }, [
      schema.node("listItem", { id: IDS.bulletItem }, [
        textblock("paragraph", IDS.bulletParagraph, "First item"),
        nestedList,
      ]),
    ]);
    const blockquote = schema.node("blockquote", { id: IDS.blockquote }, [
      textblock("paragraph", IDS.quoteParagraph, "Quoted words"),
    ]);
    const owner = contentRoot([bulletList, blockquote]);

    const candidates = projectStandardRichText({ owner });
    const candidateIds = candidates.map(
      ({ relativePos }) => owner.nodeAt(relativePos)?.attrs["id"] as EmbeddedNodeId,
    );

    expect(candidateIds).toEqual([
      IDS.bulletList,
      IDS.bulletItem,
      IDS.nestedList,
      IDS.nestedItem,
      IDS.blockquote,
      IDS.quoteParagraph,
    ]);
    expect(candidateIds).not.toContain(IDS.bulletParagraph);
    expect(candidateIds).not.toContain(IDS.nestedParagraph);
    expect(candidates.map(({ label }) => label)).toEqual([
      "First itemNested item",
      "First item",
      "Nested item",
      "Nested item",
      "Quoted words",
      "Quoted words",
    ]);
  });

  it("projects only inside the supplied owner-approved content root", () => {
    const first = textblock("paragraph", IDS.repeatedParagraph1, "First");
    const nestedRoot = schema.node("blockquote", { id: IDS.blockquote }, [
      textblock("paragraph", IDS.quoteParagraph, "Approved"),
    ]);
    const owner = contentRoot([first, nestedRoot]);

    const candidates = projectStandardRichText({ owner, contentRoot: nestedRoot });

    expect(candidates.map(({ relativePos }) => owner.nodeAt(relativePos)?.attrs["id"])).toEqual([
      IDS.quoteParagraph,
    ]);
    const detachedRoot = schema.node("blockquote", { id: IDS.blockquote }, [
      textblock("paragraph", IDS.quoteParagraph, "Detached"),
    ]);
    expect(projectStandardRichText({ owner, contentRoot: detachedRoot })).toEqual([]);
  });
});

function contentRoot(content: readonly ProseMirrorNode[]): ProseMirrorNode {
  return schema.node("content_root", { id: IDS.root }, content);
}

function textblock(type: string, nodeId: EmbeddedNodeId, text: string): ProseMirrorNode {
  return schema.node(type, { id: nodeId }, text.length === 0 ? [] : [schema.text(text)]);
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}

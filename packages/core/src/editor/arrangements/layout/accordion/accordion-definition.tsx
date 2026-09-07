import {
  BoundingBoxIcon as BoundingBox,
  ListBulletsIcon as ListBullets,
  SquareIcon as Square,
  StackIcon as Stack,
} from "@phosphor-icons/react";
import { z } from "zod";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type {
  DocumentTreeDefinition,
  ExposedDocumentChild,
  DocumentTreeChildrenBuilder,
  DocumentTreeItemDescriber,
} from "@/document/model/document-tree";
import { normalizeSemanticLabel } from "@/document/model/document-tree/semantic-labels";
import { defineConfiguration } from "@/editor/configuration/definition";

import type { LayoutDefinition } from "../model/layout-definition";
import { hiddenLayoutSectionDocumentTree } from "../shared/model/layout-semantic-publication";
import { createAccordionContent, createAccordionSection } from "./accordion-content";

const AccordionLayoutOptionsSchema = z.object({
  variant: z.enum(["default", "borderless"]).default("default"),
  allowMultiple: z.boolean().default(false),
  label: z.string().default("Accordion"),
});

const AccordionSectionOptionsSchema = z.object({
  defaultOpen: z.boolean().default(false),
});

const describeAccordionSection: DocumentTreeItemDescriber = ({ owner }) => {
  let title = "";
  owner.forEach((node) => {
    if (node.type.name === "accordion_section_title") title = node.textContent;
  });
  return Object.freeze({ label: normalizeSemanticLabel(title, "Accordion section") });
};

const projectAccordionSectionChildren: DocumentTreeChildrenBuilder = ({ owner, helpers }) => {
  let panel: ProseMirrorNode | undefined;
  owner.forEach((node) => {
    if (node.type.name === "accordion_section_panel") panel = node;
  });
  if (!panel) return Object.freeze([]);

  const candidates = new Map<number, ExposedDocumentChild>();
  for (const candidate of helpers.projectStandardRichText(panel)) {
    candidates.set(candidate.relativePos, candidate);
  }
  for (const candidate of helpers.projectStructuralChildren(panel)) {
    candidates.set(candidate.relativePos, candidate);
  }
  return Object.freeze([...candidates.values()].sort((a, b) => a.relativePos - b.relativePos));
};

const accordionSectionDocumentTree: DocumentTreeDefinition = Object.freeze({
  describe: describeAccordionSection,
  projectChildren: projectAccordionSectionChildren,
});

export const accordionLayoutDefinition = {
  id: "accordion",
  title: "Accordion",
  description: "Stack expandable sections of content",
  icon: ListBullets,
  boundedPlacement: "fill",
  boundedSectionBehavior: "terminal-scroll",
  keywords: ["accordion", "collapse", "expand", "sections"],
  placeholders: {
    accordion_section_title: "Enter your section title",
  },
  documentTree: hiddenLayoutSectionDocumentTree,
  control: {
    semanticChildren: {
      section: {
        events: [
          { type: "opened", label: "Opened" },
          { type: "closed", label: "Closed" },
        ],
        states: [
          {
            key: "open",
            label: "Open",
            valueType: { kind: "boolean" },
          },
        ],
        commands: [
          { type: "open", label: "Open" },
          { type: "close", label: "Close" },
        ],
      },
    },
  },
  configuration: defineConfiguration({
    attr: "options",
    schema: AccordionLayoutOptionsSchema,
    sheet: {
      title: "Accordion settings",
      sections: [{ id: "accordion", title: "Accordion" }],
      defaultOpenSections: ["accordion"],
    },
    controls: [
      {
        kind: "boolean",
        name: "allowMultiple",
        label: "Allow multiple sections open",
        description: "Turn this off to keep only one section open at a time.",
        icon: Stack,
        presentation: "switch",
        placement: {
          quickMenu: { presentation: "icon-toggle" },
          sheet: { section: "accordion" },
        },
      },
      {
        kind: "select",
        name: "variant",
        label: "Style",
        options: [
          { value: "default", label: "Default", icon: Square },
          { value: "borderless", label: "Borderless", icon: BoundingBox },
        ],
        placement: {
          quickMenu: { presentation: "segmented" },
          sheet: { section: "accordion" },
        },
      },
      {
        kind: "text",
        name: "label",
        label: "Accessible label",
        placement: { sheet: { section: "accordion" } },
      },
    ],
  }),
  section: {
    label: "Accordion section",
    addLabel: "Add section",
    compositionSlot: { kind: "child", nodeType: "accordion_section_panel" },
    structure: {
      kind: "ordered-children",
      nodeTypes: ["accordion_section_title", "accordion_section_panel"],
    },
    documentTree: accordionSectionDocumentTree,
    create: ({ index }) => createAccordionSection(index, `Section ${index + 1}`, false),
    configuration: defineConfiguration({
      attr: "options",
      schema: AccordionSectionOptionsSchema,
      sheet: {
        title: "Accordion section settings",
        sections: [{ id: "section", title: "Section" }],
        defaultOpenSections: ["section"],
      },
      controls: [
        {
          kind: "boolean",
          name: "defaultOpen",
          label: "Open by default",
          placement: { sheet: { section: "section" } },
        },
      ],
    }),
  },
  createContent: (input) => createAccordionContent(input?.options),
} satisfies LayoutDefinition;

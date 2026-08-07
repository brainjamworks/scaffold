import {
  BoundingBoxIcon as BoundingBox,
  ListBulletsIcon as ListBullets,
  SquareIcon as Square,
  StackIcon as Stack,
} from "@phosphor-icons/react";
import { z } from "zod";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type {
  DocumentSemanticsDefinition,
  PublishedSemanticChild,
  SemanticChildProjector,
  SemanticChildProjectionInput,
  SemanticItemDescriber,
} from "@/document/model/semantic-document";
import { normalizeSemanticLabel } from "@/document/model/semantic-document/semantic-labels";
import { defineConfiguration } from "@/editor/configuration/definition";

import type { LayoutDefinition } from "../model/layout-definition";
import { createAccordionContent, createAccordionSection } from "./accordion-content";

const AccordionLayoutOptionsSchema = z.object({
  variant: z.enum(["default", "borderless"]).default("default"),
  allowMultiple: z.boolean().default(false),
  label: z.string().default("Accordion"),
});

const AccordionSectionOptionsSchema = z.object({
  defaultOpen: z.boolean().default(false),
});

const accordionDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: ({ owner, ownerId }: SemanticChildProjectionInput) => {
    const sections: PublishedSemanticChild[] = [];
    let offset = 0;
    owner.forEach((node) => {
      if (node.type.name === "section") {
        const sectionId = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
        if (sectionId.success) {
          sections.push(
            Object.freeze({
              relativePos: offset,
              activation: Object.freeze([
                Object.freeze({
                  ownerId,
                  childId: sectionId.data,
                  ownerKind: "layout" as const,
                }),
              ]),
            }),
          );
        }
      }
      offset += node.nodeSize;
    });
    return Object.freeze(sections);
  },
});

const describeAccordionSection: SemanticItemDescriber = ({ owner }) => {
  let title = "";
  owner.forEach((node) => {
    if (node.type.name === "accordion_section_title") title = node.textContent;
  });
  return Object.freeze({ label: normalizeSemanticLabel(title, "Accordion section") });
};

const projectAccordionSectionChildren: SemanticChildProjector = ({ owner, helpers }) => {
  let panel: ProseMirrorNode | undefined;
  owner.forEach((node) => {
    if (node.type.name === "accordion_section_panel") panel = node;
  });
  if (!panel) return Object.freeze([]);

  const candidates = new Map<number, PublishedSemanticChild>();
  for (const candidate of helpers.projectStandardRichText(panel)) {
    candidates.set(candidate.relativePos, candidate);
  }
  for (const candidate of helpers.projectStructuralChildren(panel)) {
    candidates.set(candidate.relativePos, candidate);
  }
  return Object.freeze([...candidates.values()].sort((a, b) => a.relativePos - b.relativePos));
};

const accordionSectionDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
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
  documentSemantics: accordionDocumentSemantics,
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
        label: "Multiple open",
        icon: Stack,
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
    documentSemantics: accordionSectionDocumentSemantics,
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

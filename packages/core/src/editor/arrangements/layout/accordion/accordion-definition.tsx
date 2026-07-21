import {
  BoundingBoxIcon as BoundingBox,
  ListBulletsIcon as ListBullets,
  SquareIcon as Square,
  StackIcon as Stack,
} from "@phosphor-icons/react";
import { z } from "zod";

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

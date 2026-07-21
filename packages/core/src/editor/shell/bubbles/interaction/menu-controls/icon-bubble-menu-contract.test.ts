import { describe, expect, it } from "vite-plus/test";

import { defineLayout } from "@/editor/arrangements/layout/model/layout-definition";
import { accordionLayoutDefinition } from "@/editor/arrangements/layout/accordion/accordion-definition";
import { processFlowLayoutDefinition } from "@/editor/arrangements/layout/process-flow/process-flow-definition";
import { tabsLayoutDefinition } from "@/editor/arrangements/layout/tabs/tabs-definition";
import { fillBlanksBlockDefinition } from "@/editor/blocks/assessment/fill-blanks/fill-blanks-definition";
import { galleryDefinition } from "@/editor/blocks/figure-composition/gallery/gallery-definition";
import { flashcardBlockDefinition } from "@/editor/blocks/presentation/flashcard/flashcard-definition";
import { roadmapBlockDefinition } from "@/editor/blocks/presentation/roadmap/roadmap-definition";
import { timelineBlockDefinition } from "@/editor/blocks/presentation/timeline/timeline-definition";
import type { QuickMenuDefinition } from "@/editor/configuration/quick-menu";
import type { NodeSettingsSheetDefinition } from "@/editor/configuration/settings-sheet";

interface IconBubbleMenuContract {
  label: string;
  quickMenu: QuickMenuDefinition | undefined;
  settingsSheet: NodeSettingsSheetDefinition | undefined;
}

const layoutDefinitions = [
  defineLayout(accordionLayoutDefinition),
  defineLayout(processFlowLayoutDefinition),
  defineLayout(tabsLayoutDefinition),
];

const blockDefinitions = [
  fillBlanksBlockDefinition,
  galleryDefinition,
  flashcardBlockDefinition,
  roadmapBlockDefinition,
  timelineBlockDefinition,
];

const contracts: IconBubbleMenuContract[] = [
  ...blockDefinitions.map((definition) => ({
    label: definition.nodeType,
    quickMenu: definition.quickMenu,
    settingsSheet: definition.settingsSheet,
  })),
  ...layoutDefinitions.map((definition) => ({
    label: definition.id,
    quickMenu: definition.quickMenu,
    settingsSheet: definition.settingsSheet,
  })),
];

describe("block and layout icon bubble menu contracts", () => {
  for (const contract of contracts) {
    it(`${contract.label} uses icons in the bubble and full controls in the sheet`, () => {
      expect(contract.quickMenu).toBeDefined();
      expect(contract.settingsSheet).toBeDefined();

      const sheetFieldNames =
        contract.settingsSheet?.sections.flatMap((section) =>
          section.fields.map((field) => field.name),
        ) ?? [];

      for (const control of contract.quickMenu?.controls ?? []) {
        expect(sheetFieldNames).toContain(control.name);

        if (control.kind === "boolean") {
          expect(control.presentation).toBe("icon-toggle");
          expect(control.icon).toBeDefined();
        }

        if (control.kind === "select" && control.presentation === "segmented") {
          expect(control.options?.length).toBeGreaterThan(0);
          for (const option of control.options ?? []) {
            expect(option.icon).toBeDefined();
          }
        }
      }
    });
  }
});

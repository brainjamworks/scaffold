import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import {
  getLayoutInteractionStoreState,
  replaceLayoutFeatureViewStateForOwners,
} from "./layout-interaction-store";

describe("replaceLayoutFeatureViewStateForOwners", () => {
  it("removes every disposable Layout view entry for exact owners only", () => {
    const editor = {} as Editor;
    const state = getLayoutInteractionStoreState(editor);

    populateOwner(state, "layout-a", "a");
    populateOwner(state, "layout-b", "b");
    populateOwner(state, "layout-unrelated", "unrelated");

    replaceLayoutFeatureViewStateForOwners(editor, ["layout-a", "layout-b"]);

    const replaced = getLayoutInteractionStoreState(editor);
    for (const ownerId of ["layout-a", "layout-b"]) {
      expect(replaced.activePageByLayoutId).not.toHaveProperty(ownerId);
      expect(replaced.activeTabByLayoutId).not.toHaveProperty(ownerId);
      expect(replaced.lastSectionChangeByLayoutId).not.toHaveProperty(ownerId);
      expect(replaced.openAccordionSectionsByLayoutId).not.toHaveProperty(ownerId);
      expect(replaced.pendingProgrammaticAccordionOpenIdsByLayoutId).not.toHaveProperty(ownerId);
    }
    expect(replaced.activePageByLayoutId["layout-unrelated"]).toBe("page-unrelated");
    expect(replaced.activeTabByLayoutId["layout-unrelated"]).toBe("tab-unrelated");
    expect(replaced.lastSectionChangeByLayoutId["layout-unrelated"]).toEqual({
      origin: "control-command",
      sectionId: "accordion-unrelated",
    });
    expect(replaced.openAccordionSectionsByLayoutId["layout-unrelated"]).toEqual([
      "accordion-unrelated",
    ]);
    expect(
      replaced.pendingProgrammaticAccordionOpenIdsByLayoutId["layout-unrelated"],
    ).toEqual(["accordion-unrelated"]);
  });

  it("is idempotent once the requested owners are already at baseline", () => {
    const editor = {} as Editor;
    const state = getLayoutInteractionStoreState(editor);
    populateOwner(state, "layout-a", "a");

    replaceLayoutFeatureViewStateForOwners(editor, ["layout-a"]);
    const baseline = getLayoutInteractionStoreState(editor);
    replaceLayoutFeatureViewStateForOwners(editor, ["layout-a"]);

    expect(getLayoutInteractionStoreState(editor)).toBe(baseline);
  });
});

function populateOwner(
  state: ReturnType<typeof getLayoutInteractionStoreState>,
  ownerId: string,
  suffix: string,
): void {
  state.setActivePage(ownerId, `page-${suffix}`);
  state.setActiveTab(ownerId, `tab-${suffix}`);
  state.setAccordionSectionOpen(ownerId, `accordion-${suffix}`, {
    allowMultiple: false,
    defaultOpenIds: [],
    origin: "control-command",
  });
}

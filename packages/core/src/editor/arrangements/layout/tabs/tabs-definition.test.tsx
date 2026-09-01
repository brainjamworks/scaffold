import { describe, expect, it } from "vite-plus/test";

import { tabsLayoutDefinition } from "./tabs-definition";

describe("Tabs layout definition", () => {
  it("publishes select as the only reconstructable Section command", () => {
    expect(tabsLayoutDefinition.section.documentSemantics?.presentation).toEqual({
      actionIds: ["reveal", "hide", "move", "emphasize"],
      reconstructableCommandTypes: ["select"],
    });
  });
});

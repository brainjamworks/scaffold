import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  getEmojiGroups,
  getEmojisByGroup,
  getIconCategories,
  getIconDisplayName,
  getIconNodes,
  getIconsByCategory,
  isEmojiIcon,
  searchEmojis,
  searchIcons,
  setIconCatalogForTests,
  type IconCatalog,
} from "./catalog";

const testCatalog: IconCatalog = {
  icons: {
    icons: {
      "arrow-left": [["path", { d: "m12 19-7-7 7-7" }]],
      "alert-triangle": [["path", { d: "m21.73 18-8-14" }]],
      "badge-info": [["circle", { cx: 12, cy: 12, r: 10 }]],
    },
    categories: {
      alerts: {
        title: "Alerts",
        icon: "alert-triangle",
        icons: ["alert-triangle", "badge-info"],
      },
      arrows: {
        title: "Arrows",
        icon: "arrow-left",
        icons: ["arrow-left"],
      },
    },
  },
  emojis: {
    groups: [
      {
        name: "Smileys & Emotion",
        slug: "smileys-emotion",
        emojis: [
          { emoji: "😀", name: "grinning face" },
          { emoji: "💡", name: "light bulb" },
        ],
      },
    ],
  },
};

describe("icon catalog", () => {
  afterEach(() => setIconCatalogForTests(null));

  it("returns bundled essential nodes before the full catalog loads", () => {
    expect(getIconNodes("info")).toHaveLength(3);
    expect(getIconNodes("warning")?.[0]?.[0]).toBe("path");
  });

  it("searches and groups loaded Lucide icon data", () => {
    setIconCatalogForTests(testCatalog);

    expect(searchIcons("arrow")).toEqual(["arrow-left"]);
    expect(searchIcons("", 2)).toEqual(["arrow-left", "alert-triangle"]);
    expect(getIconsByCategory("alerts")).toEqual(["alert-triangle", "badge-info"]);
    expect(getIconsByCategory(null, 1)).toEqual(["arrow-left"]);
    expect(getIconCategories().map((category) => category.slug)).toEqual(["alerts", "arrows"]);
  });

  it("searches and groups emoji data", () => {
    setIconCatalogForTests(testCatalog);

    expect(searchEmojis("light")).toEqual([{ emoji: "💡", name: "light bulb" }]);
    expect(getEmojiGroups()).toEqual([
      {
        name: "Smileys & Emotion",
        slug: "smileys-emotion",
        count: 2,
        preview: "😀",
      },
    ]);
    expect(getEmojisByGroup(0)).toHaveLength(2);
  });

  it("detects emoji values and formats icon labels", () => {
    expect(isEmojiIcon("💡")).toBe(true);
    expect(isEmojiIcon("alert-triangle")).toBe(false);
    expect(getIconDisplayName("alert-triangle")).toBe("Alert Triangle");
  });
});

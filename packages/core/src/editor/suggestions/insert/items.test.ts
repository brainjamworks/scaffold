import { ImageSquareIcon, SelectionBackgroundIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { describe, expect, it } from "vite-plus/test";

import type { InsertAction } from "@/editor/insertion/insert-action";

import { searchSlashItems } from "./items";

function item(
  input: Pick<
    InsertAction,
    "category" | "description" | "icon" | "id" | "keywords" | "nodeType" | "title"
  >,
): InsertAction {
  return {
    ...input,
    content: () => ({ type: input.nodeType }),
  };
}

describe("searchSlashItems", () => {
  it("ranks direct title matches before keyword and description matches", () => {
    const results = searchSlashItems(
      [
        item({
          id: "image-hotspot",
          nodeType: "imageHotspot",
          title: "Image hotspot",
          description: "Ask learners to identify regions on a gallery image.",
          icon: SelectionBackgroundIcon,
          category: "assessment",
          keywords: ["hotspot", "image", "gallery"],
        }),
        item({
          id: "gallery",
          nodeType: "gallery",
          title: "Gallery",
          description: "Add an image gallery.",
          icon: ImageSquareIcon,
          category: "media",
          keywords: ["images", "photos", "carousel"],
        }),
      ],
      "gallery",
    );

    expect(results.map((result) => result.id)).toEqual(["gallery", "image-hotspot"]);
  });

  it("keeps catalog order when matches have the same rank", () => {
    const results = searchSlashItems(
      [
        item({
          id: "gallery",
          nodeType: "gallery",
          title: "Gallery",
          description: "Add an image gallery.",
          icon: ImageSquareIcon,
          category: "media",
          keywords: ["media"],
        }),
        item({
          id: "photo-grid",
          nodeType: "photoGrid",
          title: "Photo grid",
          description: "Place photos in a grid.",
          icon: SquaresFourIcon,
          category: "media",
          keywords: ["media"],
        }),
      ],
      "media",
    );

    expect(results.map((result) => result.id)).toEqual(["gallery", "photo-grid"]);
  });

  it("falls back from title/id matching to keyword and description matches", () => {
    const results = searchSlashItems(
      [
        item({
          id: "photo-grid",
          nodeType: "photoGrid",
          title: "Photo grid",
          description: "Compare several diagrams.",
          icon: SquaresFourIcon,
          category: "media",
          keywords: ["gallery"],
        }),
        item({
          id: "image-hotspot",
          nodeType: "imageHotspot",
          title: "Image hotspot",
          description: "Ask learners to identify regions on an image.",
          icon: SelectionBackgroundIcon,
          category: "assessment",
          keywords: ["hotspot"],
        }),
      ],
      "gallery",
    );

    expect(results.map((result) => result.id)).toEqual(["photo-grid"]);
  });
});

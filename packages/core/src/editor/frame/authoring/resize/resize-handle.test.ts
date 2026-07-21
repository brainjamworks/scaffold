// @vitest-environment happy-dom

import type { ResizableNodeViewDirection } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import {
  AUTHORING_CHROME_ATTR,
  AUTHORING_RESIZE_HANDLE_ATTR,
} from "../../../interactions/dom/authoring-chrome";
import {
  createResizeHandle,
  resizeHandleAccessibleDescription,
  resizeHandleAccessibleLabel,
} from "./resize-handle";

const directionCases: Array<{
  direction: ResizableNodeViewDirection;
  label: string;
}> = [
  { direction: "top-left", label: "Resize block from top-left corner" },
  { direction: "top", label: "Resize block from top edge" },
  { direction: "top-right", label: "Resize block from top-right corner" },
  { direction: "left", label: "Resize block from left edge" },
  { direction: "right", label: "Resize block from right edge" },
  { direction: "bottom-left", label: "Resize block from bottom-left corner" },
  { direction: "bottom", label: "Resize block from bottom edge" },
  {
    direction: "bottom-right",
    label: "Resize block from bottom-right corner",
  },
];

describe("resize handles", () => {
  it("maps every handle direction to a specific accessible label", () => {
    for (const { direction, label } of directionCases) {
      expect(resizeHandleAccessibleLabel(direction)).toBe(label);
    }
  });

  it("creates described editor chrome buttons for every handle direction", () => {
    expect(resizeHandleAccessibleDescription()).toBe("Drag to resize this block.");

    for (const { direction, label } of directionCases) {
      const handle = createResizeHandle(direction);
      const descriptionId = handle.getAttribute("aria-describedby");

      expect(handle.tagName).toBe("BUTTON");
      expect(handle.getAttribute("type")).toBe("button");
      expect(handle.getAttribute(AUTHORING_CHROME_ATTR)).toBe("resize");
      expect(handle.getAttribute(AUTHORING_RESIZE_HANDLE_ATTR)).toBe(direction);
      expect(handle.getAttribute("aria-label")).toBe(label);
      expect(Number.parseInt(handle.style.width, 10)).toBeGreaterThanOrEqual(24);
      expect(Number.parseInt(handle.style.height, 10)).toBeGreaterThanOrEqual(24);
      expect(descriptionId).not.toBeNull();
      expect(document.getElementById(descriptionId ?? "")?.textContent).toBe(
        resizeHandleAccessibleDescription(),
      );
    }
  });
});

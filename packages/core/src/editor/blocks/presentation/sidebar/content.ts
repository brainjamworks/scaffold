import { SidebarDataSchema, type SidebarData } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import { createStableId } from "@/document/model/identity/stable-ids";

export const SIDEBAR_BLOCK_ID = "sidebar";
export const SIDEBAR_NODE = "sidebar";
export const SIDEBAR_LABEL_NODE = "sidebar_label";
export const SIDEBAR_TITLE_NODE = "sidebar_title";
export const SIDEBAR_BODY_NODE = "sidebar_body";

export function emptySidebarData(overrides: Partial<SidebarData> = {}): SidebarData {
  return SidebarDataSchema.parse(overrides);
}

export function createSidebarContent(options?: Partial<SidebarData>): JSONContent {
  return {
    type: SIDEBAR_NODE,
    attrs: {
      id: createStableId(),
      data: emptySidebarData(options),
    },
    content: [
      createSidebarLabel("Note"),
      createSidebarTitle(defaultTitleFor()),
      createSidebarBody(),
    ],
  };
}

function createSidebarLabel(text: string): JSONContent {
  return {
    type: SIDEBAR_LABEL_NODE,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

function createSidebarTitle(text: string): JSONContent {
  return {
    type: SIDEBAR_TITLE_NODE,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

function createSidebarBody(): JSONContent {
  return {
    type: SIDEBAR_BODY_NODE,
    content: [{ type: "paragraph" }],
  };
}

function defaultTitleFor(): string {
  return "A note to the reader";
}

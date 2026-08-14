import {
  PresentationContentLayout,
  PresentationContentLayoutSchema,
} from "@scaffold/contracts";
import type { Attribute } from "@tiptap/core";

export const CONTENT_LAYOUT_ATTR = "contentLayout" as const;
export const CONTENT_LAYOUT_HTML_ATTR = "data-content-layout" as const;

export function readPresentationContentLayout(value: unknown) {
  return PresentationContentLayoutSchema.parse(value);
}

const contentLayoutAttributeDescriptor: Attribute = {
  default: PresentationContentLayout.Flow,
  parseHTML: (element: HTMLElement) =>
    readPresentationContentLayout(
      element.getAttribute(CONTENT_LAYOUT_HTML_ATTR) ?? PresentationContentLayout.Flow,
    ),
  renderHTML: (attrs: Record<string, unknown>) => ({
    [CONTENT_LAYOUT_HTML_ATTR]: readPresentationContentLayout(
      attrs[CONTENT_LAYOUT_ATTR] ?? PresentationContentLayout.Flow,
    ),
  }),
  validate: (value: unknown) => {
    readPresentationContentLayout(value);
  },
};

export const contentLayoutAttribute = {
  [CONTENT_LAYOUT_ATTR]: contentLayoutAttributeDescriptor,
} satisfies Record<typeof CONTENT_LAYOUT_ATTR, Attribute>;

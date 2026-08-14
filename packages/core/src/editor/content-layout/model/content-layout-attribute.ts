import {
  PresentationContentLayout,
  PresentationContentLayoutSchema,
} from "@scaffold/contracts";
import type { Attribute } from "@tiptap/core";

export const CONTENT_LAYOUT_ATTR = "contentLayout" as const;
export const CONTENT_LAYOUT_HTML_ATTR = "data-content-layout" as const;

function parsePresentationContentLayoutOrThrow(value: unknown) {
  return PresentationContentLayoutSchema.parse(value);
}

const contentLayoutAttributeDescriptor: Attribute = {
  default: PresentationContentLayout.Flow,
  parseHTML: (element: HTMLElement) => {
    const value = element.getAttribute(CONTENT_LAYOUT_HTML_ATTR);
    return parsePresentationContentLayoutOrThrow(
      value === null ? PresentationContentLayout.Flow : value,
    );
  },
  renderHTML: (attrs: Record<string, unknown>) => {
    const value = attrs[CONTENT_LAYOUT_ATTR];
    return {
      [CONTENT_LAYOUT_HTML_ATTR]: parsePresentationContentLayoutOrThrow(
        value === undefined ? PresentationContentLayout.Flow : value,
      ),
    };
  },
  validate: (value: unknown) => {
    parsePresentationContentLayoutOrThrow(value);
  },
};

export const contentLayoutAttribute = {
  [CONTENT_LAYOUT_ATTR]: contentLayoutAttributeDescriptor,
} satisfies Record<typeof CONTENT_LAYOUT_ATTR, Attribute>;

import { mergeAttributes, Node } from "@tiptap/core";

import {
  catalogIconValue,
  IconSizeSchema,
  IconValueSchema,
  type IconSize,
  type IconValue,
} from "@/schemas/media/icon";
import { getIconDisplayName } from "@/ui/icons/catalog";

export const INLINE_ICON_NODE_NAME = "inlineIcon";
export const DEFAULT_INLINE_ICON_VALUE = catalogIconValue("info");
export const DEFAULT_INLINE_ICON_SIZE: IconSize = "sm";

type InlineIconHtmlAttrs = Record<string, string>;

export function readInlineIconValue(value: unknown): IconValue | null {
  const parsed = IconValueSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readInlineIconSize(value: unknown): IconSize {
  const parsed = IconSizeSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_INLINE_ICON_SIZE;
}

export function readInlineIconLabel(value: IconValue): string {
  if (value.kind === "catalog") return getIconDisplayName(value.name);
  if (value.kind === "emoji") return value.value;
  return value.alt?.trim() || "Image icon";
}

export function inlineIconStaticText(value: IconValue): string {
  if (value.kind === "emoji") return value.value;
  return readInlineIconLabel(value);
}

function parseInlineIconValueFromElement(element: HTMLElement): IconValue {
  const kind = element.getAttribute("data-icon-kind");

  if (kind === "catalog") {
    const name = element.getAttribute("data-icon-name")?.trim();
    return name ? IconValueSchema.parse({ kind, name }) : DEFAULT_INLINE_ICON_VALUE;
  }

  if (kind === "emoji") {
    const value = element.getAttribute("data-icon-value")?.trim();
    return value ? IconValueSchema.parse({ kind, value }) : DEFAULT_INLINE_ICON_VALUE;
  }

  if (kind === "media") {
    const mediaId = element.getAttribute("data-icon-media-id")?.trim();
    const alt = element.getAttribute("data-icon-alt")?.trim();
    return mediaId
      ? IconValueSchema.parse({
          kind,
          mediaId,
          ...(alt ? { alt } : {}),
        })
      : DEFAULT_INLINE_ICON_VALUE;
  }

  return DEFAULT_INLINE_ICON_VALUE;
}

function renderInlineIconValueAttrs(value: unknown): InlineIconHtmlAttrs {
  const iconValue = readInlineIconValue(value) ?? DEFAULT_INLINE_ICON_VALUE;

  if (iconValue.kind === "catalog") {
    return {
      "data-icon-kind": "catalog",
      "data-icon-name": iconValue.name,
    };
  }

  if (iconValue.kind === "emoji") {
    return {
      "data-icon-kind": "emoji",
      "data-icon-value": iconValue.value,
    };
  }

  return {
    "data-icon-kind": "media",
    "data-icon-media-id": iconValue.mediaId,
    ...(iconValue.alt ? { "data-icon-alt": iconValue.alt } : {}),
  };
}

export const InlineIconNode = Node.create({
  name: INLINE_ICON_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      value: {
        default: DEFAULT_INLINE_ICON_VALUE,
        parseHTML: (element: HTMLElement) => parseInlineIconValueFromElement(element),
        renderHTML: (attrs: { value?: unknown }) => renderInlineIconValueAttrs(attrs.value),
      },
      size: {
        default: DEFAULT_INLINE_ICON_SIZE,
        parseHTML: (element: HTMLElement) =>
          readInlineIconSize(element.getAttribute("data-icon-size")),
        renderHTML: (attrs: { size?: unknown }) => ({
          "data-icon-size": readInlineIconSize(attrs.size),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-icon"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const value = readInlineIconValue(node.attrs["value"]) ?? DEFAULT_INLINE_ICON_VALUE;
    const size = readInlineIconSize(node.attrs["size"]);
    const label = readInlineIconLabel(value);

    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "inline-icon",
        "data-icon-size": size,
        class: "sc-inline-icon-static",
        role: "img",
        "aria-label": label,
      }),
      inlineIconStaticText(value),
    ];
  },
});

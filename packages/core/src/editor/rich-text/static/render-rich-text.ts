import type { DOMSerializer, Fragment } from "@tiptap/pm/model";

import { renderInlineMathInHtml } from "@/editor/rich-text/math/view/math-rendering";

import {
  sanitizeAuthoredStaticRichTextHtml,
  sanitizeRenderedStaticRichTextHtml,
} from "./sanitize-html";

export function serializeStaticRichTextHtml(serializer: DOMSerializer, fragment: Fragment): string {
  const container = document.createElement("div");
  container.appendChild(serializer.serializeFragment(fragment));
  const authoredHtml = sanitizeAuthoredStaticRichTextHtml(container.innerHTML);
  return sanitizeRenderedStaticRichTextHtml(renderInlineMathInHtml(authoredHtml));
}

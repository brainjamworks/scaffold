import createDOMPurify, { type Config, type DOMPurify } from "dompurify";

const ACTIVE_CONTENT_TAGS = [
  "audio",
  "button",
  "canvas",
  "embed",
  "form",
  "iframe",
  "img",
  "input",
  "object",
  "script",
  "select",
  "source",
  "style",
  "svg",
  "textarea",
  "video",
];

const COMMON_CONFIG = {
  ALLOW_DATA_ATTR: false,
  ADD_TAGS: ["code"],
  ADD_ATTR: [
    "aria-hidden",
    "aria-label",
    "class",
    "data-icon-alt",
    "data-icon-kind",
    "data-icon-media-id",
    "data-icon-name",
    "data-icon-size",
    "data-icon-value",
    "data-latex",
    "data-type",
    "data-vocab-definition",
    "data-vocab-term",
    "rel",
    "target",
    "title",
  ],
  FORBID_TAGS: ACTIVE_CONTENT_TAGS,
  RETURN_TRUSTED_TYPE: false,
} as const;

let purifier: DOMPurify | null = null;
let purifierWindow: Window | null = null;

function getPurifier(): DOMPurify | null {
  if (typeof window === "undefined") return null;
  if (!purifier || purifierWindow !== window) {
    purifier = createDOMPurify(window);
    purifierWindow = window;
  }
  return purifier;
}

function sanitize(html: string, config: Config): string {
  const activePurifier = getPurifier();
  if (!activePurifier?.isSupported) return html;
  return activePurifier.sanitize(html, config);
}

function sanitizeFragment(html: string, config: Config): string {
  const activePurifier = getPurifier();
  if (!activePurifier?.isSupported || typeof document === "undefined") {
    return html;
  }

  // DOMPurify normalizes root-level inline fragments as body content in
  // happy-dom. Sanitize inside a neutral container so marks like <code>
  // keep their element wrapper, then return only the sanitized children.
  const sanitized = activePurifier.sanitize(`<div>${html}</div>`, config);
  const template = document.createElement("template");
  template.innerHTML = sanitized;
  const root = template.content.firstElementChild;
  if (root?.tagName.toLowerCase() !== "div") return sanitized;
  return root.innerHTML;
}

export function sanitizeAuthoredStaticRichTextHtml(html: string): string {
  return sanitize(html, {
    ...COMMON_CONFIG,
    ADD_TAGS: [...COMMON_CONFIG.ADD_TAGS],
    ADD_ATTR: [...COMMON_CONFIG.ADD_ATTR],
    FORBID_ATTR: ["style", "src", "srcdoc", "srcset"],
  });
}

export function sanitizeRenderedStaticRichTextHtml(html: string): string {
  return sanitizeFragment(html, {
    ...COMMON_CONFIG,
    USE_PROFILES: { html: true, mathMl: true },
    ADD_TAGS: [...COMMON_CONFIG.ADD_TAGS, "annotation", "semantics"],
    ADD_ATTR: [...COMMON_CONFIG.ADD_ATTR, "encoding", "style", "xmlns"],
  });
}

export function sanitizeStaticRichTextHtml(html: string): string {
  return sanitizeRenderedStaticRichTextHtml(sanitizeAuthoredStaticRichTextHtml(html));
}

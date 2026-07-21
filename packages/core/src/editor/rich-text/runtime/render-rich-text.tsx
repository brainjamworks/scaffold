import type { JSONContent } from "@tiptap/core";
import katex from "katex";
import type { CSSProperties, ReactNode } from "react";

import {
  DEFAULT_INLINE_ICON_VALUE,
  readInlineIconSize,
  readInlineIconValue,
} from "@/editor/rich-text/inline-icon/model/InlineIconNode";
import { KATEX_OPTIONS } from "@/editor/rich-text/math/model/katex-options";
import { sanitizeRenderedStaticRichTextHtml } from "@/editor/rich-text/static/sanitize-html";
import { normalizeVocabularyText } from "@/editor/rich-text/vocabulary-term/model/VocabularyTermNode";
import { IconRenderer } from "@/ui/icons/IconRenderer";

import "@/editor/rich-text/inline-icon/view/inline-icon.css";
import "@/editor/rich-text/vocabulary-term/view/vocabulary-term.css";
import "katex/dist/katex.min.css";
import "./render-rich-text.css";

export function renderRuntimeRichTextNode(node: JSONContent, key = "root"): ReactNode {
  const children = (node.content ?? []).map((child, index) =>
    renderRuntimeRichTextNode(child, `${key}:${index}`),
  );

  if (typeof node.text === "string") {
    return applyMarks(node.text, node.marks);
  }

  switch (node.type) {
    case "doc":
      return children;
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "heading":
      return (
        <p key={key} className="sc-runtime-rich-text-heading">
          {children}
        </p>
      );
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return <ol key={key}>{children}</ol>;
    case "listItem":
      return <li key={key}>{children}</li>;
    case "hardBreak":
      return <br key={key} />;
    case "inlineMath":
      return renderRuntimeInlineMath(node, key);
    case "inlineIcon":
      return renderRuntimeInlineIcon(node, key);
    case "vocabTerm":
      return renderRuntimeVocabularyTerm(node, key);
    default:
      return <span key={key}>{children}</span>;
  }
}

function renderRuntimeVocabularyTerm(node: JSONContent, key: string): ReactNode {
  const term = normalizeVocabularyText(node.attrs?.["term"]);
  const definition = normalizeVocabularyText(node.attrs?.["definition"]);

  return (
    <span
      key={key}
      className="sc-vocabulary-term-static"
      data-type="vocab-term"
      data-vocab-definition={definition || undefined}
      data-vocab-term={term || undefined}
      title={definition || undefined}
    >
      {term}
    </span>
  );
}

function renderRuntimeInlineIcon(node: JSONContent, key: string): ReactNode {
  const value = readInlineIconValue(node.attrs?.["value"]) ?? DEFAULT_INLINE_ICON_VALUE;
  const size = readInlineIconSize(node.attrs?.["size"]);

  return (
    <span
      key={key}
      className="sc-inline-icon"
      data-icon-kind={value.kind}
      data-icon-size={size}
      data-type="inline-icon"
    >
      <IconRenderer value={value} decorative={false} className="sc-inline-icon__glyph" />
    </span>
  );
}

function renderRuntimeInlineMath(node: JSONContent, key: string): ReactNode {
  const latex = typeof node.attrs?.["latex"] === "string" ? node.attrs["latex"] : "";

  try {
    const markup = sanitizeRenderedStaticRichTextHtml(katex.renderToString(latex, KATEX_OPTIONS));
    return (
      <span
        key={key}
        className="sc-runtime-rich-text-inline-math tiptap-mathematics-render"
        data-latex={latex}
        data-type="inline-math"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  } catch {
    return (
      <span
        key={key}
        className="sc-runtime-rich-text-inline-math inline-math-error"
        data-latex={latex}
        data-type="inline-math"
      >
        {latex}
      </span>
    );
  }
}

function applyMarks(text: string, marks: JSONContent["marks"]): ReactNode {
  return (marks ?? []).reduce<ReactNode>((current, mark) => {
    switch (mark.type) {
      case "bold":
        return <strong>{current}</strong>;
      case "italic":
        return <em>{current}</em>;
      case "strike":
        return <s>{current}</s>;
      case "code":
        return <code>{current}</code>;
      case "underline":
        return <u>{current}</u>;
      case "highlight": {
        const color = readStringAttr(mark, "color");
        return <mark style={color ? { backgroundColor: color } : undefined}>{current}</mark>;
      }
      case "subscript":
        return <sub>{current}</sub>;
      case "superscript":
        return <sup>{current}</sup>;
      case "textStyle": {
        const color = readStringAttr(mark, "color");
        const fontSize = readStringAttr(mark, "fontSize");
        const style: CSSProperties = {};
        if (color) style.color = color;
        if (fontSize) style.fontSize = fontSize;
        return Object.keys(style).length > 0 ? <span style={style}>{current}</span> : current;
      }
      case "link": {
        const href = typeof mark.attrs?.["href"] === "string" ? mark.attrs["href"] : "";
        return isSafeRuntimeHref(href) ? (
          <a href={href} rel="noreferrer" target="_blank">
            {current}
          </a>
        ) : (
          current
        );
      }
      default:
        return current;
    }
  }, text);
}

function readStringAttr(node: JSONContent, name: string): string {
  const value = node.attrs?.[name];
  return typeof value === "string" ? value.trim() : "";
}

function isSafeRuntimeHref(href: string): boolean {
  if (href.startsWith("/") || href.startsWith("#")) return true;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { renderRuntimeRichTextNode } from "./render-rich-text";

describe("renderRuntimeRichTextNode", () => {
  it("renders empty documents without placeholder markup", () => {
    const { container } = render(<div>{renderRuntimeRichTextNode({ type: "doc" })}</div>);
    expect(container.textContent).toBe("");
  });

  it("renders paragraphs, lists, headings, and supported text marks", () => {
    render(
      <div>
        {renderRuntimeRichTextNode({
          type: "doc",
          content: [
            {
              type: "heading",
              content: [{ type: "text", text: "Heading", marks: [{ type: "bold" }] }],
            },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        { type: "text", text: "Marked", marks: [{ type: "italic" }] },
                        { type: "text", text: "Struck", marks: [{ type: "strike" }] },
                        { type: "text", text: "Coded", marks: [{ type: "code" }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        })}
      </div>,
    );

    expect(screen.getByText("Heading").tagName).toBe("STRONG");
    expect(screen.getByText("Marked").tagName).toBe("EM");
    expect(screen.getByText("Struck").tagName).toBe("S");
    expect(screen.getByText("Coded").tagName).toBe("CODE");
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("preserves every caption text mark and hard break", () => {
    render(
      <div>
        {renderRuntimeRichTextNode({
          type: "paragraph",
          content: [
            { type: "text", text: "Underlined", marks: [{ type: "underline" }] },
            { type: "hardBreak" },
            {
              type: "text",
              text: "Highlighted",
              marks: [{ type: "highlight", attrs: { color: "#FBF3DB" } }],
            },
            { type: "text", text: "Subscript", marks: [{ type: "subscript" }] },
            { type: "text", text: "Superscript", marks: [{ type: "superscript" }] },
            {
              type: "text",
              text: "Styled",
              marks: [{ type: "textStyle", attrs: { color: "#161D77", fontSize: "24px" } }],
            },
          ],
        })}
      </div>,
    );

    expect(screen.getByText("Underlined").tagName).toBe("U");
    expect(screen.getByText("Underlined").parentElement?.querySelector("br")).not.toBeNull();
    expect(screen.getByText("Highlighted").tagName).toBe("MARK");
    expect(screen.getByText("Highlighted")).toHaveStyle({ backgroundColor: "#FBF3DB" });
    expect(screen.getByText("Subscript").tagName).toBe("SUB");
    expect(screen.getByText("Superscript").tagName).toBe("SUP");
    expect(screen.getByText("Styled")).toHaveStyle({ color: "#161D77", fontSize: "24px" });
  });

  it("renders inline math as safe mathematical markup", () => {
    const { container } = render(
      <div>
        {renderRuntimeRichTextNode({
          type: "paragraph",
          content: [{ type: "inlineMath", attrs: { latex: "x^2" } }],
        })}
      </div>,
    );

    const math = container.querySelector('[data-type="inline-math"]');
    expect(math?.getAttribute("data-latex")).toBe("x^2");
    expect(math?.querySelector("math")).not.toBeNull();
    expect(math?.querySelector("script")).toBeNull();
  });

  it("renders every inline icon value with its accessible label and size", () => {
    const { container } = render(
      <div>
        {renderRuntimeRichTextNode({
          type: "paragraph",
          content: [
            {
              type: "inlineIcon",
              attrs: { value: { kind: "catalog", name: "lightbulb" }, size: "sm" },
            },
            {
              type: "inlineIcon",
              attrs: { value: { kind: "emoji", value: "💡" }, size: "md" },
            },
            {
              type: "inlineIcon",
              attrs: {
                value: { kind: "media", mediaId: "icon-1", alt: "Compass diagram" },
                size: "lg",
              },
            },
          ],
        })}
      </div>,
    );

    expect(screen.getByRole("img", { name: "Lightbulb" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "💡" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Compass diagram" })).toBeInTheDocument();
    expect(
      [...container.querySelectorAll('[data-type="inline-icon"]')].map((icon) =>
        icon.getAttribute("data-icon-size"),
      ),
    ).toEqual(["sm", "md", "lg"]);
  });

  it("preserves vocabulary terms and their definitions", () => {
    render(
      <div>
        {renderRuntimeRichTextNode({
          type: "paragraph",
          content: [
            {
              type: "vocabTerm",
              attrs: {
                term: " schema ",
                definition: " A structural contract for content. ",
              },
            },
          ],
        })}
      </div>,
    );

    const term = screen.getByText("schema");
    expect(term.getAttribute("data-vocab-term")).toBe("schema");
    expect(term.getAttribute("data-vocab-definition")).toBe("A structural contract for content.");
    expect(term.getAttribute("title")).toBe("A structural contract for content.");
  });

  it("links only safe relative, fragment, HTTP, and HTTPS targets", () => {
    render(
      <div>
        {renderRuntimeRichTextNode({
          type: "doc",
          content: [
            paragraphLink("Relative", "/lesson"),
            paragraphLink("Fragment", "#part"),
            paragraphLink("Http", "http://example.test"),
            paragraphLink("Secure", "https://example.test"),
            paragraphLink("Unsafe script", "javascript:alert(1)"),
            paragraphLink("Unsafe data", "data:text/html,<script>alert(1)</script>"),
            paragraphLink("Malformed", "not a runtime URL"),
          ],
        })}
      </div>,
    );

    expect(screen.getByRole("link", { name: "Relative" }).getAttribute("href")).toBe("/lesson");
    expect(screen.getByRole("link", { name: "Fragment" }).getAttribute("href")).toBe("#part");
    expect(screen.getByRole("link", { name: "Http" }).getAttribute("href")).toBe(
      "http://example.test",
    );
    expect(screen.getByRole("link", { name: "Secure" }).getAttribute("rel")).toBe("noreferrer");
    expect(screen.queryByRole("link", { name: "Unsafe script" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Unsafe data" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Malformed" })).toBeNull();
    expect(screen.getByText("Unsafe script")).toBeInTheDocument();
    expect(screen.getByText("Unsafe data")).toBeInTheDocument();
    expect(screen.getByText("Malformed")).toBeInTheDocument();
  });

  it("falls back to rendered children for unknown nodes without executing markup", () => {
    render(
      <div>
        {renderRuntimeRichTextNode({
          type: "unknown-node",
          content: [{ type: "text", text: "<script>alert(1)</script>" }],
        })}
      </div>,
    );

    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });
});

function paragraphLink(text: string, href: string) {
  return {
    type: "paragraph",
    content: [{ type: "text", text, marks: [{ type: "link", attrs: { href } }] }],
  };
}

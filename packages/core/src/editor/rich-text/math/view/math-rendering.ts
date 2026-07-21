import katex from "katex";

import { KATEX_OPTIONS } from "@/editor/rich-text/math/model/katex-options";

export function renderInlineMathInHtml(html: string): string {
  if (typeof document === "undefined") return html;

  const template = document.createElement("template");
  template.innerHTML = html;

  template.content
    .querySelectorAll<HTMLElement>('span[data-type="inline-math"][data-latex]')
    .forEach((el) => {
      const latex = el.getAttribute("data-latex") ?? "";
      el.classList.add("tiptap-mathematics-render");

      try {
        el.innerHTML = katex.renderToString(latex, KATEX_OPTIONS);
        el.classList.remove("inline-math-error");
      } catch {
        el.textContent = latex;
        el.classList.add("inline-math-error");
      }
    });

  return template.innerHTML;
}

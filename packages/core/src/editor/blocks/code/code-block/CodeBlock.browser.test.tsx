import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import { CodeBlockSurface, parseCodeBlockData } from "./CodeBlockSurface";
import "./CodeBlock.css";

let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

describe("CodeBlock browser behavior", () => {
  it("keeps its component styling and copy interaction inside the layered stylesheet", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);

    root = createRoot(mount);
    root.render(
      <CodeBlockSurface
        code="const answer = 42;"
        data={parseCodeBlockData({ type: "codeBlock", language: "javascript" })}
        languageControl={<span className="sc-code-block__language-static">JavaScript</span>}
      >
        <pre className="sc-code-block__pre">
          <code className="sc-code-block__content">const answer = 42;</code>
        </pre>
      </CodeBlockSurface>,
    );

    await waitForCondition(() => document.querySelector(".sc-code-block__shell"));

    const shell = requiredElement<HTMLElement>(document, ".sc-code-block__shell");
    const header = requiredElement<HTMLElement>(shell, ".sc-code-block__header");
    const copyButton = requiredElement<HTMLButtonElement>(shell, ".sc-code-block__copy");

    expect(getComputedStyle(shell).borderTopStyle).toBe("solid");
    expect(getComputedStyle(header).display).toBe("flex");
    expect(copyButton.getAttribute("aria-label")).toBe("Copy code");

    copyButton.click();
    await waitForCondition(() => copyButton.getAttribute("aria-label") === "Copied to clipboard");

    expect(copyButton.textContent).toContain("Copied");
  });
});

function requiredElement<T extends Element>(rootElement: ParentNode, selector: string): T {
  const element = rootElement.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for CodeBlock state");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

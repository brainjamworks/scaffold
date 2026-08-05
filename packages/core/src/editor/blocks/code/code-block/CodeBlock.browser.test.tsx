import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import "@/styles/globals.css";

import { CodeBlockSurface, parseCodeBlockData } from "./CodeBlockSurface";
import "./CodeBlock.css";

let root: Root | null = null;
const clipboardWriteText = vi.fn(async (_text: string) => undefined);

beforeEach(() => {
  clipboardWriteText.mockReset();
  clipboardWriteText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWriteText },
  });
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

describe("CodeBlock browser behavior", () => {
  it("renders the learner-facing surface with Course-owned classes", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);

    root = createRoot(mount);
    root.render(
      <CodeBlockSurface
        code="const answer = 42;"
        data={parseCodeBlockData({ type: "code_block", language: "javascript" })}
        languageControl={
          <span className="sc-course-code-block__language-label">JavaScript</span>
        }
      >
        <pre className="sc-course-code-block__pre">
          <code className="sc-course-code-block__content">const answer = 42;</code>
        </pre>
      </CodeBlockSurface>,
    );

    await waitForCondition(() => document.querySelector(".sc-course-code-block__shell"));

    const shell = requiredElement<HTMLElement>(document, ".sc-course-code-block__shell");
    const header = requiredElement<HTMLElement>(shell, ".sc-course-code-block__header");
    const copyButton = requiredElement<HTMLButtonElement>(
      shell,
      ".sc-course-code-block__copy",
    );

    expect(getComputedStyle(header).display).toBe("flex");
    expect(copyButton.getAttribute("aria-label")).toBe("Copy code");
    expect(document.querySelector(".sc-code-block__shell")).toBeNull();
    expect(document.querySelector('[class^="sc-app-"]')).toBeNull();
  });

  it("announces success only after the clipboard write resolves", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);

    root = createRoot(mount);
    root.render(
      <CodeBlockSurface
        code="const answer = 42;"
        data={parseCodeBlockData({ type: "code_block", language: "javascript" })}
        languageControl={
          <span className="sc-course-code-block__language-label">JavaScript</span>
        }
      >
        <pre className="sc-course-code-block__pre">
          <code className="sc-course-code-block__content">const answer = 42;</code>
        </pre>
      </CodeBlockSurface>,
    );

    await waitForCondition(() => document.querySelector(".sc-course-code-block__copy"));

    const copyButton = requiredElement<HTMLButtonElement>(
      document,
      ".sc-course-code-block__copy",
    );
    const status = requiredElement<HTMLElement>(document, '[role="status"]');

    copyButton.click();
    await waitForCondition(
      () => copyButton.getAttribute("aria-label") === "Code copied to clipboard",
    );

    expect(clipboardWriteText).toHaveBeenCalledWith("const answer = 42;");
    expect(copyButton.textContent).toContain("Copied");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(status.textContent).toBe("Code copied to clipboard");
  });

  it("announces clipboard failure without reporting success", async () => {
    clipboardWriteText.mockRejectedValueOnce(new Error("Clipboard permission denied"));
    const mount = document.createElement("div");
    document.body.append(mount);

    root = createRoot(mount);
    root.render(
      <CodeBlockSurface
        code="const answer = 42;"
        data={parseCodeBlockData({ type: "code_block", language: "javascript" })}
        languageControl={
          <span className="sc-course-code-block__language-label">JavaScript</span>
        }
      >
        <pre className="sc-course-code-block__pre">
          <code className="sc-course-code-block__content">const answer = 42;</code>
        </pre>
      </CodeBlockSurface>,
    );

    await waitForCondition(() => document.querySelector(".sc-course-code-block__copy"));

    const copyButton = requiredElement<HTMLButtonElement>(
      document,
      ".sc-course-code-block__copy",
    );
    const status = requiredElement<HTMLElement>(document, '[role="status"]');

    copyButton.click();
    await waitForCondition(() => status.textContent === "Could not copy code to clipboard");

    expect(copyButton.getAttribute("aria-label")).toBe("Copy code");
    expect(copyButton.textContent).toContain("Copy");
    expect(copyButton.textContent).not.toContain("Copied");
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

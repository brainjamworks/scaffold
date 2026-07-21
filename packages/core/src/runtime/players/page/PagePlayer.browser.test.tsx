import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createScaffoldDocumentContent } from "@/format/artifact";
import { createAssessmentRuntimeTestRoot } from "@/runtime/assessment/test-utils";
import "@/styles/globals.css";

import { PagePlayer } from "./PagePlayer";

let roots: Root[] = [];
let hosts: HTMLElement[] = [];

afterEach(() => {
  for (const root of roots) root.unmount();
  for (const host of hosts) host.remove();
  roots = [];
  hosts = [];
});

describe("PagePlayer presentation", () => {
  it("leaves the player and Page surface unpainted", async () => {
    const mounted = await mountPage(pageDocumentWithParagraphs(["Short learner page"]));
    const player = uniqueElement<HTMLElement>(mounted.host, ".sc-page-player");
    const runtimeSurface = uniqueElement<HTMLElement>(
      player,
      '.scaffold-runtime-surface-view[data-course-mode="page"] [data-surface]',
    );

    expect(getComputedStyle(player).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(runtimeSurface).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("grows with Page content while retaining the reader measure", async () => {
    const shortPage = await mountPage(pageDocumentWithParagraphs(["Short learner page"]));
    const longPage = await mountPage(
      pageDocumentWithParagraphs(
        Array.from(
          { length: 24 },
          (_, index) =>
            `Long learner page paragraph ${index + 1}. This content proves the player follows its document height.`,
        ),
      ),
    );
    const shortPlayer = uniqueElement<HTMLElement>(shortPage.host, ".sc-page-player");
    const longPlayer = uniqueElement<HTMLElement>(longPage.host, ".sc-page-player");
    const content = uniqueElement<HTMLElement>(shortPlayer, ".sc-page-player__content");
    const shortStyle = getComputedStyle(shortPlayer);

    expect(shortStyle.minHeight).toBe("0px");
    expect(shortPlayer.getBoundingClientRect().height).toBeLessThan(320);
    expect(longPlayer.getBoundingClientRect().height).toBeGreaterThan(
      shortPlayer.getBoundingClientRect().height,
    );
    expect(longPlayer.scrollHeight).toBe(longPlayer.getBoundingClientRect().height);
    expect(shortStyle.getPropertyValue("--sc-page-player-content-max-width").trim()).toBe("72ch");
    expect(content.getBoundingClientRect().width).toBeLessThan(
      shortPlayer.getBoundingClientRect().width,
    );
    expect(longPlayer.textContent).toContain("Long learner page paragraph 24");
  });

  it("keeps oversized runtime overlays out of Page root geometry", async () => {
    for (const width of [1200, 360]) {
      const mounted = await mountPage(pageDocumentWithRuntimeHint(), width);
      const player = uniqueElement<HTMLElement>(mounted.host, ".sc-page-player");
      const trigger = buttonByName(player, "Show a hint");
      const before = player.getBoundingClientRect();

      trigger.click();
      await waitForCondition(() => document.querySelector(".sc-assessment-hint-popover--runtime"));

      const host = player.querySelector<HTMLElement>(":scope > [data-scaffold-overlay-host]");
      const popover = uniqueElement<HTMLElement>(document, ".sc-assessment-hint-popover--runtime");

      expect(host).not.toBeNull();
      expect(host?.contains(popover)).toBe(true);
      expect(host?.parentElement).toBe(player);
      expect(getComputedStyle(host!).position).toBe("fixed");

      popover.style.width = `${width + 480}px`;
      popover.style.height = `${before.height + 480}px`;
      popover.style.maxWidth = "none";
      popover.style.maxHeight = "none";
      await nextAnimationFrame();

      const open = player.getBoundingClientRect();
      const playerStyle = getComputedStyle(player);
      expect(open.width).toBeCloseTo(before.width, 3);
      expect(open.height).toBeCloseTo(before.height, 3);
      expect(playerStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(playerStyle.borderTopWidth).toBe("0px");
      expect(playerStyle.boxShadow).toBe("none");
      expect(playerStyle.minHeight).toBe("0px");

      popover.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
      );
      await waitForCondition(
        () => document.querySelector(".sc-assessment-hint-popover--runtime") === null,
      );

      const closed = player.getBoundingClientRect();
      expect(closed.width).toBeCloseTo(before.width, 3);
      expect(closed.height).toBeCloseTo(before.height, 3);
    }
  });
});

function pageDocumentWithParagraphs(paragraphs: string[]): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "page",
    surfaceId: "surface-page-player-browser",
  });
  const surface = content.content?.[0]?.content?.[0];

  if (!surface) throw new Error("Page browser test document is missing its first surface.");

  surface.content = paragraphs.map((text) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  }));

  return content;
}

function pageDocumentWithRuntimeHint(): JSONContent {
  const content = pageDocumentWithParagraphs(["Hinted learner page"]);
  const surface = content.content?.[0]?.content?.[0];

  if (!surface) throw new Error("Page browser test document is missing its first surface.");

  surface.content = [
    {
      type: "mcq",
      attrs: {
        id: "mcq-page-browser-popover",
        assessment: {
          correctOptionId: "choice-b",
          feedbackByOptionId: {},
          summaryFeedback: null,
        },
        settings: {
          feedbackMode: "on_submit",
          isGraded: true,
          showAnswer: true,
          legend: "Choose a letter",
          points: 1,
          maxAttempts: null,
        },
      },
      content: [
        { type: "assessment_title", content: [{ type: "paragraph" }] },
        { type: "assessment_instructions", content: [{ type: "paragraph" }] },
        {
          type: "assessment_prompt",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Pick B" }] }],
        },
        {
          type: "assessment_choices_group",
          content: [selectableChoice("choice-a", "A"), selectableChoice("choice-b", "B")],
        },
        {
          type: "assessment_actions_group",
          content: [
            {
              type: "assessment_hints_group",
              content: [
                {
                  type: "assessment_hint",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "The answer follows A." }],
                    },
                  ],
                },
              ],
            },
            { type: "assessment_summary_feedback" },
          ],
        },
      ],
    },
  ];

  return content;
}

function selectableChoice(id: string, text: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      },
    ],
  };
}

function buttonByName(root: ParentNode, name: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll("button")).find(
    (candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent?.trim()) === name,
  );

  if (button === undefined) {
    throw new Error(`Expected ${name} button`);
  }

  return button as HTMLButtonElement;
}

async function mountPage(
  initialContent: JSONContent,
  width = 1200,
): Promise<{ host: HTMLElement }> {
  let editor: TiptapEditor | null = null;
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.append(host);
  hosts.push(host);

  const root = createRoot(host);
  roots.push(root);
  root.render(
    createAssessmentRuntimeTestRoot({
      children: (
        <PagePlayer
          initialContent={initialContent}
          surfaceId="surface-page-player-browser"
          onRendererReady={(readyEditor) => {
            editor = readyEditor;
          }}
        />
      ),
    }),
  );

  await waitForCondition(
    () => editor !== null && host.querySelector(".scaffold-runtime-surface-view"),
  );
  return { host };
}

function uniqueElement<T extends Element>(root: ParentNode, selector: string): T {
  const matches = root.querySelectorAll<T>(selector);
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(`Expected one element for ${selector}, found ${matches.length}.`);
  }
  return matches[0];
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Page browser state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await nextAnimationFrame();
}

async function nextAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

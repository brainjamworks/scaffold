// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldDocumentContent } from "@/format/artifact";
import { createAssessmentRuntimeTestRoot } from "@/runtime/assessment/test-utils";

import { PagePlayer } from "./PagePlayer";

afterEach(() => {
  cleanup();
  document
    .querySelectorAll("iframe[data-test-page-owner-document]")
    .forEach((frame) => frame.remove());
  vi.restoreAllMocks();
});

function pageDocumentWithText(text: string): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "page",
    surfaceId: "surface-page-player",
  });
  const courseDocument = content.content?.[0];
  const surface = courseDocument?.content?.[0];

  if (!surface) {
    throw new Error("page player test document is missing its first surface");
  }

  surface.content = [
    {
      type: "paragraph",
      content: [{ type: "text", text }],
    },
  ];

  return content;
}

function pageDocumentWithRuntimeHint(hintText = "The answer follows A."): JSONContent {
  const content = pageDocumentWithText("Hinted learner page");
  const surface = content.content?.[0]?.content?.[0];

  if (!surface) {
    throw new Error("page player test document is missing its first surface");
  }

  surface.content = [
    {
      type: "mcq",
      attrs: {
        id: "mcq-page-runtime-popover",
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
                      content: [{ type: "text", text: hintText }],
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

describe("PagePlayer", () => {
  it("renders one page through the runtime renderer", async () => {
    const onRendererReady = vi.fn();
    const initialContent = pageDocumentWithText("Learner page content");

    render(
      <PagePlayer
        artifactId="artifact-page-player"
        initialContent={initialContent}
        surfaceId="surface-page-player"
        onRendererReady={onRendererReady}
      />,
    );

    await waitFor(() => expect(onRendererReady).toHaveBeenCalledTimes(1));

    const pagePlayer = screen.getByTestId("page-player");
    expect(pagePlayer.getAttribute("data-runtime-player")).toBe("page");
    expect(pagePlayer.className).toBe("sc-page-player");
    expect(pagePlayer.querySelector(".sc-page-player__content")).not.toBeNull();
    expect(pagePlayer.getAttribute("data-runtime-surface-id")).toBe("surface-page-player");
    expect(screen.getByTestId("course-document-runtime-renderer")).toBeInTheDocument();
    expect(screen.getByText("Learner page content")).toBeInTheDocument();
  });

  it("omits player controls and authoring chrome", async () => {
    const onRendererReady = vi.fn();

    render(
      <PagePlayer
        artifactId="artifact-page-player"
        initialContent={pageDocumentWithText("Plain learner content")}
        surfaceId="surface-page-player"
        onRendererReady={onRendererReady}
      />,
    );

    await waitFor(() => expect(onRendererReady).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole("button", { name: /add page/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /previous/i })).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByTestId("page-navigation")).toBeNull();
    expect(screen.queryByTestId("slideshow-controls")).toBeNull();
    expect(screen.queryByTestId("authoring-agent-dock")).toBeNull();
    expect(document.body.querySelector("[data-scaffold-interaction-bubble]")).toBeNull();
    expect(document.body.querySelector('[data-authoring-chrome="bubble"]')).toBeNull();
    expect(document.body.querySelector('[data-authoring-chrome="menu"]')).toBeNull();
    expect(document.body.querySelector("[data-authoring-move-handle]")).toBeNull();
    expect(document.body.querySelector("[data-authoring-resize-handle]")).toBeNull();
  });

  it("owns runtime popovers in the player document and removes its host on unmount", async () => {
    const frame = document.createElement("iframe");
    frame.dataset.testPageOwnerDocument = "";
    document.body.append(frame);

    const ownerDocument = frame.contentDocument;
    const ownerWindow = frame.contentWindow;
    if (ownerDocument === null || ownerWindow === null) {
      throw new Error("Expected Page iframe owner document and window");
    }

    const mount = ownerDocument.createElement("div");
    ownerDocument.body.append(mount);
    const user = userEvent.setup({ document: ownerDocument });
    const { unmount } = render(
      createAssessmentRuntimeTestRoot({
        children: (
          <PagePlayer
            artifactId="artifact-page-runtime-popover"
            initialContent={pageDocumentWithRuntimeHint()}
            surfaceId="surface-page-player"
          />
        ),
      }),
      { container: mount },
    );

    await waitFor(() => expect(() => buttonByName(ownerDocument, "Show a hint")).not.toThrow());
    const trigger = buttonByName(ownerDocument, "Show a hint");
    await user.click(trigger);

    await waitFor(() => {
      expect(
        ownerDocument.querySelector(".sc-assessment-hint-popover--runtime") ??
          document.querySelector(".sc-assessment-hint-popover--runtime"),
      ).not.toBeNull();
    });

    const player = ownerDocument.querySelector<HTMLElement>(".sc-page-player");
    if (player === null) throw new Error("Expected Page player root");
    const host = player.querySelector<HTMLElement>(":scope > [data-scaffold-overlay-host]");
    const OwnerHTMLElement = (ownerWindow as Window & typeof globalThis).HTMLElement;

    expect(host).toBeInstanceOf(OwnerHTMLElement);
    expect(host?.ownerDocument).toBe(ownerDocument);
    expect(host?.style.position).toBe("fixed");
    expect(host?.style.pointerEvents).toBe("none");

    const popover = ownerDocument.querySelector<HTMLElement>(
      ".sc-assessment-hint-popover--runtime",
    );
    expect(popover).toBeInstanceOf(OwnerHTMLElement);
    expect(host?.contains(popover)).toBe(true);

    unmount();

    expect(host?.isConnected).toBe(false);
    expect(player.querySelector("[data-scaffold-overlay-host]")).toBeNull();
  });
});

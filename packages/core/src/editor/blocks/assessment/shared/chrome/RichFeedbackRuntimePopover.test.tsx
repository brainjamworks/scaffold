// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { zIndex } from "@/ui/overlays/z-index";

import { RichFeedbackRuntimePopover } from "./RichFeedbackRuntimePopover";

const richFeedback = (text: string) => ({
  kind: "rich-text" as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  },
});

const emptyRichFeedback = {
  kind: "rich-text" as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph" }],
  },
};

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() =>
    DOMRect.fromRect({ height: 32, width: 96, x: 48, y: 48 }),
  );
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
    function mockClientRects(this: Element) {
      return [this.getBoundingClientRect()] as unknown as DOMRectList;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function clientWidth(this: HTMLElement) {
      return this === document.documentElement || this === document.body ? 1024 : 96;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function clientHeight(this: HTMLElement) {
      return this === document.documentElement || this === document.body ? 768 : 32;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
    function scrollWidth(this: HTMLElement) {
      return this.clientWidth;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    function scrollHeight(this: HTMLElement) {
      return this.clientHeight;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("RichFeedbackRuntimePopover", () => {
  it("opens feedback in the shared runtime surface without moving focus", async () => {
    render(<RichFeedbackRuntimePopover feedback={richFeedback("Review your answer.")} />);

    const trigger = screen.getByRole("button", { name: "Show feedback" });
    expect(screen.queryByRole("dialog", { name: "Feedback" })).toBeNull();

    await userEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Feedback" });
    expect(within(dialog).getByRole("heading", { name: "Feedback", level: 2 })).toBeInstanceOf(
      HTMLElement,
    );
    expect(within(dialog).getByText("Review your answer.")).toBeInstanceOf(HTMLElement);
    expect(dialog.getAttribute("data-side")).toBe("bottom");
    expect(dialog.getAttribute("data-align")).toBe("start");
    expect(dialog.style.zIndex).toBe(String(zIndex.popover));
    expect(dialog.querySelector(".sc-assessment-feedback-arrow")).toBeInstanceOf(SVGElement);
    expect(document.activeElement).toBe(trigger);
  });

  it("preserves custom trigger state while the popover opens and dismisses on Escape", async () => {
    render(
      <RichFeedbackRuntimePopover
        feedback={richFeedback("Try again.")}
        trigger={({ open, hasFeedback }) => (
          <button type="button">
            {open && hasFeedback ? "Hide explanation" : "Read explanation"}
          </button>
        )}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Read explanation" }));
    expect(await screen.findByRole("button", { name: "Hide explanation" })).toBeInstanceOf(
      HTMLButtonElement,
    );
    expect(screen.getByRole("dialog", { name: "Feedback" })).toBeInstanceOf(HTMLElement);

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Feedback" })).toBeNull();
      expect(screen.getByRole("button", { name: "Read explanation" })).toBeInstanceOf(
        HTMLButtonElement,
      );
    });
  });

  it("leaves outside-interaction dismissal with the wrapped popover", async () => {
    render(
      <>
        <button type="button">Outside</button>
        <RichFeedbackRuntimePopover feedback={richFeedback("Check the units.")} />
      </>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Show feedback" }));
    expect(await screen.findByRole("dialog", { name: "Feedback" })).toBeInstanceOf(HTMLElement);

    await userEvent.click(screen.getByRole("button", { name: "Outside" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Feedback" })).toBeNull();
    });
  });

  it("renders no trigger for invalid or empty feedback", () => {
    const { rerender } = render(<RichFeedbackRuntimePopover feedback={null} />);

    expect(screen.queryByRole("button", { name: "Show feedback" })).toBeNull();

    rerender(<RichFeedbackRuntimePopover feedback={emptyRichFeedback} />);

    expect(screen.queryByRole("button", { name: "Show feedback" })).toBeNull();
  });
});

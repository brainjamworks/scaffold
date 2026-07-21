// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { ScaffoldUnavailableAgentDock } from "./ScaffoldUnavailableAgentDock";

describe("ScaffoldUnavailableAgentDock", () => {
  it("renders the complete unavailable Agent experience", () => {
    render(<ScaffoldUnavailableAgentDock />);

    expect(screen.getByRole("complementary", { name: "Scaffold Agent" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Scaffold Agent" })).toBeInTheDocument();
    expect(screen.getByText("not connected")).toBeInTheDocument();
    expect(screen.getByText("Draft, revise, or structure course content.")).toBeInTheDocument();
    expect(
      screen.getByText("Drafts open in review before they touch the document."),
    ).toBeInTheDocument();

    for (const suggestion of [
      "Plan a module",
      "Add a quick check",
      "Improve this explanation",
      "Turn this into a grid",
    ]) {
      expect(screen.getByRole("button", { name: suggestion })).toHaveProperty("disabled", true);
    }

    const prompt = screen.getByPlaceholderText("Type a prompt…");
    expect(prompt).toHaveProperty("disabled", true);
    expect(prompt.getAttribute("aria-label")).toBe("Scaffold Agent prompt");
    expect(screen.getByRole("button", { name: "Send to Scaffold Agent" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("forwards close while offering no activation or credential affordance", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<ScaffoldUnavailableAgentDock onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close Scaffold Agent" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/api key|activate|sign up|hosted|upgrade|subscription/i)).toBeNull();
  });
});

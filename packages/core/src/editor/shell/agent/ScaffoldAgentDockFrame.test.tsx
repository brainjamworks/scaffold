// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { ScaffoldAgentDockEmptyState } from "./ScaffoldAgentDockEmptyState";
import { ScaffoldAgentDockFrame } from "./ScaffoldAgentDockFrame";

describe("ScaffoldAgentDockFrame", () => {
  it("renders the fixed Agent landmark, title, ready state, body, and footer", () => {
    render(
      <ScaffoldAgentDockFrame connection="ready" footer={<div>Composer footer</div>}>
        <p>Agent activity</p>
      </ScaffoldAgentDockFrame>,
    );

    expect(screen.getByRole("complementary", { name: "Scaffold Agent" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Scaffold Agent" })).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.getByText("Agent activity")).toBeInTheDocument();
    expect(screen.getByText("Composer footer")).toBeInTheDocument();
  });

  it("renders the not-connected state", () => {
    render(
      <ScaffoldAgentDockFrame connection="not-connected" footer={<div>Composer footer</div>}>
        <p>Agent activity</p>
      </ScaffoldAgentDockFrame>,
    );

    expect(screen.getByText("not connected")).toBeInTheDocument();
    expect(screen.queryByText("ready")).toBeNull();
  });

  it("renders optional header actions and forwards close", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ScaffoldAgentDockFrame
        connection="ready"
        headerActions={<button type="button">Clear history</button>}
        footer={<div>Composer footer</div>}
        onClose={onClose}
      >
        <p>Agent activity</p>
      </ScaffoldAgentDockFrame>,
    );

    expect(screen.getByRole("button", { name: "Clear history" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close Scaffold Agent" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("omits the close control when no close callback is supplied", () => {
    render(
      <ScaffoldAgentDockFrame connection="ready" footer={<div>Composer footer</div>}>
        <p>Agent activity</p>
      </ScaffoldAgentDockFrame>,
    );

    expect(screen.queryByRole("button", { name: "Close Scaffold Agent" })).toBeNull();
  });
});

describe("ScaffoldAgentDockEmptyState", () => {
  it("renders the fixed empty-state copy and supplied suggestions", () => {
    render(
      <ScaffoldAgentDockEmptyState suggestions={<button type="button">Plan a module</button>} />,
    );

    expect(screen.getByRole("img", { name: "scaffold mark" })).toBeInTheDocument();
    expect(screen.getByText("Draft, revise, or structure course content.")).toBeInTheDocument();
    expect(
      screen.getByText("Drafts open in review before they touch the document."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan a module" })).toBeInTheDocument();
  });
});

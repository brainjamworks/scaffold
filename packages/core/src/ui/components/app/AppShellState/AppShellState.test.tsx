// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { AppShellState } from "./AppShellState";

describe("AppShellState", () => {
  it("announces a loading state without presenting it as an error", () => {
    render(<AppShellState kind="loading" title="Opening editor" />);

    const status = screen.getByRole("status", { name: "Opening editor" });
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("data-kind", "loading");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("presents a recoverable failure with supporting copy and an action", () => {
    render(
      <AppShellState
        action={<button type="button">Reload page</button>}
        description="Reload the page to try again."
        kind="error"
        title="The editor couldn’t load"
      />,
    );

    const alert = screen.getByRole("alert", { name: "The editor couldn’t load" });
    expect(alert).not.toHaveAttribute("aria-busy");
    expect(alert).toHaveTextContent("Reload the page to try again.");
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
  });
});

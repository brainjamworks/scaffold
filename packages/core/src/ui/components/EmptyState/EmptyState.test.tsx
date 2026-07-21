// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Button } from "../Button/Button";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("reflects its visual contract through semantic classes and surface data", () => {
    render(
      <EmptyState
        title="No settings"
        description="This item has no authoring options."
        surface="navy"
        action={<Button>Open</Button>}
      />,
    );

    const emptyState = screen.getByText("No settings").closest(".sc-empty-state");

    expect(emptyState).not.toBeNull();
    expect(emptyState?.getAttribute("data-scaffold-empty-state")).toBe("");
    expect(emptyState?.getAttribute("data-surface")).toBe("navy");
    expect(screen.getByText("No settings").classList.contains("sc-empty-state-title")).toBe(true);
    expect(
      screen
        .getByText("This item has no authoring options.")
        .classList.contains("sc-empty-state-description"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Open" }).closest(".sc-empty-state-action"),
    ).not.toBeNull();
  });
});

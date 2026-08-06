// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { Button } from "@/ui/components/Button/Button";

import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("reflects its visual contract through semantic classes and surface data", () => {
    const { container } = render(
      <AppThemeProvider appearance="light">
        <main>
          <EmptyState
            title="No settings"
            description="This item has no authoring options."
            surface="navy"
            action={<Button>Open</Button>}
          />
        </main>
      </AppThemeProvider>,
    );

    const emptyState = screen.getByText("No settings").closest(".sc-app-empty-state");

    expect(emptyState).not.toBeNull();
    expect(emptyState?.closest(".sc-app")).toBe(container.firstElementChild);
    expect(emptyState?.getAttribute("data-scaffold-empty-state")).toBe("");
    expect(emptyState?.getAttribute("data-surface")).toBe("navy");
    expect(screen.getByText("No settings").classList.contains("sc-app-empty-state-title")).toBe(
      true,
    );
    expect(
      screen
        .getByText("This item has no authoring options.")
        .classList.contains("sc-app-empty-state-description"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Open" }).closest(".sc-app-empty-state-action"),
    ).not.toBeNull();
  });
});

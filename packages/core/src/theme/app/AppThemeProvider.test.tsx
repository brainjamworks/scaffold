// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { AppThemeProvider } from "./AppThemeProvider";

afterEach(cleanup);

describe("AppThemeProvider", () => {
  it("applies the fixed App configuration directly to its child", () => {
    const { container, rerender } = render(
      <AppThemeProvider appearance="light">
        <main data-testid="application-root" />
      </AppThemeProvider>,
    );

    const root = screen.getByTestId("application-root");
    expect(container.firstElementChild).toBe(root);
    expect(container.childElementCount).toBe(1);
    expect(root).toHaveClass("radix-themes", "light", "sc-app");
    expect(root).toHaveAttribute("data-accent-color", "indigo");
    expect(root).toHaveAttribute("data-gray-color", "slate");
    expect(root).toHaveAttribute("data-radius", "medium");
    expect(root).toHaveAttribute("data-scaling", "100%");
    expect(root).toHaveAttribute("data-panel-background", "solid");
    expect(root).toHaveAttribute("data-has-background", "false");
    expect(root).toHaveAttribute("data-scaffold-color-mode", "light");
    expect(root.style.colorScheme).toBe("light");

    rerender(
      <AppThemeProvider appearance="dark">
        <main data-testid="application-root" />
      </AppThemeProvider>,
    );

    expect(root).toHaveClass("radix-themes", "dark", "sc-app");
    expect(root).not.toHaveClass("light");
    expect(root).toHaveAttribute("data-scaffold-color-mode", "dark");
    expect(root.style.colorScheme).toBe("dark");
  });
});

// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";

import { MediaReplaceButton } from "./MediaReplaceButton";

vi.mock("@phosphor-icons/react", () => ({
  ArrowsClockwiseIcon: () => <svg data-glyph="replace" />,
}));

afterEach(cleanup);

describe("MediaReplaceButton", () => {
  it("uses the App Radix icon-button treatment without visible button text", () => {
    renderReplaceButton();

    const button = screen.getByRole("button", { name: "Replace cover image" });
    expect(button).toHaveClass("rt-IconButton", "sc-app-media-replace-button");
    expect(button).not.toHaveClass("sc-icon-button", "sc-media-overlay-button");
    expect(button).toHaveTextContent("");
    expect(button.querySelector('[data-glyph="replace"]')).not.toBeNull();
  });

  it("describes the action as Replace image", async () => {
    const user = userEvent.setup();
    renderReplaceButton();

    await user.hover(screen.getByRole("button", { name: "Replace cover image" }));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveClass("sc-app-media-replace-tooltip");
    expect(tooltip).toHaveTextContent("Replace image");
  });

  it("supports a named inline placement with media-specific tooltip copy", async () => {
    const user = userEvent.setup();
    render(
      <AppThemeProvider appearance="light">
        <div>
          <MediaReplaceButton
            aria-label="Replace audio"
            placement="inline"
            tooltip="Replace audio"
          />
        </div>
      </AppThemeProvider>,
    );

    const button = screen.getByRole("button", { name: "Replace audio" });
    expect(button).toHaveAttribute("data-placement", "inline");

    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Replace audio");
  });
});

function renderReplaceButton() {
  return render(
    <AppThemeProvider appearance="light">
      <div>
        <MediaReplaceButton aria-label="Replace cover image" tooltip="Replace image" />
      </div>
    </AppThemeProvider>,
  );
}

// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { MediaEmptyAction } from "@/ui/components/app/MediaEmptyAction/MediaEmptyAction";

afterEach(cleanup);

describe("MediaEmptyAction", () => {
  it("renders media-specific iconography with its contextual accessible name", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const icon = createElement("svg", { "data-testid": "audio-icon" });

    render(
      createElement(MediaEmptyAction, {
        "aria-label": "Choose cover image",
        icon,
        label: "Choose cover image",
        onClick,
      }),
    );

    const action = screen.getByRole("button", { name: "Choose cover image" });
    expect(action).toHaveClass("sc-app-media-empty-action");
    expect(action).toHaveTextContent("Choose cover image");
    expect(screen.getByTestId("audio-icon").closest('[aria-hidden="true"]')).not.toBeNull();

    await user.click(action);

    expect(onClick).toHaveBeenCalledOnce();
  });
});

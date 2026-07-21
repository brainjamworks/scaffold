// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { MediaEmptyAction } from "@/editor/media/authoring/shared-components/MediaEmptyAction";

afterEach(cleanup);

describe("MediaEmptyAction", () => {
  it("renders its contextual accessible name and invokes the supplied action", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      createElement(MediaEmptyAction, {
        "aria-label": "Choose cover image",
        label: "Choose cover image",
        onClick,
      }),
    );

    const action = screen.getByRole("button", { name: "Choose cover image" });
    expect(action).toHaveTextContent("Choose cover image");

    await user.click(action);

    expect(onClick).toHaveBeenCalledOnce();
  });
});

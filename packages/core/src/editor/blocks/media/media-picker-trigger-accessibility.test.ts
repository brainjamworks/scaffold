// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { MediaEmptyAction } from "@/editor/media/authoring/shared-components/MediaEmptyAction";
import { MediaReplaceButton } from "@/editor/media/authoring/shared-components/MediaReplaceButton";

afterEach(cleanup);

describe("media picker trigger accessibility", () => {
  it("exposes contextual names and handler effects for add and replace actions", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onReplace = vi.fn();

    render(
      createElement(
        "div",
        null,
        createElement(MediaEmptyAction, {
          "aria-label": "Add wrapped image",
          label: "Add image",
          onClick: onAdd,
        }),
        createElement(MediaReplaceButton, {
          "aria-label": "Replace wrapped image",
          onClick: onReplace,
        }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Add wrapped image" }));
    await user.click(screen.getByRole("button", { name: "Replace wrapped image" }));

    expect(onAdd).toHaveBeenCalledOnce();
    expect(onReplace).toHaveBeenCalledOnce();
  });
});

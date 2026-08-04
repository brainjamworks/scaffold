// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { MediaEmptyAction } from "@/ui/components/app/MediaEmptyAction/MediaEmptyAction";
import { MediaReplaceButton } from "@/ui/components/app/MediaReplaceButton/MediaReplaceButton";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";

afterEach(cleanup);

describe("media picker trigger accessibility", () => {
  it("exposes contextual names and handler effects for add and replace actions", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onReplace = vi.fn();

    render(
      createElement(
        AppThemeProvider,
        {
          appearance: "light",
          children: createElement(
            "div",
            null,
            createElement(MediaEmptyAction, {
              "aria-label": "Add wrapped image",
              icon: createElement("svg"),
              label: "Add image",
              onClick: onAdd,
            }),
            createElement(MediaReplaceButton, {
              "aria-label": "Replace wrapped image",
              onClick: onReplace,
              tooltip: "Replace image",
            }),
          ),
        },
      ),
    );

    await user.click(screen.getByRole("button", { name: "Add wrapped image" }));
    await user.click(screen.getByRole("button", { name: "Replace wrapped image" }));

    expect(onAdd).toHaveBeenCalledOnce();
    expect(onReplace).toHaveBeenCalledOnce();
  });
});

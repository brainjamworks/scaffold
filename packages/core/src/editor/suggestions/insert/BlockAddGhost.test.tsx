// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { expect, it } from "vite-plus/test";

import { BlockAddGhost } from "./BlockAddGhost";

it("exposes an App-owned visual class contract", () => {
  render(<BlockAddGhost label="Add hint" presentation="row" tone="warning" />);

  const button = screen.getByRole("button", { name: "Add hint" });
  expect(button).toHaveClass(
    "sc-app-block-add",
    "sc-app-block-add--row",
    "sc-app-block-add--tone-warning",
  );
  expect(button.querySelector("[aria-hidden]")).toHaveClass("sc-app-block-add__icon");
});

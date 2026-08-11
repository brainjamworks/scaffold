// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { AppDialog } from "./AppDialog";

describe("AppDialog", () => {
  it("provides the App-owned small modal structure", () => {
    render(
      <AppDialog.Root open>
        <AppDialog.Content>
          <AppDialog.Title>Add Course Section</AppDialog.Title>
          <AppDialog.Description>Add an empty section.</AppDialog.Description>
          <AppDialog.Body>Section form</AppDialog.Body>
          <AppDialog.Actions>Dialog actions</AppDialog.Actions>
        </AppDialog.Content>
      </AppDialog.Root>,
    );

    const dialog = screen.getByRole("dialog", { name: "Add Course Section" });
    expect(dialog).toHaveClass("sc-app-dialog-content");
    expect(dialog).toHaveAttribute("data-intent", "neutral");
    expect(document.querySelector(".sc-app-dialog-overlay")).not.toBeNull();
    expect(screen.getByText("Section form")).toHaveClass("sc-app-dialog-body");
    expect(screen.getByText("Dialog actions")).toHaveClass("sc-app-dialog-actions");
  });

  it("supports an urgent destructive dialog without changing its content API", () => {
    render(
      <AppDialog.Root open>
        <AppDialog.Content intent="danger" role="alertdialog">
          <AppDialog.Title>Delete Course Section</AppDialog.Title>
          <AppDialog.Description>This also deletes its slides.</AppDialog.Description>
        </AppDialog.Content>
      </AppDialog.Root>,
    );

    expect(screen.getByRole("alertdialog", { name: "Delete Course Section" })).toHaveAttribute(
      "data-intent",
      "danger",
    );
  });
});

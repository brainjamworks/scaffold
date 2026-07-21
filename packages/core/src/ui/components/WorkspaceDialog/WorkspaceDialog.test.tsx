// @vitest-environment happy-dom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { zIndex } from "@/ui/overlays/z-index";
import {
  useOverlayBoundary,
  type OverlayBoundaryEnvironment,
} from "@/ui/overlays/portal-host-context";

import { OverlayBoundary } from "../OverlayBoundary/OverlayBoundary";
import { WorkspaceDialog, type WorkspaceDialogSize } from "./WorkspaceDialog";

function ControlledWorkspaceDialog({ size = "medium" }: { size?: WorkspaceDialogSize }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <WorkspaceDialog.Root open={open} onOpenChange={setOpen}>
        <WorkspaceDialog.Trigger asChild>
          <button type="button">Open workspace</button>
        </WorkspaceDialog.Trigger>
        <WorkspaceDialog.Content size={size}>
          <WorkspaceDialog.Header>
            <div>
              <WorkspaceDialog.Title>Supporting material</WorkspaceDialog.Title>
              <WorkspaceDialog.Description>
                Add context that learners can open beside the question.
              </WorkspaceDialog.Description>
            </div>
            <WorkspaceDialog.Close />
          </WorkspaceDialog.Header>
          <WorkspaceDialog.Body>Workspace body</WorkspaceDialog.Body>
          <WorkspaceDialog.Actions>
            <button type="button">Optional action</button>
          </WorkspaceDialog.Actions>
        </WorkspaceDialog.Content>
      </WorkspaceDialog.Root>
      <output aria-label="Workspace state">{open ? "open" : "closed"}</output>
    </>
  );
}

function ToolbarWorkspaceDialog({ onAdd }: { onAdd: () => void }) {
  return (
    <WorkspaceDialog.Root open>
      <WorkspaceDialog.Content>
        <WorkspaceDialog.Header>
          <div>
            <WorkspaceDialog.Title>Edit image</WorkspaceDialog.Title>
            <WorkspaceDialog.Description>Adjust the image workspace.</WorkspaceDialog.Description>
          </div>
        </WorkspaceDialog.Header>
        <WorkspaceDialog.Toolbar aria-label="Image tools">
          <WorkspaceDialog.ToolbarGroup aria-label="Edit image">
            <WorkspaceDialog.ToolbarButton label="Add marker" onClick={onAdd}>
              <span aria-hidden>+</span>
            </WorkspaceDialog.ToolbarButton>
            <WorkspaceDialog.ToolbarButton label="Unavailable action" disabled>
              <span aria-hidden>−</span>
            </WorkspaceDialog.ToolbarButton>
          </WorkspaceDialog.ToolbarGroup>
          <WorkspaceDialog.ToolbarSeparator />
          <WorkspaceDialog.ToolbarGroup aria-label="View image">
            <WorkspaceDialog.ToolbarButton label="Fit image" active>
              <span aria-hidden>□</span>
            </WorkspaceDialog.ToolbarButton>
          </WorkspaceDialog.ToolbarGroup>
        </WorkspaceDialog.Toolbar>
        <WorkspaceDialog.Body>Image workspace</WorkspaceDialog.Body>
      </WorkspaceDialog.Content>
    </WorkspaceDialog.Root>
  );
}

function BoundaryProbe({
  onReady,
}: {
  onReady: (environment: OverlayBoundaryEnvironment) => void;
}) {
  const resolution = useOverlayBoundary();

  useEffect(() => {
    if (resolution.status === "ready") onReady(resolution.environment);
  }, [onReady, resolution]);

  return null;
}

describe("WorkspaceDialog", () => {
  it("exposes an accessible controlled modal composition", async () => {
    render(<ControlledWorkspaceDialog />);

    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Open workspace" }));

    const dialog = screen.getByRole("dialog", { name: "Supporting material" });
    const description = screen.getByText("Add context that learners can open beside the question.");
    expect(dialog.getAttribute("aria-describedby")).toBe(description.id);
    expect(screen.getByText("Workspace body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Optional action" })).toBeInTheDocument();
  });

  it.each<[WorkspaceDialogSize, string]>([
    ["small", "40rem"],
    ["medium", "56rem"],
    ["large", "76rem"],
  ])("maps the %s workspace size to an exact %s inline cap", async (size, inlineSize) => {
    render(<ControlledWorkspaceDialog size={size} />);

    await userEvent.click(screen.getByRole("button", { name: "Open workspace" }));

    const dialog = screen.getByRole("dialog", { name: "Supporting material" });
    expect(dialog.getAttribute("data-size")).toBe(size);
    expect(dialog.style.getPropertyValue("--sc-workspace-dialog-inline-size")).toBe(inlineSize);
    expect(dialog.style.width).toBe("var(--sc-workspace-dialog-inline-size)");
    expect(dialog.style.height).toBe("var(--sc-workspace-dialog-block-size-cap)");
  });

  it("defaults to medium and projects fixed responsive viewport sizing and named stacking", async () => {
    render(<ControlledWorkspaceDialog />);

    await userEvent.click(screen.getByRole("button", { name: "Open workspace" }));

    const dialog = screen.getByRole("dialog", { name: "Supporting material" });
    expect(dialog.getAttribute("data-size")).toBe("medium");
    expect(dialog.style.getPropertyValue("--sc-workspace-dialog-inline-size")).toBe("56rem");
    expect(dialog.style.getPropertyValue("--sc-workspace-dialog-viewport-inline-cap")).toBe(
      "calc(100vw - 2rem)",
    );
    expect(dialog.style.maxWidth).toBe("var(--sc-workspace-dialog-viewport-inline-cap)");
    expect(dialog.style.getPropertyValue("--sc-workspace-dialog-block-size-cap")).toBe(
      "min(calc(100dvh - 2rem), 48rem)",
    );
    expect(dialog.style.maxHeight).toBe("var(--sc-workspace-dialog-block-size-cap)");
    expect(dialog.style.height).toBe("var(--sc-workspace-dialog-block-size-cap)");
    expect(dialog.style.zIndex).toBe(String(zIndex.modalContent));
  });

  it("scopes floating descendants to the workspace content boundary", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onReady = vi.fn<(environment: OverlayBoundaryEnvironment) => void>();
    let forwardedContent: HTMLDivElement | null = null;

    const { unmount } = render(
      <OverlayBoundary container={container} kind="viewport">
        <WorkspaceDialog.Root open>
          <WorkspaceDialog.Content
            ref={(element) => {
              forwardedContent = element;
            }}
          >
            <WorkspaceDialog.Title>Edit image hotspots</WorkspaceDialog.Title>
            <WorkspaceDialog.Description>Configure hotspot feedback</WorkspaceDialog.Description>
            <BoundaryProbe onReady={onReady} />
          </WorkspaceDialog.Content>
        </WorkspaceDialog.Root>
      </OverlayBoundary>,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalled());
    const dialog = screen.getByRole("dialog", { name: "Edit image hotspots" });
    const outerHost = container.querySelector<HTMLElement>(":scope > [data-scaffold-overlay-host]");
    const environment = onReady.mock.calls.at(-1)?.[0];
    if (!environment) throw new Error("Expected a ready workspace overlay environment");

    expect(forwardedContent).toBe(dialog);
    expect(dialog.parentElement).toBe(outerHost);
    expect(environment.kind).toBe("contained");
    expect(environment.collisionBoundary).toBe(dialog);
    expect(environment.host.parentElement).toBe(dialog);
    expect(dialog.querySelector(":scope > [data-scaffold-overlay-host]")).toBe(environment.host);

    const nestedHost = environment.host;
    unmount();

    expect(nestedHost.isConnected).toBe(false);
    expect(container.querySelector("[data-scaffold-overlay-host]")).toBeNull();
    container.remove();
  });

  it("closes with Escape and restores focus to its trigger", async () => {
    render(<ControlledWorkspaceDialog />);
    const trigger = screen.getByRole("button", { name: "Open workspace" });

    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status", { name: "Workspace state" }).textContent).toBe("closed");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes from its close control and restores focus to its trigger", async () => {
    render(<ControlledWorkspaceDialog />);
    const trigger = screen.getByRole("button", { name: "Open workspace" });

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Close workspace" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status", { name: "Workspace state" }).textContent).toBe("closed");
    expect(document.activeElement).toBe(trigger);
  });

  it("exposes labelled toolbar composition with button states and tooltips", async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();

    render(<ToolbarWorkspaceDialog onAdd={onAdd} />);

    const toolbar = screen.getByRole("toolbar", { name: "Image tools" });
    const addMarker = screen.getByRole("button", { name: "Add marker" });
    const unavailableAction = screen.getByRole("button", { name: "Unavailable action" });
    const fitImage = screen.getByRole("button", { name: "Fit image" });

    expect(toolbar.getAttribute("aria-orientation")).toBe("horizontal");
    expect(screen.getByRole("group", { name: "Edit image" })).toContainElement(addMarker);
    expect(screen.getByRole("group", { name: "View image" })).toContainElement(fitImage);
    expect(screen.getByRole("separator").getAttribute("aria-orientation")).toBe("vertical");
    expect(unavailableAction).toBeDisabled();
    expect(fitImage.getAttribute("aria-pressed")).toBe("true");

    addMarker.blur();
    addMarker.focus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Add marker");

    await user.click(addMarker);
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("moves focus across enabled toolbar buttons with arrow keys", async () => {
    const user = userEvent.setup();

    render(<ToolbarWorkspaceDialog onAdd={() => undefined} />);

    const addMarker = screen.getByRole("button", { name: "Add marker" });
    const fitImage = screen.getByRole("button", { name: "Fit image" });

    addMarker.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(fitImage);

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(addMarker);

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(fitImage);
  });
});

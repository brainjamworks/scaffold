// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import * as Dialog from "../Dialog/Dialog";
import { Lightbox, type LightboxItem } from "./Lightbox";
import { OverlayBoundary } from "../OverlayBoundary/OverlayBoundary";
import * as Popover from "../Popover/Popover";

const ITEMS: LightboxItem[] = [
  {
    key: "first",
    src: "https://example.com/first.jpg",
    alt: "First image",
    caption: "First caption",
  },
  {
    key: "second",
    src: "https://example.com/second.jpg",
    alt: "Second image",
    caption: "Second caption",
  },
  {
    key: "third",
    src: "https://example.com/third.jpg",
    alt: "Third image",
  },
];

afterEach(() => {
  cleanup();
  document.querySelectorAll("[data-test-portal-host]").forEach((host) => host.remove());
  document
    .querySelectorAll("iframe[data-test-lightbox-owner-document]")
    .forEach((frame) => frame.remove());
});

describe("Lightbox", () => {
  it("closes on Escape and restores focus to the opener by default", async () => {
    render(<ControlledLightbox />);

    const opener = screen.getByRole("button", { name: "Open lightbox" });
    await userEvent.click(opener);

    const dialog = await screen.findByRole("dialog", {
      name: "Gallery viewer",
    });
    expect(dialog.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(dialog);

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Gallery viewer" })).toBeNull();
      expect(document.activeElement).toBe(opener);
    });
  });

  it("prefers an explicit return focus target when provided", async () => {
    render(<ControlledLightbox returnFocusTo="explicit" />);

    await userEvent.click(screen.getByRole("button", { name: "Open lightbox" }));

    await screen.findByRole("dialog", { name: "Gallery viewer" });
    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Explicit return target" }),
      );
    });
  });

  it("restores focus to the opener in a foreign owner document", async () => {
    const { boundaryContainer, mount, ownerDocument } = createOwnerDocumentMount();
    const user = userEvent.setup({ document: ownerDocument });
    render(
      <OverlayBoundary container={boundaryContainer} kind="viewport">
        <ControlledLightbox />
      </OverlayBoundary>,
      { container: mount, baseElement: ownerDocument.body },
    );
    const ownerView = within(ownerDocument.body);
    const opener = ownerView.getByRole("button", { name: "Open lightbox" });

    await user.click(opener);

    const dialog = await ownerView.findByRole("dialog", { name: "Gallery viewer" });
    expect(ownerDocument.activeElement).toBe(dialog);

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(ownerView.queryByRole("dialog", { name: "Gallery viewer" })).toBeNull();
      expect(ownerDocument.activeElement).toBe(opener);
    });
  });

  it("restores focus to an explicit target in a foreign owner document", async () => {
    const { boundaryContainer, mount, ownerDocument } = createOwnerDocumentMount();
    const user = userEvent.setup({ document: ownerDocument });
    render(
      <OverlayBoundary container={boundaryContainer} kind="viewport">
        <ControlledLightbox returnFocusTo="explicit" />
      </OverlayBoundary>,
      { container: mount, baseElement: ownerDocument.body },
    );
    const ownerView = within(ownerDocument.body);
    const explicitTarget = ownerView.getByRole("button", { name: "Explicit return target" });

    await user.click(ownerView.getByRole("button", { name: "Open lightbox" }));
    await ownerView.findByRole("dialog", { name: "Gallery viewer" });
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(ownerView.queryByRole("dialog", { name: "Gallery viewer" })).toBeNull();
      expect(ownerDocument.activeElement).toBe(explicitTarget);
    });
  });

  it("labels navigation and announces the active image position", async () => {
    render(<ControlledLightbox />);

    await userEvent.click(screen.getByRole("button", { name: "Open lightbox" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Gallery viewer",
    });
    const caption = within(dialog).getByText("First caption");

    expect(screen.getByRole("button", { name: "Previous image" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next image" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Image 1 of 3" })).toBeInTheDocument();
    expect(dialog.getAttribute("aria-describedby")).toContain(caption.id);

    await userEvent.keyboard("{ArrowRight}");

    await waitFor(() => {
      expect(screen.getByRole("status", { name: "Image 2 of 3" })).toBeInTheDocument();
      expect(within(dialog).getByText("Second caption")).toBeInTheDocument();
    });

    await userEvent.keyboard("{End}");

    await waitFor(() => {
      expect(screen.getByRole("status", { name: "Image 3 of 3" })).toBeInTheDocument();
      expect(within(dialog).queryByText("Second caption")).toBeNull();
    });

    await userEvent.keyboard("{Home}");

    await waitFor(() => {
      expect(screen.getByRole("status", { name: "Image 1 of 3" })).toBeInTheDocument();
    });
  });

  it("renders rich React captions without changing the description contract", async () => {
    render(
      <Lightbox
        open
        onOpenChange={() => undefined}
        ariaLabel="Rich caption viewer"
        items={[
          {
            key: "rich",
            src: "https://example.com/rich.jpg",
            alt: "Rich image",
            caption: (
              <>
                <strong>Formatted</strong> caption
              </>
            ),
          },
        ]}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Rich caption viewer" });
    const caption = within(dialog).getByText("Formatted").parentElement;

    expect(caption?.tagName).toBe("FIGCAPTION");
    expect(dialog.getAttribute("aria-describedby")).toContain(caption?.id);
  });

  it("waits instead of falling back to the body while a scope is pending", () => {
    render(
      <OverlayBoundary container={null} kind="viewport">
        <Lightbox open onOpenChange={() => undefined} items={ITEMS} ariaLabel="Scoped viewer" />
      </OverlayBoundary>,
    );

    expect(screen.queryByRole("dialog", { name: "Scoped viewer" })).toBeNull();
  });

  it("portals into a ready scoped host", async () => {
    const container = document.createElement("div");
    container.dataset.testPortalHost = "";
    document.body.append(container);

    render(
      <OverlayBoundary container={container} kind="viewport">
        <Lightbox open onOpenChange={() => undefined} items={ITEMS} ariaLabel="Scoped viewer" />
      </OverlayBoundary>,
    );

    const host = container.querySelector(":scope > [data-scaffold-overlay-host]");
    expect(host).not.toBeNull();
    expect((await screen.findByRole("dialog", { name: "Scoped viewer" })).parentElement).toBe(host);
  });

  it("closes before its parent and restores focus to its launcher", async () => {
    render(<NestedLightboxExample />);

    await userEvent.click(screen.getByRole("button", { name: "Open workspace" }));
    const parentDialog = screen.getByRole("dialog", { name: "Workspace dialog" });
    const lightboxTrigger = screen.getByRole("button", { name: "Open nested lightbox" });

    await userEvent.click(lightboxTrigger);

    const host = parentDialog.querySelector("[data-scaffold-overlay-host]");
    expect(host).not.toBeNull();
    expect((await screen.findByRole("dialog", { name: "Nested viewer" })).parentElement).toBe(host);

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Nested viewer" })).toBeNull();
      expect(screen.getByRole("dialog", { name: "Workspace dialog" })).toBe(parentDialog);
      expect(parentDialog.parentElement).toBe(document.body);
      expect(document.activeElement).toBe(lightboxTrigger);
    });
  });

  it("contains a child popover and lets it handle Escape before closing", async () => {
    render(<LightboxWithNestedPopover />);

    await userEvent.click(screen.getByRole("button", { name: "Open annotated figure" }));
    const lightbox = await screen.findByRole("dialog", { name: "Annotated figure viewer" });

    await userEvent.click(within(lightbox).getByRole("button", { name: "View annotation 1" }));

    await waitFor(() => {
      expect(document.querySelector('[role="dialog"][aria-label="Annotation 1"]')).not.toBeNull();
    });
    const popover = document.querySelector('[role="dialog"][aria-label="Annotation 1"]');
    const childBoundary = lightbox.querySelector(
      ':scope > [data-scaffold-overlay-host][data-kind="contained"]',
    );

    expect(childBoundary).not.toBeNull();
    if (!popover) throw new Error("Expected nested annotation popover");
    expect(popover.closest("[data-scaffold-overlay-host]")).toBe(childBoundary);

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(document.querySelector('[role="dialog"][aria-label="Annotation 1"]')).toBeNull();
      expect(screen.getByRole("dialog", { name: "Annotated figure viewer" })).toBe(lightbox);
      expect(document.activeElement).toBe(
        within(lightbox).getByRole("button", { name: "View annotation 1" }),
      );
    });

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Annotated figure viewer" })).toBeNull();
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Open annotated figure" }),
      );
    });
  });
});

function createOwnerDocumentMount() {
  const frame = document.createElement("iframe");
  frame.dataset.testLightboxOwnerDocument = "";
  document.body.append(frame);

  const ownerDocument = frame.contentDocument;
  if (ownerDocument === null) throw new Error("Expected iframe owner document");

  const boundaryContainer = ownerDocument.createElement("section");
  const mount = ownerDocument.createElement("div");
  ownerDocument.body.append(boundaryContainer, mount);

  return { boundaryContainer, mount, ownerDocument };
}

function NestedLightboxExample() {
  const [parentOpen, setParentOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [boundaryContainer, setBoundaryContainer] = useState<HTMLDivElement | null>(null);

  return (
    <Dialog.Root open={parentOpen} onOpenChange={setParentOpen}>
      <Dialog.Trigger asChild>
        <button type="button">Open workspace</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Title>Workspace dialog</Dialog.Title>
          <Dialog.Description>Parent modal</Dialog.Description>
          <div data-test-portal-host="" ref={setBoundaryContainer} />
          <OverlayBoundary container={boundaryContainer} kind="viewport">
            <button type="button" onClick={() => setLightboxOpen(true)}>
              Open nested lightbox
            </button>
            <Lightbox
              open={lightboxOpen}
              onOpenChange={setLightboxOpen}
              items={ITEMS}
              ariaLabel="Nested viewer"
            />
          </OverlayBoundary>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ControlledLightbox({ returnFocusTo }: { returnFocusTo?: "explicit" }) {
  const [open, setOpen] = useState(false);
  const explicitReturnRef = useRef<HTMLElement | null>(null);
  const lightboxProps = returnFocusTo === "explicit" ? { returnFocusRef: explicitReturnRef } : {};

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open lightbox
      </button>
      <button
        type="button"
        ref={(node) => {
          explicitReturnRef.current = node;
        }}
      >
        Explicit return target
      </button>
      <Lightbox
        open={open}
        onOpenChange={setOpen}
        items={ITEMS}
        ariaLabel="Gallery viewer"
        {...lightboxProps}
      />
    </>
  );
}

function LightboxWithNestedPopover() {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const items: LightboxItem[] = [
    {
      key: "annotated",
      src: "https://example.com/annotated.jpg",
      alt: "Annotated image",
      render: () => (
        <Popover.Root open={popoverOpen} onOpenChange={setPopoverOpen}>
          <Popover.Trigger asChild>
            <button type="button">View annotation 1</button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              aria-label="Annotation 1"
              aria-describedby={undefined}
              onEscapeKeyDown={(event) => {
                event.preventDefault();
                setPopoverOpen(false);
              }}
            >
              Annotation caption
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ),
    },
  ];

  return (
    <>
      <button type="button" onClick={() => setLightboxOpen(true)}>
        Open annotated figure
      </button>
      <Lightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        items={items}
        ariaLabel="Annotated figure viewer"
      />
    </>
  );
}

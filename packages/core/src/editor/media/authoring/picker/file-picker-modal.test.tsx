// @vitest-environment happy-dom

import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import type { MediaListItem, MediaPort } from "@/host/ports/media";
import { OverlayBoundary } from "@/ui/overlays/OverlayBoundary";

import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/file-picker-modal";

function mediaPortWithLibrary(): MediaPort {
  return {
    resolve: async () => "https://example.com/image-1.jpg",
    upload: async (file, meta) => ({
      id: "uploaded-media",
      url: "https://example.com/uploaded.jpg",
      mediaType: meta.mediaType,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    }),
    list: async () => [
      {
        id: "media-image-1",
        url: "https://example.com/image-1.jpg",
        mediaType: "image",
        fileName: "first.jpg",
        mimeType: "image/jpeg",
        size: 1234,
      },
    ],
  };
}

function uploadOnlyMediaPort(): MediaPort {
  return {
    resolve: async () => "https://example.com/image-1.jpg",
    upload: async (file, meta) => ({
      id: "uploaded-media",
      url: "https://example.com/uploaded.jpg",
      mediaType: meta.mediaType,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function renderFilePicker({
  media = mediaPortWithLibrary(),
}: {
  media?: MediaPort;
} = {}) {
  const onResolved = vi.fn<(result: FilePickerResult) => void>();

  function Harness() {
    const [open, setOpen] = useState(false);

    return (
      <ScaffoldServicesProvider ports={{ media }}>
        <button type="button" onClick={() => setOpen(true)}>
          Open picker
        </button>
        <FilePickerModal
          open={open}
          onOpenChange={setOpen}
          onResolved={onResolved}
          kind="media"
          allowedMediaTypes={["image"]}
          defaultMediaType="image"
          title="Add image"
        />
      </ScaffoldServicesProvider>
    );
  }

  render(<Harness />);

  return { onResolved };
}

function ContainedEditorFilePicker() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div ref={setContainer}>
      <div data-testid="prosemirror-content">
        <h2>Callout heading</h2>
        <p>Callout content</p>
      </div>
      <OverlayBoundary container={container} kind="contained">
        <button type="button" onClick={() => setOpen(true)}>
          Open contained picker
        </button>
        <FilePickerModal
          open={open}
          onOpenChange={setOpen}
          onResolved={() => undefined}
          kind="media"
          allowedMediaTypes={["image"]}
          defaultMediaType="image"
          title="Choose contained image"
        />
      </OverlayBoundary>
    </div>
  );
}

it("isolates a contained editor without mutating its ProseMirror descendants", async () => {
  render(
    <ScaffoldServicesProvider ports={{ media: mediaPortWithLibrary() }}>
      <ContainedEditorFilePicker />
    </ScaffoldServicesProvider>,
  );
  const editorContent = screen.getByTestId("prosemirror-content");
  const heading = screen.getByRole("heading", { name: "Callout heading" });
  const paragraph = screen.getByText("Callout content");

  fireEvent.click(screen.getByRole("button", { name: "Open contained picker" }));

  expect(await screen.findByRole("dialog", { name: "Choose contained image" })).toBeInTheDocument();
  expect(editorContent).not.toHaveAttribute("data-aria-hidden");
  expect(editorContent.querySelector("[data-aria-hidden]")).toBeNull();
  expect(editorContent).toHaveAttribute("data-sc-file-picker-inert");
  expect(editorContent).toHaveAttribute("inert");
  expect(heading).not.toHaveAttribute("aria-hidden");
  expect(paragraph).not.toHaveAttribute("aria-hidden");
});

it("labels source tabs, the active panel, and library choices", async () => {
  renderFilePicker();

  const opener = screen.getByRole("button", { name: "Open picker" });
  opener.focus();
  fireEvent.click(opener);

  const dialog = await screen.findByRole("dialog", { name: "Add image" });
  const libraryTab = within(dialog).getByRole("tab", { name: "Library" });
  const uploadTab = within(dialog).getByRole("tab", { name: "Upload" });
  const urlTab = within(dialog).getByRole("tab", { name: "URL" });

  expect(libraryTab.getAttribute("aria-selected")).toBe("true");
  expect(uploadTab.getAttribute("aria-selected")).toBe("false");
  expect(urlTab.getAttribute("aria-selected")).toBe("false");
  expect(within(dialog).getByRole("tabpanel", { name: "Library" })).toBeInTheDocument();
  expect(document.getElementById(uploadTab.getAttribute("aria-controls") ?? "")).not.toBeNull();
  expect(document.getElementById(urlTab.getAttribute("aria-controls") ?? "")).not.toBeNull();

  expect(
    await within(dialog).findByRole("button", {
      name: "Choose image: first.jpg",
    }),
  ).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Add image" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

it("stays open when the consumer rejects a resolved value", async () => {
  const onResolved = vi.fn((_result: FilePickerResult) => false);

  function Harness() {
    const [open, setOpen] = useState(false);

    return (
      <ScaffoldServicesProvider ports={{ media: uploadOnlyMediaPort() }}>
        <button type="button" onClick={() => setOpen(true)}>
          Open picker
        </button>
        <FilePickerModal
          open={open}
          onOpenChange={setOpen}
          onResolved={onResolved}
          kind="media"
          allowedMediaTypes={["image"]}
          defaultMediaType="image"
          title="Add image"
        />
      </ScaffoldServicesProvider>
    );
  }

  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Open picker" }));

  const dialog = await screen.findByRole("dialog", { name: "Add image" });
  fireEvent.click(within(dialog).getByRole("tab", { name: "URL" }));
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Image URL" }), {
    target: { value: "https://example.com/rejected.png" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Use URL" }));

  expect(onResolved).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("dialog", { name: "Add image" })).toBeInTheDocument();
});

it("supports keyboard source switching and connects URL errors to the field", async () => {
  renderFilePicker({ media: uploadOnlyMediaPort() });

  fireEvent.click(screen.getByRole("button", { name: "Open picker" }));

  const dialog = await screen.findByRole("dialog", { name: "Add image" });
  const uploadTab = within(dialog).getByRole("tab", { name: "Upload" });
  const uploadPanel = within(dialog).getByRole("tabpanel", { name: "Upload" });
  const dropzone = within(uploadPanel).getByRole("button", {
    name: "Drop an image here",
  });

  expect(uploadTab.getAttribute("aria-selected")).toBe("true");
  expect(dropzone.getAttribute("aria-describedby")).toMatch(/\S/);

  fireEvent.keyDown(uploadTab, { key: "ArrowRight" });

  await waitFor(() => {
    expect(within(dialog).getByRole("tab", { name: "URL" }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  const urlPanel = within(dialog).getByRole("tabpanel", { name: "URL" });
  const urlInput = within(urlPanel).getByRole("textbox", {
    name: "Image URL",
  });
  const helpIds = urlInput.getAttribute("aria-describedby") ?? "";

  expect(helpIds).toMatch(/\S/);

  fireEvent.change(urlInput, {
    target: { value: "javascript:alert(1)" },
  });
  fireEvent.click(within(urlPanel).getByRole("button", { name: "Use URL" }));

  const error = await within(dialog).findByRole("alert");

  expect(error.textContent).toBe("Use a valid http or https URL.");
  expect(urlInput.getAttribute("aria-invalid")).toBe("true");
  expect(urlInput.getAttribute("aria-describedby")).toContain(error.id);
});

it("announces library loading and library errors", async () => {
  const library = deferred<MediaListItem[]>();
  renderFilePicker({
    media: {
      ...uploadOnlyMediaPort(),
      list: async () => library.promise,
    },
  });

  fireEvent.click(screen.getByRole("button", { name: "Open picker" }));

  const dialog = await screen.findByRole("dialog", { name: "Add image" });
  const status = await within(dialog).findByRole("status");

  expect(status.textContent).toBe("Loading files");

  library.reject(new Error("Library unavailable"));

  const alert = await within(dialog).findByRole("alert");

  expect(alert.textContent).toBe("Files couldn’t be loaded. Try again or upload a new file.");
});

it("does not restart a pending library request across provider rerenders", async () => {
  const library = deferred<MediaListItem[]>();
  const list = vi.fn<NonNullable<MediaPort["list"]>>(() => library.promise);
  const onResolved = vi.fn<(result: FilePickerResult) => void>();

  function Harness() {
    const [open, setOpen] = useState(false);
    const [revision, setRevision] = useState(0);
    const media: MediaPort = {
      ...uploadOnlyMediaPort(),
      list: async (filter) => list(filter),
    };

    return (
      <ScaffoldServicesProvider ports={{ media }}>
        <button type="button" onClick={() => setOpen(true)}>
          Open picker
        </button>
        <button type="button" onClick={() => setRevision((value) => value + 1)}>
          Rerender provider {revision}
        </button>
        <FilePickerModal
          open={open}
          onOpenChange={setOpen}
          onResolved={onResolved}
          kind="media"
          defaultMediaType="image"
          title="Add image"
        />
      </ScaffoldServicesProvider>
    );
  }

  render(<Harness />);

  const rerenderButton = screen.getByRole("button", {
    name: /Rerender provider/,
  });
  fireEvent.click(screen.getByRole("button", { name: "Open picker" }));

  const dialog = await screen.findByRole("dialog", { name: "Add image" });
  await within(dialog).findByRole("status");

  fireEvent.click(rerenderButton);
  fireEvent.click(rerenderButton);
  fireEvent.click(rerenderButton);

  expect(list).toHaveBeenCalledTimes(1);

  library.resolve([
    {
      id: "media-image-1",
      url: "https://example.com/image-1.jpg",
      mediaType: "image",
      fileName: "first.jpg",
      mimeType: "image/jpeg",
      size: 1234,
    },
  ]);

  expect(
    await within(dialog).findByRole("button", {
      name: "Choose image: first.jpg",
    }),
  ).toBeInTheDocument();
});

it("announces upload progress and exposes the current value", async () => {
  const upload = deferred<Awaited<ReturnType<MediaPort["upload"]>>>();
  renderFilePicker({
    media: {
      resolve: async () => "https://example.com/image-1.jpg",
      upload: async (file, meta, onProgress) => {
        onProgress?.(42);
        return upload.promise.then(() => ({
          id: "uploaded-media",
          url: "https://example.com/uploaded.jpg",
          mediaType: meta.mediaType,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
        }));
      },
    },
  });

  fireEvent.click(screen.getByRole("button", { name: "Open picker" }));

  const dialog = await screen.findByRole("dialog", { name: "Add image" });
  const fileInput = within(dialog).getByLabelText("Choose image");
  const file = new File(["image"], "photo.png", { type: "image/png" });

  fireEvent.change(fileInput, { target: { files: [file] } });

  const progressbar = await within(dialog).findByRole("progressbar", {
    name: "Uploading photo.png",
  });
  const status = within(dialog).getByRole("status");

  expect(progressbar.getAttribute("aria-valuenow")).toBe("42");
  expect(progressbar.getAttribute("aria-valuetext")).toBe("42% uploaded");
  expect(status.textContent).toBe("Uploading photo.png, 42% uploaded.");

  await act(async () => {
    upload.resolve({
      id: "uploaded-media",
      url: "https://example.com/uploaded.jpg",
      mediaType: "image",
      fileName: "photo.png",
      mimeType: "image/png",
      size: file.size,
    });
    await upload.promise;
  });
});

it("does not resolve an upload after the author cancels it", async () => {
  const upload = deferred<Awaited<ReturnType<MediaPort["upload"]>>>();
  const { onResolved } = renderFilePicker({
    media: {
      resolve: async () => "https://example.com/image-1.jpg",
      upload: async () => upload.promise,
    },
  });

  fireEvent.click(screen.getByRole("button", { name: "Open picker" }));

  const dialog = await screen.findByRole("dialog", { name: "Add image" });
  const file = new File(["image"], "photo.png", { type: "image/png" });

  fireEvent.change(within(dialog).getByLabelText("Choose image"), {
    target: { files: [file] },
  });
  fireEvent.click(
    await within(dialog).findByRole("button", {
      name: "Cancel upload of photo.png",
    }),
  );

  await act(async () => {
    upload.resolve({
      id: "uploaded-media",
      url: "https://example.com/uploaded.jpg",
      mediaType: "image",
      fileName: "photo.png",
      mimeType: "image/png",
      size: file.size,
    });
    await upload.promise;
  });

  await waitFor(() => {
    expect(onResolved).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Add image" })).toBeInTheDocument();
  });
});

it("replaces host upload failures with recovery copy", async () => {
  renderFilePicker({
    media: {
      resolve: async () => "https://example.com/image-1.jpg",
      upload: async () => {
        throw new Error("upstream storage token expired");
      },
    },
  });

  fireEvent.click(screen.getByRole("button", { name: "Open picker" }));

  const dialog = await screen.findByRole("dialog", { name: "Add image" });
  const file = new File(["image"], "photo.png", { type: "image/png" });
  fireEvent.change(within(dialog).getByLabelText("Choose image"), {
    target: { files: [file] },
  });

  expect((await within(dialog).findByRole("alert")).textContent).toBe(
    "Upload failed. Check the file and try again.",
  );
});

it("connects upload validation errors to the dropzone", async () => {
  renderFilePicker({ media: uploadOnlyMediaPort() });

  fireEvent.click(screen.getByRole("button", { name: "Open picker" }));

  const dialog = await screen.findByRole("dialog", { name: "Add image" });
  const uploadPanel = within(dialog).getByRole("tabpanel", { name: "Upload" });
  const fileInput = within(dialog).getByLabelText("Choose image");
  const file = new File(["not an image"], "notes.txt", { type: "text/plain" });

  fireEvent.change(fileInput, { target: { files: [file] } });

  const alert = await within(dialog).findByRole("alert");
  const dropzone = within(uploadPanel).getByRole("button", {
    name: "Drop an image here",
  });

  expect(alert.textContent).toContain("notes.txt");
  expect(dropzone.getAttribute("aria-invalid")).toBe("true");
  expect(dropzone.getAttribute("aria-describedby")).toContain(alert.id);
});

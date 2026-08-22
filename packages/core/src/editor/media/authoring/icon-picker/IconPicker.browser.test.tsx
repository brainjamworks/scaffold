import type { Editor, JSONContent } from "@tiptap/core";
import { render as renderBrowserReact } from "vitest-browser-react";
import { expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor.test-harness";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import type { MediaPort } from "@/host/ports/media";
import { mediaIconValue } from "@/schemas/media/icon";
import "@/styles/globals.css";

const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();

it("keeps the managed-image picker open inside a Callout NodeView and selects an image", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  let editor: Editor | null = null;
  let documentError: unknown = null;
  const media: MediaPort = {
    resolve: async () => "https://example.com/logo.png",
    upload: async () => {
      throw new Error("not used");
    },
    list: async () => [
      {
        id: "logo-media-id",
        url: "https://example.com/logo.png",
        mediaType: "image",
        fileName: "logo.png",
        mimeType: "image/png",
        size: 1234,
      },
    ],
  };

  const rendered = await renderBrowserReact(
    <ScaffoldServicesProvider ports={{ media }}>
      <CourseDocumentEditor
        composition={coreAuthoringComposition}
        source={{ mode: "document", content: pageWithCallout() }}
        editable
        onReady={(nextEditor) => {
          editor = nextEditor;
        }}
        onDocumentError={(failure) => {
          documentError = failure;
        }}
      />
    </ScaffoldServicesProvider>,
    { baseElement: document.body, container: host },
  );

  try {
    await waitForCondition(() => editor !== null || documentError !== null);
    if (documentError !== null) throw new Error(JSON.stringify(documentError));
    const trigger = await waitForElement<HTMLButtonElement>(
      host,
      'button[aria-label="Choose callout icon"]',
    );
    trigger.focus();
    trigger.click();

    const imagePickerButton = await waitForElement<HTMLButtonElement>(
      host,
      ".sc-icon-emoji-picker-media-button",
    );
    imagePickerButton.focus();
    imagePickerButton.click();

    await animationFrames(8);

    const dialog = await waitForElement<HTMLElement>(host, '.sc-file-picker-dialog[role="dialog"]');
    expect(dialog.isConnected).toBe(true);

    await userEvent.keyboard("{Escape}");
    await waitForCondition(() => host.querySelector(".sc-file-picker-dialog") === null);
    expect(document.activeElement).toBe(trigger);

    trigger.click();
    const reopenedImagePickerButton = await waitForElement<HTMLButtonElement>(
      host,
      ".sc-icon-emoji-picker-media-button",
    );
    reopenedImagePickerButton.focus();
    reopenedImagePickerButton.click();
    await animationFrames(8);
    const reopenedDialog = await waitForElement<HTMLElement>(
      host,
      '.sc-file-picker-dialog[role="dialog"]',
    );
    const imageChoice = await waitForElement<HTMLButtonElement>(
      reopenedDialog,
      'button[aria-label="Choose image: logo.png"]',
    );
    imageChoice.click();

    await waitForCondition(
      () =>
        editor !== null &&
        JSON.stringify(selectedCalloutIcon(editor)) ===
          JSON.stringify(mediaIconValue("logo-media-id")),
    );
    expect(selectedCalloutIcon(editor!)).toEqual(mediaIconValue("logo-media-id"));
  } finally {
    await rendered.unmount();
    (editor as Editor | null)?.destroy();
    host.remove();
  }
});

function pageWithCallout(): JSONContent {
  const content = createScaffoldDocumentContent({ mode: "page", surfaceId: "surface00001" });
  const courseDocument = content.content?.[0];
  const surface = courseDocument?.content?.[0];
  if (courseDocument?.type !== "courseDocument" || surface?.type !== "surface") {
    throw new Error("Could not create the Callout image-picker browser fixture.");
  }
  surface.content = [calloutDoc()];
  return content;
}

function calloutDoc(): JSONContent {
  const item = coreAuthoringComposition.catalogues.inDocument.getById("callout");
  if (!item) throw new Error("Callout is not registered in the authoring catalogue.");
  const content = item.content() as JSONContent;
  assignMissingIds(content);
  return content;
}

function assignMissingIds(node: JSONContent): void {
  if (node.type !== "text") {
    node.attrs = { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() };
  }
  for (const child of node.content ?? []) assignMissingIds(child);
}

function selectedCalloutIcon(editor: Editor): unknown {
  let icon: unknown = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "callout") return true;
    icon = node.attrs["data"]?.icon ?? null;
    return false;
  });
  return icon;
}

async function waitForElement<T extends Element>(root: ParentNode, selector: string): Promise<T> {
  await waitForCondition(() => root.querySelector(selector) !== null);
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for the Callout image-picker browser state.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function animationFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

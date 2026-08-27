import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { render as renderBrowserReact } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import {
  getControlBindingRegistryForEditor,
  getControlCapabilityCatalogueForEditor,
  type ControlEvent,
} from "@/document/control-binding";
import { createScaffoldDocumentContent } from "@/format/artifact";

import {
  checkRuntimeDocumentReadiness,
  CourseDocumentRuntimeRenderer,
} from "./CourseDocumentRuntimeRenderer";

const runtimeComposition = createCoreScaffoldRuntimeComposition();
const SURFACE_ID = id("surfaceCtrl1");
const LAYOUT_ID = id("layoutCtrl01");
const FIRST_SECTION_ID = id("sectionCtl01");
const SECOND_SECTION_ID = id("sectionCtl02");

afterEach(() => {
  document.body.replaceChildren();
});

describe("mounted runtime Control Binding", () => {
  it("uses one Tabs target and owner identity from catalogue through command execution", async () => {
    let editor: TiptapEditor | null = null;
    const initialContent = runtimeTabsDocument();
    const productAccess = { scaffoldPlusAuthorized: false } as const;
    const readiness = checkRuntimeDocumentReadiness(
      initialContent,
      runtimeComposition,
      productAccess,
    );
    expect(readiness.status).toBe("supported");
    if (readiness.status !== "supported") {
      throw new Error(`Expected supported runtime Tabs content: ${JSON.stringify(readiness)}`);
    }
    const rendered = await renderBrowserReact(
      <CourseDocumentRuntimeRenderer
        artifactId="control-binding-browser"
        composition={runtimeComposition}
        initialContent={initialContent}
        onReady={(readyEditor) => {
          editor = readyEditor;
        }}
        productAccess={productAccess}
        visibleSurfaceId={SURFACE_ID}
      />,
    );

    try {
      await expect.poll(() => editor).not.toBeNull();
      const mountedEditor = editor!;
      const catalogue = getControlCapabilityCatalogueForEditor(mountedEditor);
      const registry = getControlBindingRegistryForEditor(mountedEditor);
      const target = catalogue.resolve(SECOND_SECTION_ID);
      const command = catalogue.resolveCommand(SECOND_SECTION_ID, "select");

      expect(target.isOk()).toBe(true);
      if (target.isErr()) throw new Error(`Expected Tabs target: ${JSON.stringify(target.error)}`);
      expect(command.isOk()).toBe(true);
      if (command.isErr()) {
        throw new Error(`Expected Tabs select command: ${JSON.stringify(command.error)}`);
      }
      expect(target.value).toMatchObject({
        targetId: SECOND_SECTION_ID,
        ownerId: LAYOUT_ID,
      });
      expect(command.value.targetId).toBe(target.value.targetId);
      expect(command.value.ownerId).toBe(target.value.ownerId);
      expect(command.value.command).toBe(target.value.capabilities.commands?.[0]);

      await expect.poll(() => registry.get(target.value.ownerId)).toBeDefined();
      const binding = registry.get(target.value.ownerId);
      if (!binding?.eventSource || !binding.stateReader || !binding.commandExecutor) {
        throw new Error(`Eligible Tabs owner "${target.value.ownerId}" is not fully mounted.`);
      }
      expect(binding.ownerId).toBe(target.value.ownerId);
      expect(
        binding.stateReader.read({ targetId: target.value.targetId, key: "selected" }),
      ).toBe(false);
      const events: ControlEvent[] = [];
      const unsubscribe = binding.eventSource.subscribe((event) => events.push(event));

      const execution = await binding.commandExecutor.execute({
        targetId: command.value.targetId,
        type: command.value.command.type,
        signal: new AbortController().signal,
      });

      expect(execution.isOk()).toBe(true);
      await expect
        .poll(() =>
          binding.stateReader!.read({ targetId: target.value.targetId, key: "selected" }),
        )
        .toBe(true);
      await expect
        .element(page.getByRole("tab", { name: "Practice" }))
        .toHaveAttribute("aria-selected", "true");
      expect(events).toEqual([]);
      unsubscribe();
    } finally {
      await rendered.unmount();
    }
  });
});

function runtimeTabsDocument(): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "page",
    surfaceId: SURFACE_ID,
  });
  const surface = content.content?.[0]?.content?.find((node) => node.type === "surface");
  if (!surface) throw new Error("Expected runtime Control Binding Surface.");
  surface.content = [
    {
      type: "layout",
      attrs: {
        id: LAYOUT_ID,
        variant: "tabs",
        options: { label: "Lesson sections", variant: "default" },
      },
      content: [
        tabSection(FIRST_SECTION_ID, "Overview", "paraCtrl0001"),
        tabSection(SECOND_SECTION_ID, "Practice", "paraCtrl0002"),
      ],
    },
  ];
  return content;
}

function tabSection(idValue: EmbeddedNodeId, label: string, paragraphId: string): JSONContent {
  return {
    type: "section",
    attrs: {
      id: idValue,
      role: "tab-panel",
      verticalPosition: "top",
      options: { label },
    },
    content: [
      {
        type: "paragraph",
        attrs: { id: paragraphId },
        content: [{ type: "text", text: label }],
      },
    ],
  };
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}

// @vitest-environment jsdom

import { CircleIcon } from "@phosphor-icons/react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type LayoutCapability,
} from "@/composition/application/create-scaffold-application";
import type { ResolvedScaffoldCapabilities } from "@/composition/model/resolved-scaffold-capabilities";

import {
  createScaffoldCapabilitiesStorageExtension,
  getScaffoldCapabilitiesForEditor,
  getScaffoldCapabilitiesForState,
  type ScaffoldCapabilitiesStorage,
} from "./scaffold-capabilities-storage";

describe("Scaffold capabilities storage", () => {
  it("keeps each editor's exact resolved capabilities isolated", () => {
    const coreCapabilities = createScaffoldApplication().capabilities;
    const hostCapabilities = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "isolated-host",
          layouts: [testLayoutCapability("isolated-host-layout")],
        }),
      ],
    }).capabilities;
    const coreEditor = createEditor(coreCapabilities);
    const hostEditor = createEditor(hostCapabilities);

    try {
      const coreStorage = readCapabilitiesStorage(coreEditor);
      const hostStorage = readCapabilitiesStorage(hostEditor);

      expect(coreCapabilities).not.toBe(hostCapabilities);
      expect(Object.keys(coreStorage)).toEqual(["capabilities"]);
      expect(Object.keys(hostStorage)).toEqual(["capabilities"]);
      expect(coreStorage.capabilities).toBe(coreCapabilities);
      expect(hostStorage.capabilities).toBe(hostCapabilities);
      expect(getScaffoldCapabilitiesForEditor(coreEditor)).toBe(coreCapabilities);
      expect(getScaffoldCapabilitiesForEditor(hostEditor)).toBe(hostCapabilities);
      expect(getScaffoldCapabilitiesForEditor(coreEditor).blocks.registry).toBe(
        coreCapabilities.blocks.registry,
      );
      expect(getScaffoldCapabilitiesForState(hostEditor.state).blocks.registry).toBe(
        hostCapabilities.blocks.registry,
      );
    } finally {
      coreEditor.destroy();
      hostEditor.destroy();
    }
  });

  it("prevents replacing the installed capabilities on its owned storage record", () => {
    const installedCapabilities = createScaffoldApplication().capabilities;
    const anotherCapabilities = createScaffoldApplication().capabilities;
    const editor = createEditor(installedCapabilities);

    try {
      const storage = readCapabilitiesStorage(editor);

      expect(Reflect.set(storage, "capabilities", anotherCapabilities)).toBe(false);
      expect(Object.isFrozen(storage)).toBe(true);
      expect(storage.capabilities).toBe(installedCapabilities);
      expect(getScaffoldCapabilitiesForEditor(editor)).toBe(installedCapabilities);
    } finally {
      editor.destroy();
    }
  });

  it("exposes the exact installed capabilities through editor state", () => {
    const capabilities = createScaffoldApplication().capabilities;
    const editor = createEditor(capabilities);

    try {
      expect(getScaffoldCapabilitiesForState(editor.state)).toBe(capabilities);
    } finally {
      editor.destroy();
    }
  });

  it("fails clearly when editor state lacks the capabilities plugin", () => {
    const editor = new Editor({ extensions: [StarterKit] });

    try {
      expect(() => getScaffoldCapabilitiesForState(editor.state)).toThrowError(
        "Scaffold capabilities plugin is not installed for this editor state",
      );
    } finally {
      editor.destroy();
    }
  });

  it("fails clearly when the capabilities extension is absent", () => {
    const editor = new Editor({ extensions: [StarterKit] });

    try {
      expect(() => getScaffoldCapabilitiesForEditor(editor)).toThrowError(
        "Scaffold capabilities extension is not installed for this editor",
      );
    } finally {
      editor.destroy();
    }
  });
});

function createEditor(capabilities: ResolvedScaffoldCapabilities): Editor {
  return new Editor({
    extensions: [StarterKit, createScaffoldCapabilitiesStorageExtension(capabilities)],
  });
}

function readCapabilitiesStorage(editor: Editor): ScaffoldCapabilitiesStorage {
  return (
    editor.storage as unknown as {
      scaffoldCapabilities: ScaffoldCapabilitiesStorage;
    }
  ).scaffoldCapabilities;
}

function testLayoutCapability(id: string): LayoutCapability {
  return {
    definition: {
      id,
      title: "Host layout",
      description: "Host-contributed layout",
      icon: CircleIcon,
      createContent: () => ({
        type: "layout",
        attrs: { id: `${id}-instance`, variant: id },
        content: [{ type: "section", attrs: { id: `${id}-section` } }],
      }),
    },
    authoringView: {
      id,
      layout: TestLayoutAuthoringView,
    },
    runtimeView: {
      id,
      component: TestLayoutRuntimeView,
    },
  };
}

function TestLayoutAuthoringView() {
  return null;
}

function TestLayoutRuntimeView() {
  return null;
}

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

import {
  createScaffoldAuthoringCataloguesStorageExtension,
  getScaffoldAuthoringCataloguesForEditor,
  type ScaffoldAuthoringCataloguesStorage,
} from "./scaffold-authoring-catalogues-storage";

describe("Scaffold authoring catalogues storage", () => {
  it("keeps each editor's exact authoring catalogues in its frozen owned storage record", () => {
    const coreApplication = createScaffoldApplication();
    const hostApplication = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "isolated-authoring-catalogues-host",
          layouts: [testLayoutCapability("isolated-authoring-catalogues-layout")],
        }),
      ],
    });
    const coreEditor = createEditor(coreApplication.authoring.catalogues);
    const hostEditor = createEditor(hostApplication.authoring.catalogues);

    try {
      const coreStorage = readAuthoringCataloguesStorage(coreEditor);
      const hostStorage = readAuthoringCataloguesStorage(hostEditor);

      expect(coreApplication.authoring.catalogues).not.toBe(hostApplication.authoring.catalogues);
      expect(Object.keys(coreStorage)).toEqual(["catalogues"]);
      expect(Object.keys(hostStorage)).toEqual(["catalogues"]);
      expect(Object.isFrozen(coreStorage)).toBe(true);
      expect(Object.isFrozen(hostStorage)).toBe(true);
      expect(coreStorage.catalogues).toBe(coreApplication.authoring.catalogues);
      expect(hostStorage.catalogues).toBe(hostApplication.authoring.catalogues);
      expect(Reflect.set(coreStorage, "catalogues", hostApplication.authoring.catalogues)).toBe(
        false,
      );
      expect(coreStorage.catalogues).toBe(coreApplication.authoring.catalogues);
      expect(getScaffoldAuthoringCataloguesForEditor(coreEditor)).toBe(
        coreApplication.authoring.catalogues,
      );
      expect(getScaffoldAuthoringCataloguesForEditor(hostEditor)).toBe(
        hostApplication.authoring.catalogues,
      );
    } finally {
      coreEditor.destroy();
      hostEditor.destroy();
    }
  });

  it("fails clearly when the authoring catalogues extension is absent", () => {
    const editor = new Editor({ extensions: [StarterKit] });

    try {
      expect(() => getScaffoldAuthoringCataloguesForEditor(editor)).toThrowError(
        "Scaffold authoring catalogues extension is not installed for this editor",
      );
    } finally {
      editor.destroy();
    }
  });
});

function createEditor(
  catalogues: ReturnType<typeof createScaffoldApplication>["authoring"]["catalogues"],
): Editor {
  return new Editor({
    extensions: [StarterKit, createScaffoldAuthoringCataloguesStorageExtension(catalogues)],
  });
}

function readAuthoringCataloguesStorage(editor: Editor): ScaffoldAuthoringCataloguesStorage {
  return (
    editor.storage as unknown as {
      scaffoldAuthoringCatalogues: ScaffoldAuthoringCataloguesStorage;
    }
  ).scaffoldAuthoringCatalogues;
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

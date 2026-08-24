// @vitest-environment jsdom

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { getSemanticDocumentControllerForEditor } from "@/document/authoring/semantic-document";
import { projectSemanticDocument } from "@/document/model/semantic-document";
import { createRepresentativeSemanticDocumentFixture } from "@/document/model/semantic-document/testing/semantic-document-fixtures";

import { createSemanticTargetInteractionEnvironment } from "./semantic-target-interaction-environment";
import {
  createSemanticTargetInteractionEnvironmentStorageExtension,
  getSemanticTargetInteractionEnvironmentForEditor,
} from "./semantic-target-interaction-storage";

describe("SemanticTargetInteractionEnvironment", () => {
  it("isolates mounted environments and keeps disposal outside the borrowed service", async () => {
    const fixture = createRepresentativeSemanticDocumentFixture({ kind: "page" });
    const semantics = projectSemanticDocument({
      doc: fixture.doc,
      courseStructure: fixture.courseStructure,
      definitions: fixture.definitions,
      revision: 1,
    });
    const first = createSemanticTargetInteractionEnvironment({
      getSemantics: () => semantics,
      getCourseStructure: () => fixture.courseStructure,
      surfacePresentation: { presentSurface: vi.fn(async () => undefined) },
    });
    const second = createSemanticTargetInteractionEnvironment({
      getSemantics: () => semantics,
      getCourseStructure: () => fixture.courseStructure,
      surfacePresentation: { presentSurface: vi.fn(async () => undefined) },
    });
    const ownerId = EmbeddedNodeIdSchema.parse("owner0000001");
    const childId = EmbeddedNodeIdSchema.parse("child0000001");
    const binding = {
      ownerId,
      activate: vi.fn(async () => ({ kind: "revealed" as const, ownerId, childId })),
    };

    first.environment.registry.register(binding);
    second.environment.registry.register(binding);

    expect(first.environment).not.toBe(second.environment);
    expect(first.environment.registry).not.toBe(second.environment.registry);
    expect(Object.keys(first.environment).sort()).toEqual(["coordinator", "registry"]);
    expect(first.environment).not.toHaveProperty("dispose");
    expect(first.environment.registry).not.toHaveProperty("dispose");
    expect(Object.isFrozen(first.environment)).toBe(true);

    first.dispose();
    first.dispose();

    expect(() => first.environment.registry.register(binding)).toThrowError(
      "Cannot register a semantic activation binding after registry disposal",
    );
    expect(second.environment.registry.resolve(ownerId)).toEqual({
      kind: "resolved",
      binding,
    });
    await expect(
      first.environment.coordinator.activate(fixture.surfaces[0]!.surface, {
        origin: "configured-presentation",
      }),
    ).resolves.toEqual({
      kind: "interrupted",
      requestedId: fixture.surfaces[0]!.surface,
    });
  });

  it("exposes one borrow-only environment through Core editor storage", () => {
    const fixture = createRepresentativeSemanticDocumentFixture({ kind: "page" });
    const semantics = projectSemanticDocument({
      doc: fixture.doc,
      courseStructure: fixture.courseStructure,
      definitions: fixture.definitions,
      revision: 1,
    });
    const owner = createSemanticTargetInteractionEnvironment({
      getSemantics: () => semantics,
      getCourseStructure: () => fixture.courseStructure,
      surfacePresentation: { presentSurface: vi.fn(async () => undefined) },
    });
    const editor = new Editor({
      extensions: [
        StarterKit,
        createSemanticTargetInteractionEnvironmentStorageExtension({
          getEnvironment: () => owner.environment,
        }),
      ],
    });
    const editorWithoutEnvironment = new Editor({ extensions: [StarterKit] });

    try {
      expect(getSemanticTargetInteractionEnvironmentForEditor(editor)).toBe(owner.environment);
      expect(getSemanticTargetInteractionEnvironmentForEditor(editor)).not.toHaveProperty(
        "dispose",
      );
      expect(() =>
        getSemanticTargetInteractionEnvironmentForEditor(editorWithoutEnvironment),
      ).toThrowError(
        "Semantic Target Interaction Environment extension is not installed for this editor",
      );
    } finally {
      editor.destroy();
      editorWithoutEnvironment.destroy();
      owner.dispose();
    }
  });

  it("interrupts in-flight work when the owning environment is disposed", async () => {
    const fixture = createRepresentativeSemanticDocumentFixture({ kind: "page" });
    const projected = projectSemanticDocument({
      doc: fixture.doc,
      courseStructure: fixture.courseStructure,
      definitions: fixture.definitions,
      revision: 1,
    });
    const targetId = fixture.surfaces[0]!.publishedParagraph;
    const ownerId = EmbeddedNodeIdSchema.parse("owner0000001");
    const childId = EmbeddedNodeIdSchema.parse("child0000001");
    const location = projected.locationById.get(targetId);
    if (!location) throw new Error("expected target location");
    const locationById = new Map(projected.locationById);
    locationById.set(targetId, {
      ...location,
      activationPath: [{ ownerId, childId, ownerKind: "block" }],
    });
    const semantics = { ...projected, locationById };
    const owner = createSemanticTargetInteractionEnvironment({
      getSemantics: () => semantics,
      getCourseStructure: () => fixture.courseStructure,
      surfacePresentation: { presentSurface: vi.fn(async () => undefined) },
    });
    let started!: () => void;
    const activationStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    owner.environment.registry.register({
      ownerId,
      activate: ({ signal }) =>
        new Promise((resolve) => {
          started();
          signal.addEventListener(
            "abort",
            () => resolve({ kind: "interrupted", ownerId, childId }),
            { once: true },
          );
        }),
    });

    const activation = owner.environment.coordinator.activate(targetId, {
      origin: "configured-presentation",
    });
    await activationStarted;
    owner.dispose();

    await expect(activation).resolves.toEqual({ kind: "interrupted", requestedId: targetId });
  });

  it("mounts one environment over each authoring controller's existing snapshot", async () => {
    const composition = createCoreScaffoldAuthoringComposition();
    const createEditor = () =>
      new Editor({
        editable: true,
        extensions: createCourseDocumentAuthoringExtensions({
          editable: true,
          composition,
        }),
        content: {
          type: "doc",
          content: [
            {
              type: "courseDocument",
              attrs: { id: "course000001", mode: "page" },
              content: [
                {
                  type: "surface",
                  attrs: { id: "surface00001", variant: "page-default" },
                  content: [
                    {
                      type: "paragraph",
                      attrs: { id: "paragraph001" },
                      content: [{ type: "text", text: "Authoring environment" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      });
    const firstEditor = createEditor();
    const secondEditor = createEditor();

    try {
      const firstController = getSemanticDocumentControllerForEditor(firstEditor);
      const firstEnvironment = getSemanticTargetInteractionEnvironmentForEditor(firstEditor);
      const secondEnvironment = getSemanticTargetInteractionEnvironmentForEditor(secondEditor);
      const presentSurface = vi.fn(async () => undefined);
      const createActivationTransaction = vi.fn(() => firstEditor.state.tr);
      const bringIntoView = vi.fn(async () => undefined);
      firstController.setNavigationEnvironment({
        presentSurface,
        createActivationTransaction,
        bringIntoView,
      });
      const beforeSelection = firstEditor.state.selection.toJSON();

      expect(firstEnvironment).toBe(firstController.semanticTargetInteractions);
      expect(firstEnvironment.registry).not.toBe(firstController.semanticActivations);
      expect(firstEnvironment.registry.resolve).toBeDefined();
      expect(firstEnvironment).not.toBe(secondEnvironment);
      await expect(
        firstEnvironment.coordinator.activate(EmbeddedNodeIdSchema.parse("surface00001"), {
          origin: "configured-presentation",
        }),
      ).resolves.toEqual({ kind: "reached", requestedId: "surface00001" });
      expect(presentSurface).toHaveBeenCalledWith("surface00001");
      expect(createActivationTransaction).not.toHaveBeenCalled();
      expect(bringIntoView).not.toHaveBeenCalled();
      expect(firstEditor.state.selection.toJSON()).toEqual(beforeSelection);

      firstEditor.destroy();

      const ownerId = EmbeddedNodeIdSchema.parse("owner0000001");
      expect(() =>
        firstEnvironment.registry.register({
          ownerId,
          activate: async () => {
            throw new Error("not called");
          },
        }),
      ).toThrowError("Cannot register a semantic activation binding after registry disposal");
      expect(secondEnvironment.registry.resolve(ownerId)).toEqual({
        kind: "unavailable",
        ownerId,
        reason: "owner-unmounted",
      });
    } finally {
      if (!firstEditor.isDestroyed) firstEditor.destroy();
      secondEditor.destroy();
    }
  });
});

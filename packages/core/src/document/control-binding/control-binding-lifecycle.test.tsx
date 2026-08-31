// @vitest-environment jsdom

import { CircleIcon } from "@phosphor-icons/react";
import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Editor } from "@tiptap/core";
import { EditorContent, NodeViewContent } from "@tiptap/react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement, useEffect } from "react";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type LayoutCapability,
} from "@/composition/application/create-scaffold-application";
import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import {
  APPROVED_SEMANTIC_MEMBER_FAMILY_CASES,
  SEMANTIC_LIFECYCLE_AUTHORING_STATE,
  createCompleteSemanticLifecycleDocument,
} from "@/composition/application/testing/semantic-publication-lifecycle-fixtures";
import {
  getSemanticTargetInteractionEnvironmentForEditor,
  tryGetSemanticTargetInteractionEnvironmentForEditor,
} from "@/document/semantic-target-interaction";
import { hiddenLayoutSectionDocumentSemantics } from "@/editor/arrangements/layout/shared/model/layout-semantic-publication";
import type { LayoutRuntimeViewProps } from "@/editor/arrangements/layout/runtime/layout-view-definition";

import type { ControlEventListener } from "./control-binding";
import type { ControlBindingRegistryPort } from "./control-binding-storage";
import {
  getControlBindingRegistryForEditor,
  tryGetControlBindingRegistryForEditor,
} from "./control-binding-storage";
import {
  getControlCapabilityCatalogueForEditor,
  tryGetControlCapabilityCatalogueForEditor,
} from "./control-capability-catalogue-storage";

const editors: Editor[] = [];
const OWNER_ID = "sharedowner01" as EmbeddedNodeId;

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Control Binding editor lifecycle", () => {
  it("keeps authoring and runtime catalogue, registry and Target Interaction siblings isolated", () => {
    const content = createCompleteSemanticLifecycleDocument().toJSON();
    const authoring = trackEditor(
      new Editor({
        editable: true,
        extensions: SEMANTIC_LIFECYCLE_AUTHORING_STATE.extensions,
        content,
      }),
    );
    const runtime = trackEditor(
      new Editor({
        editable: false,
        extensions: createCourseDocumentRuntimeExtensions({
          composition: createCoreScaffoldRuntimeComposition(),
        }),
        content,
      }),
    );

    const authoringCatalogue = getControlCapabilityCatalogueForEditor(authoring);
    const runtimeCatalogue = getControlCapabilityCatalogueForEditor(runtime);
    const authoringRegistry = getControlBindingRegistryForEditor(authoring);
    const runtimeRegistry = getControlBindingRegistryForEditor(runtime);
    const sharedOwnerId = APPROVED_SEMANTIC_MEMBER_FAMILY_CASES[0]!.ownerId;
    const authoringSharedOwner = authoringCatalogue.resolve(sharedOwnerId);
    const runtimeSharedOwner = runtimeCatalogue.resolve(sharedOwnerId);

    expect(authoringCatalogue).not.toBe(runtimeCatalogue);
    expect(authoringRegistry).not.toBe(runtimeRegistry);
    expect(authoringSharedOwner.isErr()).toBe(true);
    expect(runtimeSharedOwner.isErr()).toBe(true);
    if (authoringSharedOwner.isOk()) {
      throw new Error("Expected the shared passive owner to have no declared capabilities.");
    }
    if (runtimeSharedOwner.isOk()) {
      throw new Error("Expected the shared passive owner to have no declared capabilities.");
    }
    expect(authoringSharedOwner.error).toEqual({
      reason: "no-declared-capabilities",
      targetId: sharedOwnerId,
    });
    expect(runtimeSharedOwner.error).toEqual(authoringSharedOwner.error);
    expect(authoringRegistry).not.toHaveProperty("dispose");
    expect(runtimeRegistry).not.toHaveProperty("dispose");
    expectTypeOf(authoringRegistry).toEqualTypeOf<ControlBindingRegistryPort>();
    expect(tryGetControlCapabilityCatalogueForEditor(authoring)).toBe(authoringCatalogue);
    expect(tryGetControlCapabilityCatalogueForEditor(runtime)).toBe(runtimeCatalogue);
    expect(tryGetControlBindingRegistryForEditor(authoring)).toBe(authoringRegistry);
    expect(tryGetControlBindingRegistryForEditor(runtime)).toBe(runtimeRegistry);

    const authoringInteractions = getSemanticTargetInteractionEnvironmentForEditor(authoring);
    const runtimeInteractions = getSemanticTargetInteractionEnvironmentForEditor(runtime);
    expect(authoringInteractions).not.toBe(runtimeInteractions);
    expect(tryGetSemanticTargetInteractionEnvironmentForEditor(authoring)).toBe(
      authoringInteractions,
    );
    expect(tryGetSemanticTargetInteractionEnvironmentForEditor(runtime)).toBe(
      runtimeInteractions,
    );
  });

  it("keeps disposal private while invalidating previously borrowed registry ports", () => {
    const editor = trackEditor(
      new Editor({
        editable: true,
        extensions: SEMANTIC_LIFECYCLE_AUTHORING_STATE.extensions,
        content: createCompleteSemanticLifecycleDocument().toJSON(),
      }),
    );
    const registry = getControlBindingRegistryForEditor(editor);

    editor.destroy();

    expect(() => registry.get(OWNER_ID)).toThrow(
      "Cannot use a disposed Control Binding registry.",
    );
    expect(() => registry.register({ ownerId: OWNER_ID })).toThrow(
      "Cannot register a Control Binding after registry disposal.",
    );
    expect(() => registry.notifyWhenOwnersMounted([], () => undefined)).toThrow(
      "Cannot request Control Binding readiness after registry disposal.",
    );
  });

  it("delegates exact-owner readiness through isolated authoring and runtime ports", () => {
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "control-readiness-lifecycle",
          layouts: [unmountProofLayoutCapability(new Set())],
        }),
      ],
    });
    const authoringEnvironment = createCourseDocumentAuthoringEnvironment({
      composition: application.authoring,
      editable: true,
    });
    const authoring = trackEditor(
      new Editor({
        editable: true,
        extensions: getCourseDocumentAuthoringEnvironmentState(authoringEnvironment).extensions,
        content: unmountProofDocument(),
      }),
    );
    const runtime = trackEditor(
      new Editor({
        editable: false,
        extensions: createCourseDocumentRuntimeExtensions({ composition: application.runtime }),
        content: unmountProofDocument(),
      }),
    );
    const ownerId = "layoutUmnt01" as EmbeddedNodeId;
    const authoringRegistry = getControlBindingRegistryForEditor(authoring);
    const runtimeRegistry = getControlBindingRegistryForEditor(runtime);
    const authoringReady = vi.fn();
    const runtimeReady = vi.fn();

    authoringRegistry.notifyWhenOwnersMounted([ownerId], authoringReady);
    runtimeRegistry.notifyWhenOwnersMounted([ownerId], runtimeReady);
    runtimeRegistry.register(readinessProofBinding(ownerId));

    expect(runtimeReady).toHaveBeenCalledOnce();
    expect(authoringReady).not.toHaveBeenCalled();

    authoringRegistry.register(readinessProofBinding(ownerId));

    expect(authoringReady).toHaveBeenCalledOnce();
    expect(runtimeReady).toHaveBeenCalledOnce();
    expect(authoringRegistry).not.toHaveProperty("dispose");
    expect(runtimeRegistry).not.toHaveProperty("dispose");
  });

  it("unregisters a mounted feature and closes subscriptions while its editor stays alive", async () => {
    const listeners = new Set<ControlEventListener>();
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "control-lifecycle-unmount",
          layouts: [unmountProofLayoutCapability(listeners)],
        }),
      ],
    });
    const editor = trackEditor(
      new Editor({
        editable: false,
        extensions: createCourseDocumentRuntimeExtensions({ composition: application.runtime }),
        content: unmountProofDocument(),
      }),
    );
    render(createElement(EditorContent, { editor }));
    const ownerId = "layoutUmnt01" as EmbeddedNodeId;
    const registry = getControlBindingRegistryForEditor(editor);

    await waitFor(() => expect(registry.get(ownerId)).toBeDefined());
    const mountedBinding = registry.get(ownerId);
    if (!mountedBinding) throw new Error("Expected mounted lifecycle proof binding.");
    const unsubscribe = mountedBinding.eventSource?.subscribe(() => undefined);
    expect(listeners.size).toBe(1);

    removeUnmountProofLayout(editor, ownerId);

    await waitFor(() => {
      expect(editor.isDestroyed).toBe(false);
      expect(registry.get(ownerId)).toBeUndefined();
      expect(listeners.size).toBe(0);
    });
    expect(() => mountedBinding.eventSource?.subscribe(() => undefined)).toThrow(
      `Control Binding for owner "${ownerId}" is no longer mounted.`,
    );
    unsubscribe?.();
    expect(editor.isDestroyed).toBe(false);
  });
});

function trackEditor(editor: Editor): Editor {
  editors.push(editor);
  return editor;
}

function readinessProofBinding(ownerId: EmbeddedNodeId) {
  return {
    ownerId,
    eventSource: {
      subscribe: () => () => undefined,
    },
  };
}

function unmountProofLayoutCapability(
  listeners: Set<ControlEventListener>,
): LayoutCapability {
  const id = "control-lifecycle-unmount-layout";
  function UnmountProofRuntimeView(props: LayoutRuntimeViewProps) {
    const ownerId = props.node.attrs["id"] as EmbeddedNodeId;

    useEffect(() => {
      const registry = getControlBindingRegistryForEditor(props.editor);
      return registry.register({
        ownerId,
        eventSource: {
          subscribe(listener) {
            listeners.add(listener);
            let subscribed = true;
            return () => {
              if (!subscribed) return;
              subscribed = false;
              listeners.delete(listener);
            };
          },
        },
      });
    }, [ownerId, props.editor]);

    return createElement(NodeViewContent);
  }

  return {
    definition: {
      id,
      title: "Control lifecycle unmount proof",
      description: "Test-only mounted Control Binding lifecycle owner",
      icon: CircleIcon,
      documentSemantics: hiddenLayoutSectionDocumentSemantics,
      control: {
        semanticChildren: {
          section: { events: [{ type: "changed", label: "Changed" }] },
        },
      },
      createContent: () => ({
        type: "layout",
        attrs: { id: "layoutUmnt01", variant: id },
        content: [{ type: "section", attrs: { id: "sectionUmn01" } }],
      }),
    },
    authoringView: { id, layout: () => null },
    runtimeView: { id, component: UnmountProofRuntimeView },
  };
}

function unmountProofDocument() {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: "courseDocUm1", mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceUmn01", variant: "page-default" },
            content: [
              {
                type: "layout",
                attrs: {
                  id: "layoutUmnt01",
                  variant: "control-lifecycle-unmount-layout",
                },
                content: [
                  {
                    type: "section",
                    attrs: { id: "sectionUmn01" },
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Mounted" }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function removeUnmountProofLayout(editor: Editor, ownerId: EmbeddedNodeId): void {
  let target: { readonly pos: number; readonly nodeSize: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "layout" || node.attrs["id"] !== ownerId) return true;
    target = { pos, nodeSize: node.nodeSize };
    return false;
  });
  const mountedTarget = target as { readonly pos: number; readonly nodeSize: number } | null;
  if (!mountedTarget) throw new Error("Expected mounted lifecycle proof Layout.");
  const paragraph = editor.schema.nodes["paragraph"];
  if (!paragraph) throw new Error("Expected paragraph in lifecycle proof schema.");
  editor.view.dispatch(
    editor.state.tr
      .replaceWith(
        mountedTarget.pos,
        mountedTarget.pos + mountedTarget.nodeSize,
        paragraph.create({ id: "replaceUmnt1" }, editor.schema.text("Unmounted")),
      )
      .setMeta("studentGuard", "allow"),
  );
}

import { CircleIcon } from "@phosphor-icons/react";
import { Node } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { builtInBlockDefinitions } from "@/editor/blocks/built-in-block-definitions";

import type { BlockCapability } from "./block-capability";
import {
  createScaffoldApplication,
  defineScaffoldExtensionPack,
  type LayoutCapability,
} from "./create-scaffold-application";

describe("createScaffoldApplication", () => {
  it("shares neutral capabilities while keeping authoring and runtime views lane-local", () => {
    const hostLayout = testLayoutCapability("host-columns");
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-content",
          layouts: [hostLayout],
        }),
      ],
    });

    expect(application.authoring.capabilities).toBe(application.capabilities);
    expect(application.runtime.capabilities).toBe(application.capabilities);
    expect(Object.keys(application.capabilities)).toEqual(["blocks", "layouts"]);
    expect(Object.keys(application.capabilities.blocks)).toEqual(["registry"]);
    expect(Object.keys(application.capabilities.layouts)).toEqual(["registry"]);
    expect(application.authoring.capabilities.blocks.registry).toBe(
      application.capabilities.blocks.registry,
    );
    expect(application.runtime.capabilities.blocks.registry).toBe(
      application.capabilities.blocks.registry,
    );
    expect(Object.keys(application.authoring.blocks)).toEqual(["extensions"]);
    expect(Object.keys(application.runtime.blocks)).toEqual(["extensions"]);
    expect(Object.keys(application.authoring.layouts)).toEqual(["views"]);
    expect(Object.keys(application.runtime.layouts)).toEqual(["views"]);
    expect(application.authoring.layouts.views.getById(hostLayout.definition.id)?.layout).toBe(
      TestLayoutAuthoringView,
    );
    expect(application.runtime.layouts.views.getById(hostLayout.definition.id)?.component).toBe(
      TestLayoutRuntimeView,
    );
  });

  it("creates an isolated immutable Block registry for each application", () => {
    const firstApplication = createScaffoldApplication();
    const secondApplication = createScaffoldApplication();

    expect(firstApplication.capabilities.blocks.registry.definitions).toHaveLength(34);
    expect(firstApplication.capabilities.blocks.registry).not.toBe(
      secondApplication.capabilities.blocks.registry,
    );
    expect(Object.isFrozen(firstApplication.capabilities.blocks)).toBe(true);
    expect(Object.isFrozen(firstApplication.capabilities.blocks.registry)).toBe(true);
  });

  it("projects one complete host Block after all mandatory Core Blocks", () => {
    const hostBlock = testBlockCapability("host_tracer");
    const application = createScaffoldApplication({
      packs: [
        defineScaffoldExtensionPack({
          id: "host-blocks",
          blocks: [hostBlock],
        }),
      ],
    });

    expect(
      application.capabilities.blocks.registry.definitions.map(({ nodeType }) => nodeType),
    ).toEqual([
      ...builtInBlockDefinitions.map(({ nodeType }) => nodeType),
      hostBlock.definition.nodeType,
    ]);
    expect(
      application.capabilities.blocks.registry.definitions.filter(
        ({ nodeType }) => nodeType === hostBlock.definition.nodeType,
      ),
    ).toHaveLength(1);
    expect(
      application.authoring.blocks.extensions.filter(
        (extension) => extension === hostBlock.authoringExtension,
      ),
    ).toHaveLength(1);
    expect(
      application.runtime.blocks.extensions.filter(
        (extension) => extension === hostBlock.runtimeExtension,
      ),
    ).toHaveLength(1);
  });
});

function testBlockCapability(nodeType: string): BlockCapability {
  return {
    definition: { nodeType },
    authoringExtension: Node.create({ name: nodeType }),
    runtimeExtension: Node.create({ name: nodeType }),
  };
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

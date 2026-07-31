import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as extensions from "@scaffold/core/extensions";
import type {
  BlockCapability,
  BlockDefinition,
  BlockDefinitionInput,
  LayoutCapability,
  ResolvedBlockCapabilities,
  ResolvedLayoutCapabilities,
  ResolvedScaffoldCapabilities,
  ScaffoldApplication,
  ScaffoldAuthoringComposition,
  ScaffoldAuthoringBlockComposition,
  ScaffoldAuthoringLayoutComposition,
  ScaffoldCapabilitiesStorage,
  ScaffoldExtensionPack,
  ScaffoldExtensionPackInput,
  ScaffoldRuntimeComposition,
  ScaffoldRuntimeBlockComposition,
  ScaffoldRuntimeLayoutComposition,
} from "@scaffold/core/extensions";

type ExtensionTypeSurface = {
  blockDefinitionInput: BlockDefinitionInput;
  blockDefinition: BlockDefinition;
  blockCapability: BlockCapability;
  layoutCapability: LayoutCapability;
  resolvedBlocks: ResolvedBlockCapabilities;
  resolvedLayouts: ResolvedLayoutCapabilities;
  resolvedCapabilities: ResolvedScaffoldCapabilities;
  application: ScaffoldApplication;
  authoring: ScaffoldAuthoringComposition;
  authoringBlocks: ScaffoldAuthoringBlockComposition;
  authoringLayouts: ScaffoldAuthoringLayoutComposition;
  capabilitiesStorage: ScaffoldCapabilitiesStorage;
  pack: ScaffoldExtensionPack;
  packInput: ScaffoldExtensionPackInput;
  runtime: ScaffoldRuntimeComposition;
  runtimeBlocks: ScaffoldRuntimeBlockComposition;
  runtimeLayouts: ScaffoldRuntimeLayoutComposition;
};

describe("@scaffold/core/extensions", () => {
  it("publishes only the supported composition factories and editor accessor", () => {
    expect(Object.keys(extensions).sort()).toEqual([
      "createScaffoldApplication",
      "createScaffoldCapabilitiesStorageExtension",
      "defineBlock",
      "defineScaffoldExtensionPack",
      "getScaffoldCapabilitiesForEditor",
    ]);
  });

  it("publishes only the complete Block and Layout composition contracts", () => {
    expectTypeOf<ExtensionTypeSurface>().toBeObject();
    expectTypeOf<keyof ScaffoldExtensionPackInput>().toEqualTypeOf<"blocks" | "id" | "layouts">();
    expectTypeOf<keyof ScaffoldExtensionPack>().toEqualTypeOf<"blocks" | "id" | "layouts">();
    expectTypeOf<keyof ScaffoldApplication>().toEqualTypeOf<
      "capabilities" | "authoring" | "runtime"
    >();
    expectTypeOf<keyof ResolvedScaffoldCapabilities>().toEqualTypeOf<"blocks" | "layouts">();
    expectTypeOf<keyof ResolvedBlockCapabilities>().toEqualTypeOf<"registry">();
    expectTypeOf<keyof ResolvedLayoutCapabilities>().toEqualTypeOf<"registry">();
    expectTypeOf<keyof ScaffoldAuthoringComposition>().toEqualTypeOf<
      "blocks" | "capabilities" | "layouts"
    >();
    expectTypeOf<keyof ScaffoldAuthoringBlockComposition>().toEqualTypeOf<"extensions">();
    expectTypeOf<keyof ScaffoldAuthoringLayoutComposition>().toEqualTypeOf<"views">();
    expectTypeOf<keyof ScaffoldRuntimeComposition>().toEqualTypeOf<
      "blocks" | "capabilities" | "layouts"
    >();
    expectTypeOf<keyof ScaffoldRuntimeBlockComposition>().toEqualTypeOf<"extensions">();
    expectTypeOf<keyof ScaffoldRuntimeLayoutComposition>().toEqualTypeOf<"views">();
    expectTypeOf<keyof ScaffoldCapabilitiesStorage>().toEqualTypeOf<"capabilities">();
  });
});

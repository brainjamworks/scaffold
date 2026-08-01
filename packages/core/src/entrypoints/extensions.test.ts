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
  ResolvedSurfaceCapabilities,
  ScaffoldApplication,
  ScaffoldAuthoringBlockComposition,
  ScaffoldAuthoringComposition,
  ScaffoldAuthoringLayoutComposition,
  ScaffoldAuthoringSurfaceComposition,
  ScaffoldCapabilitiesStorage,
  ScaffoldExtensionPack,
  ScaffoldExtensionPackInput,
  ScaffoldRuntimeBlockComposition,
  ScaffoldRuntimeComposition,
  ScaffoldRuntimeLayoutComposition,
  ScaffoldRuntimeSurfaceComposition,
  SurfaceAuthoringViewBinding,
  SurfaceAuthoringViewProps,
  SurfaceCapability,
  SurfaceRuntimeViewBinding,
  SurfaceRuntimeViewProps,
  SurfaceVariantDefinition,
} from "@scaffold/core/extensions";

type ExtensionTypeSurface = {
  blockDefinitionInput: BlockDefinitionInput;
  blockDefinition: BlockDefinition;
  blockCapability: BlockCapability;
  layoutCapability: LayoutCapability;
  surfaceCapability: SurfaceCapability;
  surfaceDefinition: SurfaceVariantDefinition;
  surfaceAuthoringViewBinding: SurfaceAuthoringViewBinding;
  surfaceAuthoringViewProps: SurfaceAuthoringViewProps;
  surfaceRuntimeViewBinding: SurfaceRuntimeViewBinding;
  surfaceRuntimeViewProps: SurfaceRuntimeViewProps;
  resolvedBlocks: ResolvedBlockCapabilities;
  resolvedLayouts: ResolvedLayoutCapabilities;
  resolvedSurfaces: ResolvedSurfaceCapabilities;
  resolvedCapabilities: ResolvedScaffoldCapabilities;
  application: ScaffoldApplication;
  authoring: ScaffoldAuthoringComposition;
  authoringBlocks: ScaffoldAuthoringBlockComposition;
  authoringLayouts: ScaffoldAuthoringLayoutComposition;
  authoringSurfaces: ScaffoldAuthoringSurfaceComposition;
  capabilitiesStorage: ScaffoldCapabilitiesStorage;
  pack: ScaffoldExtensionPack;
  packInput: ScaffoldExtensionPackInput;
  runtime: ScaffoldRuntimeComposition;
  runtimeBlocks: ScaffoldRuntimeBlockComposition;
  runtimeLayouts: ScaffoldRuntimeLayoutComposition;
  runtimeSurfaces: ScaffoldRuntimeSurfaceComposition;
};

type SurfaceDefinitionRequiredExtensionMembers = Pick<
  SurfaceVariantDefinition,
  "createSurface" | "description" | "id" | "modes" | "title"
>;
type SurfaceAuthoringRequiredExtensionProps = Pick<
  SurfaceAuthoringViewProps,
  "authoringView" | "definition" | "isEmpty" | "variant"
>;
type SurfaceRuntimeRequiredExtensionProps = Pick<
  SurfaceRuntimeViewProps,
  "definition" | "isEmpty" | "runtimeView" | "variant"
>;

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

  it("publishes only the complete Block, Layout, and Surface composition contracts", () => {
    expectTypeOf<ExtensionTypeSurface>().toBeObject();
    expectTypeOf<keyof ScaffoldExtensionPackInput>().toEqualTypeOf<
      "blocks" | "id" | "layouts" | "surfaces"
    >();
    expectTypeOf<keyof ScaffoldExtensionPack>().toEqualTypeOf<
      "blocks" | "id" | "layouts" | "surfaces"
    >();
    expectTypeOf<keyof ScaffoldApplication>().toEqualTypeOf<
      "capabilities" | "authoring" | "runtime"
    >();
    expectTypeOf<keyof ResolvedScaffoldCapabilities>().toEqualTypeOf<
      "blocks" | "layouts" | "surfaces"
    >();
    expectTypeOf<keyof ResolvedBlockCapabilities>().toEqualTypeOf<"registry">();
    expectTypeOf<keyof ResolvedLayoutCapabilities>().toEqualTypeOf<"registry">();
    expectTypeOf<keyof ResolvedSurfaceCapabilities>().toEqualTypeOf<"registry">();
    expectTypeOf<keyof ScaffoldAuthoringComposition>().toEqualTypeOf<
      "blocks" | "capabilities" | "layouts" | "surfaces"
    >();
    expectTypeOf<keyof ScaffoldAuthoringBlockComposition>().toEqualTypeOf<"extensions">();
    expectTypeOf<keyof ScaffoldAuthoringLayoutComposition>().toEqualTypeOf<"views">();
    expectTypeOf<keyof ScaffoldAuthoringSurfaceComposition>().toEqualTypeOf<
      "chrome" | "views"
    >();
    expectTypeOf<keyof ScaffoldRuntimeComposition>().toEqualTypeOf<
      "blocks" | "capabilities" | "layouts" | "surfaces"
    >();
    expectTypeOf<keyof ScaffoldRuntimeBlockComposition>().toEqualTypeOf<"extensions">();
    expectTypeOf<keyof ScaffoldRuntimeLayoutComposition>().toEqualTypeOf<"views">();
    expectTypeOf<keyof ScaffoldRuntimeSurfaceComposition>().toEqualTypeOf<"views">();
    expectTypeOf<keyof SurfaceCapability>().toEqualTypeOf<
      "authoringView" | "definition" | "runtimeView"
    >();
    expectTypeOf<keyof SurfaceAuthoringViewBinding>().toEqualTypeOf<
      "component" | "configuration" | "variantId"
    >();
    expectTypeOf<keyof SurfaceRuntimeViewBinding>().toEqualTypeOf<"component" | "variantId">();
    expectTypeOf<keyof SurfaceDefinitionRequiredExtensionMembers>().toEqualTypeOf<
      "createSurface" | "description" | "id" | "modes" | "title"
    >();
    expectTypeOf<keyof SurfaceAuthoringRequiredExtensionProps>().toEqualTypeOf<
      "authoringView" | "definition" | "isEmpty" | "variant"
    >();
    expectTypeOf<keyof SurfaceRuntimeRequiredExtensionProps>().toEqualTypeOf<
      "definition" | "isEmpty" | "runtimeView" | "variant"
    >();
    expectTypeOf<keyof ScaffoldCapabilitiesStorage>().toEqualTypeOf<"capabilities">();
  });
});

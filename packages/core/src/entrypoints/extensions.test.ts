import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import * as extensions from "@scaffold/core/extensions";
import type { BlockInsertVariantDefinition as CoreBlockInsertVariantDefinition } from "../editor/blocks/block-definition";
import type { ScaffoldAuthoringCatalogues as CoreScaffoldAuthoringCatalogues } from "../composition/extensions/scaffold-authoring-catalogues-storage";
import type {
  BlockLearningEventInput,
  BlockInsertVariantDefinition as ExtensionBlockInsertVariantDefinition,
  ScaffoldAuthoringCatalogues as ExtensionScaffoldAuthoringCatalogues,
} from "@scaffold/core/extensions";
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
  LearningEventReporter,
} from "@scaffold/core/extensions";
// @ts-expect-error Raw event drafts are not available to host blocks.
import type { LearningEventDraft } from "@scaffold/core/extensions";
// @ts-expect-error Core-only catalogue inputs are not available to host blocks.
import type { CoreLearningEventInput } from "@scaffold/core/extensions";
// @ts-expect-error Host blocks cannot access the underlying session.
import type { LearningEventSession } from "@scaffold/core/extensions";

type ExtensionTypeSurface = {
  coreInputViolation: CoreLearningEventInput;
  draftViolation: LearningEventDraft;
  authoringCatalogues: ExtensionScaffoldAuthoringCatalogues;
  blockDefinitionInput: BlockDefinitionInput;
  blockDefinition: BlockDefinition;
  blockInsertVariant: ExtensionBlockInsertVariantDefinition;
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
  learningEventInput: BlockLearningEventInput;
  learningEventReporter: LearningEventReporter;
  sessionViolation: LearningEventSession;
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
      "getScaffoldAuthoringCataloguesForEditor",
      "getScaffoldCapabilitiesForEditor",
      "useLearningEventReporter",
    ]);
  });

  it("publishes only the complete Block, Layout, and Surface composition contracts", () => {
    expectTypeOf<ExtensionTypeSurface>().toBeObject();
    expectTypeOf<CoreBlockInsertVariantDefinition>().toEqualTypeOf<ExtensionBlockInsertVariantDefinition>();
    expectTypeOf<CoreScaffoldAuthoringCatalogues>().toEqualTypeOf<ExtensionScaffoldAuthoringCatalogues>();
    expectTypeOf<keyof ScaffoldExtensionPackInput>().toEqualTypeOf<
      "blocks" | "id" | "layouts" | "surfaces"
    >();
    expectTypeOf<keyof ScaffoldExtensionPack>().toEqualTypeOf<
      "blocks" | "id" | "layouts" | "surfaces"
    >();
    expectTypeOf<keyof ScaffoldApplication>().toEqualTypeOf<
      "capabilities" | "courseStructure" | "authoring" | "runtime"
    >();
    expectTypeOf<keyof ResolvedScaffoldCapabilities>().toEqualTypeOf<
      "blocks" | "layouts" | "surfaces"
    >();
    expectTypeOf<keyof ResolvedBlockCapabilities>().toEqualTypeOf<"registry">();
    expectTypeOf<keyof ResolvedLayoutCapabilities>().toEqualTypeOf<"registry">();
    expectTypeOf<keyof ResolvedSurfaceCapabilities>().toEqualTypeOf<"registry">();
    expectTypeOf<keyof ScaffoldAuthoringComposition>().toEqualTypeOf<
      "blocks" | "capabilities" | "catalogues" | "courseStructure" | "layouts" | "surfaces"
    >();
    expectTypeOf<keyof ScaffoldAuthoringBlockComposition>().toEqualTypeOf<"extensions">();
    expectTypeOf<keyof ScaffoldAuthoringLayoutComposition>().toEqualTypeOf<"views">();
    expectTypeOf<keyof ScaffoldAuthoringSurfaceComposition>().toEqualTypeOf<"chrome" | "views">();
    expectTypeOf<keyof ScaffoldRuntimeComposition>().toEqualTypeOf<
      "blocks" | "capabilities" | "courseStructure" | "layouts" | "surfaces"
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

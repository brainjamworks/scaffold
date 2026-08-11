import type { Schema } from "@tiptap/pm/model";

import type { ScaffoldProductAccess } from "@/host/contracts/product-access";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";

export interface DocumentCapabilityLookups {
  readonly blocks: BlockDefinitionLookup;
  readonly layouts: Pick<LayoutRegistry, "getById">;
  readonly surfaces: SurfaceVariantLookup;
}

export interface EstablishAuthoringDocumentInput {
  readonly canonicalDocument: unknown;
  readonly capabilities: DocumentCapabilityLookups;
  readonly authoringSchema: Schema;
  readonly productAccess: ScaffoldProductAccess;
}

export interface CanonicalizeAuthoringDocumentInput {
  readonly workingDocument: unknown;
  readonly capabilities: DocumentCapabilityLookups;
  readonly authoringSchema: Schema;
  readonly expectedRequiresScaffoldPlus: boolean;
  readonly productAccess: ScaffoldProductAccess;
}

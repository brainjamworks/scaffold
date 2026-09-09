import type { JSONContent } from "@tiptap/core";

import type {
  LayerContextDiagnostic,
  LayerIdentityDiagnostic,
} from "@/document/model/layers/layer-diagnostics";
import type { RequiresScaffoldPlusResult } from "@/host/contracts/product-access";

export type UnavailableCapabilityKind = "block" | "layout" | "surface";

export interface EstablishedDocumentFormat {
  readonly fromVersion: number;
  readonly currentVersion: number;
  readonly migrated: boolean;
}

export interface UnavailableContentRef {
  readonly kind: UnavailableCapabilityKind;
  readonly capabilityId: string;
  readonly stableId: string;
  readonly path: readonly (string | number)[];
}

export interface GenericDocumentEstablishmentIssue {
  readonly kind?: never;
  readonly code: string;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

type LayerIdentityEstablishmentIssue = {
  [Reason in LayerIdentityDiagnostic["reason"]]: {
    readonly kind: "layer-identity";
    readonly code: Reason;
    readonly message: string;
    readonly path: readonly (string | number)[];
    readonly diagnostic: Extract<LayerIdentityDiagnostic, { readonly reason: Reason }>;
  };
}[LayerIdentityDiagnostic["reason"]];

type LayerContextEstablishmentIssue = {
  [Reason in LayerContextDiagnostic["reason"]]: {
    readonly kind: "layer-context";
    readonly code: Reason;
    readonly message: string;
    readonly path: readonly (string | number)[];
    readonly diagnostic: Extract<LayerContextDiagnostic, { readonly reason: Reason }>;
  };
}[LayerContextDiagnostic["reason"]];

export type DocumentEstablishmentIssue =
  | GenericDocumentEstablishmentIssue
  | LayerIdentityEstablishmentIssue
  | LayerContextEstablishmentIssue;

export type AuthoringDocumentEstablishmentResult =
  | {
      readonly status: "supported";
      readonly workingDocument: JSONContent;
      readonly format: EstablishedDocumentFormat;
      readonly unavailableContent: readonly [];
      readonly requiresScaffoldPlus: boolean;
    }
  | {
      readonly status: "unavailable";
      readonly workingDocument: JSONContent;
      readonly format: EstablishedDocumentFormat;
      readonly unavailableContent: readonly UnavailableContentRef[];
      readonly requiresScaffoldPlus: boolean;
    }
  | {
      readonly status: "invalid";
      readonly issues: readonly DocumentEstablishmentIssue[];
    }
  | {
      readonly status: "unsupported-core-format";
      readonly documentVersion: number;
      readonly supportedVersion: number;
      readonly message: string;
    }
  | RequiresScaffoldPlusResult;

export type AuthoringDocumentCanonicalizationResult =
  | {
      readonly status: "ready";
      readonly canonicalDocument: JSONContent;
      readonly unavailableContent: readonly UnavailableContentRef[];
    }
  | {
      readonly status: "invalid";
      readonly issues: readonly DocumentEstablishmentIssue[];
    }
  | {
      readonly status: "unsupported-core-format";
      readonly documentVersion: number;
      readonly supportedVersion: number;
      readonly message: string;
    }
  | RequiresScaffoldPlusResult;

export type LearnerProjectionReadinessResult =
  | {
      readonly status: "supported";
      readonly canonicalDocument: JSONContent;
    }
  | {
      readonly status: "unavailable-content";
      readonly unavailableContent: readonly UnavailableContentRef[];
    }
  | {
      readonly status: "invalid";
      readonly issues: readonly DocumentEstablishmentIssue[];
    }
  | {
      readonly status: "unsupported-core-format";
      readonly documentVersion: number;
      readonly supportedVersion: number;
      readonly message: string;
    }
  | RequiresScaffoldPlusResult;

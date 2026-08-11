import type { JSONContent } from "@tiptap/core";

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

export interface DocumentEstablishmentIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly (string | number)[];
}

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

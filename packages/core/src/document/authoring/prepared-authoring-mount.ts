import type { JSONContent } from "@tiptap/core";

import type { ScaffoldProductAccess } from "@/host/contracts/product-access";
import {
  getCourseDocumentAuthoringEnvironmentState,
  type CourseDocumentAuthoringEnvironment,
} from "@/composition/authoring/create-authoring-composition";
import {
  establishAuthoringDocument,
  type AuthoringDocumentEstablishmentResult,
  type EstablishedDocumentFormat,
  type UnavailableContentRef,
} from "@/document/model/establishment";

const courseDocumentAuthoringMountBrand: unique symbol = Symbol("CourseDocumentAuthoringMount");

export interface CourseDocumentAuthoringMount {
  readonly [courseDocumentAuthoringMountBrand]: true;
}

export interface CourseDocumentAuthoringMountState {
  readonly environment: CourseDocumentAuthoringEnvironment;
  readonly expectedRequiresScaffoldPlus: boolean;
  readonly productAccess: ScaffoldProductAccess;
  readonly unavailableContent: readonly UnavailableContentRef[];
  readonly workingDocument: JSONContent;
}

const mountStates = new WeakMap<CourseDocumentAuthoringMount, CourseDocumentAuthoringMountState>();

function createCourseDocumentAuthoringMount(
  state: CourseDocumentAuthoringMountState,
): CourseDocumentAuthoringMount {
  const mount = Object.freeze({}) as CourseDocumentAuthoringMount;
  mountStates.set(mount, Object.freeze({ ...state }));
  return mount;
}

export type PreparedCourseDocumentAuthoringMount =
  | {
      readonly status: "supported" | "unavailable";
      readonly mount: CourseDocumentAuthoringMount;
      readonly format: EstablishedDocumentFormat;
      readonly unavailableContent: readonly UnavailableContentRef[];
    }
  | Extract<
      AuthoringDocumentEstablishmentResult,
      { readonly status: "invalid" | "requires-scaffold-plus" | "unsupported-core-format" }
    >;

export function prepareCourseDocumentAuthoringMount(
  canonicalDocument: unknown,
  environment: CourseDocumentAuthoringEnvironment,
  productAccess: ScaffoldProductAccess,
): PreparedCourseDocumentAuthoringMount {
  const environmentState = getCourseDocumentAuthoringEnvironmentState(environment);
  const capturedProductAccess = Object.freeze({
    scaffoldPlusAuthorized: productAccess.scaffoldPlusAuthorized,
  });
  const establishment = establishAuthoringDocument({
    canonicalDocument,
    capabilities: environmentState.capabilities,
    authoringSchema: environmentState.schema,
    productAccess: capturedProductAccess,
  });
  if (
    establishment.status === "invalid" ||
    establishment.status === "requires-scaffold-plus" ||
    establishment.status === "unsupported-core-format"
  ) {
    return establishment;
  }
  return {
    status: establishment.status,
    mount: createCourseDocumentAuthoringMount({
      environment,
      expectedRequiresScaffoldPlus: establishment.requiresScaffoldPlus,
      productAccess: capturedProductAccess,
      unavailableContent: establishment.unavailableContent,
      workingDocument: establishment.workingDocument,
    }),
    format: establishment.format,
    unavailableContent: establishment.unavailableContent,
  };
}

export function getCourseDocumentAuthoringMountState(
  mount: CourseDocumentAuthoringMount,
): CourseDocumentAuthoringMountState {
  const state = mountStates.get(mount);
  if (!state) throw new Error("Course Document authoring mount was not prepared by Core.");
  return state;
}

export { canonicalizeAuthoringDocument } from "./canonicalize-authoring-document";
export type {
  CanonicalizeAuthoringDocumentInput,
  DocumentCapabilityLookups,
  EstablishAuthoringDocumentInput,
} from "./document-capability-lookups";
export { establishDocumentFormat, type DocumentFormatEstablishmentResult } from "./document-format";
export { establishAuthoringDocument } from "./establish-authoring-document";
export { checkLearnerProjectionReadiness } from "./learner-projection-readiness";
export { assertMountedNodeIdentitySchema } from "./mounted-node-identity";
export type {
  AuthoringDocumentCanonicalizationResult,
  AuthoringDocumentEstablishmentResult,
  DocumentEstablishmentIssue,
  EstablishedDocumentFormat,
  LearnerProjectionReadinessResult,
  UnavailableCapabilityKind,
  UnavailableContentRef,
} from "./document-establishment";

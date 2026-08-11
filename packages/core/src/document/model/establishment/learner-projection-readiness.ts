import type { CanonicalizeAuthoringDocumentInput } from "./document-capability-lookups";
import type { LearnerProjectionReadinessResult } from "./document-establishment";
import { canonicalizeAuthoringDocument } from "./canonicalize-authoring-document";

export function checkLearnerProjectionReadiness(
  input: CanonicalizeAuthoringDocumentInput,
): LearnerProjectionReadinessResult {
  const canonicalized = canonicalizeAuthoringDocument(input);
  if (
    canonicalized.status === "invalid" ||
    canonicalized.status === "requires-scaffold-plus" ||
    canonicalized.status === "unsupported-core-format"
  ) {
    return canonicalized;
  }
  if (canonicalized.unavailableContent.length > 0) {
    return {
      status: "unavailable-content",
      unavailableContent: canonicalized.unavailableContent,
    };
  }
  return { status: "supported", canonicalDocument: canonicalized.canonicalDocument };
}

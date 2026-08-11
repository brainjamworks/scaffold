import json

from ..payload import validate_save_payload_size
from ..state import assessment_bundle_from_json
from .content_save import course_document_mode
from .course_requirement import classify_artifact_access


class PublicationValidationError(ValueError):
    pass


def validate_publication_payload(data, canonical_artifact, artifact_id, supported_modes):
    if not isinstance(data, dict) or set(data) != {
        "sourceArtifactRevision",
        "artifact",
        "learnerContent",
        "assessmentTargets",
        "assessmentGroups",
    }:
        raise PublicationValidationError("publication payload has invalid fields")

    source_revision = data["sourceArtifactRevision"]
    if not isinstance(source_revision, str) or not source_revision:
        raise PublicationValidationError("publication source revision is required")
    metadata = data["artifact"]
    if not isinstance(metadata, dict) or set(metadata) != {
        "id",
        "title",
        "mode",
        "requiresScaffoldPlus",
    }:
        raise PublicationValidationError("publication artifact metadata is invalid")
    if (
        metadata["id"] != artifact_id
        or metadata["id"] != canonical_artifact.get("id")
        or metadata["title"] != canonical_artifact.get("title")
        or metadata["mode"] != canonical_artifact.get("mode")
        or metadata["mode"] not in supported_modes
        or not isinstance(metadata["requiresScaffoldPlus"], bool)
    ):
        raise PublicationValidationError(
            "publication artifact metadata does not match saved canonical artifact",
        )

    canonical_requirement = _course_document_requirement(canonical_artifact.get("content"))
    learner_content = data["learnerContent"]
    learner_requirement = _course_document_requirement(learner_content)
    if canonical_requirement is None or canonical_requirement != metadata["requiresScaffoldPlus"]:
        raise PublicationValidationError(
            "publication product requirement does not match saved canonical artifact",
        )
    if learner_requirement != metadata["requiresScaffoldPlus"]:
        raise PublicationValidationError(
            "publication product requirement does not match learner content",
        )
    if course_document_mode(learner_content) != metadata["mode"]:
        raise PublicationValidationError(
            "publication mode does not match learner content",
        )
    learner_access = classify_artifact_access(
        {
            "id": metadata["id"],
            "title": metadata["title"],
            "mode": metadata["mode"],
            "content": learner_content,
        },
    )
    if learner_access["status"] == "requires-scaffold-plus":
        raise PublicationValidationError("published content requires Scaffold Plus")
    if learner_access["status"] != "supported":
        raise PublicationValidationError("published learner content is not supported")

    for name in ("learnerContent", "assessmentTargets", "assessmentGroups"):
        try:
            validate_save_payload_size(name, data[name])
        except (KeyError, ValueError) as exc:
            raise PublicationValidationError(str(exc)) from exc
    try:
        assessment_bundle = assessment_bundle_from_json(
            json.dumps(data["assessmentTargets"]),
            json.dumps(data["assessmentGroups"]),
        )
    except ValueError as exc:
        raise PublicationValidationError(str(exc)) from exc

    return {
        "source_artifact_revision": source_revision,
        "artifact": metadata,
        "learner_content": learner_content,
        **assessment_bundle,
    }


def _course_document_requirement(content):
    if not isinstance(content, dict):
        return None
    children = content.get("content")
    if not isinstance(children, list) or not children:
        return None
    attrs = children[0].get("attrs") if isinstance(children[0], dict) else None
    requirement = attrs.get("requiresScaffoldPlus") if isinstance(attrs, dict) else None
    return requirement if isinstance(requirement, bool) else None

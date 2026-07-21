from ..payload import validate_save_payload_size
from .assessment_groups import (
    AssessmentGroupValidationError,
    validate_assessment_groups,
)
from .assessment_targets import (
    AssessmentTargetValidationError,
    validate_assessment_targets,
)


class ContentSaveValidationError(ValueError):
    pass


def validate_content_save_bundle(data, artifact_id, supported_modes):
    artifact = data.get("artifact") if isinstance(data, dict) else None
    if not isinstance(artifact, dict):
        raise ContentSaveValidationError("artifact must be a JSON object")

    if artifact.get("id") != artifact_id:
        raise ContentSaveValidationError("artifact.id does not match activity")

    title = artifact.get("title")
    if not isinstance(title, str) or not title.strip():
        raise ContentSaveValidationError("artifact.title is required")

    mode = artifact.get("mode")
    if mode not in supported_modes:
        raise ContentSaveValidationError("artifact.mode is invalid")

    content = artifact.get("content")
    if not isinstance(content, dict):
        raise ContentSaveValidationError("artifact.content must be a JSON object")
    if course_document_mode(content) != mode:
        raise ContentSaveValidationError(
            "artifact.mode must match artifact.content courseDocument mode",
        )
    _validate_payload_size("artifact", artifact)

    learner_content = data.get("learnerContent") if isinstance(data, dict) else None
    if not isinstance(learner_content, dict):
        raise ContentSaveValidationError("learnerContent must be a JSON object")
    if course_document_mode(learner_content) != mode:
        raise ContentSaveValidationError(
            "learnerContent must be a Scaffold document matching artifact.mode",
        )
    _validate_payload_size("learnerContent", learner_content)

    assessment_targets = (
        data.get("assessmentTargets") if isinstance(data, dict) else None
    )
    if not isinstance(assessment_targets, list):
        raise ContentSaveValidationError("assessmentTargets must be a JSON array")

    assessment_groups = (
        data.get("assessmentGroups") if isinstance(data, dict) else None
    )
    if not isinstance(assessment_groups, list):
        raise ContentSaveValidationError("assessmentGroups must be a JSON array")

    _validate_payload_size("assessmentTargets", assessment_targets)
    _validate_payload_size("assessmentGroups", assessment_groups)
    try:
        assessment_targets = validate_assessment_targets(assessment_targets)
        assessment_groups = validate_assessment_groups(
            assessment_groups,
            assessment_targets,
        )
    except (AssessmentTargetValidationError, AssessmentGroupValidationError) as exc:
        raise ContentSaveValidationError(str(exc)) from exc

    return {
        "artifact": artifact,
        "learner_content": learner_content,
        "assessment_targets": assessment_targets,
        "assessment_groups": assessment_groups,
        "title": title.strip(),
    }


def course_document_mode(content):
    if not isinstance(content, dict):
        return None

    children = content.get("content")
    if not isinstance(children, list) or not children:
        return None

    course_document = children[0]
    if not isinstance(course_document, dict):
        return None
    if course_document.get("type") != "courseDocument":
        return None

    attrs = course_document.get("attrs")
    if not isinstance(attrs, dict):
        return None

    mode = attrs.get("mode")
    return mode if isinstance(mode, str) else None


def _validate_payload_size(name, value):
    try:
        validate_save_payload_size(name, value)
    except ValueError as exc:
        raise ContentSaveValidationError(str(exc)) from exc

from ..payload import validate_save_payload_size
from .course_requirement import classify_artifact_access


class ContentSaveValidationError(ValueError):
    pass


def validate_artifact_save(data, artifact_id, supported_modes):
    if not isinstance(data, dict) or set(data) != {"artifact"}:
        raise ContentSaveValidationError("save payload must contain only artifact")

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
    artifact_access = classify_artifact_access(artifact)
    if artifact_access["status"] == "requires-scaffold-plus":
        raise ContentSaveValidationError("artifact.content requires Scaffold Plus")
    if artifact_access["status"] != "supported":
        raise ContentSaveValidationError("artifact.content format is not supported")
    _validate_payload_size("artifact", artifact)

    return {
        "artifact": artifact,
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

from datetime import datetime, timezone

from .validation.json_schema import JsonSchemaValidationError
from .validation.learner_activity import validate_learner_activity_definition


class LearnerActivityOperationValidationError(ValueError):
    pass


def load_learner_activity_snapshot(snapshot, data, artifact_id):
    _validate_snapshot(snapshot, artifact_id)
    if not isinstance(data, dict) or set(data) != {"artifactId"}:
        raise LearnerActivityOperationValidationError(
            "learner activity load request must contain only artifactId",
        )
    if data["artifactId"] != artifact_id:
        raise LearnerActivityOperationValidationError(
            "artifactId does not match XBlock artifact",
        )
    return snapshot


def save_learner_activity_snapshot(
    snapshot,
    data,
    artifact_id,
    authorized_block_ids,
    clock=None,
):
    _validate_snapshot(snapshot, artifact_id)
    if not isinstance(data, dict) or set(data) != {
        "artifactId",
        "blockId",
        "record",
    }:
        raise LearnerActivityOperationValidationError(
            "learner activity save request has an invalid shape",
        )
    if data["artifactId"] != artifact_id:
        raise LearnerActivityOperationValidationError(
            "artifactId does not match XBlock artifact",
        )

    block_id = data["blockId"]
    if not isinstance(block_id, str) or not block_id.strip():
        raise LearnerActivityOperationValidationError(
            "blockId must be a non-blank string",
        )
    if block_id not in set(authorized_block_ids):
        raise LearnerActivityOperationValidationError(
            "blockId is not authorized for this artifact",
        )

    requested_record = data["record"]
    if not isinstance(requested_record, dict) or set(requested_record) != {
        "activityKind",
        "data",
        "completed",
    }:
        raise LearnerActivityOperationValidationError(
            "learner activity save record has an invalid shape",
        )

    authoritative_now = (clock or (lambda: datetime.now(timezone.utc)))()
    authoritative_record = {
        **requested_record,
        "updatedAt": authoritative_now.astimezone(timezone.utc).isoformat(),
    }
    _validate_record(authoritative_record)

    updated_snapshot = {
        **snapshot,
        "activities": {
            **snapshot["activities"],
            block_id: authoritative_record,
        },
    }
    _validate_snapshot(updated_snapshot, artifact_id)
    return authoritative_record, updated_snapshot


def _validate_snapshot(snapshot, artifact_id):
    try:
        validate_learner_activity_definition(
            "LearnerActivitySnapshot",
            snapshot,
            "learnerActivitySnapshot",
        )
    except JsonSchemaValidationError as exc:
        raise LearnerActivityOperationValidationError(str(exc)) from exc

    if snapshot["artifactId"] != artifact_id:
        raise LearnerActivityOperationValidationError(
            "learnerActivitySnapshot.artifactId does not match XBlock artifact",
        )


def _validate_record(record):
    try:
        validate_learner_activity_definition(
            "LearnerActivityRecord",
            record,
            "learnerActivityRecord",
        )
    except JsonSchemaValidationError as exc:
        raise LearnerActivityOperationValidationError(str(exc)) from exc

import json
from datetime import datetime, timedelta, timezone

from .validation.assessment_groups import (
    AssessmentGroupValidationError,
    validate_assessment_groups,
)
from .validation.assessment_targets import (
    AssessmentTargetValidationError,
    validate_assessment_targets,
)
from .validation.json_schema import (
    JsonSchemaValidationError,
    validate_assessment_definition,
)
from .validation.learner_activity import validate_learner_activity_definition


class AssessmentStorageValidationError(ValueError):
    pass


class LearnerActivityStorageValidationError(ValueError):
    pass


ASSESSMENT_GRADE_DELIVERY_KEYS = {
    "projection",
    "deliveryStatus",
    "attemptCount",
    "lastAttemptedAt",
    "deliveredAt",
    "error",
}


def next_assessment_grade_changed_at(previous_changed_at, now=None):
    candidate = now or datetime.now(timezone.utc)
    if candidate.tzinfo is None:
        raise AssessmentStorageValidationError(
            "assessment grade change time must include a timezone",
        )
    candidate = candidate.astimezone(timezone.utc)

    if previous_changed_at:
        try:
            previous = datetime.fromisoformat(
                previous_changed_at.replace("Z", "+00:00"),
            ).astimezone(timezone.utc)
        except (AttributeError, TypeError, ValueError) as exc:
            raise AssessmentStorageValidationError(
                "stored assessment grade change time is invalid",
            ) from exc
        if candidate <= previous:
            candidate = previous + timedelta(microseconds=1)

    return candidate.isoformat(timespec="microseconds").replace("+00:00", "Z")


def assessment_grade_delivery_from_json(raw):
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        delivery = json.loads(raw)
    except (TypeError, ValueError) as exc:
        raise AssessmentStorageValidationError(
            "assessmentGradeDelivery must contain valid JSON",
        ) from exc

    return _validate_assessment_grade_delivery(delivery)


def serialize_assessment_grade_delivery(delivery):
    return json.dumps(_validate_assessment_grade_delivery(delivery))


def assessment_grade_changed_at_is_newer(candidate, current):
    candidate_time = _parse_delivery_timestamp(
        candidate,
        "projection.changedAt",
    )
    current_time = _parse_delivery_timestamp(
        current, "stored projection.changedAt",
    )
    return candidate_time > current_time


def artifact_from_json(raw, artifact_id, title, default_mode):
    artifact = _parse_json_object(
        raw,
        {
            "id": artifact_id,
            "title": title,
            "mode": default_mode,
            "content": None,
        },
    )
    artifact["id"] = artifact_id
    artifact["title"] = title
    if "content" not in artifact:
        artifact["content"] = None
    return artifact


def learner_content_from_json(raw):
    return _parse_json_nullable_object(raw)


def assessment_bundle_from_json(targets_raw, groups_raw):
    assessment_targets = _parse_assessment_array(
        targets_raw,
        "assessmentTargets",
    )
    assessment_groups = _parse_assessment_array(
        groups_raw,
        "assessmentGroups",
    )

    try:
        assessment_targets = validate_assessment_targets(assessment_targets)
        assessment_groups = validate_assessment_groups(
            assessment_groups,
            assessment_targets,
        )
    except (AssessmentTargetValidationError, AssessmentGroupValidationError) as exc:
        raise AssessmentStorageValidationError(str(exc)) from exc

    return {
        "assessment_targets": assessment_targets,
        "assessment_groups": assessment_groups,
    }


def assessment_snapshot_from_json(raw, artifact_id):
    if not raw:
        snapshot = {
            "snapshotVersion": 1,
            "artifactId": artifact_id,
            "problems": {},
            "quizzes": {},
        }
    else:
        try:
            snapshot = json.loads(raw)
        except (TypeError, ValueError) as exc:
            raise AssessmentStorageValidationError(
                "assessmentSnapshot must contain valid JSON",
            ) from exc

    try:
        validate_assessment_definition(
            "AssessmentLearnerSnapshot",
            snapshot,
            "assessmentSnapshot",
        )
    except JsonSchemaValidationError as exc:
        raise AssessmentStorageValidationError(str(exc)) from exc

    if snapshot["artifactId"] != artifact_id:
        raise AssessmentStorageValidationError(
            "assessmentSnapshot.artifactId does not match XBlock artifact",
        )
    return snapshot


def serialize_assessment_snapshot(snapshot, artifact_id):
    validated = assessment_snapshot_from_json(json.dumps(snapshot), artifact_id)
    return json.dumps(validated)


def learner_activity_snapshot_from_json(raw, artifact_id):
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        snapshot = {
            "snapshotVersion": 1,
            "artifactId": artifact_id,
            "activities": {},
        }
    else:
        try:
            snapshot = json.loads(raw)
        except (TypeError, ValueError) as exc:
            raise LearnerActivityStorageValidationError(
                "learnerActivitySnapshot must contain valid JSON",
            ) from exc

    return _validate_learner_activity_snapshot(snapshot, artifact_id)


def serialize_learner_activity_snapshot(snapshot, artifact_id):
    validated = _validate_learner_activity_snapshot(snapshot, artifact_id)
    return json.dumps(validated)


def _validate_learner_activity_snapshot(snapshot, artifact_id):
    try:
        validate_learner_activity_definition(
            "LearnerActivitySnapshot",
            snapshot,
            "learnerActivitySnapshot",
        )
    except JsonSchemaValidationError as exc:
        raise LearnerActivityStorageValidationError(str(exc)) from exc

    if snapshot["artifactId"] != artifact_id:
        raise LearnerActivityStorageValidationError(
            "learnerActivitySnapshot.artifactId does not match XBlock artifact",
        )
    return snapshot


def _validate_assessment_grade_delivery(delivery):
    if not isinstance(delivery, dict) or set(delivery) != ASSESSMENT_GRADE_DELIVERY_KEYS:
        raise AssessmentStorageValidationError(
            "assessmentGradeDelivery has invalid fields",
        )

    projection = delivery["projection"]
    try:
        validate_assessment_definition(
            "AssessmentGradeProjection",
            projection,
            "assessmentGradeDelivery.projection",
        )
    except JsonSchemaValidationError as exc:
        raise AssessmentStorageValidationError(str(exc)) from exc

    status = delivery["deliveryStatus"]
    if status not in {"pending", "delivered", "failed"}:
        raise AssessmentStorageValidationError(
            "assessmentGradeDelivery.deliveryStatus is invalid",
        )
    attempt_count = delivery["attemptCount"]
    if type(attempt_count) is not int or attempt_count < 0:
        raise AssessmentStorageValidationError(
            "assessmentGradeDelivery.attemptCount must be a non-negative integer",
        )

    last_attempted_at = delivery["lastAttemptedAt"]
    if last_attempted_at is not None:
        _parse_delivery_timestamp(
            last_attempted_at,
            "assessmentGradeDelivery.lastAttemptedAt",
        )
    if (attempt_count == 0) != (last_attempted_at is None):
        raise AssessmentStorageValidationError(
            "assessmentGradeDelivery attempt metadata is inconsistent",
        )

    delivered_at = delivery["deliveredAt"]
    error = delivery["error"]
    if status == "delivered":
        if delivered_at is None or error is not None:
            raise AssessmentStorageValidationError(
                "delivered assessmentGradeDelivery metadata is invalid",
            )
        _parse_delivery_timestamp(
            delivered_at,
            "assessmentGradeDelivery.deliveredAt",
        )
    elif delivered_at is not None:
        raise AssessmentStorageValidationError(
            "undelivered assessmentGradeDelivery cannot have deliveredAt",
        )

    if status == "failed":
        if not isinstance(error, str) or not error:
            raise AssessmentStorageValidationError(
                "failed assessmentGradeDelivery requires an error",
            )
    elif error is not None:
        raise AssessmentStorageValidationError(
            "non-failed assessmentGradeDelivery cannot have an error",
        )

    return delivery


def _parse_delivery_timestamp(value, name):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError) as exc:
        raise AssessmentStorageValidationError("%s is invalid" % name) from exc
    if parsed.tzinfo is None:
        raise AssessmentStorageValidationError("%s must include a timezone" % name)
    return parsed.astimezone(timezone.utc)


def _parse_json_object(raw, fallback):
    if not raw:
        return fallback

    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return fallback

    return value if isinstance(value, dict) else fallback


def _parse_json_nullable_object(raw):
    if not raw:
        return None

    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return None

    return value if value is None or isinstance(value, dict) else None


def _parse_assessment_array(raw, name):
    try:
        value = json.loads(raw)
    except (TypeError, ValueError) as exc:
        raise AssessmentStorageValidationError(
            "%s must contain valid JSON" % name,
        ) from exc

    if not isinstance(value, list):
        raise AssessmentStorageValidationError(
            "%s must be a JSON array" % name,
        )
    return value

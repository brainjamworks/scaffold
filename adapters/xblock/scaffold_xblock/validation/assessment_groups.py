from .json_schema import JsonSchemaValidationError, validate_assessment_definition


class AssessmentGroupValidationError(ValueError):
    pass


def validate_assessment_groups(value, assessment_targets):
    if not isinstance(value, list):
        raise AssessmentGroupValidationError(
            "assessmentGroups must be a JSON array",
        )

    target_ids = {target["targetId"] for target in assessment_targets}
    seen_group_ids = set()
    groups = []
    for index, group in enumerate(value):
        group_path = "assessmentGroups[%d]" % index
        try:
            validate_assessment_definition(
                "AssessmentGroupContract",
                group,
                group_path,
            )
        except JsonSchemaValidationError as exc:
            raise AssessmentGroupValidationError(str(exc)) from exc

        group_id = group["groupId"]
        if group_id in seen_group_ids:
            raise AssessmentGroupValidationError(
                "%s.groupId must be unique" % group_path,
            )
        seen_group_ids.add(group_id)

        for target_index, target_id in enumerate(group["targetIds"]):
            if target_id not in target_ids:
                raise AssessmentGroupValidationError(
                    "%s.targetIds[%d] must reference an assessment target"
                    % (group_path, target_index),
                )
        groups.append(group)

    quiz_group_id_by_target_id(groups)
    return groups


def quiz_group_id_by_target_id(groups):
    ownership = {}
    for group in groups:
        if not isinstance(group, dict) or group.get("kind") != "quiz":
            continue

        group_id = group.get("groupId")
        target_ids = group.get("targetIds")
        if not isinstance(group_id, str) or not isinstance(target_ids, list):
            raise AssessmentGroupValidationError(
                "quiz target ownership cannot be determined",
            )

        for target_id in target_ids:
            existing_group_id = ownership.get(target_id)
            if existing_group_id is not None and existing_group_id != group_id:
                raise AssessmentGroupValidationError(
                    "assessment target %s belongs to multiple quiz groups" % target_id,
                )
            ownership[target_id] = group_id

    return ownership

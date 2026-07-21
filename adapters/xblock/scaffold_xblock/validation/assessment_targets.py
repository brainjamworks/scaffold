from .json_schema import JsonSchemaValidationError, validate_assessment_definition


class AssessmentTargetValidationError(ValueError):
    pass


def validate_assessment_targets(value):
    if not isinstance(value, list):
        raise AssessmentTargetValidationError(
            "assessmentTargets must be a JSON array",
        )

    seen_target_ids = set()
    targets = []
    for index, target in enumerate(value):
        target_path = "assessmentTargets[%d]" % index
        try:
            validate_assessment_definition(
                "AssessmentTargetContract",
                target,
                target_path,
            )
        except JsonSchemaValidationError as exc:
            raise AssessmentTargetValidationError(str(exc)) from exc

        target_id = target["targetId"]
        if target_id in seen_target_ids:
            raise AssessmentTargetValidationError(
                "%s.targetId must be unique" % target_path,
            )
        seen_target_ids.add(target_id)
        targets.append(target)

    return targets

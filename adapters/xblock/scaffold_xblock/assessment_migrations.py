from copy import deepcopy


def upgrade_assessment_bundle(assessment_targets, assessment_groups):
    """Upgrade one complete assessment-definition bundle to version 2."""
    if not isinstance(assessment_targets, list) or not isinstance(
        assessment_groups,
        list,
    ):
        raise ValueError("assessment definitions must be arrays")

    upgraded_targets = deepcopy(assessment_targets)
    upgraded_groups = deepcopy(assessment_groups)
    versions = set()

    for definition in upgraded_targets + upgraded_groups:
        if not isinstance(definition, dict):
            raise ValueError("assessment definitions must be objects")
        version = definition.get("schemaVersion")
        if type(version) is not int:
            raise ValueError("assessment definition version is invalid")
        versions.add(version)

    if len(versions) > 1:
        raise ValueError("assessment definition versions are mixed")
    if not versions:
        return {
            "assessment_targets": upgraded_targets,
            "assessment_groups": upgraded_groups,
        }

    version = next(iter(versions))
    if version not in {1, 2}:
        raise ValueError("assessment definition version is unsupported")
    if version == 2:
        return {
            "assessment_targets": upgraded_targets,
            "assessment_groups": upgraded_groups,
        }

    for group in upgraded_groups:
        settings = group.get("settings")
        if isinstance(settings, dict) and "passingScore" in settings:
            raise ValueError(
                "version 1 assessment group contains version 2 fields",
            )

    for target in upgraded_targets:
        target["schemaVersion"] = 2
    for group in upgraded_groups:
        group["schemaVersion"] = 2
        settings = group.get("settings")
        if group.get("kind") == "quiz" and isinstance(settings, dict):
            settings["passingScore"] = None

    return {
        "assessment_targets": upgraded_targets,
        "assessment_groups": upgraded_groups,
    }


def upgrade_assessment_snapshot(snapshot):
    """Upgrade one learner assessment snapshot to version 2."""
    if not isinstance(snapshot, dict):
        raise ValueError("assessment snapshot must be an object")

    upgraded = deepcopy(snapshot)
    version = upgraded.get("snapshotVersion")
    if type(version) is not int:
        raise ValueError("assessment snapshot version is invalid")
    if version not in {1, 2}:
        raise ValueError("assessment snapshot version is unsupported")
    if version == 2:
        return upgraded

    quizzes = upgraded.get("quizzes")
    if isinstance(quizzes, dict):
        for attempt in quizzes.values():
            if not isinstance(attempt, dict):
                continue
            if "successStatus" in attempt:
                raise ValueError(
                    "version 1 assessment snapshot contains version 2 fields",
                )
            attempt["successStatus"] = None

    upgraded["snapshotVersion"] = 2
    return upgraded

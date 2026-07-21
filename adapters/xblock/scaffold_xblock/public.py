from copy import deepcopy

from .assessment_projection import public_assessment_result
from .validation.assessment_groups import quiz_group_id_by_target_id


def public_standalone_problem(problem, target):
    public_problem = deepcopy(problem)
    settings = (
        target.get("settings")
        if isinstance(target.get("settings"), dict)
        else {}
    )
    include_authored_feedback = settings.get("showAnswer") is True
    for result_key in ("checkResult", "submissionResult"):
        result = public_problem.get(result_key)
        public_problem[result_key] = (
            public_assessment_result(result, include_authored_feedback)
            if isinstance(result, dict)
            else None
        )
    return public_problem


def public_assessment_snapshot(snapshot, assessment_targets, assessment_groups):
    from .quiz import (  # pylint: disable=import-outside-toplevel
        public_quiz_attempt,
        public_quiz_problems_by_target_id,
        quiz_settings,
    )

    problems = (
        snapshot.get("problems")
        if isinstance(snapshot.get("problems"), dict)
        else {}
    )
    quizzes = (
        snapshot.get("quizzes")
        if isinstance(snapshot.get("quizzes"), dict)
        else {}
    )
    ownership = quiz_group_id_by_target_id(assessment_groups)
    public_problems = {}
    public_quizzes = {}

    for target in assessment_targets:
        target_id = target.get("targetId") if isinstance(target, dict) else None
        if (
            not isinstance(target_id, str)
            or target_id in ownership
            or not isinstance(problems.get(target_id), dict)
        ):
            continue
        public_problems[target_id] = public_standalone_problem(
            problems[target_id],
            target,
        )

    for group in assessment_groups:
        if not isinstance(group, dict) or group.get("kind") != "quiz":
            continue
        group_id = group.get("groupId")
        attempt = quizzes.get(group_id) if isinstance(group_id, str) else None
        if not isinstance(attempt, dict):
            continue
        settings = quiz_settings(group)
        public_attempt = public_quiz_attempt(
            attempt,
            group_id,
            settings,
        )
        public_attempt.pop("groupId", None)
        public_quizzes[group_id] = public_attempt
        public_problems.update(
            public_quiz_problems_by_target_id(
                problems,
                group.get("targetIds", []),
                settings,
                attempt,
            ),
        )

    return {
        "snapshotVersion": snapshot.get("snapshotVersion"),
        "artifactId": snapshot.get("artifactId"),
        "problems": public_problems,
        "quizzes": public_quizzes,
    }

import math

from .validation.assessment_groups import quiz_group_id_by_target_id
from .validation.json_schema import validate_assessment_definition


def build_assessment_grade_projection(
    assessment_targets,
    assessment_groups,
    snapshot,
    changed_at,
):
    problems = snapshot.get("problems") if isinstance(snapshot, dict) else {}
    problems = problems if isinstance(problems, dict) else {}
    quizzes = snapshot.get("quizzes") if isinstance(snapshot, dict) else {}
    quizzes = quizzes if isinstance(quizzes, dict) else {}
    group_policy = _quiz_group_policy_by_target_id(assessment_groups)
    grouped_target_ids = set(group_policy)
    total_points = 0.0
    earned_points = 0.0
    has_numeric_result = _has_authoritative_quiz_result(
        assessment_groups,
        quizzes,
    )

    for target in assessment_targets:
        if not isinstance(target, dict):
            continue
        target_id = target.get("targetId")
        if not isinstance(target_id, str) or not target_id:
            continue
        if not _target_contributes_to_score(target, group_policy.get(target_id)):
            continue

        points = _target_score_points(target)
        total_points += points
        group_policy_for_target = group_policy.get(target_id)
        result = (
            _authoritative_quiz_result(
                quizzes,
                group_policy_for_target["group_id"],
                target_id,
            )
            if group_policy_for_target is not None
            else _authoritative_problem_result(problems.get(target_id))
        )
        if result is None:
            continue
        has_numeric_result = True
        earned_points += float(result["score"]) * points

    normalized_score = None
    if has_numeric_result and total_points > 0:
        normalized_score = earned_points / total_points

    has_persisted_activity = bool(problems or quizzes)
    standalone_is_terminal = all(
        target.get("targetId") in grouped_target_ids
        or _authoritative_problem_result(problems.get(target.get("targetId"))) is not None
        for target in assessment_targets
        if isinstance(target, dict)
    )
    quizzes_are_terminal = all(
        isinstance(quizzes.get(group.get("groupId")), dict)
        and quizzes[group["groupId"]].get("status") in {"completed", "expired"}
        for group in assessment_groups
        if isinstance(group, dict) and group.get("kind") == "quiz"
    )

    if not has_persisted_activity:
        activity_status = "not_started"
    elif standalone_is_terminal and quizzes_are_terminal:
        activity_status = "completed"
    else:
        activity_status = "in_progress"

    projection = {
        "normalizedScore": normalized_score,
        "activityStatus": activity_status,
        "gradingStatus": "graded" if normalized_score is not None else "not_ready",
        "changedAt": changed_at,
    }
    return validate_assessment_definition(
        "AssessmentGradeProjection",
        projection,
        "assessmentGradeProjection",
    )


def map_grade_projection_to_xblock_event(projection, weight):
    validate_assessment_definition(
        "AssessmentGradeProjection",
        projection,
        "assessmentGradeProjection",
    )
    if projection["normalizedScore"] is None:
        return None
    if (
        not isinstance(weight, (int, float))
        or isinstance(weight, bool)
        or not math.isfinite(weight)
        or weight <= 0
    ):
        raise ValueError("XBlock weight must be a positive finite number")
    return {
        "value": projection["normalizedScore"] * weight,
        "max_value": weight,
    }


def stored_assessment_result(result):
    return {
        "isCorrect": bool(result.get("isCorrect")),
        "score": float(result.get("score") or 0),
        "maxScore": 1,
        "feedback": result.get("feedback"),
        "items": result.get("items") if isinstance(result.get("items"), dict) else {},
    }


def empty_problem_snapshot():
    return {
        "response": None,
        "attemptNumber": 0,
        "hintsShown": 0,
        "checkResult": None,
        "submitted": False,
        "submissionResult": None,
    }


def canonical_problem_snapshot(problems, target_id):
    problem = problems.get(target_id) if isinstance(problems, dict) else None
    return dict(problem) if isinstance(problem, dict) else empty_problem_snapshot()


def canonical_problems_by_target_id(problems, target_ids):
    if not isinstance(problems, dict):
        return {}
    return {
        target_id: dict(problems[target_id])
        for target_id in target_ids
        if isinstance(target_id, str) and isinstance(problems.get(target_id), dict)
    }


def target_points(target):
    settings = _target_settings(target)
    points = settings.get("points")
    return (
        points
        if isinstance(points, (int, float)) and not isinstance(points, bool)
        else 1
    )


def target_is_graded(target):
    settings = _target_settings(target)
    return True if settings.get("isGraded") is None else bool(settings.get("isGraded"))


def build_submission_update(
    snapshot,
    target_id,
    response,
    result,
    is_graded,
    submitted=True,
    publish_grade=True,
):
    problems = snapshot.get("problems") if isinstance(snapshot, dict) else {}
    problems = dict(problems) if isinstance(problems, dict) else {}
    previous = problems.get(target_id)
    previous = previous if isinstance(previous, dict) else empty_problem_snapshot()
    stored_result = stored_assessment_result(result)
    problems[target_id] = {
        "response": response,
        "attemptNumber": problem_attempts(problems, target_id) + 1,
        "hintsShown": previous.get("hintsShown", 0),
        "checkResult": previous.get("checkResult") if submitted else stored_result,
        "submitted": submitted,
        "submissionResult": stored_result if submitted else None,
    }
    next_snapshot = dict(snapshot)
    next_snapshot["problems"] = problems
    return {
        "snapshot": next_snapshot,
        "attempts_delta": 1,
        "publish_grade": publish_grade and is_graded,
    }


def problem_attempts(problems, target_id):
    problem = problems.get(target_id) if isinstance(problems, dict) else None
    if not isinstance(problem, dict):
        return 0

    attempt_number = problem.get("attemptNumber")
    return (
        attempt_number
        if isinstance(attempt_number, int)
        and not isinstance(attempt_number, bool)
        and attempt_number >= 0
        else 0
    )


def _target_settings(target):
    return target.get("settings") if isinstance(target.get("settings"), dict) else {}


def _target_score_points(target):
    points = target_points(target)
    return float(points) if points >= 0 else 1.0


def _target_contributes_to_score(target, group_policy):
    if not target_is_graded(target):
        return False
    if group_policy is None:
        return True
    return group_policy["has_graded_group"]


def _authoritative_problem_result(problem):
    if not isinstance(problem, dict):
        return None
    result = problem.get("submissionResult") or problem.get("checkResult")
    return _authoritative_stored_result(result)


def _authoritative_quiz_result(quizzes, group_id, target_id):
    attempt = quizzes.get(group_id)
    if not isinstance(attempt, dict) or attempt.get("status") not in {
        "completed",
        "expired",
    }:
        return None
    results = attempt.get("resultsByTargetId")
    result = results.get(target_id) if isinstance(results, dict) else None
    return _authoritative_stored_result(result)


def _authoritative_stored_result(result):
    if not isinstance(result, dict):
        return None
    score = result.get("score")
    if (
        not isinstance(score, (int, float))
        or isinstance(score, bool)
        or not math.isfinite(score)
    ):
        return None
    return result


def _has_authoritative_quiz_result(assessment_groups, quizzes):
    for group in assessment_groups:
        if not isinstance(group, dict) or group.get("kind") != "quiz":
            continue
        settings = _target_settings(group)
        if settings.get("isGraded") is False:
            continue
        attempt = quizzes.get(group.get("groupId"))
        if not isinstance(attempt, dict):
            continue
        score = attempt.get("score")
        if (
            attempt.get("status") in {"completed", "expired"}
            and isinstance(score, (int, float))
            and not isinstance(score, bool)
            and math.isfinite(score)
        ):
            return True
    return False


def _quiz_group_policy_by_target_id(assessment_groups):
    ownership = quiz_group_id_by_target_id(assessment_groups)
    groups_by_id = {}
    for group in assessment_groups:
        if not isinstance(group, dict) or group.get("kind") != "quiz":
            continue
        groups_by_id[group.get("groupId")] = group

    policy = {}
    for target_id, group_id in ownership.items():
        group = groups_by_id[group_id]
        settings = (
            group.get("settings") if isinstance(group.get("settings"), dict) else {}
        )
        policy[target_id] = {
            "group_id": group_id,
            "has_graded_group": settings.get("isGraded") is not False,
        }
    return policy

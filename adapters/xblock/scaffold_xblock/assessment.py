from .grading import assessment_id_from_problem_id, grade_assessment
from .scorebook import target_is_graded, target_points
from .validation.assessment_groups import quiz_group_id_by_target_id


QUIZ_TARGET_STANDALONE_ERROR = "quiz target requires quiz attempt"


def assessment_target_for_request(
    assessment_targets,
    artifact_id,
    problem_id,
    target_id,
    interaction_kind,
):
    if (
        not isinstance(problem_id, str)
        or not isinstance(target_id, str)
        or not isinstance(interaction_kind, str)
    ):
        return None, "problemId, targetId, and interactionKind are required"

    assessment_id = assessment_id_from_problem_id(problem_id, artifact_id)
    if not assessment_id:
        return None, "problemId, targetId, and interactionKind are required"

    if assessment_id != target_id:
        return None, "targetId does not match problem"

    target = _assessment_target(assessment_targets, target_id)
    if target is None:
        return None, "problem not found"
    if target.get("targetId") != target_id:
        return None, "targetId does not match problem"
    if target.get("interaction", {}).get("kind") != interaction_kind:
        return None, "interactionKind does not match problem"

    return target, None


def standalone_assessment_target_for_request(
    assessment_targets,
    assessment_groups,
    artifact_id,
    problem_id,
    target_id,
    interaction_kind,
    allow_quiz_targets=False,
):
    target, error = assessment_target_for_request(
        assessment_targets,
        artifact_id,
        problem_id,
        target_id,
        interaction_kind,
    )
    if error:
        return None, error

    ownership = quiz_group_id_by_target_id(assessment_groups)
    if not allow_quiz_targets and target_id in ownership:
        return None, QUIZ_TARGET_STANDALONE_ERROR
    return target, None


def reveal_answer(data, assessment_targets, assessment_groups, artifact_id, problems):
    problem_id = data.get("problemId") if isinstance(data, dict) else None
    target_id = data.get("targetId") if isinstance(data, dict) else None
    interaction_kind = data.get("interactionKind") if isinstance(data, dict) else None

    target, error = standalone_assessment_target_for_request(
        assessment_targets,
        assessment_groups,
        artifact_id,
        problem_id,
        target_id,
        interaction_kind,
    )
    if error:
        return {"success": False, "error": error}

    settings = _target_settings(target)
    if settings.get("showAnswer") is not True:
        return {"success": False, "error": "answer reveal disabled"}

    problem = problems.get(target_id) if isinstance(problems, dict) else None
    if not _can_reveal_answer_from_problem(problem):
        return {"success": False, "error": "answer reveal unavailable"}

    return {
        "success": True,
        "answerKey": target.get("assessment"),
    }


def grade_assessment_request(
    data,
    action,
    assessment_targets,
    artifact_id,
    problem_attempts,
    persist=True,
    assessment_groups=None,
    allow_quiz_targets=False,
):
    if not isinstance(data, dict):
        return {
            "response": {"success": False, "error": "request body must be an object"},
            "submission": None,
        }

    problem_id = data.get("problemId")
    target_id = data.get("targetId")
    interaction_kind = data.get("interactionKind")
    response = data.get("response")

    if (
        not isinstance(problem_id, str)
        or not isinstance(target_id, str)
        or not isinstance(interaction_kind, str)
    ):
        return {
            "response": {
                "success": False,
                "error": "problemId, targetId, and interactionKind are required",
            },
            "submission": None,
        }

    target, error = standalone_assessment_target_for_request(
        assessment_targets,
        assessment_groups or [],
        artifact_id,
        problem_id,
        target_id,
        interaction_kind,
        allow_quiz_targets=allow_quiz_targets,
    )
    if error:
        return {"response": {"success": False, "error": error}, "submission": None}

    if not isinstance(response, dict) or response.get("kind") != interaction_kind:
        return {
            "response": {
                "success": False,
                "error": "response kind does not match problem",
            },
            "submission": None,
        }

    settings = _target_settings(target)
    feedback_mode = settings.get("feedbackMode")
    immediate_check = action == "check" and feedback_mode == "immediate"
    submit_attempt = action == "submit"
    if action == "check" and not immediate_check:
        return {
            "response": {
                "success": False,
                "error": "check is only available for immediate feedback",
            },
            "submission": None,
        }

    if persist and (submit_attempt or immediate_check):
        relation, error = expected_attempt_relation(data, problem_attempts)
        if error:
            return {
                "response": {"success": False, "error": error},
                "submission": None,
            }
        if relation == "stale":
            return {
                "response": {"success": True},
                "submission": None,
                "converged": True,
            }

    max_attempts = _max_attempts(settings)
    if persist and (submit_attempt or immediate_check) and max_attempts is not None:
        if problem_attempts >= max_attempts:
            return {
                "response": {
                    "success": False,
                    "error": "maximum attempts exceeded",
                },
                "submission": None,
            }

    result = grade_assessment(target, response)
    response_payload = {"success": True, **result}

    submission = None
    if submit_attempt or immediate_check:
        submission = {
            "problem_id": problem_id,
            "target_id": target_id,
            "interaction_kind": interaction_kind,
            "response": response,
            "result": result,
            "points": target_points(target),
            "is_graded": target_is_graded(target),
            "submitted": submit_attempt,
        }

    return {"response": response_payload, "submission": submission}


def expected_attempt_relation(data, stored_attempt_number):
    expected = data.get("expectedAttemptNumber") if isinstance(data, dict) else None
    if type(expected) is not int or expected < 0:
        return None, "expectedAttemptNumber must be a nonnegative integer"
    if expected < stored_attempt_number:
        return "stale", None
    if expected > stored_attempt_number:
        return None, "expectedAttemptNumber is ahead of stored state"
    return "equal", None


def _assessment_target(assessment_targets, target_id):
    if not isinstance(assessment_targets, list):
        return None

    for target in assessment_targets:
        if isinstance(target, dict) and target.get("targetId") == target_id:
            return target
    return None


def _target_settings(target):
    return target.get("settings") if isinstance(target.get("settings"), dict) else {}


def _max_attempts(settings):
    max_attempts = settings.get("maxAttempts")
    return (
        max_attempts
        if isinstance(max_attempts, int)
        and not isinstance(max_attempts, bool)
        and max_attempts > 0
        else None
    )


def _can_reveal_answer_from_problem(problem):
    if not isinstance(problem, dict) or problem.get("submitted") is not True:
        return False

    submission_result = problem.get("submissionResult")
    return (
        isinstance(submission_result, dict)
        and submission_result.get("isCorrect") is False
    )

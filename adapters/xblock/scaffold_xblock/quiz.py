from copy import deepcopy
from datetime import datetime, timedelta, timezone

from .assessment import expected_attempt_relation
from .assessment_projection import public_assessment_result
from .grading import build_assessment_problem_id, grade_assessment
from .scorebook import (
    canonical_problems_by_target_id,
    problem_attempts,
    stored_assessment_result,
    target_is_graded,
    target_points,
)


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def iso_has_expired(value):
    parsed = _parse_iso_datetime(value)
    return parsed is not None and datetime.now(timezone.utc) >= parsed


def quiz_attempt_expires_at(settings, now_factory=None):
    duration_seconds = settings["timer"]["durationSeconds"]
    if settings["timer"]["enabled"] and duration_seconds > 0:
        now = now_factory() if now_factory is not None else datetime.now(timezone.utc)
        return (
            now + timedelta(seconds=duration_seconds)
        ).isoformat().replace("+00:00", "Z")
    return None


def _parse_iso_datetime(value):
    if not isinstance(value, str) or not value.strip():
        return None

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def quiz_group_by_id(assessment_groups, group_id):
    if not isinstance(assessment_groups, list):
        return None

    for group in assessment_groups:
        if (
            isinstance(group, dict)
            and group.get("kind") == "quiz"
            and group.get("groupId") == group_id
        ):
            return group
    return None


def quiz_group_for_request(data, assessment_groups):
    if not isinstance(data, dict):
        return None, None, None, "request body must be an object"

    group_id = data.get("groupId")
    if not isinstance(group_id, str) or not group_id:
        return None, None, None, "groupId is required"

    group = quiz_group_by_id(assessment_groups, group_id)
    if group is None:
        return None, None, None, "quiz group not found"

    stored_target_ids = [
        target_id
        for target_id in group.get("targetIds", [])
        if isinstance(target_id, str)
    ]
    if not stored_target_ids:
        return None, None, None, "quiz group has no targets"

    settings = quiz_settings(group)
    return group, stored_target_ids, settings, None


def quiz_attempt_for_request(data, group_id, state):
    if not isinstance(data, dict):
        return None, None, "request body must be an object"
    attempt_id = data.get("attemptId")
    if not isinstance(attempt_id, str) or not attempt_id:
        return None, None, "attemptId is required"

    state = state if isinstance(state, dict) else {}
    attempt = state.get(group_id)
    if not isinstance(attempt, dict) or attempt.get("attemptId") != attempt_id:
        return None, None, "quiz attempt is not latest"
    return attempt, state, None


def quiz_target_for_response(target_id, target_ids, response, assessment_targets):
    if not isinstance(target_id, str) or target_id not in target_ids:
        return None, None, "targetId does not match quiz"
    if not isinstance(response, dict):
        return None, None, "response must be a JSON object"

    target = _assessment_target(assessment_targets, target_id)
    if target is None:
        return None, None, "problem not found"

    interaction = target.get("interaction") if isinstance(target, dict) else {}
    interaction_kind = (
        interaction.get("kind") if isinstance(interaction, dict) else None
    )
    if not isinstance(interaction_kind, str):
        return None, None, "interactionKind does not match problem"
    if response.get("kind") != interaction_kind:
        return None, None, "interactionKind does not match problem"

    return target, interaction_kind, None


def start_quiz_attempt(
    data,
    assessment_groups,
    state,
    now_factory,
    attempt_id_factory,
    expires_at_factory,
    is_expired,
):
    group, target_ids, settings, error = quiz_group_for_request(
        data,
        assessment_groups,
    )
    if error:
        return {
            "response": {"success": False, "error": error},
            "state": None,
            "finalize_expired": None,
        }

    state = state if isinstance(state, dict) else {}
    previous = state.get(group["groupId"])
    if isinstance(previous, dict):
        if previous.get("status") == "in_progress":
            if is_expired(previous.get("expiresAt")):
                return {
                    "response": None,
                    "state": state,
                    "finalize_expired": {
                        "attempt": previous,
                        "group_id": group["groupId"],
                        "target_ids": target_ids,
                        "settings": settings,
                    },
                }
            return {
                "response": public_quiz_attempt(
                    previous,
                    group["groupId"],
                    settings,
                    success=True,
                ),
                "state": None,
                "finalize_expired": None,
            }
        if previous.get("status") in {"completed", "expired"}:
            return {
                "response": public_quiz_attempt(
                    previous,
                    group["groupId"],
                    settings,
                    success=True,
                ),
                "state": None,
                "finalize_expired": None,
            }

    attempt_id = attempt_id_factory(group["groupId"])
    attempt = {
        "attemptId": attempt_id,
        "status": "in_progress",
        "currentTargetId": target_ids[0],
        "submittedTargetIds": [],
        "startedAt": now_factory(),
        "finishedAt": None,
        "expiresAt": expires_at_factory(settings),
        "score": None,
        "maxScore": None,
        "resultsByTargetId": {},
        "answerReviewAuthorized": False,
    }
    next_state = dict(state)
    next_state[group["groupId"]] = attempt
    return {
        "response": public_quiz_attempt(
            attempt,
            group["groupId"],
            settings,
            success=True,
        ),
        "state": next_state,
        "finalize_expired": None,
    }


def submit_quiz_question(
    data,
    assessment_groups,
    assessment_targets,
    state,
    problems,
    artifact_id,
    now_factory,
    is_expired,
):
    group, target_ids, settings, error = quiz_group_for_request(
        data,
        assessment_groups,
    )
    if error:
        return {"response": {"success": False, "error": error}, "state": None}
    if settings["reviewTiming"] != "after_each_answer":
        return {
            "response": {
                "success": False,
                "error": "quiz question submission requires after_each_answer timing",
            },
            "state": None,
        }

    attempt, state, error = quiz_attempt_for_request(
        data,
        group["groupId"],
        state,
    )
    if error:
        return {"response": {"success": False, "error": error}, "state": None}

    target_id = data.get("targetId") if isinstance(data, dict) else None
    response = data.get("response") if isinstance(data, dict) else None
    target, interaction_kind, error = quiz_target_for_response(
        target_id,
        target_ids,
        response,
        assessment_targets,
    )
    if error:
        return {"response": {"success": False, "error": error}, "state": None}

    previous_count = problem_attempts(problems, target_id)
    relation, error = expected_attempt_relation(data, previous_count)
    if error:
        return {"response": {"success": False, "error": error}, "state": None}
    if relation == "stale":
        return {
            "response": public_quiz_attempt(
                attempt,
                group["groupId"],
                settings,
                success=True,
            ),
            "state": None,
            "submissions": [],
            "converged_target_id": target_id,
        }

    if attempt.get("status") != "in_progress":
        return {
            "response": {
                "success": False,
                "error": "quiz attempt is not in progress",
            },
            "state": None,
        }

    if is_expired(attempt.get("expiresAt")):
        finalization = finalize_expired_quiz_attempt(
            attempt,
            state,
            group["groupId"],
            target_ids,
            settings,
            now_factory,
        )
        finalization["submissions"] = []
        return finalization

    current_target_id = attempt.get("currentTargetId")
    if current_target_id and target_id != current_target_id:
        return {
            "response": {
                "success": False,
                "error": "quiz current question is %s" % current_target_id,
            },
            "state": None,
        }

    if previous_count >= settings["attemptsPerQuestion"]:
        return {
            "response": {"success": False, "error": "maximum attempts exceeded"},
            "state": None,
        }

    submitted_target_ids = [
        submitted_target_id
        for submitted_target_id in attempt.get("submittedTargetIds", [])
        if isinstance(submitted_target_id, str)
    ]
    first_unsubmitted = next(
        (
            quiz_target_id
            for quiz_target_id in target_ids
            if quiz_target_id not in submitted_target_ids
        ),
        None,
    )
    if (
        previous_count == 0
        and first_unsubmitted is not None
        and target_id != first_unsubmitted
    ):
        return {
            "response": {
                "success": False,
                "error": "quiz current question is %s" % first_unsubmitted,
            },
            "state": None,
        }

    result = grade_assessment(target, response)
    submission = quiz_submission(
        artifact_id,
        target_id,
        target,
        interaction_kind,
        response,
        result,
        settings,
        publish_grade=settings["isGraded"] and target_is_graded(target),
    )

    results_by_target_id = (
        attempt.get("resultsByTargetId")
        if isinstance(attempt.get("resultsByTargetId"), dict)
        else {}
    )
    results_by_target_id = dict(results_by_target_id)
    results_by_target_id[target_id] = stored_assessment_result(result)

    has_attempts_remaining = (
        previous_count + 1 < settings["attemptsPerQuestion"]
    )
    should_stay = not result.get("isCorrect") and has_attempts_remaining
    if not should_stay and target_id not in submitted_target_ids:
        submitted_target_ids.append(target_id)
    next_target_id = (
        target_id
        if should_stay
        else next(
            (
                quiz_target_id
                for quiz_target_id in target_ids
                if quiz_target_id not in submitted_target_ids
            ),
            None,
        )
    )
    expired = is_expired(attempt.get("expiresAt"))
    status = "expired" if expired else ("in_progress" if next_target_id else "completed")
    score, max_score = (
        aggregate_quiz_results(results_by_target_id)
        if status in {"completed", "expired"}
        else (None, None)
    )

    next_attempt = dict(attempt)
    next_attempt.update(
        {
            "status": status,
            "currentTargetId": None if status == "completed" else next_target_id,
            "submittedTargetIds": submitted_target_ids,
            "finishedAt": (
                now_factory() if status in {"completed", "expired"} else None
            ),
            "score": score,
            "maxScore": max_score,
            "resultsByTargetId": results_by_target_id,
            "answerReviewAuthorized": True,
        }
    )
    next_state = dict(state)
    next_state[group["groupId"]] = next_attempt
    return {
        "response": public_quiz_attempt(
            next_attempt,
            group["groupId"],
            settings,
            success=True,
        ),
        "state": next_state,
        "submissions": [submission],
    }


def finish_quiz_attempt(
    data,
    assessment_groups,
    assessment_targets,
    state,
    artifact_id,
    now_factory,
    is_expired,
):
    group, target_ids, settings, error = quiz_group_for_request(
        data,
        assessment_groups,
    )
    if error:
        return _finish_error(error)

    attempt, state, error = quiz_attempt_for_request(
        data,
        group["groupId"],
        state,
    )
    if error:
        return _finish_error(error)
    if attempt.get("status") != "in_progress":
        if attempt.get("status") in {"completed", "expired"}:
            return {
                "response": public_quiz_attempt(
                    attempt,
                    group["groupId"],
                    settings,
                    success=True,
                ),
                "state": None,
                "submissions": [],
                "publish_grade": False,
                "finalize_expired": None,
            }
        return _finish_error("quiz attempt is not in progress")

    expired = is_expired(attempt.get("expiresAt"))
    if expired and settings["reviewTiming"] == "after_quiz":
        return _expired_finish_finalization(
            attempt,
            state,
            group["groupId"],
            target_ids,
            settings,
        )

    responses_by_target_id = (
        data.get("responsesByTargetId") if isinstance(data, dict) else None
    )
    if not isinstance(responses_by_target_id, dict):
        return _finish_error("responsesByTargetId must be an object")

    unknown_target_ids = [
        target_id
        for target_id in responses_by_target_id.keys()
        if target_id not in target_ids
    ]
    if unknown_target_ids:
        return _finish_error("responsesByTargetId contains unknown target")

    if settings["reviewTiming"] == "after_each_answer":
        if not expired:
            return _finish_error(
                "quiz finish requires after_quiz timing or expired attempt",
            )

        return _expired_finish_finalization(
            attempt,
            state,
            group["groupId"],
            target_ids,
            settings,
        )

    if not expired and any(
        target_id not in responses_by_target_id for target_id in target_ids
    ):
        return _finish_error("responsesByTargetId must include every quiz target")

    results_by_target_id = {}
    submitted_target_ids = []
    submissions = []
    for target_id in target_ids:
        if target_id not in responses_by_target_id:
            continue

        response = responses_by_target_id[target_id]
        target, interaction_kind, error = quiz_target_for_response(
            target_id,
            target_ids,
            response,
            assessment_targets,
        )
        if error:
            return _finish_error(error)

        result = grade_assessment(target, response)
        results_by_target_id[target_id] = stored_assessment_result(result)
        submitted_target_ids.append(target_id)
        submissions.append(
            quiz_submission(
                artifact_id,
                target_id,
                target,
                interaction_kind,
                response,
                result,
                settings,
                publish_grade=False,
            )
        )

    score, max_score = aggregate_quiz_results(
        results_by_target_id,
        target_ids,
    )
    next_attempt = dict(attempt)
    next_attempt.update(
        {
            "status": "expired" if expired else "completed",
            "currentTargetId": None,
            "submittedTargetIds": submitted_target_ids,
            "finishedAt": now_factory(),
            "score": score,
            "maxScore": max_score,
            "resultsByTargetId": results_by_target_id,
            "answerReviewAuthorized": True,
        }
    )
    next_state = dict(state)
    next_state[group["groupId"]] = next_attempt
    return {
        "response": public_quiz_attempt(
            next_attempt,
            group["groupId"],
            settings,
            success=True,
        ),
        "state": next_state,
        "submissions": submissions,
        "publish_grade": settings["isGraded"],
        "finalize_expired": None,
    }


def finalize_expired_quiz_attempt(
    attempt,
    state,
    group_id,
    target_ids,
    settings,
    now_factory,
):
    results_by_target_id = (
        attempt.get("resultsByTargetId")
        if isinstance(attempt.get("resultsByTargetId"), dict)
        else {}
    )
    submitted_target_ids = [
        target_id
        for target_id in attempt.get("submittedTargetIds", [])
        if isinstance(target_id, str) and target_id in target_ids
    ]
    score, max_score = aggregate_quiz_results(
        results_by_target_id,
        target_ids,
    )
    next_attempt = dict(attempt)
    next_attempt.update(
        {
            "status": "expired",
            "currentTargetId": None,
            "submittedTargetIds": submitted_target_ids,
            "finishedAt": now_factory(),
            "score": score,
            "maxScore": max_score,
            "resultsByTargetId": results_by_target_id,
            "answerReviewAuthorized": True,
        }
    )
    state = state if isinstance(state, dict) else {}
    next_state = dict(state)
    next_state[group_id] = next_attempt
    return {
        "response": public_quiz_attempt(
            next_attempt,
            group_id,
            settings,
            success=True,
        ),
        "state": next_state,
        "publish_grade": settings["isGraded"],
    }


def reveal_quiz_answers(data, assessment_groups, state):
    group_id = data.get("groupId") if isinstance(data, dict) else None
    group = quiz_group_by_id(assessment_groups, group_id)
    if group is None:
        return _reveal_error("quiz group not found")

    settings = quiz_settings(group)
    if settings["reviewDetail"] != "full_review":
        return _reveal_error("quiz answer review disabled")

    attempt, state, error = quiz_attempt_for_request(
        data,
        group_id,
        state,
    )
    if error:
        return _reveal_error(error)
    if attempt.get("status") not in {"completed", "expired"}:
        return _reveal_error("quiz attempt is not complete")

    return {
        "response": public_quiz_attempt(
            attempt,
            group_id,
            settings,
            success=True,
            authorize_full_review=True,
        ),
        "state": None,
    }


def quiz_settings(group):
    settings = group.get("settings") if isinstance(group.get("settings"), dict) else {}
    timer = settings.get("timer") if isinstance(settings.get("timer"), dict) else {}
    attempts_per_question = settings.get("attemptsPerQuestion")
    return {
        "allowBacktracking": (
            settings.get("allowBacktracking")
            if isinstance(settings.get("allowBacktracking"), bool)
            else True
        ),
        "reviewTiming": (
            settings.get("reviewTiming")
            if settings.get("reviewTiming") in {"after_quiz", "after_each_answer"}
            else "after_quiz"
        ),
        "reviewDetail": (
            settings.get("reviewDetail")
            if settings.get("reviewDetail") in {"none", "result_only", "full_review"}
            else "result_only"
        ),
        "attemptsPerQuestion": (
            attempts_per_question
            if attempts_per_question in {1, 2, 3}
            else 1
        ),
        "isGraded": (
            settings.get("isGraded")
            if isinstance(settings.get("isGraded"), bool)
            else True
        ),
        "timer": {
            "enabled": (
                timer.get("enabled")
                if isinstance(timer.get("enabled"), bool)
                else False
            ),
            "durationSeconds": (
                int(timer.get("durationSeconds"))
                if isinstance(timer.get("durationSeconds"), int)
                and not isinstance(timer.get("durationSeconds"), bool)
                and timer.get("durationSeconds") >= 0
                else 0
            ),
        },
    }


def public_quiz_attempt(
    attempt,
    group_id,
    settings=None,
    success=False,
    authorize_full_review=False,
):
    settings = settings if isinstance(settings, dict) else {"reviewDetail": "none"}
    review_detail, full_review_authorized = _public_quiz_review_policy(
        attempt,
        settings,
        authorize_full_review,
    )
    payload = {
        "attemptId": attempt.get("attemptId"),
        "groupId": group_id,
        "status": attempt.get("status"),
        "currentTargetId": attempt.get("currentTargetId"),
        "submittedTargetIds": [
            target_id
            for target_id in attempt.get("submittedTargetIds", [])
            if isinstance(target_id, str)
        ],
        "startedAt": attempt.get("startedAt"),
        "finishedAt": attempt.get("finishedAt"),
        "expiresAt": attempt.get("expiresAt"),
        "score": attempt.get("score"),
        "maxScore": attempt.get("maxScore"),
        "resultsByTargetId": _public_quiz_results_by_target_id(
            attempt.get("resultsByTargetId"),
            review_detail,
            full_review_authorized,
        ),
        "answerReviewAuthorized": (
            bool(attempt.get("answerReviewAuthorized")) or full_review_authorized
        ),
    }
    if success:
        payload["success"] = True
    return payload


def public_quiz_problems_by_target_id(problems, target_ids, settings, attempt):
    review_detail, full_review_authorized = _public_quiz_review_policy(
        attempt,
        settings,
    )
    public_problems = canonical_problems_by_target_id(problems, target_ids)
    for target_id, problem in public_problems.items():
        public_problem = deepcopy(problem)
        if review_detail == "none":
            public_problem.update(
                {
                    "submitted": False,
                    "checkResult": None,
                    "submissionResult": None,
                }
            )
        elif not full_review_authorized:
            for result_key in ("checkResult", "submissionResult"):
                result = public_problem.get(result_key)
                if isinstance(result, dict):
                    public_problem[result_key] = public_assessment_result(result)
        public_problems[target_id] = public_problem
    return public_problems


def _public_quiz_review_policy(attempt, settings, authorize_full_review=False):
    review_detail = settings.get("reviewDetail")
    if review_detail not in {"none", "result_only", "full_review"}:
        review_detail = "none"
    terminal = attempt.get("status") in {"completed", "expired"}
    full_review_authorized = (
        review_detail == "full_review"
        and terminal
        and (bool(attempt.get("answerReviewAuthorized")) or authorize_full_review)
    )
    return review_detail, full_review_authorized


def _public_quiz_results_by_target_id(
    results_by_target_id,
    review_detail,
    full_review_authorized,
):
    if review_detail == "none" or not isinstance(results_by_target_id, dict):
        return {}
    if full_review_authorized:
        return deepcopy(results_by_target_id)
    return {
        target_id: public_assessment_result(result)
        for target_id, result in results_by_target_id.items()
        if isinstance(target_id, str) and isinstance(result, dict)
    }


def quiz_submission(
    artifact_id,
    target_id,
    target,
    interaction_kind,
    response,
    result,
    settings,
    publish_grade,
):
    graded = settings["isGraded"] and target_is_graded(target)
    return {
        "problem_id": build_assessment_problem_id(artifact_id, target_id),
        "target_id": target_id,
        "interaction_kind": interaction_kind,
        "response": response,
        "result": result,
        "points": target_points(target),
        "is_graded": graded,
        "submitted": True,
        "publish_grade": publish_grade,
    }


def aggregate_quiz_results(results_by_target_id, target_ids=None):
    if not isinstance(results_by_target_id, dict):
        results_by_target_id = {}
    result_values = (
        [results_by_target_id.get(target_id) for target_id in target_ids]
        if target_ids is not None
        else results_by_target_id.values()
    )

    score = 0.0
    max_score = 0.0
    for result in result_values:
        if target_ids is not None:
            max_score += 1.0
        if not isinstance(result, dict):
            continue
        if target_ids is None:
            max_score += 1.0
        score += float(result.get("score") or 0)
    return score, max_score


def _assessment_target(assessment_targets, target_id):
    if not isinstance(assessment_targets, list):
        return None

    for target in assessment_targets:
        if isinstance(target, dict) and target.get("targetId") == target_id:
            return target
    return None


def _finish_error(error):
    return {
        "response": {"success": False, "error": error},
        "state": None,
        "submissions": [],
        "publish_grade": False,
        "finalize_expired": None,
    }


def _expired_finish_finalization(attempt, state, group_id, target_ids, settings):
    return {
        "response": None,
        "state": state,
        "submissions": [],
        "publish_grade": False,
        "finalize_expired": {
            "attempt": attempt,
            "group_id": group_id,
            "target_ids": target_ids,
            "settings": settings,
        },
    }


def _reveal_error(error):
    return {
        "response": {"success": False, "error": error},
        "state": None,
    }

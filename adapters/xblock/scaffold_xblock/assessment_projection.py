from copy import deepcopy


def public_assessment_result(result, include_authored_feedback=False):
    # Item outcomes stay exclusive to explicit reveal and authorized full review.
    return {
        "isCorrect": bool(result.get("isCorrect")),
        "score": result.get("score"),
        "maxScore": result.get("maxScore"),
        "feedback": (
            deepcopy(result.get("feedback")) if include_authored_feedback else None
        ),
        "items": {},
    }

def assessment_id_from_problem_id(problem_id, expected_artifact_id=None):
    if not isinstance(problem_id, str):
        return None

    value = problem_id.strip()
    if not value:
        return None

    marker = "/block:"
    if marker not in value:
        return None

    artifact, block_id = value.rsplit(marker, 1)
    if not artifact.startswith("artifact:") or not artifact[len("artifact:"):].strip():
        return None
    if expected_artifact_id is not None:
        expected_artifact = str(expected_artifact_id).strip()
        if not expected_artifact or artifact != "artifact:%s" % expected_artifact:
            return None

    block_id = block_id.strip()
    return block_id or None


def build_assessment_problem_id(artifact_id, block_id):
    artifact = str(artifact_id).strip() if artifact_id is not None else ""
    block = str(block_id).strip() if block_id is not None else ""
    if not artifact or not block:
        return None
    return "artifact:%s/block:%s" % (artifact, block)


def read_string_list(value):
    if not isinstance(value, list):
        return []

    return [item for item in value if isinstance(item, str)]


def read_object_array(value):
    return (
        [item for item in value if isinstance(item, dict)]
        if isinstance(value, list)
        else []
    )


def summary_feedback(assessment):
    return assessment.get("summaryFeedback") if isinstance(assessment, dict) else None


def empty_grade_result(feedback=None):
    return {
        "isCorrect": False,
        "score": 0,
        "maxScore": 1,
        "feedback": feedback,
        "items": {},
    }


def grade_assessment(target, response):
    if not isinstance(target, dict) or not isinstance(response, dict):
        return empty_grade_result()

    assessment = target.get("assessment")
    interaction = target.get("interaction")
    if not isinstance(assessment, dict) or not isinstance(interaction, dict):
        return empty_grade_result()
    if response.get("kind") != assessment.get("kind"):
        return empty_grade_result()

    kind = assessment.get("kind")
    if kind == "single-select":
        return grade_single_select_target(interaction, assessment, response)
    if kind == "multi-select":
        return grade_multi_select_target(interaction, assessment, response)
    if kind == "sequence":
        return grade_sequence_target(assessment, response)
    if kind == "match":
        return grade_pair_target(
            assessment.get("correctPairs"),
            response.get("pairs"),
            "targetId",
            summary_feedback(assessment),
            assessment.get("feedbackByItemId"),
        )
    if kind == "classify":
        return grade_pair_target(
            assessment.get("correctPlacements"),
            response.get("placements"),
            "categoryId",
            summary_feedback(assessment),
            assessment.get("feedbackByItemId"),
        )
    if kind == "fill-blanks":
        return grade_fill_blanks_target(assessment, response)
    if kind == "spatial-hotspot":
        return grade_hotspot_target(interaction, assessment, response)
    return empty_grade_result()


def grade_single_select_target(interaction, assessment, response):
    correct_id = assessment.get("correctOptionId")
    given = response.get("optionId")
    is_correct = bool(isinstance(correct_id, str) and given == correct_id)
    feedback = assessment.get("feedbackByOptionId")
    feedback = feedback if isinstance(feedback, dict) else {}
    items = {}
    for option in interaction.get("options") or []:
        if not isinstance(option, dict) or not isinstance(option.get("id"), str):
            continue
        option_id = option["id"]
        expected = option_id == correct_id
        selected = option_id == given
        item = {"correct": selected and expected, "expected": expected, "given": selected}
        if option_id in feedback:
            item["feedback"] = feedback[option_id]
        items[option_id] = item
    return {
        "isCorrect": is_correct,
        "score": 1 if is_correct else 0,
        "maxScore": 1,
        "feedback": summary_feedback(assessment),
        "items": items,
    }


def grade_multi_select_target(interaction, assessment, response):
    expected = set(read_string_list(assessment.get("correctOptionIds")))
    selected = set(read_string_list(response.get("optionIds")))
    feedback = assessment.get("feedbackByOptionId")
    feedback = feedback if isinstance(feedback, dict) else {}
    items = {}
    for option in interaction.get("options") or []:
        if not isinstance(option, dict) or not isinstance(option.get("id"), str):
            continue
        option_id = option["id"]
        is_expected = option_id in expected
        was_selected = option_id in selected
        item = {
            "correct": is_expected == was_selected,
            "expected": is_expected,
            "given": was_selected,
        }
        if option_id in feedback:
            item["feedback"] = feedback[option_id]
        items[option_id] = item
    if not expected:
        return {
            "isCorrect": False,
            "score": 0,
            "maxScore": 1,
            "feedback": summary_feedback(assessment),
            "items": items,
        }
    if len(selected) == len(expected) and selected == expected:
        return {
            "isCorrect": True,
            "score": 1,
            "maxScore": 1,
            "feedback": summary_feedback(assessment),
            "items": items,
        }
    per_correct = 1 / len(expected)
    score = max(
        0,
        (len(selected & expected) * per_correct)
        - (len([item for item in selected if item not in expected]) * per_correct),
    )
    return {
        "isCorrect": False,
        "score": score,
        "maxScore": 1,
        "feedback": summary_feedback(assessment),
        "items": items,
    }


def grade_sequence_target(assessment, response):
    expected = read_string_list(assessment.get("correctOrder"))
    given = read_string_list(response.get("orderedItemIds"))
    feedback = assessment.get("feedbackByItemId")
    feedback = feedback if isinstance(feedback, dict) else {}
    items = {}
    if not expected:
        return empty_grade_result(summary_feedback(assessment))
    given_index = {}
    for index, item_id in enumerate(given):
        if item_id not in given_index:
            given_index[item_id] = index
    correct_count = 0
    for expected_index, item_id in enumerate(expected):
        actual_index = given_index.get(item_id)
        correct = actual_index == expected_index
        if correct:
            correct_count += 1
        item = {"correct": correct, "expected": expected_index}
        if actual_index is not None:
            item["given"] = actual_index
        if item_id in feedback:
            item["feedback"] = feedback[item_id]
        items[item_id] = item
    same_set = (
        len(expected) == len(given)
        and all(item_id in given_index for item_id in expected)
        and all(item_id in expected for item_id in given)
    )
    is_correct = same_set and correct_count == len(expected)
    return {
        "isCorrect": is_correct,
        "score": 1 if is_correct else correct_count / len(expected),
        "maxScore": 1,
        "feedback": summary_feedback(assessment),
        "items": items,
    }


def grade_pair_target(
    expected_pairs,
    given_pairs,
    expected_key,
    feedback=None,
    feedback_by_item=None,
):
    expected_pairs = expected_pairs if isinstance(expected_pairs, list) else []
    given_pairs = given_pairs if isinstance(given_pairs, list) else []
    feedback_by_item = (
        feedback_by_item if isinstance(feedback_by_item, dict) else {}
    )
    given_by_item = {}
    for pair in given_pairs:
        if not isinstance(pair, dict):
            continue
        item_id = pair.get("itemId")
        expected_value = pair.get(expected_key)
        if isinstance(item_id, str) and isinstance(expected_value, str):
            given_by_item[item_id] = expected_value
    items = {}
    if not expected_pairs:
        return empty_grade_result(feedback)
    correct_count = 0
    for pair in expected_pairs:
        if not isinstance(pair, dict):
            continue
        item_id = pair.get("itemId")
        expected = pair.get(expected_key)
        if not isinstance(item_id, str) or not isinstance(expected, str):
            continue
        given = given_by_item.get(item_id)
        correct = given == expected
        if correct:
            correct_count += 1
        item = {"correct": correct, "expected": expected}
        if given is not None:
            item["given"] = given
        if item_id in feedback_by_item:
            item["feedback"] = feedback_by_item[item_id]
        items[item_id] = item
    total = len(items)
    if total == 0:
        return empty_grade_result(feedback)
    return {
        "isCorrect": correct_count == total,
        "score": correct_count / total,
        "maxScore": 1,
        "feedback": feedback,
        "items": items,
    }


def normalize_fill_blank_value(value, meta):
    normalized = value if meta.get("trimWhitespace") is False else value.strip()
    return normalized if meta.get("caseSensitive") else normalized.lower()


def grade_fill_blanks_target(assessment, response):
    given_by_blank = {}
    for blank in response.get("blanks") or []:
        if not isinstance(blank, dict):
            continue
        blank_id = blank.get("blankId")
        value = blank.get("value")
        if isinstance(blank_id, str) and isinstance(value, str):
            given_by_blank[blank_id] = value
    blanks = assessment.get("blanks") if isinstance(assessment.get("blanks"), list) else []
    feedback = assessment.get("feedbackByBlankId")
    feedback = feedback if isinstance(feedback, dict) else {}
    items = {}
    if not blanks:
        return empty_grade_result(summary_feedback(assessment))
    correct_count = 0
    for blank in blanks:
        blank_id = blank.get("blankId") if isinstance(blank, dict) else None
        if not isinstance(blank_id, str):
            continue
        accepted = [
            answer
            for answer in blank.get("acceptedAnswers", [])
            if isinstance(answer, str) and answer
        ]
        given = given_by_blank.get(blank_id, "")
        normalized_given = normalize_fill_blank_value(given, blank)
        correct = bool(accepted) and any(
            normalize_fill_blank_value(answer, blank) == normalized_given
            for answer in accepted
        )
        if correct:
            correct_count += 1
        item = {"correct": correct, "expected": accepted}
        if given != "":
            item["given"] = given
        if blank_id in feedback:
            item["feedback"] = feedback[blank_id]
        items[blank_id] = item
    total = len(items)
    if total == 0:
        return empty_grade_result(summary_feedback(assessment))
    return {
        "isCorrect": correct_count == total,
        "score": correct_count / total,
        "maxScore": 1,
        "feedback": summary_feedback(assessment),
        "items": items,
    }


def grade_hotspot_target(interaction, assessment, response):
    selected = set()
    for selection in response.get("selections") or []:
        if not isinstance(selection, dict):
            continue
        hotspot_id = selection.get("hotspotId")
        if isinstance(hotspot_id, str) and hotspot_id:
            selected.add(hotspot_id)
    expected = set(read_string_list(assessment.get("correctHotspotIds")))
    feedback = assessment.get("feedbackByHotspotId")
    feedback = feedback if isinstance(feedback, dict) else {}
    hotspot_ids = [
        hotspot.get("id")
        for hotspot in interaction.get("hotspots") or []
        if isinstance(hotspot, dict) and isinstance(hotspot.get("id"), str)
    ]
    items = {}
    if not hotspot_ids:
        return empty_grade_result(summary_feedback(assessment))
    correct_count = 0
    for hotspot_id in hotspot_ids:
        is_expected = hotspot_id in expected
        was_selected = hotspot_id in selected
        correct = is_expected == was_selected
        if correct:
            correct_count += 1
        item = {"correct": correct, "expected": is_expected, "given": was_selected}
        if hotspot_id in feedback:
            item["feedback"] = feedback[hotspot_id]
        items[hotspot_id] = item
    all_correct = correct_count == len(hotspot_ids)
    return {
        "isCorrect": all_correct,
        "score": (1 if all_correct else 0)
        if assessment.get("gradingMode") == "all-or-nothing"
        else correct_count / len(hotspot_ids),
        "maxScore": 1,
        "feedback": summary_feedback(assessment),
        "items": items,
    }

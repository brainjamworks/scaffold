from math import hypot, isfinite
from urllib.parse import unquote


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
        encoded_artifact = artifact[len("artifact:"):]
        if (
            not expected_artifact
            or unquote(encoded_artifact) != expected_artifact
        ):
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
        "score": scaled_score(0),
        "feedback": feedback,
        "items": {},
    }


def scaled_score(scaled):
    return {"scaled": scaled}


def count_score(raw, maximum):
    if maximum <= 0:
        return scaled_score(0)
    return {
        "scaled": raw / maximum,
        "raw": raw,
        "min": 0,
        "max": maximum,
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
    if kind == "spatial-placement":
        return grade_spatial_placement_target(interaction, assessment, response)
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
        "score": count_score(1 if is_correct else 0, 1),
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
            "score": scaled_score(0),
            "feedback": summary_feedback(assessment),
            "items": items,
        }
    if len(selected) == len(expected) and selected == expected:
        return {
            "isCorrect": True,
            "score": count_score(len(expected), len(expected)),
            "feedback": summary_feedback(assessment),
            "items": items,
        }
    raw = max(0, len(selected & expected) - len(selected - expected))
    return {
        "isCorrect": False,
        "score": count_score(raw, len(expected)),
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
        "score": count_score(correct_count, len(expected)),
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
        "score": count_score(correct_count, total),
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
        "score": count_score(correct_count, total),
        "feedback": summary_feedback(assessment),
        "items": items,
    }


def grade_hotspot_target(interaction, assessment, response):
    hotspot_ids = [
        hotspot.get("id")
        for hotspot in interaction.get("hotspots") or []
        if isinstance(hotspot, dict) and isinstance(hotspot.get("id"), str)
    ]
    hotspot_id_set = set(hotspot_ids)
    selections = response.get("selections")
    selections = selections if isinstance(selections, list) else []
    selected_current_ids = []
    for selection in selections:
        if not isinstance(selection, dict):
            continue
        hotspot_id = selection.get("hotspotId")
        if isinstance(hotspot_id, str) and hotspot_id in hotspot_id_set:
            selected_current_ids.append(hotspot_id)
    selected = set(selected_current_ids)
    expected = set(read_string_list(assessment.get("correctHotspotIds")))
    feedback = assessment.get("feedbackByHotspotId")
    feedback = feedback if isinstance(feedback, dict) else {}
    items = {}
    if not hotspot_ids:
        return empty_grade_result(summary_feedback(assessment))
    for hotspot_id in hotspot_ids:
        is_expected = hotspot_id in expected
        was_selected = hotspot_id in selected
        correct = is_expected == was_selected
        item = {"correct": correct, "expected": is_expected, "given": was_selected}
        if hotspot_id in feedback:
            item["feedback"] = feedback[hotspot_id]
        items[hotspot_id] = item
    correct_selections = len(selected.intersection(expected))
    all_correct = (
        len(selections) == len(expected)
        and len(selected_current_ids) == len(selections)
        and len(selected) == len(selections)
        and correct_selections == len(expected)
    )
    partial_credit_denominator = max(len(expected), len(selections))
    return {
        "isCorrect": all_correct,
        "score": count_score(1 if all_correct else 0, 1)
        if assessment.get("gradingMode") == "all-or-nothing"
        else count_score(0, 1)
        if not expected or partial_credit_denominator == 0
        else count_score(correct_selections, partial_credit_denominator),
        "feedback": summary_feedback(assessment),
        "items": items,
    }


def grade_spatial_placement_target(interaction, assessment, response):
    if interaction.get("kind") != "spatial-placement":
        raise ValueError(
            "spatial-placement interaction kind must match assessment: %s"
            % interaction.get("kind")
        )

    markers = spatial_object_list(interaction.get("markers"), "interaction markers")
    marker_ids = []
    marker_id_set = set()
    for marker in markers:
        marker_id = spatial_marker_id(marker.get("id"), "interaction marker")
        if marker_id in marker_id_set:
            raise ValueError(
                "duplicate spatial-placement interaction marker id: %s" % marker_id
            )
        marker_ids.append(marker_id)
        marker_id_set.add(marker_id)

    correct_placements = spatial_object_list(
        assessment.get("correctPlacements"),
        "correct placements",
    )
    correct_by_marker_id = {}
    for placement in correct_placements:
        marker_id = spatial_marker_id(
            placement.get("markerId"),
            "correct-placement marker",
        )
        if marker_id in correct_by_marker_id:
            raise ValueError(
                "duplicate spatial-placement correct-placement marker id: %s"
                % marker_id
            )
        if marker_id not in marker_id_set:
            raise ValueError(
                "spatial-placement answer references unknown marker: %s" % marker_id
            )
        correct_by_marker_id[marker_id] = placement
    for marker_id in marker_ids:
        if marker_id not in correct_by_marker_id:
            raise ValueError(
                "spatial-placement answer is missing marker: %s" % marker_id
            )

    feedback = assessment.get("feedbackByMarkerId", {})
    if not isinstance(feedback, dict):
        raise ValueError("spatial-placement marker feedback must be an object")
    for marker_id in feedback:
        if marker_id not in marker_id_set:
            raise ValueError(
                "spatial-placement feedback references unknown marker: %s" % marker_id
            )

    given_by_marker_id = {}
    placements = spatial_object_list(response.get("placements"), "response placements")
    for placement in placements:
        marker_id = spatial_marker_id(placement.get("markerId"), "response marker")
        if marker_id not in marker_id_set:
            raise ValueError(
                "spatial-placement response references unknown marker: %s" % marker_id
            )
        if marker_id in given_by_marker_id:
            raise ValueError(
                "duplicate spatial-placement response marker id: %s" % marker_id
            )
        assert_spatial_coordinate(placement.get("x"), "response marker %s x" % marker_id)
        assert_spatial_coordinate(placement.get("y"), "response marker %s y" % marker_id)
        given_by_marker_id[marker_id] = placement

    aspect_ratio = assessment.get("imageAspectRatio")
    if aspect_ratio is not None and not spatial_positive_number(aspect_ratio):
        raise ValueError(
            "spatial-placement image aspect ratio must be finite and positive"
        )
    grading_mode = assessment.get("gradingMode")
    if grading_mode not in ("partial-credit", "all-or-nothing"):
        raise ValueError(
            "unsupported spatial-placement grading mode: %s" % grading_mode
        )

    if not marker_ids:
        return empty_grade_result(summary_feedback(assessment))
    if aspect_ratio is None:
        raise ValueError(
            "spatial-placement image aspect ratio must be finite and positive"
        )

    items = {}
    correct_count = 0
    for marker_id in marker_ids:
        geometry = correct_by_marker_id[marker_id].get("geometry")
        assert_spatial_circle(geometry, marker_id)
        learner = given_by_marker_id.get(marker_id)
        correct = False
        if learner is not None:
            dx = learner["x"] - geometry["centerX"]
            dy = (learner["y"] - geometry["centerY"]) / aspect_ratio
            correct = hypot(dx, dy) <= geometry["radius"]
        if correct:
            correct_count += 1
        item = {"correct": correct, "expected": True, "given": correct}
        if marker_id in feedback:
            item["feedback"] = feedback[marker_id]
        items[marker_id] = item

    total = len(marker_ids)
    exact_all_correct = len(given_by_marker_id) == total and correct_count == total
    return {
        "isCorrect": exact_all_correct,
        "score": count_score(1 if exact_all_correct else 0, 1)
        if grading_mode == "all-or-nothing"
        else count_score(correct_count, total),
        "feedback": summary_feedback(assessment),
        "items": items,
    }


def spatial_object_list(value, label):
    if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
        raise ValueError("spatial-placement %s must be an array of objects" % label)
    return value


def spatial_marker_id(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("spatial-placement %s id must be a non-empty string" % label)
    return value


def spatial_positive_number(value):
    return type(value) in (int, float) and isfinite(value) and value > 0


def assert_spatial_coordinate(value, label):
    if type(value) not in (int, float) or not isfinite(value) or value < 0 or value > 100:
        raise ValueError(
            "spatial-placement %s must be finite and within 0..100" % label
        )


def assert_spatial_circle(circle, marker_id):
    if not isinstance(circle, dict) or circle.get("kind") != "circle":
        raise ValueError(
            "spatial-placement answer geometry must be a circle: %s" % marker_id
        )
    assert_spatial_coordinate(
        circle.get("centerX"),
        "answer centerX for marker %s" % marker_id,
    )
    assert_spatial_coordinate(
        circle.get("centerY"),
        "answer centerY for marker %s" % marker_id,
    )
    if not spatial_positive_number(circle.get("radius")):
        raise ValueError(
            "spatial-placement answer radius must be finite and positive: %s"
            % marker_id
        )

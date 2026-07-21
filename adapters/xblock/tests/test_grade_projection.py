import importlib
import sys
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path


ADAPTER_ROOT = Path(__file__).resolve().parents[1]
if str(ADAPTER_ROOT) not in sys.path:
    sys.path.insert(0, str(ADAPTER_ROOT))

scaffold_package = types.ModuleType("scaffold_xblock")
scaffold_package.__path__ = [str(ADAPTER_ROOT / "scaffold_xblock")]
sys.modules.setdefault("scaffold_xblock", scaffold_package)

scorebook = importlib.import_module("scaffold_xblock.scorebook")
state = importlib.import_module("scaffold_xblock.state")


def target(target_id, points, is_graded=True):
    return {
        "targetId": target_id,
        "settings": {"points": points, "isGraded": is_graded},
    }


def result(score):
    return {
        "isCorrect": score == 1,
        "score": score,
        "maxScore": 1,
        "feedback": None,
        "items": {},
    }


def problem(score):
    return {
        "submissionResult": result(score),
        "checkResult": None,
    }


class AssessmentGradeProjectionTest(unittest.TestCase):
    def test_canonical_problem_helpers_return_complete_copies_for_command_outcomes(self):
        stored = {
            "target-a": {
                "response": {"kind": "single-select", "optionId": "b"},
                "attemptNumber": 1,
                "hintsShown": 0,
                "checkResult": None,
                "submitted": True,
                "submissionResult": result(1),
            },
        }

        canonical = scorebook.canonical_problem_snapshot(stored, "target-a")
        selected = scorebook.canonical_problems_by_target_id(
            stored,
            ["target-a", "target-missing"],
        )

        self.assertEqual(canonical, stored["target-a"])
        self.assertIsNot(canonical, stored["target-a"])
        self.assertEqual(selected, {"target-a": stored["target-a"]})
        self.assertEqual(
            scorebook.canonical_problem_snapshot({}, "target-missing"),
            {
                "response": None,
                "attemptNumber": 0,
                "hintsShown": 0,
                "checkResult": None,
                "submitted": False,
                "submissionResult": None,
            },
        )

    def test_builds_normalized_projection_before_mapping_xblock_weight(self):
        build_projection = getattr(
            scorebook,
            "build_assessment_grade_projection",
            None,
        )
        map_event = getattr(
            scorebook,
            "map_grade_projection_to_xblock_event",
            None,
        )
        self.assertIsNotNone(build_projection)
        self.assertIsNotNone(map_event)

        projection = build_projection(
            [target("target-a", 2), target("target-b", 3)],
            [],
            {
                "problems": {
                    "target-a": problem(0.5),
                    "target-b": problem(1),
                },
                "quizzes": {},
            },
            "2026-07-17T10:00:00.123Z",
        )

        self.assertEqual(
            projection,
            {
                "normalizedScore": 0.8,
                "activityStatus": "completed",
                "gradingStatus": "graded",
                "changedAt": "2026-07-17T10:00:00.123Z",
            },
        )
        self.assertEqual(
            map_event(projection, 20),
            {"value": 16, "max_value": 20},
        )

    def test_projects_approved_standalone_status_transitions(self):
        build_projection = scorebook.build_assessment_grade_projection
        targets = [target("target-a", 2), target("target-b", 3)]
        changed_at = "2026-07-17T10:00:00.123Z"

        cases = [
            (
                {"problems": {}, "quizzes": {}},
                ("not_started", "not_ready", None),
            ),
            (
                {
                    "problems": {
                        "target-a": {
                            "submissionResult": None,
                            "checkResult": None,
                        },
                    },
                    "quizzes": {},
                },
                ("in_progress", "not_ready", None),
            ),
            (
                {
                    "problems": {"target-a": problem(0.5)},
                    "quizzes": {},
                },
                ("in_progress", "graded", 0.2),
            ),
        ]

        for snapshot, expected in cases:
            with self.subTest(expected=expected):
                projection = build_projection(targets, [], snapshot, changed_at)
                self.assertEqual(
                    (
                        projection["activityStatus"],
                        projection["gradingStatus"],
                        projection["normalizedScore"],
                    ),
                    expected,
                )

    def test_quiz_is_terminal_only_when_attempt_is_completed_or_expired(self):
        targets = [target("target-a", 1)]
        groups = [
            {
                "kind": "quiz",
                "groupId": "quiz-1",
                "targetIds": ["target-a"],
                "settings": {"isGraded": True},
            },
        ]
        changed_at = "2026-07-17T10:00:00.123Z"

        for status, quiz_score, expected_activity, expected_score in [
            ("in_progress", 1, "in_progress", None),
            ("completed", 0.25, "completed", 0.25),
            ("expired", 0.5, "completed", 0.5),
        ]:
            with self.subTest(status=status):
                projection = scorebook.build_assessment_grade_projection(
                    targets,
                    groups,
                    {
                        "problems": {"target-a": problem(1)},
                        "quizzes": {
                            "quiz-1": {
                                "status": status,
                                "score": quiz_score,
                                "resultsByTargetId": {
                                    "target-a": result(quiz_score),
                                },
                            },
                        },
                    },
                    changed_at,
                )
                self.assertEqual(projection["activityStatus"], expected_activity)
                self.assertEqual(projection["normalizedScore"], expected_score)

    def test_quiz_target_ignores_legacy_standalone_problem_result(self):
        projection = scorebook.build_assessment_grade_projection(
            [target("target-a", 1)],
            [
                {
                    "kind": "quiz",
                    "groupId": "quiz-1",
                    "targetIds": ["target-a"],
                    "settings": {"isGraded": True},
                },
            ],
            {
                "problems": {"target-a": problem(1)},
                "quizzes": {},
            },
            "2026-07-17T10:00:00.123Z",
        )

        self.assertIsNone(projection["normalizedScore"])
        self.assertEqual(projection["activityStatus"], "in_progress")
        self.assertEqual(projection["gradingStatus"], "not_ready")

    def test_ungraded_result_produces_no_numeric_grade(self):
        projection = scorebook.build_assessment_grade_projection(
            [target("practice", 5, is_graded=False)],
            [],
            {"problems": {"practice": problem(1)}, "quizzes": {}},
            "2026-07-17T10:00:00.123Z",
        )

        self.assertIsNone(projection["normalizedScore"])
        self.assertEqual(projection["activityStatus"], "completed")
        self.assertEqual(projection["gradingStatus"], "not_ready")
        self.assertIsNone(
            scorebook.map_grade_projection_to_xblock_event(projection, 20),
        )

    def test_all_authored_work_controls_completion_while_only_graded_work_scores(self):
        targets = [target("graded", 2), target("practice", 5, is_graded=False)]
        changed_at = "2026-07-17T10:00:00.123Z"

        in_progress = scorebook.build_assessment_grade_projection(
            targets,
            [],
            {"problems": {"graded": problem(1)}, "quizzes": {}},
            changed_at,
        )
        completed = scorebook.build_assessment_grade_projection(
            targets,
            [],
            {
                "problems": {"graded": problem(1), "practice": problem(0)},
                "quizzes": {},
            },
            changed_at,
        )

        self.assertEqual(in_progress["activityStatus"], "in_progress")
        self.assertEqual(in_progress["normalizedScore"], 1)
        self.assertEqual(completed["activityStatus"], "completed")
        self.assertEqual(completed["normalizedScore"], 1)

    def test_mapping_rejects_invalid_xblock_weight_for_numeric_grade(self):
        projection = {
            "normalizedScore": 0.5,
            "activityStatus": "in_progress",
            "gradingStatus": "graded",
            "changedAt": "2026-07-17T10:00:00.123Z",
        }

        for weight in [0, -1, float("inf"), float("nan"), True, "20"]:
            with self.subTest(weight=weight):
                with self.assertRaisesRegex(ValueError, "positive finite"):
                    scorebook.map_grade_projection_to_xblock_event(projection, weight)

    def test_build_validates_the_contract_owned_projection(self):
        with self.assertRaisesRegex(ValueError, "changedAt"):
            scorebook.build_assessment_grade_projection(
                [],
                [],
                {"problems": {}, "quizzes": {}},
                "not-a-timestamp",
            )

    def test_projection_change_times_advance_strictly(self):
        next_changed_at = getattr(
            state,
            "next_assessment_grade_changed_at",
            None,
        )
        self.assertIsNotNone(next_changed_at)
        now = datetime(2026, 7, 17, 10, 0, 0, 123456, tzinfo=timezone.utc)

        first = next_changed_at("", now)
        second = next_changed_at(first, now)

        self.assertEqual(first, "2026-07-17T10:00:00.123456Z")
        self.assertEqual(second, "2026-07-17T10:00:00.123457Z")


if __name__ == "__main__":
    unittest.main()

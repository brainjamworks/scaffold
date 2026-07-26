import importlib
import sys
import types
import unittest
from copy import deepcopy
from pathlib import Path


ADAPTER_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = ADAPTER_ROOT / "scaffold_xblock"

package = types.ModuleType("scaffold_xblock")
package.__path__ = [str(PACKAGE_ROOT)]
sys.modules.setdefault("scaffold_xblock", package)
if str(ADAPTER_ROOT) not in sys.path:
    sys.path.insert(0, str(ADAPTER_ROOT))

assessment_migrations = importlib.import_module(
    "scaffold_xblock.assessment_migrations",
)
upgrade_assessment_bundle = assessment_migrations.upgrade_assessment_bundle
upgrade_assessment_snapshot = assessment_migrations.upgrade_assessment_snapshot


class AssessmentMigrationTest(unittest.TestCase):
    def test_v1_bundle_upgrades_without_mutating_the_caller(self):
        targets, groups = assessment_definitions(1)
        original = deepcopy((targets, groups))

        upgraded = upgrade_assessment_bundle(targets, groups)

        self.assertEqual((targets, groups), original)
        self.assertEqual(upgraded["assessment_targets"][0]["schemaVersion"], 2)
        self.assertEqual(
            upgraded["assessment_targets"][0]["assessment"]["feedbackByOptionId"],
            {},
        )
        self.assertEqual(upgraded["assessment_groups"][0]["schemaVersion"], 2)
        self.assertIsNone(
            upgraded["assessment_groups"][0]["settings"]["passingScore"],
        )
        self.assertIsNot(upgraded["assessment_targets"][0], targets[0])
        self.assertIsNot(
            upgraded["assessment_groups"][0]["settings"],
            groups[0]["settings"],
        )

    def test_exact_v2_bundle_passes_through_as_a_clone(self):
        targets, groups = assessment_definitions(2, passing_score=0.75)
        original = deepcopy((targets, groups))

        upgraded = upgrade_assessment_bundle(targets, groups)

        self.assertEqual((targets, groups), original)
        self.assertEqual(
            (
                upgraded["assessment_targets"],
                upgraded["assessment_groups"],
            ),
            original,
        )
        self.assertIsNot(upgraded["assessment_targets"][0], targets[0])
        self.assertIsNot(upgraded["assessment_groups"][0], groups[0])

    def test_empty_bundle_passes_through_as_a_clone(self):
        targets = []
        groups = []

        upgraded = upgrade_assessment_bundle(targets, groups)

        self.assertEqual(
            upgraded,
            {"assessment_targets": [], "assessment_groups": []},
        )
        self.assertIsNot(upgraded["assessment_targets"], targets)
        self.assertIsNot(upgraded["assessment_groups"], groups)

    def test_bundle_upgrade_rejects_ambiguous_versions(self):
        v1_targets, v1_groups = assessment_definitions(1)
        v2_targets, v2_groups = assessment_definitions(2)
        future_targets, future_groups = assessment_definitions(3)

        missing_target_version = deepcopy(v1_targets)
        del missing_target_version[0]["schemaVersion"]
        missing_group_version = deepcopy(v1_groups)
        del missing_group_version[0]["schemaVersion"]
        boolean_target_version = deepcopy(v1_targets)
        boolean_target_version[0]["schemaVersion"] = True
        v1_with_passing_score = deepcopy(v1_groups)
        v1_with_passing_score[0]["settings"]["passingScore"] = None

        rejected = {
            "mixed target and group versions": (v1_targets, v2_groups),
            "mixed group and target versions": (v2_targets, v1_groups),
            "future definitions": (future_targets, future_groups),
            "missing target version": (missing_target_version, v1_groups),
            "missing group version": (v1_targets, missing_group_version),
            "boolean target version": (boolean_target_version, v1_groups),
            "v1 group with v2 passing score": (
                v1_targets,
                v1_with_passing_score,
            ),
            "non-object target": (["not-an-object"], v1_groups),
            "non-object group": (v1_targets, ["not-an-object"]),
        }

        for name, (targets, groups) in rejected.items():
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    upgrade_assessment_bundle(targets, groups)

    def test_v1_snapshot_upgrade_preserves_history_without_mutation(self):
        snapshot = assessment_snapshot(1)
        original = deepcopy(snapshot)

        upgraded = upgrade_assessment_snapshot(snapshot)

        self.assertEqual(snapshot, original)
        self.assertEqual(upgraded["snapshotVersion"], 2)
        self.assertEqual(upgraded["artifactId"], "xblock-42")
        self.assertEqual(
            upgraded["quizzes"]["quiz-1"]["finishedAt"],
            "2026-07-20T10:05:00Z",
        )
        self.assertEqual(upgraded["quizzes"]["quiz-1"]["score"], 1.0)
        self.assertEqual(upgraded["quizzes"]["quiz-1"]["maxScore"], 2.0)
        self.assertIsNone(upgraded["quizzes"]["quiz-1"]["successStatus"])
        self.assertIsNone(upgraded["quizzes"]["quiz-2"]["successStatus"])
        self.assertEqual(
            upgraded["problems"]["question-1"]["response"]["optionId"],
            "option-b",
        )
        self.assertEqual(
            upgraded["quizzes"]["quiz-2"]["resultsByTargetId"],
            {},
        )
        self.assertIsNot(upgraded, snapshot)
        self.assertIsNot(
            upgraded["quizzes"]["quiz-1"],
            snapshot["quizzes"]["quiz-1"],
        )

    def test_exact_v2_snapshot_passes_through_as_a_clone(self):
        snapshot = assessment_snapshot(2)
        snapshot["quizzes"]["quiz-1"]["successStatus"] = "passed"
        snapshot["quizzes"]["quiz-2"]["successStatus"] = None
        original = deepcopy(snapshot)

        upgraded = upgrade_assessment_snapshot(snapshot)

        self.assertEqual(snapshot, original)
        self.assertEqual(upgraded, original)
        self.assertIsNot(upgraded, snapshot)
        self.assertIsNot(
            upgraded["quizzes"]["quiz-1"],
            snapshot["quizzes"]["quiz-1"],
        )

    def test_snapshot_upgrade_rejects_ambiguous_versions(self):
        missing_version = assessment_snapshot(1)
        del missing_version["snapshotVersion"]
        boolean_version = assessment_snapshot(1)
        boolean_version["snapshotVersion"] = True
        future_version = assessment_snapshot(3)
        v1_with_success = assessment_snapshot(1)
        v1_with_success["quizzes"]["quiz-1"]["successStatus"] = None

        rejected = {
            "missing version": missing_version,
            "boolean version": boolean_version,
            "future version": future_version,
            "v1 attempt with v2 success status": v1_with_success,
        }

        for name, snapshot in rejected.items():
            with self.subTest(name=name):
                with self.assertRaises(ValueError):
                    upgrade_assessment_snapshot(snapshot)


def assessment_definitions(version, passing_score=None):
    settings = {
        "allowBacktracking": False,
        "reviewTiming": "after_quiz",
        "reviewDetail": "result_only",
        "attemptsPerQuestion": 1,
        "isGraded": True,
        "timer": {"enabled": False, "durationSeconds": 0},
    }
    if version == 2:
        settings["passingScore"] = passing_score

    return (
        [
            {
                "schemaVersion": version,
                "targetId": "question-1",
                "assessment": {"feedbackByOptionId": {}},
            }
        ],
        [
            {
                "schemaVersion": version,
                "kind": "quiz",
                "groupId": "quiz-1",
                "targetIds": ["question-1"],
                "settings": settings,
            }
        ],
    )


def assessment_snapshot(version):
    return {
        "snapshotVersion": version,
        "artifactId": "xblock-42",
        "problems": {
            "question-1": {
                "response": {
                    "kind": "single-select",
                    "optionId": "option-b",
                },
                "submitted": True,
                "attemptNumber": 1,
            }
        },
        "quizzes": {
            "quiz-1": {
                "attemptId": "attempt-complete",
                "status": "completed",
                "currentTargetId": None,
                "submittedTargetIds": ["question-1"],
                "startedAt": "2026-07-20T10:00:00Z",
                "finishedAt": "2026-07-20T10:05:00Z",
                "expiresAt": None,
                "score": 1.0,
                "maxScore": 2.0,
                "resultsByTargetId": {},
                "answerReviewAuthorized": True,
            },
            "quiz-2": {
                "attemptId": "attempt-progress",
                "status": "in_progress",
                "currentTargetId": "question-2",
                "submittedTargetIds": [],
                "startedAt": "2026-07-20T11:00:00Z",
                "finishedAt": None,
                "expiresAt": None,
                "score": None,
                "maxScore": None,
                "resultsByTargetId": {},
                "answerReviewAuthorized": False,
            },
        },
    }


if __name__ == "__main__":
    unittest.main()

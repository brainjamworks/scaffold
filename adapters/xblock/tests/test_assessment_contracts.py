import importlib
import json
import subprocess
import sys
import tarfile
import types
import unittest
import zipfile
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from adapters.xblock.tests.artifact_test_support import (
    copied_artifact_workspace,
    copied_distribution_source,
    packaging_python,
)


ADAPTER_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = ADAPTER_ROOT / "scaffold_xblock"


EMPTY_PROBLEM = {
    "response": None,
    "submitted": False,
    "attemptNumber": 0,
    "hintsShown": 0,
    "checkResult": None,
    "submissionResult": None,
}

LEARNER_SNAPSHOT = {
    "snapshotVersion": 1,
    "artifactId": "artifact-1",
    "problems": {"question-1": EMPTY_PROBLEM},
    "quizzes": {},
}

TARGET = {
    "schemaVersion": 1,
    "targetId": "question-1",
    "blockId": "block-1",
    "blockType": "mcq",
    "interaction": {
        "kind": "single-select",
        "options": [
            {"id": "option-a", "label": "A"},
            {"id": "option-b", "label": "B"},
        ],
    },
    "assessment": {
        "kind": "single-select",
        "correctOptionId": "option-b",
        "feedbackByOptionId": {},
    },
    "settings": {
        "feedbackMode": "on_submit",
        "isGraded": True,
        "showAnswer": True,
        "points": 1,
        "maxAttempts": None,
    },
}

GROUP = {
    "schemaVersion": 1,
    "kind": "quiz",
    "groupId": "quiz-1",
    "targetIds": ["question-1", "question-2"],
    "settings": {
        "allowBacktracking": True,
        "reviewTiming": "after_quiz",
        "reviewDetail": "result_only",
        "attemptsPerQuestion": 1,
        "isGraded": True,
        "timer": {"enabled": False, "durationSeconds": 0},
    },
}

QUIZ_ATTEMPT_SNAPSHOT = {
    "attemptId": "attempt-1",
    "status": "in_progress",
    "currentTargetId": "question-1",
    "submittedTargetIds": [],
    "startedAt": "2026-07-15T12:00:00Z",
    "finishedAt": None,
    "expiresAt": None,
    "score": None,
    "maxScore": None,
    "resultsByTargetId": {},
    "answerReviewAuthorized": False,
}


def load_validation_module(module_name):
    package = types.ModuleType("scaffold_xblock")
    package.__path__ = [str(PACKAGE_ROOT)]
    sys.modules.setdefault("scaffold_xblock", package)
    if str(ADAPTER_ROOT) not in sys.path:
        sys.path.insert(0, str(ADAPTER_ROOT))
    return importlib.import_module("scaffold_xblock.validation.%s" % module_name)


class AssessmentContractResourceTest(unittest.TestCase):
    def test_validation_package_exports_contract_evaluator(self):
        validation = importlib.import_module("scaffold_xblock.validation")

        self.assertTrue(callable(validation.load_assessment_schema))
        self.assertTrue(callable(validation.validate_assessment_definition))

    def test_loads_vendored_schema_and_resolves_named_definition(self):
        json_schema = load_validation_module("json_schema")

        schema = json_schema.load_assessment_schema()
        group = {
            "schemaVersion": 1,
            "kind": "quiz",
            "groupId": "quiz-1",
            "targetIds": ["question-1"],
            "settings": {
                "allowBacktracking": True,
                "reviewTiming": "after_quiz",
                "reviewDetail": "result_only",
                "attemptsPerQuestion": 1,
                "isGraded": True,
                "timer": {"enabled": False, "durationSeconds": 0},
            },
        }

        self.assertEqual(
            schema["$id"],
            "https://scaffold.ac/schemas/assessment.schema.json",
        )
        self.assertEqual(
            json_schema.validate_assessment_definition(
                "AssessmentGroupContract",
                group,
                "assessmentGroups[0]",
            ),
            group,
        )

    def test_rejects_unsupported_schema_keywords_but_not_property_names(self):
        json_schema = load_validation_module("json_schema")
        schema = deepcopy(json_schema.load_assessment_schema())
        schema["definitions"]["UnsupportedKeywordProbe"] = {
            "type": "object",
            "properties": {
                "minLength": {"type": "string"},
                "definitions": {"type": "string"},
            },
            "minLength": 1,
        }

        with patch.object(json_schema, "load_assessment_schema", return_value=schema):
            with self.assertRaisesRegex(
                json_schema.UnsupportedJsonSchemaKeywordError,
                r"definitions\.UnsupportedKeywordProbe\.minLength",
            ):
                json_schema.validate_assessment_definition(
                    "UnsupportedKeywordProbe",
                    {"minLength": "value", "definitions": "value"},
                )

    def test_python_distributions_install_schema_and_corpus_resources(self):
        expected = {
            "scaffold_xblock/validation/schemas/assessment.schema.json",
            "scaffold_xblock/validation/fixtures/assessment-grading.json",
        }
        with copied_distribution_source() as source:
            distribution = source / "dist"
            subprocess.run(
                [
                    packaging_python(),
                    "setup.py",
                    "sdist",
                    "bdist_wheel",
                    "--dist-dir",
                    str(distribution),
                ],
                cwd=source,
                check=True,
                capture_output=True,
                text=True,
            )
            wheel = next(distribution.glob("*.whl"))
            source_distribution = next(distribution.glob("*.tar.gz"))
            with zipfile.ZipFile(wheel) as archive:
                self.assertTrue(expected.issubset(archive.namelist()))
            with tarfile.open(source_distribution) as archive:
                names = {name.split("/", 1)[-1] for name in archive.getnames()}
                self.assertTrue(expected.issubset(names))
            resource_probe = """
import importlib
import importlib.resources
import json
import sys
import types
from pathlib import Path
package = types.ModuleType('scaffold_xblock')
package.__path__ = [str(Path(sys.argv[1]) / 'scaffold_xblock')]
sys.modules['scaffold_xblock'] = package
validation = importlib.import_module('scaffold_xblock.validation')
resources = importlib.resources.files(validation)
json.loads(resources.joinpath('schemas/assessment.schema.json').read_text())
json.loads(resources.joinpath('fixtures/assessment-grading.json').read_text())
"""
            for archive in (wheel, source_distribution):
                installed = source / ("installed-" + archive.name.split(".", 1)[0])
                subprocess.run(
                    [
                        packaging_python(),
                        "-m",
                        "pip",
                        "install",
                        "--no-deps",
                        "--no-build-isolation",
                        "--target",
                        str(installed),
                        str(archive),
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                subprocess.run(
                    [packaging_python(), "-c", resource_probe, str(installed)],
                    check=True,
                    capture_output=True,
                    text=True,
                )


class AssessmentArtifactSyncTest(unittest.TestCase):
    def test_adapter_exposes_deterministic_sync_and_check_commands(self):
        package_json = json.loads((ADAPTER_ROOT / "package.json").read_text())

        self.assertEqual(
            package_json["scripts"]["sync:assessment-artifacts"],
            "node scripts/sync-assessment-artifacts.mjs",
        )
        self.assertEqual(
            package_json["scripts"]["check:assessment-artifacts"],
            "node scripts/sync-assessment-artifacts.mjs --check",
        )

    def test_check_detects_divergent_vendor_bytes(self):
        with copied_artifact_workspace() as adapter_root:
            vendor_path = (
                adapter_root
                / "scaffold_xblock/validation/schemas/assessment.schema.json"
            )
            original_bytes = vendor_path.read_bytes()
            vendor_path.write_bytes(original_bytes + b" ")
            result = subprocess.run(
                ["node", "scripts/sync-assessment-artifacts.mjs", "--check"],
                cwd=adapter_root,
                capture_output=True,
                check=False,
                text=True,
            )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("has drifted", result.stderr)


class AssessmentContractSemanticTest(unittest.TestCase):
    def test_accepts_the_four_xblock_boundary_definitions(self):
        json_schema = load_validation_module("json_schema")
        cases = [
            ("AssessmentTargetContract", TARGET),
            ("AssessmentGroupContract", GROUP),
            ("AssessmentLearnerSnapshot", LEARNER_SNAPSHOT),
            (
                "AssessmentGradeProjection",
                {
                    "normalizedScore": 0.75,
                    "activityStatus": "completed",
                    "gradingStatus": "graded",
                    "changedAt": "2026-07-15T10:00:00.123Z",
                },
            ),
        ]

        for definition_name, value in cases:
            with self.subTest(definition_name=definition_name):
                self.assertIs(
                    json_schema.validate_assessment_definition(
                        definition_name,
                        value,
                    ),
                    value,
                )

    def test_rejects_the_portable_contract_invariant_corpus(self):
        json_schema = load_validation_module("json_schema")
        mismatched_target = deepcopy(TARGET)
        mismatched_target["assessment"] = {
            "kind": "multi-select",
            "correctOptionIds": ["option-a"],
            "feedbackByOptionId": {},
        }
        blank_target = {**deepcopy(TARGET), "targetId": "   "}
        target_with_removed_setting = deepcopy(TARGET)
        target_with_removed_setting["settings"]["".join(("is", "Required"))] = True
        target_with_unknown_field = {**deepcopy(TARGET), "hostMaximum": 100}
        interaction_with_unknown_field = deepcopy(TARGET)
        interaction_with_unknown_field["interaction"]["provider"] = "host"
        option_with_unknown_field = deepcopy(TARGET)
        option_with_unknown_field["interaction"]["options"][0]["providerPayload"] = {}
        answer_key_with_unknown_field = deepcopy(TARGET)
        answer_key_with_unknown_field["assessment"]["hostItemId"] = "item-1"
        duplicate_group = {**deepcopy(GROUP), "targetIds": ["question-1"] * 2}
        invalid_grade = {
            "normalizedScore": None,
            "activityStatus": "completed",
            "gradingStatus": "graded",
            "changedAt": "2026-07-15T10:00:00.123Z",
        }
        mismatched_quiz_score = {
            **deepcopy(QUIZ_ATTEMPT_SNAPSHOT),
            "score": None,
            "maxScore": 1,
        }
        duplicate_submitted_ids = {
            **deepcopy(QUIZ_ATTEMPT_SNAPSHOT),
            "submittedTargetIds": ["question-1", "question-1"],
        }
        submitted_without_result = {**deepcopy(EMPTY_PROBLEM), "submitted": True}
        blank_problem_key = deepcopy(LEARNER_SNAPSHOT)
        blank_problem_key["problems"] = {"   ": deepcopy(EMPTY_PROBLEM)}
        quiz_with_identity = deepcopy(LEARNER_SNAPSHOT)
        quiz_with_identity["quizzes"] = {
            "quiz-1": {**deepcopy(QUIZ_ATTEMPT_SNAPSHOT), "groupId": "quiz-1"},
        }
        cases = [
            ("AssessmentTargetContract", mismatched_target),
            ("AssessmentTargetContract", blank_target),
            ("AssessmentTargetContract", target_with_removed_setting),
            ("AssessmentTargetContract", target_with_unknown_field),
            ("AssessmentTargetContract", interaction_with_unknown_field),
            ("AssessmentTargetContract", option_with_unknown_field),
            ("AssessmentTargetContract", answer_key_with_unknown_field),
            ("AssessmentGroupContract", duplicate_group),
            ("AssessmentGradeProjection", invalid_grade),
            ("QuizAttemptSnapshot", mismatched_quiz_score),
            ("QuizAttemptSnapshot", duplicate_submitted_ids),
            ("AssessmentProblemSnapshot", submitted_without_result),
            ("AssessmentLearnerSnapshot", blank_problem_key),
            ("AssessmentLearnerSnapshot", quiz_with_identity),
        ]

        for definition_name, value in cases:
            with self.subTest(definition_name=definition_name, value=value):
                with self.assertRaises(json_schema.JsonSchemaValidationError):
                    json_schema.validate_assessment_definition(definition_name, value)

    def test_rejects_noncanonical_problem_keys_with_the_property_path(self):
        json_schema = load_validation_module("json_schema")
        snapshot = deepcopy(LEARNER_SNAPSHOT)
        snapshot["problems"] = {
            "artifact:artifact-1/block:question-1": deepcopy(EMPTY_PROBLEM),
        }

        with self.assertRaisesRegex(
            json_schema.JsonSchemaValidationError,
            r"assessmentSnapshot\.problems\.artifact:artifact-1/block:question-1",
        ):
            json_schema.validate_assessment_definition(
                "AssessmentLearnerSnapshot",
                snapshot,
                "assessmentSnapshot",
            )

    def test_rejects_invalid_rfc3339_instants_with_the_field_path(self):
        json_schema = load_validation_module("json_schema")
        projection = {
            "normalizedScore": 0.75,
            "activityStatus": "completed",
            "gradingStatus": "graded",
            "changedAt": "2026-99-99T25:61:61.123Z",
        }

        with self.assertRaisesRegex(
            json_schema.JsonSchemaValidationError,
            r"gradeProjection\.changedAt",
        ):
            json_schema.validate_assessment_definition(
                "AssessmentGradeProjection",
                projection,
                "gradeProjection",
            )


class XBlockAssessmentInvariantTest(unittest.TestCase):
    def test_target_validator_executes_the_vendored_nested_contract(self):
        assessment_targets = load_validation_module("assessment_targets")
        invalid_target = deepcopy(TARGET)
        invalid_target["interaction"]["options"][0] = {"label": "A"}

        with self.assertRaisesRegex(
            assessment_targets.AssessmentTargetValidationError,
            r"assessmentTargets\[0\]\.interaction\.options\[0\]\.id",
        ):
            assessment_targets.validate_assessment_targets([invalid_target])

    def test_group_validator_executes_the_vendored_settings_contract(self):
        assessment_groups = load_validation_module("assessment_groups")
        invalid_group = deepcopy(GROUP)
        invalid_group["targetIds"] = ["question-1"]
        invalid_group["settings"]["provider"] = "xblock"

        with self.assertRaisesRegex(
            assessment_groups.AssessmentGroupValidationError,
            r"assessmentGroups\[0\]\.settings\.provider",
        ):
            assessment_groups.validate_assessment_groups(
                [invalid_group],
                [TARGET],
            )

    def test_target_ids_are_unique_across_the_xblock_save_bundle(self):
        assessment_targets = load_validation_module("assessment_targets")

        with self.assertRaisesRegex(
            assessment_targets.AssessmentTargetValidationError,
            r"assessmentTargets\[1\]\.targetId must be unique",
        ):
            assessment_targets.validate_assessment_targets(
                [deepcopy(TARGET), deepcopy(TARGET)],
            )

    def test_group_members_must_reference_targets_in_the_xblock_save_bundle(self):
        assessment_groups = load_validation_module("assessment_groups")
        group = {**deepcopy(GROUP), "targetIds": ["question-1", "missing"]}

        with self.assertRaisesRegex(
            assessment_groups.AssessmentGroupValidationError,
            (
                r"assessmentGroups\[0\]\.targetIds\[1\] must reference "
                r"an assessment target"
            ),
        ):
            assessment_groups.validate_assessment_groups([group], [TARGET])


if __name__ == "__main__":
    unittest.main()

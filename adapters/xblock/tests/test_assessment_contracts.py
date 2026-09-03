import importlib
import importlib.resources
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


def score_conformance_fixture():
    validation = importlib.import_module("scaffold_xblock.validation")
    resource = importlib.resources.files(validation).joinpath(
        "fixtures/score-transport-conformance.json"
    )
    return json.loads(resource.read_text(encoding="utf-8"))


def spatial_placement_contract_case():
    validation = importlib.import_module("scaffold_xblock.validation")
    resource = importlib.resources.files(validation).joinpath(
        "fixtures/assessment-grading.json"
    )
    corpus = json.loads(resource.read_text(encoding="utf-8"))
    case = next(
        case
        for case in corpus["cases"]
        if case["id"] == "spatial-placement-partial-credit-fully-correct"
    )
    return deepcopy(case["target"]), deepcopy(case["response"])


EMPTY_PROBLEM = {
    "response": None,
    "submitted": False,
    "attemptNumber": 0,
    "hintsShown": 0,
    "checkResult": None,
    "submissionResult": None,
}

LEARNER_SNAPSHOT = {
    "snapshotVersion": 2,
    "artifactId": "artifact-1",
    "problems": {"target_00001": EMPTY_PROBLEM},
    "quizzes": {},
}

TARGET = {
    "schemaVersion": 2,
    "targetId": "target_00001",
    "blockId": "block_000001",
    "blockType": "mcq",
    "interaction": {
        "kind": "single-select",
        "options": [
            {"id": "option_00001", "label": "A"},
            {"id": "option_00002", "label": "B"},
        ],
    },
    "assessment": {
        "kind": "single-select",
        "correctOptionId": "option_00002",
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
    "schemaVersion": 2,
    "kind": "quiz",
    "groupId": "quiz__000001",
    "targetIds": ["target_00001", "target_00002"],
    "settings": {
        "allowBacktracking": True,
        "reviewTiming": "after_quiz",
        "reviewDetail": "result_only",
        "attemptsPerQuestion": 1,
        "isGraded": True,
        "passingScore": None,
        "timer": {"enabled": False, "durationSeconds": 0},
    },
}

QUIZ_ATTEMPT_SNAPSHOT = {
    "attemptId": "attempt-1",
    "status": "in_progress",
    "currentTargetId": "target_00001",
    "submittedTargetIds": [],
    "startedAt": "2026-07-15T12:00:00Z",
    "finishedAt": None,
    "expiresAt": None,
    "score": None,
    "successStatus": None,
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


def replace_refs(value, old, new):
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "$ref" and isinstance(child, str):
                value[key] = child.replace(old, new)
            else:
                replace_refs(child, old, new)
    elif isinstance(value, list):
        for child in value:
            replace_refs(child, old, new)


class AssessmentContractResourceTest(unittest.TestCase):
    def test_validation_package_exports_contract_evaluator(self):
        validation = importlib.import_module("scaffold_xblock.validation")

        self.assertTrue(callable(validation.load_assessment_schema))
        self.assertTrue(callable(validation.validate_assessment_definition))

    def test_loads_vendored_schema_and_resolves_named_definition(self):
        json_schema = load_validation_module("json_schema")

        schema = json_schema.load_assessment_schema()
        group = {
            "schemaVersion": 2,
            "kind": "quiz",
            "groupId": "quiz__000001",
            "targetIds": ["target_00001"],
            "settings": {
                "allowBacktracking": True,
                "reviewTiming": "after_quiz",
                "reviewDetail": "result_only",
                "attemptsPerQuestion": 1,
                "isGraded": True,
                "passingScore": None,
                "timer": {"enabled": False, "durationSeconds": 0},
            },
        }

        self.assertEqual(
            schema["$id"],
            "https://scaffold.ac/schemas/assessment.schema.json",
        )
        self.assertEqual(
            schema["x-scaffold-semantics"],
            ["score-v1", "spatial-placement-v1"],
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
                "maxLength": {"type": "string"},
                "definitions": {"type": "string"},
            },
            "maxLength": 1,
        }

        with patch.object(json_schema, "load_assessment_schema", return_value=schema):
            with self.assertRaisesRegex(
                json_schema.UnsupportedJsonSchemaKeywordError,
                r"definitions\.UnsupportedKeywordProbe\.maxLength",
            ):
                json_schema.validate_assessment_definition(
                    "UnsupportedKeywordProbe",
                    {"maxLength": "value", "definitions": "value"},
                )

    def test_enforces_minimum_string_length(self):
        json_schema = load_validation_module("json_schema")
        schema = {
            "definitions": {
                "Label": {"type": "string", "minLength": 2},
                "UntypedValue": {"minLength": 2},
            }
        }

        self.assertEqual(
            json_schema.validate_schema_definition(schema, "Label", "ab"),
            "ab",
        )
        self.assertEqual(
            json_schema.validate_schema_definition(schema, "UntypedValue", 1),
            1,
        )
        with self.assertRaisesRegex(
            json_schema.JsonSchemaValidationError,
            r"marker\.label must contain at least 2 characters",
        ):
            json_schema.validate_schema_definition(
                schema,
                "Label",
                "a",
                "marker.label",
            )

    def test_rejects_invalid_minimum_string_length_schemas(self):
        json_schema = load_validation_module("json_schema")

        for minimum_length in (-1, True, 1.5, "2"):
            with self.subTest(minimum_length=minimum_length):
                schema = {
                    "definitions": {
                        "Label": {"type": "string", "minLength": minimum_length}
                    }
                }
                with self.assertRaises(json_schema.JsonSchemaValidationError):
                    json_schema.validate_schema_definition(schema, "Label", "value")

    def test_python_distributions_install_schema_and_corpus_resources(self):
        expected = {
            "scaffold_xblock/validation/schemas/assessment.schema.json",
            "scaffold_xblock/validation/fixtures/assessment-grading.json",
            "scaffold_xblock/validation/fixtures/score-transport-conformance.json",
        }
        with copied_distribution_source() as source:
            distribution = source / "dist"
            subprocess.run(
                [
                    packaging_python(),
                    "-m",
                    "build",
                    "--outdir",
                    str(distribution),
                    ".",
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
json.loads(resources.joinpath('fixtures/score-transport-conformance.json').read_text())
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
    def test_spatial_placement_semantics_reject_malformed_portable_graphs(self):
        json_schema = load_validation_module("json_schema")
        target, response = spatial_placement_contract_case()

        duplicate_markers = deepcopy(target)
        duplicate_markers["interaction"]["markers"][1]["id"] = duplicate_markers[
            "interaction"
        ]["markers"][0]["id"]
        missing_answer = deepcopy(target)
        missing_answer["assessment"]["correctPlacements"].pop()
        missing_aspect = deepcopy(target)
        missing_aspect["assessment"]["imageAspectRatio"] = None
        dangling_feedback = deepcopy(target)
        dangling_feedback["assessment"]["feedbackByMarkerId"]["marker_99999"] = {
            "kind": "rich-text",
            "document": {"type": "doc", "content": []},
        }
        blank_label = deepcopy(target)
        blank_label["interaction"]["markers"][0]["label"] = "   "
        duplicate_response = deepcopy(response)
        duplicate_response["placements"][1]["markerId"] = duplicate_response[
            "placements"
        ][0]["markerId"]
        invalid_reveal = {
            "answerKey": {
                **deepcopy(target["assessment"]),
                "imageAspectRatio": None,
            }
        }

        cases = [
            ("AssessmentTargetContract", value)
            for value in (
                duplicate_markers,
                missing_answer,
                missing_aspect,
                dangling_feedback,
                blank_label,
            )
        ] + [
            ("AssessmentResponseValue", duplicate_response),
            ("AnswerReveal", invalid_reveal),
        ]
        for definition_name, value in cases:
            with self.subTest(definition=definition_name, value=value):
                with self.assertRaises(json_schema.JsonSchemaValidationError):
                    json_schema.validate_assessment_definition(definition_name, value)

    def test_shared_score_transport_corpus_matches_root_and_nested_boundaries(self):
        json_schema = load_validation_module("json_schema")
        fixture = score_conformance_fixture()

        for case in fixture["transportCases"]:
            score = json.loads(case["json"])
            result = {
                "isCorrect": True,
                "score": score,
                "feedback": None,
                "items": {},
            }
            for definition_name, value in (
                ("Score", score),
                ("AssessmentResult", result),
            ):
                with self.subTest(case=case["name"], definition=definition_name):
                    try:
                        json_schema.validate_assessment_definition(
                            definition_name,
                            value,
                        )
                        actual = True
                    except json_schema.JsonSchemaValidationError:
                        actual = False
                    self.assertEqual(actual, case["valid"])

        programmatic_values = {
            "nan": float("nan"),
            "positiveInfinity": float("inf"),
            "negativeInfinity": float("-inf"),
        }
        for case in fixture["programmaticCases"]:
            score = {"scaled": 0.5, "raw": 1, "min": 0, "max": 2}
            score[case["field"]] = programmatic_values[case["value"]]
            with self.subTest(case=case["name"]):
                with self.assertRaises(json_schema.JsonSchemaValidationError):
                    json_schema.validate_assessment_definition("Score", score)

    def test_score_semantics_are_name_independent(self):
        json_schema = load_validation_module("json_schema")
        schema = deepcopy(json_schema.load_assessment_schema())
        schema["x-scaffold-semantics"] = ["score-v1", "spatial-placement-v1"]
        schema["definitions"]["CanonicalScore"] = schema["definitions"].pop(
            "Score"
        )
        replace_refs(
            schema,
            "#/definitions/Score",
            "#/definitions/CanonicalScore",
        )

        valid = {"scaled": 0.5, "raw": 1, "min": 0, "max": 2}
        invalid = {"scaled": 0.5, "raw": 1, "min": 1, "max": 1}
        self.assertIs(
            json_schema.validate_schema_definition(schema, "CanonicalScore", valid),
            valid,
        )
        with self.assertRaises(json_schema.JsonSchemaValidationError):
            json_schema.validate_schema_definition(schema, "CanonicalScore", invalid)
        result = {
            "isCorrect": True,
            "score": invalid,
            "feedback": None,
            "items": {},
        }
        with self.assertRaises(json_schema.JsonSchemaValidationError):
            json_schema.validate_schema_definition(schema, "AssessmentResult", result)

        unmarked = deepcopy(schema)
        unmarked["definitions"]["CanonicalScore"].pop("x-scaffold-semantic")
        with self.assertRaises(json_schema.JsonSchemaValidationError):
            json_schema.validate_schema_definition(
                unmarked,
                "CanonicalScore",
                valid,
            )

        generic = {
            "definitions": {
                "Score": {"type": "string"},
                "Other": {"type": "integer"},
            }
        }
        self.assertEqual(
            json_schema.validate_schema_definition(generic, "Score", "ordinary"),
            "ordinary",
        )
        self.assertEqual(
            json_schema.validate_schema_definition(generic, "Other", 1),
            1,
        )

    def test_rejects_invalid_semantic_protocols(self):
        json_schema = load_validation_module("json_schema")
        invalid_schemas = [
            {
                "definitions": {
                    "Probe": {
                        "type": "object",
                        "x-scaffold-semantic": "score-v1",
                    }
                }
            },
            {"x-scaffold-semantics": None, "definitions": {"Probe": {"type": "object"}}},
            {"x-scaffold-semantics": "score-v1", "definitions": {"Probe": {"type": "object"}}},
            {"x-scaffold-semantics": [], "definitions": {"Probe": {"type": "object"}}},
            {
                "x-scaffold-semantics": ["score-v1", "score-v1"],
                "definitions": {"Probe": {"type": "object"}},
            },
            {"x-scaffold-semantics": ["score-v2"], "definitions": {"Probe": {"type": "object"}}},
            {"x-scaffold-semantics": ["score-v1"], "definitions": {"Probe": {"type": "object"}}},
            {
                "x-scaffold-semantics": ["score-v1"],
                "definitions": {"Probe": {"type": "object", "x-scaffold-semantic": 1}},
            },
            {
                "x-scaffold-semantics": ["score-v1"],
                "definitions": {
                    "Probe": {"type": "object", "x-scaffold-semantic": "score-v2"}
                },
            },
            {
                "x-scaffold-semantics": ["score-v1"],
                "x-scaffold-semantic": "score-v1",
                "definitions": {"Probe": {"type": "object"}},
            },
        ]

        for schema in invalid_schemas:
            with self.subTest(schema=schema):
                with self.assertRaises(json_schema.JsonSchemaValidationError):
                    json_schema.validate_schema_definition(
                        schema,
                        "Probe",
                        {},
                    )

    def test_score_semantics_execute_in_branches_and_through_refs(self):
        json_schema = load_validation_module("json_schema")
        schema = {
            "x-scaffold-semantics": ["score-v1"],
            "definitions": {
                "Shape": {"type": "object"},
                "AdjacentRef": {
                    "$ref": "#/definitions/Shape",
                    "x-scaffold-semantic": "score-v1",
                },
                "BehindRef": {"$ref": "#/definitions/AdjacentRef"},
                "Branch": {
                    "oneOf": [
                        {"type": "null"},
                        {
                            "$ref": "#/definitions/Shape",
                            "x-scaffold-semantic": "score-v1",
                        },
                    ]
                },
            },
        }
        valid = {"scaled": 0.5, "raw": 1, "min": 0, "max": 2}
        invalid = {"scaled": 0.5, "raw": 1, "min": 1, "max": 1}

        for definition_name in ("AdjacentRef", "BehindRef", "Branch"):
            with self.subTest(definition=definition_name):
                self.assertIs(
                    json_schema.validate_schema_definition(
                        schema,
                        definition_name,
                        valid,
                    ),
                    valid,
                )
                with self.assertRaises(json_schema.JsonSchemaValidationError):
                    json_schema.validate_schema_definition(
                        schema,
                        definition_name,
                        invalid,
                    )

    def test_score_boundary_accepts_only_the_canonical_shapes(self):
        json_schema = load_validation_module("json_schema")
        for score in (
            {"scaled": 0.25},
            {"scaled": 0.5, "raw": 1, "min": 0, "max": 2},
        ):
            with self.subTest(score=score):
                json_schema.validate_assessment_definition("Score", score)

        for score in (
            {},
            {"scaled": -0.1},
            {"scaled": 1.1},
            {"scaled": 0.5, "raw": 1, "min": 0},
            {"scaled": 0.5, "raw": 0.5, "min": 0, "max": 1},
            {"scaled": 0.5, "raw": 3, "min": 0, "max": 2},
            {"scaled": 0.5, "raw": 1, "min": 2, "max": 2},
        ):
            with self.subTest(score=score):
                with self.assertRaises(json_schema.JsonSchemaValidationError):
                    json_schema.validate_assessment_definition("Score", score)

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

    def test_requires_quiz_success_fields(self):
        json_schema = load_validation_module("json_schema")
        missing_passing_score = deepcopy(GROUP)
        del missing_passing_score["settings"]["passingScore"]
        missing_success_status = deepcopy(LEARNER_SNAPSHOT)
        attempt = deepcopy(QUIZ_ATTEMPT_SNAPSHOT)
        del attempt["successStatus"]
        missing_success_status["quizzes"] = {"quiz__000001": attempt}

        for definition_name, value in [
            ("AssessmentGroupContract", missing_passing_score),
            ("AssessmentLearnerSnapshot", missing_success_status),
        ]:
            with self.subTest(definition_name=definition_name, value=value):
                with self.assertRaises(json_schema.JsonSchemaValidationError):
                    json_schema.validate_assessment_definition(definition_name, value)

    def test_rejects_the_portable_contract_invariant_corpus(self):
        json_schema = load_validation_module("json_schema")
        mismatched_target = deepcopy(TARGET)
        mismatched_target["assessment"] = {
            "kind": "multi-select",
            "correctOptionIds": ["option_00001"],
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
        duplicate_group = {**deepcopy(GROUP), "targetIds": ["target_00001"] * 2}
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
            "submittedTargetIds": ["target_00001", "target_00001"],
        }
        submitted_without_result = {**deepcopy(EMPTY_PROBLEM), "submitted": True}
        blank_problem_key = deepcopy(LEARNER_SNAPSHOT)
        blank_problem_key["problems"] = {"   ": deepcopy(EMPTY_PROBLEM)}
        quiz_with_identity = deepcopy(LEARNER_SNAPSHOT)
        quiz_with_identity["quizzes"] = {
            "quiz__000001": {**deepcopy(QUIZ_ATTEMPT_SNAPSHOT), "groupId": "quiz__000001"},
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
            "artifact:artifact-1/block:target_00001": deepcopy(EMPTY_PROBLEM),
        }

        with self.assertRaisesRegex(
            json_schema.JsonSchemaValidationError,
            r"assessmentSnapshot\.problems\.artifact:artifact-1/block:target_00001",
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
        invalid_group["targetIds"] = ["target_00001"]
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
        group = {**deepcopy(GROUP), "targetIds": ["target_00001", "target_99999"]}

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

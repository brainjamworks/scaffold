import ast
import importlib
import json
import subprocess
import sys
import types
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch


ADAPTER_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = ADAPTER_ROOT.parents[1]
PACKAGE_ROOT = ADAPTER_ROOT / "scaffold_xblock"
SOURCE_SCHEMA = (
    REPOSITORY_ROOT
    / "packages"
    / "contracts"
    / "generated"
    / "learner-activity.schema.json"
)
VENDORED_SCHEMA = (
    PACKAGE_ROOT / "validation" / "schemas" / "learner-activity.schema.json"
)

RECORD = {
    "activityKind": "checklist",
    "data": {"checkedItemIds": ["item-1"], "nested": {"count": 1}},
    "completed": False,
    "updatedAt": "2026-07-17T10:15:30+00:00",
}

SNAPSHOT = {
    "snapshotVersion": 1,
    "artifactId": "artifact-1",
    "activities": {"block-1": RECORD},
}

PORTABLE_UPDATED_AT_VALUES = [
    "0001-01-01T00:00:00Z",
    "9999-12-31T23:59:59.123456Z",
    "2024-02-29T23:59:59+23:59",
    "2026-07-16T00:00:00-00:00",
]

NON_PORTABLE_UPDATED_AT_VALUES = [
    "0000-01-01T00:00:00Z",
    "10000-01-01T00:00:00Z",
    "2026-01-01t00:00:00Z",
    "2026-01-01 00:00:00Z",
    "2026-01-01T00:00:00z",
    "2026-01-01T23:59:60Z",
    "2026-01-01T00:00:00+2400",
    "2026-01-01T00:00:00+24:00",
    "2026-01-01T00:00:00+00:60",
    "2025-02-29T00:00:00Z",
    "2026-04-31T00:00:00Z",
]


def load_validation_module(module_name):
    package = types.ModuleType("scaffold_xblock")
    package.__path__ = [str(PACKAGE_ROOT)]
    sys.modules.setdefault("scaffold_xblock", package)
    if str(ADAPTER_ROOT) not in sys.path:
        sys.path.insert(0, str(ADAPTER_ROOT))
    return importlib.import_module("scaffold_xblock.validation.%s" % module_name)


class LearnerActivityArtifactSyncTest(unittest.TestCase):
    def test_vendored_schema_is_byte_identical_to_contracts(self):
        self.assertEqual(VENDORED_SCHEMA.read_bytes(), SOURCE_SCHEMA.read_bytes())

    def test_adapter_exposes_dedicated_sync_and_check_commands(self):
        package_json = json.loads((ADAPTER_ROOT / "package.json").read_text())

        self.assertEqual(
            package_json["scripts"]["sync:learner-activity-artifact"],
            "node scripts/sync-learner-activity-artifact.mjs",
        )
        self.assertEqual(
            package_json["scripts"]["check:learner-activity-artifact"],
            "node scripts/sync-learner-activity-artifact.mjs --check",
        )

    def test_check_detects_divergent_vendor_bytes(self):
        original_bytes = VENDORED_SCHEMA.read_bytes()
        try:
            VENDORED_SCHEMA.write_bytes(original_bytes + b" ")
            result = subprocess.run(
                ["node", "scripts/sync-learner-activity-artifact.mjs", "--check"],
                cwd=ADAPTER_ROOT,
                capture_output=True,
                check=False,
                text=True,
            )
        finally:
            VENDORED_SCHEMA.write_bytes(original_bytes)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("has drifted", result.stderr)


class LearnerActivityContractResourceTest(unittest.TestCase):
    def test_loads_vendored_schema_and_resolves_stable_definitions(self):
        learner_activity = load_validation_module("learner_activity")

        schema = learner_activity.load_learner_activity_schema()

        self.assertEqual(
            schema["$id"],
            "https://scaffold.ac/schemas/learner-activity.schema.json",
        )
        self.assertIs(
            learner_activity.validate_learner_activity_definition(
                "LearnerActivitySnapshot",
                SNAPSHOT,
                "learnerActivitySnapshot",
            ),
            SNAPSHOT,
        )

    def test_rejects_unsupported_keywords_through_the_generic_traversal(self):
        json_schema = load_validation_module("json_schema")
        learner_activity = load_validation_module("learner_activity")
        schema = deepcopy(learner_activity.load_learner_activity_schema())
        schema["definitions"]["LearnerActivityRecord"]["minProperties"] = 1

        with patch.object(
            learner_activity,
            "load_learner_activity_schema",
            return_value=schema,
        ):
            with self.assertRaisesRegex(
                json_schema.UnsupportedJsonSchemaKeywordError,
                r"definitions\.LearnerActivityRecord\.minProperties",
            ):
                learner_activity.validate_learner_activity_definition(
                    "LearnerActivityRecord",
                    RECORD,
                )

    def test_python_distributions_include_the_schema_resource(self):
        setup_tree = ast.parse((ADAPTER_ROOT / "setup.py").read_text())
        setup_call = next(
            node
            for node in ast.walk(setup_tree)
            if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "setup"
        )
        package_data_node = next(
            keyword.value for keyword in setup_call.keywords if keyword.arg == "package_data"
        )
        package_data = ast.literal_eval(package_data_node)

        self.assertIn(
            "validation/schemas/*.json",
            package_data["scaffold_xblock"],
        )
        self.assertIn(
            "recursive-include scaffold_xblock/validation/schemas *.json",
            (ADAPTER_ROOT / "MANIFEST.in").read_text().splitlines(),
        )


class LearnerActivityContractSemanticTest(unittest.TestCase):
    def test_accepts_canonical_snapshot_and_record_values(self):
        learner_activity = load_validation_module("learner_activity")

        self.assertIs(
            learner_activity.validate_learner_activity_definition(
                "LearnerActivityRecord",
                RECORD,
            ),
            RECORD,
        )
        self.assertIs(
            learner_activity.validate_learner_activity_definition(
                "LearnerActivitySnapshot",
                SNAPSHOT,
            ),
            SNAPSHOT,
        )

    def test_timestamp_subset_matches_the_contract_boundary(self):
        json_schema = load_validation_module("json_schema")
        learner_activity = load_validation_module("learner_activity")

        for updated_at in PORTABLE_UPDATED_AT_VALUES:
            with self.subTest(updated_at=updated_at, accepted=True):
                record = {**deepcopy(RECORD), "updatedAt": updated_at}
                self.assertIs(
                    learner_activity.validate_learner_activity_definition(
                        "LearnerActivityRecord",
                        record,
                    ),
                    record,
                )

        for updated_at in NON_PORTABLE_UPDATED_AT_VALUES:
            with self.subTest(updated_at=updated_at, accepted=False):
                with self.assertRaises(json_schema.JsonSchemaValidationError):
                    learner_activity.validate_learner_activity_definition(
                        "LearnerActivityRecord",
                        {**deepcopy(RECORD), "updatedAt": updated_at},
                    )

    def test_rejects_invalid_contract_values_without_sanitizing(self):
        json_schema = load_validation_module("json_schema")
        learner_activity = load_validation_module("learner_activity")
        invalid_values = [
            (
                "LearnerActivityRecord",
                {**deepcopy(RECORD), "updatedAt": "2026-07-17T10:15:30"},
            ),
            ("LearnerActivityRecord", {**deepcopy(RECORD), "score": 1}),
            (
                "LearnerActivitySnapshot",
                {**deepcopy(SNAPSHOT), "snapshotVersion": 2},
            ),
            (
                "LearnerActivitySnapshot",
                {
                    **deepcopy(SNAPSHOT),
                    "activities": {
                        "artifact:artifact-1/block:block-1": deepcopy(RECORD),
                    },
                },
            ),
            (
                "LearnerActivityRecord",
                {**deepcopy(RECORD), "data": {"value": float("inf")}},
            ),
        ]

        for definition_name, value in invalid_values:
            with self.subTest(definition_name=definition_name, value=value):
                with self.assertRaises(json_schema.JsonSchemaValidationError):
                    learner_activity.validate_learner_activity_definition(
                        definition_name,
                        value,
                    )


if __name__ == "__main__":
    unittest.main()

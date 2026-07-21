import importlib
import json
import sys
import types
import unittest
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path


ADAPTER_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = ADAPTER_ROOT / "scaffold_xblock"

EXISTING_RECORD = {
    "activityKind": "flashcard",
    "data": {"side": "back"},
    "completed": True,
    "updatedAt": "2026-07-16T08:00:00+00:00",
}

SNAPSHOT = {
    "snapshotVersion": 1,
    "artifactId": "artifact-1",
    "activities": {"block-existing": EXISTING_RECORD},
}

SAVE_REQUEST = {
    "artifactId": "artifact-1",
    "blockId": "block-new",
    "record": {
        "activityKind": "checklist",
        "data": {"checkedItemIds": ["item-1"]},
        "completed": False,
    },
}


def load_scaffold_module(module_name):
    package = types.ModuleType("scaffold_xblock")
    package.__path__ = [str(PACKAGE_ROOT)]
    sys.modules.setdefault("scaffold_xblock", package)
    if str(ADAPTER_ROOT) not in sys.path:
        sys.path.insert(0, str(ADAPTER_ROOT))
    return importlib.import_module("scaffold_xblock.%s" % module_name)


class LearnerActivitySnapshotStorageTest(unittest.TestCase):
    def test_blank_storage_creates_an_empty_v1_snapshot_for_the_artifact(self):
        state = load_scaffold_module("state")

        for raw in (None, "", "   "):
            with self.subTest(raw=raw):
                self.assertEqual(
                    state.learner_activity_snapshot_from_json(raw, "artifact-1"),
                    {
                        "snapshotVersion": 1,
                        "artifactId": "artifact-1",
                        "activities": {},
                    },
                )

    def test_valid_storage_round_trips_through_the_contract(self):
        state = load_scaffold_module("state")

        loaded = state.learner_activity_snapshot_from_json(
            json.dumps(SNAPSHOT),
            "artifact-1",
        )

        self.assertEqual(loaded, SNAPSHOT)
        self.assertEqual(
            json.loads(state.serialize_learner_activity_snapshot(loaded, "artifact-1")),
            SNAPSHOT,
        )

    def test_nonblank_malformed_future_and_foreign_storage_is_rejected(self):
        state = load_scaffold_module("state")
        cases = [
            "not json",
            json.dumps([]),
            json.dumps({**deepcopy(SNAPSHOT), "snapshotVersion": 2}),
            json.dumps({**deepcopy(SNAPSHOT), "artifactId": "artifact-2"}),
            json.dumps({**deepcopy(SNAPSHOT), "provider": "xblock"}),
        ]

        for raw in cases:
            with self.subTest(raw=raw):
                with self.assertRaises(state.LearnerActivityStorageValidationError):
                    state.learner_activity_snapshot_from_json(raw, "artifact-1")

    def test_non_string_falsy_storage_is_malformed_not_blank(self):
        state = load_scaffold_module("state")

        for raw in (False, 0, [], {}):
            with self.subTest(raw=raw):
                with self.assertRaises(state.LearnerActivityStorageValidationError):
                    state.learner_activity_snapshot_from_json(raw, "artifact-1")


class LearnerActivityLoadOperationTest(unittest.TestCase):
    def test_load_accepts_only_the_exact_port_request_for_the_current_artifact(self):
        activity = load_scaffold_module("activity")

        self.assertIs(
            activity.load_learner_activity_snapshot(
                SNAPSHOT,
                {"artifactId": "artifact-1"},
                "artifact-1",
            ),
            SNAPSHOT,
        )

        for request in (
            None,
            {},
            {"artifactId": "artifact-2"},
            {"artifactId": "artifact-1", "activityIds": []},
        ):
            with self.subTest(request=request):
                with self.assertRaises(activity.LearnerActivityOperationValidationError):
                    activity.load_learner_activity_snapshot(
                        SNAPSHOT,
                        request,
                        "artifact-1",
                    )

    def test_load_rejects_invalid_and_foreign_snapshots(self):
        activity = load_scaffold_module("activity")
        cases = [
            {**deepcopy(SNAPSHOT), "snapshotVersion": 2},
            {**deepcopy(SNAPSHOT), "artifactId": "artifact-2"},
            {**deepcopy(SNAPSHOT), "activities": {"bad": {"completed": False}}},
        ]

        for snapshot in cases:
            with self.subTest(snapshot=snapshot):
                with self.assertRaises(activity.LearnerActivityOperationValidationError):
                    activity.load_learner_activity_snapshot(
                        snapshot,
                        {"artifactId": "artifact-1"},
                        "artifact-1",
                    )


class LearnerActivitySaveOperationTest(unittest.TestCase):
    def test_save_assigns_an_authoritative_timestamp_and_preserves_other_records(self):
        activity = load_scaffold_module("activity")
        original = deepcopy(SNAPSHOT)
        now = datetime(2026, 7, 17, 12, 30, 45, 123000, tzinfo=timezone.utc)

        record, updated_snapshot = activity.save_learner_activity_snapshot(
            SNAPSHOT,
            SAVE_REQUEST,
            "artifact-1",
            {"block-existing", "block-new"},
            clock=lambda: now,
        )

        self.assertEqual(
            record,
            {
                **SAVE_REQUEST["record"],
                "updatedAt": "2026-07-17T12:30:45.123000+00:00",
            },
        )
        self.assertEqual(updated_snapshot["activities"]["block-new"], record)
        self.assertEqual(
            updated_snapshot["activities"]["block-existing"],
            EXISTING_RECORD,
        )
        self.assertEqual(SNAPSHOT, original)

    def test_save_rejects_foreign_identity_and_unauthorized_blocks_atomically(self):
        activity = load_scaffold_module("activity")
        cases = [
            {**deepcopy(SAVE_REQUEST), "artifactId": "artifact-2"},
            {**deepcopy(SAVE_REQUEST), "blockId": "block-foreign"},
            {
                **deepcopy(SAVE_REQUEST),
                "blockId": "artifact:artifact-1/block:block-new",
            },
        ]

        for request in cases:
            with self.subTest(request=request):
                original = deepcopy(SNAPSHOT)
                authorized_block_ids = {"block-existing", "block-new"}
                if request["blockId"].startswith("artifact:"):
                    authorized_block_ids.add(request["blockId"])
                with self.assertRaises(activity.LearnerActivityOperationValidationError):
                    activity.save_learner_activity_snapshot(
                        SNAPSHOT,
                        request,
                        "artifact-1",
                        authorized_block_ids,
                    )
                self.assertEqual(SNAPSHOT, original)

    def test_save_rejects_non_string_and_blank_block_ids_as_operation_errors(self):
        activity = load_scaffold_module("activity")

        for block_id in (None, False, 0, [], {}, "", "   "):
            with self.subTest(block_id=block_id):
                request = {**deepcopy(SAVE_REQUEST), "blockId": block_id}
                original = deepcopy(SNAPSHOT)
                with self.assertRaisesRegex(
                    activity.LearnerActivityOperationValidationError,
                    "blockId must be a non-blank string",
                ):
                    activity.save_learner_activity_snapshot(
                        SNAPSHOT,
                        request,
                        "artifact-1",
                        {"block-existing", "block-new"},
                    )
                self.assertEqual(SNAPSHOT, original)

    def test_save_rejects_malformed_data_client_timestamps_and_extra_fields(self):
        activity = load_scaffold_module("activity")
        cases = [
            None,
            {**deepcopy(SAVE_REQUEST), "provider": "xblock"},
            {
                **deepcopy(SAVE_REQUEST),
                "record": {**deepcopy(SAVE_REQUEST["record"]), "updatedAt": None},
            },
            {
                **deepcopy(SAVE_REQUEST),
                "record": {**deepcopy(SAVE_REQUEST["record"]), "score": 1},
            },
            {
                **deepcopy(SAVE_REQUEST),
                "record": {**deepcopy(SAVE_REQUEST["record"]), "data": []},
            },
            {
                **deepcopy(SAVE_REQUEST),
                "record": {
                    **deepcopy(SAVE_REQUEST["record"]),
                    "data": {"value": float("nan")},
                },
            },
        ]

        for request in cases:
            with self.subTest(request=request):
                original = deepcopy(SNAPSHOT)
                with self.assertRaises(activity.LearnerActivityOperationValidationError):
                    activity.save_learner_activity_snapshot(
                        SNAPSHOT,
                        request,
                        "artifact-1",
                        {"block-existing", "block-new"},
                    )
                self.assertEqual(SNAPSHOT, original)

    def test_save_rejects_invalid_current_snapshots_before_mutation(self):
        activity = load_scaffold_module("activity")
        cases = [
            {**deepcopy(SNAPSHOT), "snapshotVersion": 2},
            {**deepcopy(SNAPSHOT), "artifactId": "artifact-2"},
            {**deepcopy(SNAPSHOT), "activities": []},
        ]

        for snapshot in cases:
            with self.subTest(snapshot=snapshot):
                original = deepcopy(snapshot)
                with self.assertRaises(activity.LearnerActivityOperationValidationError):
                    activity.save_learner_activity_snapshot(
                        snapshot,
                        SAVE_REQUEST,
                        "artifact-1",
                        {"block-existing", "block-new"},
                    )
                self.assertEqual(snapshot, original)


if __name__ == "__main__":
    unittest.main()

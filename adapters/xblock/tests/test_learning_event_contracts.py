import importlib
import importlib.resources
import json
import sys
import types
import unittest
from pathlib import Path


ADAPTER_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = ADAPTER_ROOT / "scaffold_xblock"
REPOSITORY_ROOT = ADAPTER_ROOT.parents[1]
CONFORMANCE_FIXTURE = (
    REPOSITORY_ROOT / "packages/core/fixtures/learning-event-conformance.json"
)


def load_learning_event_module():
    if "scaffold_xblock" not in sys.modules:
        package = types.ModuleType("scaffold_xblock")
        package.__path__ = [str(PACKAGE_ROOT)]
        sys.modules["scaffold_xblock"] = package
    return importlib.import_module("scaffold_xblock.validation.learning_event")


def score_conformance_fixture():
    validation = importlib.import_module("scaffold_xblock.validation")
    resource = importlib.resources.files(validation).joinpath(
        "fixtures/score-transport-conformance.json"
    )
    return json.loads(resource.read_text(encoding="utf-8"))


def valid_learning_event():
    return {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "timestamp": "2026-07-25T10:15:30.123Z",
        "verb": {
            "id": "https://w3id.org/xapi/adl/verbs/answered",
            "display": {"en": "answered"},
        },
        "object": {
            "objectType": "Activity",
            "id": (
                "https://learning.example.test/artifacts/"
                "artifact-1/questions/question-1"
            ),
        },
        "result": {"response": "choice-a"},
    }


def event_with_scalar(family, value):
    event = valid_learning_event()
    if family == "uuid":
        event["id"] = value
    elif family == "duration":
        event["result"] = {"duration": value}
    elif family == "languageTag":
        event["verb"]["display"] = {value: "answered"}
    elif family == "iri":
        event["object"]["id"] = value
    else:
        raise AssertionError(f"Unknown scalar family: {family}")
    return event


def nested_json_value(depth):
    value = "leaf"
    for _level in range(depth):
        value = [value]
    return value


class LearningEventContractTest(unittest.TestCase):
    def test_shared_score_transport_corpus_matches_request_ingress(self):
        learning_event = load_learning_event_module()

        for case in score_conformance_fixture()["transportCases"]:
            event = valid_learning_event()
            event["result"] = {"score": json.loads(case["json"])}
            with self.subTest(case=case["name"]):
                try:
                    validated = learning_event.validate_learning_event_request(
                        {"event": event}
                    )
                    actual = True
                except learning_event.LearningEventValidationError:
                    validated = None
                    actual = False

                self.assertEqual(actual, case["valid"])
                if actual:
                    self.assertEqual(validated["result"]["score"], case["normalized"])
                    for field in ("raw", "min", "max"):
                        if field in case["normalized"]:
                            self.assertIs(type(validated["result"]["score"][field]), int)

    def test_accepts_an_actorless_canonical_event_as_an_owned_copy(self):
        event = valid_learning_event()

        validated = load_learning_event_module().validate_learning_event(event)

        self.assertEqual(validated, event)
        self.assertIsNot(validated, event)

    def test_rejects_actor_authority_and_unknown_top_level_fields(self):
        learning_event = load_learning_event_module()

        for field in ("actor", "authority", "destination"):
            with self.subTest(field=field):
                event = {**valid_learning_event(), field: {"spoofed": True}}
                with self.assertRaises(learning_event.LearningEventValidationError):
                    learning_event.validate_learning_event(event)

    def test_accepts_the_exact_learning_event_request_shape(self):
        learning_event = load_learning_event_module()
        event = valid_learning_event()

        validated = learning_event.validate_learning_event_request({"event": event})

        self.assertEqual(validated, event)

    def test_rejects_old_or_extra_request_envelopes(self):
        learning_event = load_learning_event_module()
        event = valid_learning_event()
        requests = (
            {"statement": event},
            {"event": event, "destination": "tracking"},
            None,
        )

        for request in requests:
            with self.subTest(request=request):
                with self.assertRaises(learning_event.LearningEventValidationError):
                    learning_event.validate_learning_event_request(request)

    def test_rejects_an_event_over_64_kib(self):
        learning_event = load_learning_event_module()
        event = valid_learning_event()
        event["result"]["response"] = "x" * 65536

        with self.assertRaisesRegex(
            learning_event.LearningEventValidationError,
            "maximum accepted size",
        ):
            learning_event.validate_learning_event(event)

    def test_accepts_exactly_64_kib_of_multibyte_json(self):
        learning_event = load_learning_event_module()
        event = valid_learning_event()
        event["result"]["response"] = ""
        encoded = json.dumps(
            event,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        remaining_bytes = 65536 - len(encoded)
        event["result"]["response"] = (
            "é" * (remaining_bytes // 2) + "x" * (remaining_bytes % 2)
        )

        validated = learning_event.validate_learning_event(event)

        self.assertEqual(validated, event)
        self.assertEqual(
            len(
                json.dumps(
                    event,
                    allow_nan=False,
                    ensure_ascii=False,
                    separators=(",", ":"),
                ).encode("utf-8")
            ),
            65536,
        )

        event["result"]["response"] += "é"
        with self.assertRaisesRegex(
            learning_event.LearningEventValidationError,
            "maximum accepted size",
        ):
            learning_event.validate_learning_event(event)

    def test_rejects_non_json_finite_or_cyclic_values(self):
        learning_event = load_learning_event_module()
        cyclic = []
        cyclic.append(cyclic)

        for unsafe_value in (float("nan"), {"not-json"}, cyclic):
            with self.subTest(value_type=type(unsafe_value).__name__):
                event = valid_learning_event()
                event["result"] = {
                    "extensions": {
                        "https://scaffold.example/xapi/extensions/value": (
                            unsafe_value
                        ),
                    },
                }
                with self.assertRaises(learning_event.LearningEventValidationError):
                    learning_event.validate_learning_event(event)

    def test_matches_the_core_learning_event_conformance_fixture(self):
        learning_event = load_learning_event_module()
        fixture = json.loads(CONFORMANCE_FIXTURE.read_text(encoding="utf-8"))

        for case in fixture["cases"]:
            with self.subTest(case=case["name"]):
                try:
                    validated = learning_event.validate_learning_event(case["event"])
                    accepted = True
                except learning_event.LearningEventValidationError:
                    validated = None
                    accepted = False

                self.assertEqual(accepted, case["valid"])
                if accepted:
                    self.assertEqual(validated, case["event"])

        for family, cases in fixture["scalarCases"].items():
            for case in cases:
                with self.subTest(family=family, case=case["name"]):
                    try:
                        validated = learning_event.validate_learning_event(
                            event_with_scalar(family, case["value"])
                        )
                        accepted = True
                    except learning_event.LearningEventValidationError:
                        validated = None
                        accepted = False

                    self.assertEqual(accepted, case["valid"])
                    if accepted:
                        self.assertEqual(
                            validated,
                            event_with_scalar(family, case["value"]),
                        )

        for case in fixture["jsonDepthCases"]:
            with self.subTest(case=case["name"]):
                event = valid_learning_event()
                event["result"] = {
                    "extensions": {
                        "https://scaffold.example/xapi/extensions/value": (
                            nested_json_value(case["depth"])
                        ),
                    },
                }
                try:
                    learning_event.validate_learning_event(event)
                    accepted = True
                except learning_event.LearningEventValidationError:
                    accepted = False

                self.assertEqual(accepted, case["valid"])

    def test_large_hostile_nesting_is_a_safe_validation_error(self):
        learning_event = load_learning_event_module()
        event = valid_learning_event()
        event["result"] = {
            "extensions": {
                "https://scaffold.example/xapi/extensions/value": (
                    nested_json_value(1000)
                ),
            },
        }

        with self.assertRaises(learning_event.LearningEventValidationError):
            learning_event.validate_learning_event(event)


if __name__ == "__main__":
    unittest.main()

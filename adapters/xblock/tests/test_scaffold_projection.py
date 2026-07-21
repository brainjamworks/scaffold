import ast
import importlib
import json
import sys
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch


def install_xblock_import_stubs():
    class Field:
        def __init__(self, *args, **kwargs):
            pass

    class Scope:
        content = "content"
        settings = "settings"
        user_state = "user_state"

    class XBlock:
        @classmethod
        def needs(cls, *_services):
            return lambda target: target

        @classmethod
        def wants(cls, *_services):
            return lambda target: target

        @staticmethod
        def json_handler(fn):
            return fn

    class ScorableXBlockMixin:
        pass

    class Score:
        def __init__(self, raw_earned, raw_possible):
            self.raw_earned = raw_earned
            self.raw_possible = raw_possible

    class Fragment:
        def __init__(self, *_args, **_kwargs):
            pass

    xblock = types.ModuleType("xblock")
    xblock_core = types.ModuleType("xblock.core")
    xblock_fields = types.ModuleType("xblock.fields")
    xblock_scorable = types.ModuleType("xblock.scorable")
    xblock_fragment = types.ModuleType("xblock.fragment")
    web_fragments = types.ModuleType("web_fragments")
    web_fragments_fragment = types.ModuleType("web_fragments.fragment")
    pkg_resources = types.ModuleType("pkg_resources")

    xblock_core.XBlock = XBlock
    xblock_fields.Float = Field
    xblock_fields.Integer = Field
    xblock_fields.String = Field
    xblock_fields.Scope = Scope
    xblock_scorable.ScorableXBlockMixin = ScorableXBlockMixin
    xblock_scorable.Score = Score
    xblock_fragment.Fragment = Fragment
    web_fragments_fragment.Fragment = Fragment
    pkg_resources.resource_string = lambda *_args, **_kwargs: b""

    sys.modules.setdefault("xblock", xblock)
    sys.modules.setdefault("xblock.core", xblock_core)
    sys.modules.setdefault("xblock.fields", xblock_fields)
    sys.modules.setdefault("xblock.scorable", xblock_scorable)
    sys.modules.setdefault("xblock.fragment", xblock_fragment)
    sys.modules.setdefault("web_fragments", web_fragments)
    sys.modules.setdefault("web_fragments.fragment", web_fragments_fragment)
    sys.modules.setdefault("pkg_resources", pkg_resources)


def load_scaffold_module():
    install_xblock_import_stubs()
    adapter_root = Path(__file__).resolve().parents[1]
    if str(adapter_root) not in sys.path:
        sys.path.insert(0, str(adapter_root))
    return importlib.import_module("scaffold_xblock.scaffold")


scaffold = load_scaffold_module()
assessment_module = importlib.import_module("scaffold_xblock.assessment")
assessment_projection_module = importlib.import_module(
    "scaffold_xblock.assessment_projection"
)
content_save_module = importlib.import_module("scaffold_xblock.validation.content_save")
media_store = importlib.import_module("scaffold_xblock.media_store")
quiz_module = importlib.import_module("scaffold_xblock.quiz")
scorebook_module = importlib.import_module("scaffold_xblock.scorebook")
state_codecs = importlib.import_module("scaffold_xblock.state")
views_module = importlib.import_module("scaffold_xblock.views")


def scaffold_xblock_import_graph(module_root):
    package_name = module_root.name
    module_paths = {}
    for module_path in sorted(module_root.rglob("*.py")):
        relative_path = module_path.relative_to(module_root)
        module_parts = (
            relative_path.parent.parts
            if module_path.name == "__init__.py"
            else relative_path.with_suffix("").parts
        )
        module_name = ".".join((package_name, *module_parts))
        module_paths[module_name] = module_path

    local_modules = set(module_paths)
    package_modules = {
        module_name
        for module_name, module_path in module_paths.items()
        if module_path.name == "__init__.py"
    }
    graph = {module_name: set() for module_name in local_modules}
    for module_name, module_path in module_paths.items():
        tree = ast.parse(
            module_path.read_text(encoding="utf-8"),
            filename=str(module_path),
        )
        dependencies = set()
        for node in ast.walk(tree):
            dependencies.update(
                local_import_dependencies(
                    module_name,
                    node,
                    local_modules,
                    package_modules,
                )
            )
        graph[module_name] = dependencies
    return graph


def local_import_dependencies(
    importer,
    node,
    local_modules,
    package_modules,
):
    if isinstance(node, ast.Import):
        return {
            alias.name for alias in node.names if alias.name in local_modules
        }
    if not isinstance(node, ast.ImportFrom):
        return set()

    base_module = import_from_base_module(importer, node, package_modules)
    dependencies = {base_module} if base_module in local_modules else set()
    for alias in node.names:
        if alias.name == "*":
            continue
        candidate = ".".join(
            part for part in (base_module, alias.name) if part
        )
        if candidate in local_modules:
            dependencies.add(candidate)
    return dependencies


def import_from_base_module(importer, node, package_modules):
    if node.level == 0:
        return node.module or ""

    importer_package = (
        importer if importer in package_modules else importer.rpartition(".")[0]
    )
    package_parts = importer_package.split(".") if importer_package else []
    if node.level > len(package_parts):
        return ""
    retained_parts = package_parts[: len(package_parts) - node.level + 1]
    if node.module:
        retained_parts.extend(node.module.split("."))
    return ".".join(retained_parts)


def reachable_modules(graph, module_name):
    reachable = set()
    pending = list(graph[module_name])
    while pending:
        dependency = pending.pop()
        if dependency in reachable:
            continue
        reachable.add(dependency)
        pending.extend(graph[dependency] - reachable)
    return reachable


def non_singleton_strongly_connected_components(graph):
    reachability = {
        module_name: reachable_modules(graph, module_name) for module_name in graph
    }
    remaining = set(graph)
    components = []
    while remaining:
        root = min(remaining)
        component = {
            module_name
            for module_name in graph
            if module_name == root
            or (
                module_name in reachability[root]
                and root in reachability[module_name]
            )
        }
        components.append(component)
        remaining -= component

    return sorted(
        sorted(component) for component in components if len(component) > 1
    )


def rich_feedback(text):
    return {
        "kind": "rich-text",
        "document": {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": text}],
                },
            ],
        },
    }


def single_select_target(
    target_id="mcq-1",
    points=2,
    is_graded=True,
    max_attempts=2,
    feedback_mode="on_submit",
    show_answer=True,
):
    return {
        "schemaVersion": 1,
        "targetId": target_id,
        "blockId": target_id,
        "blockType": "mcq",
        "interaction": {
            "kind": "single-select",
            "options": [{"id": "a"}, {"id": "b"}],
        },
        "assessment": {
            "kind": "single-select",
            "correctOptionId": "b",
            "feedbackByOptionId": {"b": rich_feedback("Choice feedback")},
            "summaryFeedback": rich_feedback("Summary feedback"),
        },
        "settings": {
            "feedbackMode": feedback_mode,
            "isGraded": is_graded,
            "showAnswer": show_answer,
            "points": points,
            "maxAttempts": max_attempts,
        },
    }


def quiz_group(
    group_id="quiz-1",
    target_ids=None,
    review_timing="after_quiz",
    review_detail="result_only",
    attempts_per_question=1,
    is_graded=True,
):
    return {
        "schemaVersion": 1,
        "kind": "quiz",
        "groupId": group_id,
        "targetIds": target_ids or ["mcq-1", "mcq-2"],
        "settings": {
            "allowBacktracking": False,
            "reviewTiming": review_timing,
            "reviewDetail": review_detail,
            "attemptsPerQuestion": attempts_per_question,
            "isGraded": is_graded,
            "timer": {"enabled": False, "durationSeconds": 0},
        },
    }


def course_document(children=None, mode="page", surface_attrs=None):
    attrs = {"id": "surface-1"}
    if surface_attrs is not None:
        attrs.update(surface_attrs)

    return {
        "type": "doc",
        "content": [
            {
                "type": "courseDocument",
                "attrs": {
                    "schemaVersion": 1,
                    "mode": mode,
                    "surfaceSize": "fluid",
                    "overflowMode": "grow",
                },
                "content": [
                    {
                        "type": "surface",
                        "attrs": attrs,
                        "content": children or [],
                    }
                ],
            }
        ],
    }


def save_payload(
    content=None,
    learner_content=None,
    title="Saved lesson",
    assessment_targets=None,
    assessment_groups=None,
    artifact_id="usage-v1",
    mode="page",
):
    content = content if content is not None else course_document(mode=mode)
    return {
        "artifact": {
            "id": artifact_id,
            "title": title,
            "mode": mode,
            "content": content,
        },
        "learnerContent": (
            learner_content
            if learner_content is not None
            else course_document(mode=mode)
        ),
        "assessmentTargets": assessment_targets or [],
        "assessmentGroups": assessment_groups or [],
    }


class RuntimeStub:
    def __init__(self):
        self.published = []

    def publish(self, block, event, payload):
        self.published.append((block, event, payload))

    def local_resource_url(self, block, path):
        return "/xblock/" + path


class StaticContentStub:
    @staticmethod
    def get_asset_key_from_path(course_key, media_id):
        return "%s:%s" % (course_key, media_id)

    @staticmethod
    def get_static_path_from_location(asset_key):
        return "static/%s" % asset_key

    @staticmethod
    def get_canonicalized_asset_path(course_key, portable_url, *_args):
        return "/assets/%s" % portable_url


class ContentStoreStub:
    def __init__(self, assets=None):
        self.lookups = []
        self.assets = assets or []

    def find(self, asset_key):
        self.lookups.append(asset_key)
        return object()

    def get_all_content_for_course(self, course_key):
        self.lookups.append(course_key)
        return self.assets, len(self.assets)


class FragmentRecorder:
    def __init__(self, html):
        self.html = html
        self.css = []
        self.css_urls = []
        self.javascript = []
        self.initialized = []

    def add_css(self, css):
        self.css.append(css)

    def add_css_url(self, url):
        self.css_urls.append(url)

    def add_javascript(self, javascript):
        self.javascript.append(javascript)

    def initialize_js(self, initializer, payload):
        self.initialized.append((initializer, payload))


def make_xblock(targets=None, groups=None, usage_id="usage-v1"):
    block = object.__new__(scaffold.ScaffoldXBlock)
    block.display_name = "Scaffold"
    block.artifact_json = json.dumps(
        {
            "id": usage_id,
            "title": "Scaffold",
            "mode": "page",
            "content": course_document(),
        },
    )
    block.learner_content_json = json.dumps(course_document())
    block.assessment_targets_json = json.dumps(targets or [])
    block.assessment_groups_json = json.dumps(groups or [])
    block.assessment_snapshot_json = ""
    block.assessment_grade_changed_at = ""
    block.learner_activity_snapshot_json = ""
    block.attempts_count = 0
    block.current_score = 0.0
    block.weight = 1.0
    block.scope_ids = types.SimpleNamespace(usage_id=usage_id)
    block.runtime = RuntimeStub()
    block._has_studio_write_access = lambda: True
    return block


class ScaffoldAssessmentTargetContractTest(unittest.TestCase):
    def test_empty_learner_receives_a_strict_v1_assessment_snapshot(self):
        block = make_xblock(usage_id="usage-v1")

        self.assertEqual(
            block._assessment_snapshot(),
            {
                "snapshotVersion": 1,
                "artifactId": "usage-v1",
                "problems": {},
                "quizzes": {},
            },
        )

    def test_stored_assessment_snapshot_rejects_malformed_future_and_foreign_values(self):
        valid = {
            "snapshotVersion": 1,
            "artifactId": "usage-v1",
            "problems": {},
            "quizzes": {},
        }
        cases = [
            "{bad json",
            json.dumps([]),
            json.dumps({**valid, "snapshotVersion": 2}),
            json.dumps({**valid, "artifactId": "other-usage"}),
            json.dumps({**valid, "studentResponses": {}}),
        ]

        for raw in cases:
            with self.subTest(raw=raw):
                block = make_xblock(usage_id="usage-v1")
                block.assessment_snapshot_json = raw

                with self.assertRaises(ValueError):
                    block._assessment_snapshot()

    def test_xblock_rejects_malformed_stored_assessment_targets(self):
        block = make_xblock()
        block.assessment_targets_json = "{bad json"

        with self.assertRaises(ValueError):
            block._assessment_targets()

    def test_xblock_rejects_non_current_stored_assessment_targets(self):
        current_target = single_select_target()
        cases = [
            "",
            json.dumps({}),
            json.dumps([current_target, "not-an-object"]),
            json.dumps([{"targetId": "old-target"}]),
            json.dumps([{**current_target, "schemaVersion": 2}]),
        ]

        for raw in cases:
            with self.subTest(raw=raw):
                block = make_xblock()
                block.assessment_targets_json = raw

                with self.assertRaises(ValueError):
                    block._assessment_targets()

    def test_xblock_rejects_non_current_stored_assessment_groups(self):
        current_group = quiz_group(target_ids=["mcq-1"])
        cases = [
            "",
            "{bad json",
            json.dumps({}),
            json.dumps([current_group, "not-an-object"]),
            json.dumps([{"groupId": "old-group", "targetIds": ["mcq-1"]}]),
            json.dumps([{**current_group, "schemaVersion": 2}]),
        ]

        for raw in cases:
            with self.subTest(raw=raw):
                block = make_xblock(targets=[single_select_target()])
                block.assessment_groups_json = raw

                with self.assertRaises(ValueError):
                    block._assessment_groups()

    def test_xblock_validates_stored_group_membership_against_stored_targets(self):
        block = make_xblock(
            targets=[single_select_target("mcq-1")],
            groups=[quiz_group(target_ids=["missing-target"])],
        )

        for read in (block._assessment_targets, block._assessment_groups):
            with self.subTest(read=read.__name__), self.assertRaisesRegex(
                ValueError,
                "must reference an assessment target",
            ):
                read()

    def test_xblock_rejects_duplicate_ids_in_stored_assessment_bundle(self):
        target = single_select_target("mcq-1")
        group = quiz_group(target_ids=["mcq-1"])
        cases = [
            ([target, target], [group], "targetId must be unique"),
            (
                [target],
                [group, {**group, "targetIds": ["mcq-1"]}],
                "groupId must be unique",
            ),
        ]

        for targets, groups, error in cases:
            with self.subTest(error=error):
                block = make_xblock(targets=targets, groups=groups)

                with self.assertRaisesRegex(ValueError, error):
                    block._assessment_bundle()

    def test_xblock_rejects_targets_owned_by_multiple_quiz_groups(self):
        target = single_select_target("mcq-1")
        block = make_xblock(
            targets=[target],
            groups=[
                quiz_group("quiz-1", target_ids=["mcq-1"]),
                quiz_group("quiz-2", target_ids=["mcq-1"]),
            ],
        )

        with self.assertRaisesRegex(ValueError, "multiple quiz groups"):
            block._assessment_bundle()

    def test_xblock_reads_valid_empty_and_populated_assessment_bundles(self):
        empty_block = make_xblock()

        self.assertEqual(empty_block._assessment_targets(), [])
        self.assertEqual(empty_block._assessment_groups(), [])

        target = single_select_target("mcq-1")
        group = quiz_group(target_ids=["mcq-1"])
        populated_block = make_xblock(targets=[target], groups=[group])

        self.assertEqual(populated_block._assessment_targets(), [target])
        self.assertEqual(populated_block._assessment_groups(), [group])

    def test_state_codecs_validate_persisted_assessment_snapshots(self):
        artifact = state_codecs.artifact_from_json(
            json.dumps({"id": "old-id", "title": "Old title", "mode": "page"}),
            "usage-v1",
            "Scaffold",
            "page",
        )

        self.assertEqual(
            artifact,
            {
                "id": "usage-v1",
                "title": "Scaffold",
                "mode": "page",
                "content": None,
            },
        )
        self.assertIsNone(state_codecs.learner_content_from_json("{bad json"))
        snapshot = {
            "snapshotVersion": 1,
            "artifactId": "usage-v1",
            "problems": {},
            "quizzes": {},
        }
        self.assertEqual(
            state_codecs.assessment_snapshot_from_json(
                json.dumps(snapshot),
                "usage-v1",
            ),
            snapshot,
        )
        activity_snapshot = {
            "snapshotVersion": 1,
            "artifactId": "usage-v1",
            "activities": {},
        }
        self.assertEqual(
            state_codecs.learner_activity_snapshot_from_json("", "usage-v1"),
            activity_snapshot,
        )

    def test_state_codecs_serialize_stable_persisted_shapes(self):
        self.assertEqual(
            json.loads(
                state_codecs.serialize_assessment_snapshot(
                    {
                        "snapshotVersion": 1,
                        "artifactId": "usage-v1",
                        "problems": {},
                        "quizzes": {},
                    },
                    "usage-v1",
                ),
            ),
            {
                "snapshotVersion": 1,
                "artifactId": "usage-v1",
                "problems": {},
                "quizzes": {},
            },
        )
        self.assertEqual(
            json.loads(
                state_codecs.serialize_learner_activity_snapshot(
                    {
                        "snapshotVersion": 1,
                        "artifactId": "usage-v1",
                        "activities": {},
                    },
                    "usage-v1",
                ),
            ),
            {
                "snapshotVersion": 1,
                "artifactId": "usage-v1",
                "activities": {},
            },
        )

    def test_scorebook_problem_attempts_reads_persisted_response_state(self):
        problems = {
            "explicit": {"attemptNumber": 3},
            "bool-attempts": {"attemptNumber": True},
            "negative-attempts": {"attemptNumber": -1},
            "missing-attempts": {},
        }

        self.assertEqual(scorebook_module.problem_attempts(problems, "explicit"), 3)
        self.assertEqual(scorebook_module.problem_attempts(problems, "bool-attempts"), 0)
        self.assertEqual(
            scorebook_module.problem_attempts(problems, "negative-attempts"),
            0,
        )
        self.assertEqual(
            scorebook_module.problem_attempts(problems, "missing-attempts"),
            0,
        )
        self.assertEqual(scorebook_module.problem_attempts(problems, "unknown"), 0)
        self.assertEqual(scorebook_module.problem_attempts([], "explicit"), 0)

    def test_assessment_module_rejects_spoofed_problem_id(self):
        outcome = assessment_module.grade_assessment_request(
            {
                "problemId": "artifact:other-usage/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
            "check",
            [single_select_target(feedback_mode="immediate")],
            "usage-v1",
            0,
        )

        self.assertEqual(
            outcome,
            {
                "response": {
                    "success": False,
                    "error": "problemId, targetId, and interactionKind are required",
                },
                "submission": None,
            },
        )

    def test_assessment_module_prepares_immediate_check_submission(self):
        outcome = assessment_module.grade_assessment_request(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
            "check",
            [single_select_target(feedback_mode="immediate")],
            "usage-v1",
            0,
        )

        self.assertTrue(outcome["response"]["success"])
        self.assertTrue(outcome["response"]["isCorrect"])
        self.assertEqual(outcome["response"]["maxScore"], 1)
        canonical_result = {
            "isCorrect": True,
            "score": 1,
            "maxScore": 1,
            "feedback": rich_feedback("Summary feedback"),
            "items": {
                "a": {
                    "correct": False,
                    "expected": False,
                    "given": False,
                },
                "b": {
                    "correct": True,
                    "expected": True,
                    "given": True,
                    "feedback": rich_feedback("Choice feedback"),
                },
            },
        }
        self.assertEqual(
            outcome["submission"],
            {
                "problem_id": "artifact:usage-v1/block:mcq-1",
                "target_id": "mcq-1",
                "interaction_kind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
                "result": canonical_result,
                "points": 2,
                "is_graded": True,
                "submitted": False,
            },
        )
        self.assertNotIn("success", outcome["submission"]["result"])

    def test_quiz_module_resolves_membership_and_settings_from_stored_group(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
            review_detail="full_review",
            attempts_per_question=3,
        )
        group["settings"]["timer"] = {
            "enabled": True,
            "durationSeconds": 120,
        }

        resolved_group, target_ids, settings, error = quiz_module.quiz_group_for_request(
            {"groupId": "quiz-1"},
            [group],
        )

        self.assertEqual(resolved_group, group)
        self.assertEqual(target_ids, ["mcq-1", "mcq-2"])
        self.assertEqual(
            settings,
            {
                "allowBacktracking": False,
                "reviewTiming": "after_each_answer",
                "reviewDetail": "full_review",
                "attemptsPerQuestion": 3,
                "isGraded": True,
                "timer": {
                    "enabled": True,
                    "durationSeconds": 120,
                },
            },
        )
        self.assertIsNone(error)

    def test_quiz_module_reconstructs_public_group_identity_from_the_record_key(self):
        attempt = {
            "attemptId": "attempt-1",
            "status": "in_progress",
            "currentTargetId": "mcq-1",
            "submittedTargetIds": ["mcq-1", 12],
            "startedAt": "2026-06-27T10:00:00Z",
            "finishedAt": None,
            "expiresAt": None,
            "score": None,
            "maxScore": None,
            "resultsByTargetId": "invalid",
            "answerReviewAuthorized": False,
        }

        result = quiz_module.public_quiz_attempt(attempt, "quiz-1")

        self.assertEqual(
            result,
            {
                "attemptId": "attempt-1",
                "groupId": "quiz-1",
                "status": "in_progress",
                "currentTargetId": "mcq-1",
                "submittedTargetIds": ["mcq-1"],
                "startedAt": "2026-06-27T10:00:00Z",
                "finishedAt": None,
                "expiresAt": None,
                "score": None,
                "maxScore": None,
                "resultsByTargetId": {},
                "answerReviewAuthorized": False,
            },
        )

    def test_quiz_module_starts_from_minimal_request_and_stored_membership(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])

        outcome = quiz_module.start_quiz_attempt(
            {"groupId": "quiz-1"},
            [group],
            {},
            lambda: "2026-06-27T10:00:00Z",
            lambda group_id: "quiz:%s:fixed" % group_id,
            lambda _settings: "2026-06-27T10:10:00Z",
            lambda _expires_at: False,
        )

        self.assertIsNone(outcome["finalize_expired"])
        self.assertEqual(outcome["response"]["attemptId"], "quiz:quiz-1:fixed")
        self.assertEqual(outcome["response"]["groupId"], "quiz-1")
        self.assertEqual(outcome["response"]["status"], "in_progress")
        self.assertEqual(outcome["response"]["currentTargetId"], "mcq-1")
        stored_attempt = outcome["state"]["quiz-1"]
        self.assertEqual(stored_attempt["startedAt"], "2026-06-27T10:00:00Z")
        self.assertEqual(stored_attempt["expiresAt"], "2026-06-27T10:10:00Z")
        self.assertNotIn("groupId", stored_attempt)
        self.assertNotIn("targetIds", stored_attempt)
        self.assertNotIn("settings", stored_attempt)

    def test_quiz_module_time_helpers_handle_expiry_and_timer_settings(self):
        settings = {
            "timer": {
                "enabled": True,
                "durationSeconds": 90,
            },
        }
        disabled = {
            "timer": {
                "enabled": False,
                "durationSeconds": 90,
            },
        }
        fixed_now = lambda: datetime(2026, 6, 27, 10, 0, tzinfo=timezone.utc)

        self.assertEqual(
            quiz_module.quiz_attempt_expires_at(settings, fixed_now),
            "2026-06-27T10:01:30Z",
        )
        self.assertIsNone(quiz_module.quiz_attempt_expires_at(disabled, fixed_now))
        self.assertTrue(quiz_module.iso_has_expired("2000-01-01T00:00:00Z"))
        self.assertFalse(quiz_module.iso_has_expired("2999-01-01T00:00:00Z"))
        self.assertFalse(quiz_module.iso_has_expired("not a date"))

    def test_quiz_aggregate_uses_normalized_target_units(self):
        result = {
            "isCorrect": False,
            "score": 0.5,
            "maxScore": 1,
            "feedback": None,
            "items": {},
        }

        self.assertEqual(
            quiz_module.aggregate_quiz_results({"mcq-1": result}, ["mcq-1", "mcq-2"]),
            (0.5, 2.0),
        )
        self.assertEqual(quiz_module.aggregate_quiz_results({}, []), (0.0, 0.0))

    def test_quiz_module_returns_expired_attempt_finalization_action(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        attempt = {
            "attemptId": "attempt-1",
            "status": "in_progress",
            "currentTargetId": "mcq-1",
            "submittedTargetIds": [],
            "startedAt": "2026-06-27T10:00:00Z",
            "finishedAt": None,
            "expiresAt": "2000-01-01T00:00:00Z",
            "score": None,
            "maxScore": None,
            "resultsByTargetId": {},
            "answerReviewAuthorized": False,
        }

        def unexpected_factory(*_args):
            raise AssertionError("new attempt factories must not run")

        outcome = quiz_module.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
            [group],
            {"quiz-1": attempt},
            unexpected_factory,
            unexpected_factory,
            unexpected_factory,
            lambda _expires_at: True,
        )

        self.assertIsNone(outcome["response"])
        self.assertEqual(
            outcome["finalize_expired"],
            {
                "attempt": attempt,
                "group_id": "quiz-1",
                "target_ids": ["mcq-1", "mcq-2"],
                "settings": quiz_module.quiz_settings(group),
            },
        )

    def test_quiz_module_submits_question_from_minimal_request_and_stored_membership(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
        )
        attempt = {
            "attemptId": "attempt-1",
            "status": "in_progress",
            "currentTargetId": "mcq-1",
            "submittedTargetIds": [],
            "startedAt": "2026-06-27T10:00:00Z",
            "finishedAt": None,
            "expiresAt": None,
            "score": None,
            "maxScore": None,
            "resultsByTargetId": {},
            "answerReviewAuthorized": False,
        }

        state = {"quiz-1": attempt}
        outcome = quiz_module.submit_quiz_question(
            {
                "attemptId": "attempt-1",
                "groupId": "quiz-1",
                "targetId": "mcq-1",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
            [group],
            [single_select_target("mcq-1"), single_select_target("mcq-2")],
            state,
            {},
            "usage-v1",
            lambda: "2026-06-27T10:01:00Z",
            lambda _expires_at: False,
        )

        self.assertTrue(outcome["response"]["success"])
        self.assertEqual(outcome["response"]["currentTargetId"], "mcq-2")
        stored_attempt = outcome["state"]["quiz-1"]
        self.assertEqual(stored_attempt["submittedTargetIds"], ["mcq-1"])
        self.assertNotIn("attemptCountsByTargetId", stored_attempt)
        self.assertEqual(stored_attempt["resultsByTargetId"]["mcq-1"]["score"], 1.0)
        self.assertEqual(
            outcome["submissions"],
            [
                {
                    "problem_id": "artifact:usage-v1/block:mcq-1",
                    "target_id": "mcq-1",
                    "interaction_kind": "single-select",
                    "response": {"kind": "single-select", "optionId": "b"},
                    "result": {
                        "isCorrect": True,
                        "score": 1,
                        "maxScore": 1,
                        "feedback": rich_feedback("Summary feedback"),
                        "items": {
                            "a": {
                                "correct": False,
                                "expected": False,
                                "given": False,
                            },
                            "b": {
                                "correct": True,
                                "expected": True,
                                "given": True,
                                "feedback": rich_feedback("Choice feedback"),
                            },
                        },
                    },
                    "points": 2,
                    "is_graded": True,
                    "submitted": True,
                    "publish_grade": True,
                },
            ],
        )
        self.assertNotIn("success", outcome["submissions"][0]["result"])

        rejected = quiz_module.submit_quiz_question(
            {
                "attemptId": "attempt-1",
                "groupId": "quiz-1",
                "targetId": "mcq-outside-group",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
            [group],
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
                single_select_target("mcq-outside-group"),
            ],
            state,
            {},
            "usage-v1",
            lambda: "2026-06-27T10:01:00Z",
            lambda _expires_at: False,
        )

        self.assertEqual(
            rejected["response"],
            {"success": False, "error": "targetId does not match quiz"},
        )

    def test_quiz_module_submit_question_keeps_retryable_wrong_answer_current(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
            attempts_per_question=2,
        )
        attempt = {
            "attemptId": "attempt-1",
            "status": "in_progress",
            "currentTargetId": "mcq-1",
            "submittedTargetIds": [],
            "startedAt": "2026-06-27T10:00:00Z",
            "finishedAt": None,
            "expiresAt": None,
            "score": None,
            "maxScore": None,
            "resultsByTargetId": {},
            "answerReviewAuthorized": False,
        }

        outcome = quiz_module.submit_quiz_question(
            {
                "attemptId": "attempt-1",
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "targetId": "mcq-1",
                "response": {"kind": "single-select", "optionId": "a"},
                "expectedAttemptNumber": 0,
            },
            [group],
            [single_select_target("mcq-1"), single_select_target("mcq-2")],
            {"quiz-1": attempt},
            {},
            "usage-v1",
            lambda: "2026-06-27T10:01:00Z",
            lambda _expires_at: False,
        )

        self.assertTrue(outcome["response"]["success"])
        self.assertEqual(outcome["response"]["currentTargetId"], "mcq-1")
        stored_attempt = outcome["state"]["quiz-1"]
        self.assertEqual(stored_attempt["submittedTargetIds"], [])
        self.assertNotIn("attemptCountsByTargetId", stored_attempt)

    def test_quiz_module_submit_question_finalizes_expired_without_late_submission(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
        )
        attempt = {
            "attemptId": "attempt-1",
            "status": "in_progress",
            "currentTargetId": "mcq-2",
            "submittedTargetIds": ["mcq-1"],
            "startedAt": "2026-06-27T10:00:00Z",
            "finishedAt": None,
            "expiresAt": "2000-01-01T00:00:00Z",
            "score": None,
            "maxScore": None,
            "resultsByTargetId": {
                "mcq-1": {
                    "isCorrect": True,
                    "score": 1.0,
                    "maxScore": 1,
                    "feedback": None,
                    "items": {},
                }
            },
            "answerReviewAuthorized": False,
        }

        outcome = quiz_module.submit_quiz_question(
            {
                "attemptId": "attempt-1",
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "targetId": "mcq-2",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
            [group],
            [single_select_target("mcq-1"), single_select_target("mcq-2")],
            {"quiz-1": attempt},
            {},
            "usage-v1",
            lambda: "2026-06-27T10:05:00Z",
            lambda _expires_at: True,
        )

        self.assertTrue(outcome["response"]["success"])
        self.assertEqual(outcome["response"]["status"], "expired")
        self.assertEqual(outcome["response"]["submittedTargetIds"], ["mcq-1"])
        self.assertEqual(outcome["response"]["score"], 1.0)
        self.assertEqual(outcome["response"]["maxScore"], 2.0)
        self.assertEqual(outcome["submissions"], [])
        self.assertTrue(outcome["publish_grade"])
        stored_attempt = outcome["state"]["quiz-1"]
        self.assertNotIn("mcq-2", stored_attempt["resultsByTargetId"])
        self.assertNotIn("attemptCountsByTargetId", stored_attempt)

    def test_quiz_module_finishes_from_minimal_request_and_stored_membership(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        attempt = {
            "attemptId": "attempt-1",
            "status": "in_progress",
            "currentTargetId": "mcq-1",
            "submittedTargetIds": [],
            "startedAt": "2026-06-27T10:00:00Z",
            "finishedAt": None,
            "expiresAt": None,
            "score": None,
            "maxScore": None,
            "resultsByTargetId": {},
            "answerReviewAuthorized": False,
        }

        state = {"quiz-1": attempt}
        rejected = quiz_module.finish_quiz_attempt(
            {
                "attemptId": "attempt-1",
                "groupId": "quiz-1",
                "responsesByTargetId": {
                    "mcq-1": {"kind": "single-select", "optionId": "b"},
                    "mcq-2": {"kind": "single-select", "optionId": "b"},
                    "mcq-outside-group": {
                        "kind": "single-select",
                        "optionId": "b",
                    },
                },
            },
            [group],
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
                single_select_target("mcq-outside-group"),
            ],
            state,
            "usage-v1",
            lambda: "2026-06-27T10:02:00Z",
            lambda _expires_at: False,
        )
        self.assertEqual(
            rejected["response"],
            {
                "success": False,
                "error": "responsesByTargetId contains unknown target",
            },
        )

        outcome = quiz_module.finish_quiz_attempt(
            {
                "attemptId": "attempt-1",
                "groupId": "quiz-1",
                "responsesByTargetId": {
                    "mcq-1": {"kind": "single-select", "optionId": "b"},
                    "mcq-2": {"kind": "single-select", "optionId": "b"},
                },
            },
            [group],
            [single_select_target("mcq-1"), single_select_target("mcq-2")],
            state,
            "usage-v1",
            lambda: "2026-06-27T10:02:00Z",
            lambda _expires_at: False,
        )

        self.assertTrue(outcome["response"]["success"])
        self.assertEqual(outcome["response"]["status"], "completed")
        self.assertEqual(outcome["response"]["score"], 2.0)
        self.assertEqual(outcome["response"]["maxScore"], 2.0)
        self.assertTrue(outcome["publish_grade"])
        self.assertIsNone(outcome["finalize_expired"])
        stored_attempt = outcome["state"]["quiz-1"]
        self.assertEqual(stored_attempt["finishedAt"], "2026-06-27T10:02:00Z")
        self.assertEqual(stored_attempt["submittedTargetIds"], ["mcq-1", "mcq-2"])
        self.assertNotIn("attemptCountsByTargetId", stored_attempt)
        self.assertEqual(
            [submission["problem_id"] for submission in outcome["submissions"]],
            ["artifact:usage-v1/block:mcq-1", "artifact:usage-v1/block:mcq-2"],
        )
        self.assertEqual(
            [submission["publish_grade"] for submission in outcome["submissions"]],
            [False, False],
        )

    def test_quiz_module_finish_expired_after_quiz_returns_finalization_action(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        attempt = {
            "attemptId": "attempt-1",
            "status": "in_progress",
            "currentTargetId": "mcq-1",
            "submittedTargetIds": [],
            "startedAt": "2026-06-27T10:00:00Z",
            "finishedAt": None,
            "expiresAt": "2000-01-01T00:00:00Z",
            "score": None,
            "maxScore": None,
            "resultsByTargetId": {},
            "answerReviewAuthorized": False,
        }

        state = {"quiz-1": attempt}
        with patch.object(
            quiz_module,
            "grade_assessment",
            wraps=quiz_module.grade_assessment,
        ) as grade:
            outcome = quiz_module.finish_quiz_attempt(
                {
                    "attemptId": "attempt-1",
                    "groupId": "quiz-1",
                    "targetIds": ["mcq-1", "mcq-2"],
                    "settings": group["settings"],
                    "responsesByTargetId": {
                        "mcq-1": {"kind": "single-select", "optionId": "b"},
                    },
                },
                [group],
                [single_select_target("mcq-1"), single_select_target("mcq-2")],
                state,
                "usage-v1",
                lambda: "2026-06-27T10:02:00Z",
                lambda _expires_at: True,
            )

        self.assertIsNone(outcome["response"])
        self.assertIs(outcome["state"], state)
        self.assertEqual(outcome["submissions"], [])
        self.assertFalse(outcome["publish_grade"])
        self.assertEqual(
            outcome["finalize_expired"],
            {
                "attempt": attempt,
                "group_id": "quiz-1",
                "target_ids": ["mcq-1", "mcq-2"],
                "settings": quiz_module.quiz_settings(group),
            },
        )
        self.assertEqual(grade.call_count, 0)

    def test_quiz_module_finish_expired_after_each_answer_returns_finalization_action(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
        )
        attempt = {
            "attemptId": "attempt-1",
            "status": "in_progress",
            "currentTargetId": "mcq-1",
            "submittedTargetIds": [],
            "startedAt": "2026-06-27T10:00:00Z",
            "finishedAt": None,
            "expiresAt": "2000-01-01T00:00:00Z",
            "score": None,
            "maxScore": None,
            "resultsByTargetId": {},
            "answerReviewAuthorized": False,
        }
        state = {"quiz-1": attempt}

        outcome = quiz_module.finish_quiz_attempt(
            {
                "attemptId": "attempt-1",
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "responsesByTargetId": {},
            },
            [group],
            [single_select_target("mcq-1"), single_select_target("mcq-2")],
            state,
            "usage-v1",
            lambda: "2026-06-27T10:02:00Z",
            lambda _expires_at: True,
        )

        self.assertIsNone(outcome["response"])
        self.assertIs(outcome["state"], state)
        self.assertEqual(outcome["submissions"], [])
        self.assertFalse(outcome["publish_grade"])
        self.assertEqual(
            outcome["finalize_expired"],
            {
                "attempt": attempt,
                "group_id": "quiz-1",
                "target_ids": ["mcq-1", "mcq-2"],
                "settings": quiz_module.quiz_settings(group),
            },
        )

    def test_quiz_module_finalizes_expired_attempt_state_without_mutating_input(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        attempt = {
            "attemptId": "attempt-1",
            "status": "in_progress",
            "currentTargetId": "mcq-2",
            "submittedTargetIds": ["mcq-1", "not-in-quiz"],
            "startedAt": "2026-06-27T10:00:00Z",
            "finishedAt": None,
            "expiresAt": "2000-01-01T00:00:00Z",
            "score": None,
            "maxScore": None,
            "resultsByTargetId": {
                "mcq-1": {
                    "isCorrect": True,
                    "score": 1.0,
                    "maxScore": 1,
                    "feedback": None,
                    "items": {},
                }
            },
            "answerReviewAuthorized": False,
        }
        state = {"quiz-1": attempt}

        outcome = quiz_module.finalize_expired_quiz_attempt(
            attempt,
            state,
            "quiz-1",
            ["mcq-1", "mcq-2"],
            quiz_module.quiz_settings(group),
            lambda: "2026-06-27T10:05:00Z",
        )

        self.assertTrue(outcome["response"]["success"])
        self.assertEqual(outcome["response"]["status"], "expired")
        self.assertIsNone(outcome["response"]["currentTargetId"])
        self.assertEqual(outcome["response"]["submittedTargetIds"], ["mcq-1"])
        self.assertEqual(outcome["response"]["score"], 1.0)
        self.assertEqual(outcome["response"]["maxScore"], 2.0)
        self.assertTrue(outcome["publish_grade"])
        finalized = outcome["state"]["quiz-1"]
        self.assertEqual(finalized["finishedAt"], "2026-06-27T10:05:00Z")
        self.assertTrue(finalized["answerReviewAuthorized"])
        self.assertNotIn("attemptCountsByTargetId", finalized)
        self.assertEqual(attempt["status"], "in_progress")
        self.assertEqual(attempt["submittedTargetIds"], ["mcq-1", "not-in-quiz"])

    def test_quiz_module_finalizes_ungraded_expired_attempt_without_publish_intent(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"], is_graded=False)
        attempt = {
            "attemptId": "attempt-1",
            "status": "in_progress",
            "currentTargetId": "mcq-1",
            "submittedTargetIds": [],
            "startedAt": "2026-06-27T10:00:00Z",
            "finishedAt": None,
            "expiresAt": "2000-01-01T00:00:00Z",
            "score": None,
            "maxScore": None,
            "resultsByTargetId": {},
            "answerReviewAuthorized": False,
        }

        outcome = quiz_module.finalize_expired_quiz_attempt(
            attempt,
            {"quiz-1": attempt},
            "quiz-1",
            ["mcq-1", "mcq-2"],
            quiz_module.quiz_settings(group),
            lambda: "2026-06-27T10:05:00Z",
        )

        self.assertFalse(outcome["publish_grade"])
        self.assertEqual(outcome["response"]["score"], 0.0)
        self.assertEqual(outcome["response"]["maxScore"], 2.0)

    def test_quiz_module_reveal_answers_reads_completed_attempt_without_mutation(self):
        group = quiz_group(target_ids=["mcq-1"], review_detail="full_review")
        attempt = {
            "attemptId": "attempt-1",
            "status": "completed",
            "currentTargetId": None,
            "submittedTargetIds": ["mcq-1"],
            "startedAt": "2026-06-27T10:00:00Z",
            "finishedAt": "2026-06-27T10:05:00Z",
            "expiresAt": None,
            "score": 1.0,
            "maxScore": 1.0,
            "resultsByTargetId": {
                "mcq-1": {
                    "isCorrect": True,
                    "score": 1.0,
                    "maxScore": 1,
                    "feedback": rich_feedback("Summary feedback"),
                    "items": {
                        "b": {
                            "correct": True,
                            "expected": True,
                            "given": True,
                            "feedback": rich_feedback("Choice feedback"),
                        },
                    },
                }
            },
            "answerReviewAuthorized": False,
        }
        state = {"quiz-1": attempt}

        outcome = quiz_module.reveal_quiz_answers(
            {"attemptId": "attempt-1", "groupId": "quiz-1"},
            [group],
            state,
        )

        self.assertTrue(outcome["response"]["success"])
        self.assertTrue(outcome["response"]["answerReviewAuthorized"])
        response_json = json.dumps(outcome["response"], sort_keys=True)
        self.assertIn('"expected"', response_json)
        self.assertIn("Summary feedback", response_json)
        self.assertIn("Choice feedback", response_json)
        self.assertIsNone(outcome["state"])
        self.assertFalse(attempt["answerReviewAuthorized"])

    def test_quiz_module_reveal_answers_rejects_incomplete_attempt(self):
        group = quiz_group(target_ids=["mcq-1"], review_detail="full_review")
        attempt = {
            "attemptId": "attempt-1",
            "status": "in_progress",
            "currentTargetId": "mcq-1",
            "submittedTargetIds": [],
            "startedAt": "2026-06-27T10:00:00Z",
            "finishedAt": None,
            "expiresAt": None,
            "score": None,
            "maxScore": None,
            "resultsByTargetId": {},
            "answerReviewAuthorized": False,
        }

        outcome = quiz_module.reveal_quiz_answers(
            {"attemptId": "attempt-1", "groupId": "quiz-1"},
            [group],
            {"quiz-1": attempt},
        )

        self.assertEqual(
            outcome,
            {
                "response": {
                    "success": False,
                    "error": "quiz attempt is not complete",
                },
                "state": None,
            },
        )
        self.assertFalse(attempt["answerReviewAuthorized"])

    def test_studio_fragment_uses_outer_and_inner_iframe_payload_with_scoped_host_css(self):
        block = make_xblock()
        stored_snapshot_json = json.dumps(
            {
                "snapshotVersion": 1,
                "artifactId": "usage-v1",
                "problems": {},
                "quizzes": {},
            },
        )
        block.assessment_snapshot_json = stored_snapshot_json
        block.learner_activity_snapshot_json = json.dumps(
            {
                "snapshotVersion": 1,
                "artifactId": "usage-v1",
                "activities": {},
            },
        )

        def fake_resource_string(path):
            if path == "static/studio-host.css":
                return ".modal-type-scaffold.sc-xblock-host-modal {}"
            if path == "static/studio.js":
                return "studio bootstrap"
            return ""

        with patch.object(scaffold, "Fragment", FragmentRecorder), patch.object(
            views_module,
            "resource_string",
            side_effect=fake_resource_string,
        ), patch.object(
            block,
            "_assessment_snapshot",
            wraps=block._assessment_snapshot,
        ) as assessment_snapshot_getter, patch.object(
            block,
            "_learner_activity_snapshot",
            wraps=block._learner_activity_snapshot,
        ) as learner_activity_getter:
            fragment = block.studio_view()

        self.assertEqual(
            fragment.css,
            [".modal-type-scaffold.sc-xblock-host-modal {}"],
        )
        self.assertEqual(fragment.css_urls, [])
        self.assertEqual(fragment.javascript, ["studio bootstrap"])
        self.assertEqual(len(fragment.initialized), 1)
        initializer, payload = fragment.initialized[0]
        self.assertEqual(initializer, "ScaffoldStudioView")
        self.assertNotIn("url", payload)
        self.assertEqual(payload["outerUrl"], "/xblock/public/studio-ui.js")
        self.assertEqual(payload["innerUrl"], "/xblock/public/studio-inner.html")
        self.assertEqual(payload["view"], "studio")
        self.assertEqual(payload["protocolVersion"], 1)
        self.assertEqual(payload["mediaContext"], "authoring")
        self.assertEqual(payload["resolvedMedia"], {})
        self.assertNotIn("assessmentSnapshot", payload)
        self.assertNotIn("learnerActivitySnapshot", payload)
        self.assertEqual(block.assessment_snapshot_json, stored_snapshot_json)
        assessment_snapshot_getter.assert_not_called()
        learner_activity_getter.assert_not_called()

    def test_student_fragment_pre_resolves_managed_media_payload(self):
        block = make_xblock()
        block._course_key = lambda: "course-v1:test"
        media_id = "images/scaffold-photo.png"
        block.learner_content_json = json.dumps(
            course_document(
                [
                    {
                        "type": "image_block",
                        "attrs": {
                            "data": {
                                "mode": "managed",
                                "mediaId": media_id,
                            }
                        },
                    },
                ],
            ),
        )
        store = ContentStoreStub()

        with patch.object(scaffold, "Fragment", FragmentRecorder), patch.object(
            views_module,
            "resource_string",
            return_value="student bootstrap",
        ), patch.object(
            media_store,
            "HAS_STATIC_CONTENT",
            True,
        ), patch.object(
            media_store,
            "StaticContent",
            StaticContentStub,
        ), patch.object(
            media_store,
            "contentstore",
            lambda: store,
        ):
            fragment = block.student_view()

        initializer, payload = fragment.initialized[0]
        asset_key = "course-v1:test:%s" % media_id
        asset_url = "/assets/static/%s" % asset_key

        self.assertEqual(initializer, "ScaffoldStudentView")
        self.assertEqual(payload["mediaContext"], "runtime")
        self.assertEqual(
            payload["learnerActivitySnapshot"],
            {
                "snapshotVersion": 1,
                "artifactId": "usage-v1",
                "activities": {},
            },
        )
        self.assertEqual(payload["resolvedMedia"][media_id], asset_url)
        self.assertEqual(payload["resolvedMedia"][asset_key], asset_url)
        self.assertEqual(store.lookups, [asset_key])

    def test_student_fragment_skips_media_resolution_without_contentstore(self):
        block = make_xblock()
        block.learner_content_json = json.dumps(
            course_document(
                [
                    {
                        "type": "image_block",
                        "attrs": {
                            "data": {
                                "mode": "managed",
                                "mediaId": "images/scaffold-photo.png",
                            }
                        },
                    },
                ],
            ),
        )

        with patch.object(scaffold, "Fragment", FragmentRecorder), patch.object(
            views_module,
            "resource_string",
            return_value="student bootstrap",
        ), patch.object(
            media_store,
            "HAS_STATIC_CONTENT",
            False,
        ):
            fragment = block.student_view()

        _initializer, payload = fragment.initialized[0]
        self.assertEqual(payload["resolvedMedia"], {})

    def test_setup_package_data_includes_inner_iframe_html(self):
        setup_path = Path(__file__).resolve().parents[1] / "setup.py"
        tree = ast.parse(setup_path.read_text())
        setup_call = next(
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and getattr(node.func, "id", None) == "setup"
        )
        package_data_node = next(
            keyword.value
            for keyword in setup_call.keywords
            if keyword.arg == "package_data"
        )
        package_data = ast.literal_eval(package_data_node)

        self.assertIn(
            "public/*.html",
            package_data["scaffold_xblock"],
        )

    def test_media_store_extracts_unique_media_ids_from_nested_content(self):
        content = {
            "type": "doc",
            "content": [
                {
                    "type": "image_block",
                    "attrs": {"data": {"mediaId": "images/photo.png"}},
                },
                {
                    "type": "audio_block",
                    "attrs": {"data": {"mediaId": "audio/clip.mp3"}},
                },
                {"mediaId": "images/photo.png"},
                {"mediaId": ""},
                {"mediaId": 42},
            ],
        }

        self.assertEqual(
            media_store.media_ids_from_content(content),
            ["audio/clip.mp3", "images/photo.png"],
        )

    def test_media_store_content_resolution_defers_course_key_until_needed(self):
        def fail_course_key():
            self.fail("course key should not be resolved")

        with patch.object(media_store, "HAS_STATIC_CONTENT", False):
            self.assertEqual(
                media_store.resolved_media_urls_for_content(
                    {"mediaId": "images/photo.png"},
                    fail_course_key,
                ),
                {},
            )

        with patch.object(media_store, "HAS_STATIC_CONTENT", True):
            self.assertEqual(
                media_store.resolved_media_urls_for_content(
                    {"type": "doc", "content": []},
                    fail_course_key,
                ),
                {},
            )

    def test_media_store_resolves_managed_media_id(self):
        store = ContentStoreStub()

        with patch.object(media_store, "HAS_STATIC_CONTENT", True), patch.object(
            media_store,
            "StaticContent",
            StaticContentStub,
        ), patch.object(
            media_store,
            "contentstore",
            lambda: store,
        ), patch.object(media_store.log, "exception") as log_exception:
            result = media_store.resolve_media(
                {"mediaId": "images/scaffold-photo.png"},
                "course-v1:test",
            )

        asset_key = "course-v1:test:images/scaffold-photo.png"
        self.assertEqual(
            result,
            {
                "success": True,
                "mediaId": asset_key,
                "url": "/assets/static/%s" % asset_key,
            },
        )
        self.assertEqual(store.lookups, [asset_key])

    def test_media_store_resolve_hides_contentstore_error_details(self):
        class FailingContentStore(ContentStoreStub):
            def find(self, asset_key):
                self.lookups.append(asset_key)
                raise RuntimeError("secret storage path")

        store = FailingContentStore()

        with patch.object(media_store, "HAS_STATIC_CONTENT", True), patch.object(
            media_store,
            "StaticContent",
            StaticContentStub,
        ), patch.object(
            media_store,
            "contentstore",
            lambda: store,
        ), patch.object(media_store.log, "exception") as log_exception:
            result = media_store.resolve_media(
                {"mediaId": "images/scaffold-photo.png"},
                "course-v1:test",
            )

        self.assertEqual(
            result,
            {"success": False, "error": "media could not be resolved"},
        )
        self.assertNotIn("secret storage path", result["error"])
        log_exception.assert_called_once()

    def test_media_store_lists_managed_media_by_media_type(self):
        store = ContentStoreStub(
            assets=[
                {
                    "_id": "images/scaffold-photo.png",
                    "displayname": "scaffold-photo.png",
                    "contentType": "image/png",
                    "length": "42",
                },
                {
                    "_id": "documents/brief.pdf",
                    "displayname": "brief.pdf",
                    "contentType": "application/pdf",
                    "length": "100",
                },
            ],
        )

        with patch.object(media_store, "HAS_STATIC_CONTENT", True), patch.object(
            media_store,
            "StaticContent",
            StaticContentStub,
        ), patch.object(
            media_store,
            "contentstore",
            lambda: store,
        ):
            result = media_store.list_media({"mediaType": "image"}, "course-v1:test")

        asset_key = "course-v1:test:images/scaffold-photo.png"
        self.assertEqual(result["success"], True)
        self.assertEqual(
            result["items"],
            [
                {
                    "id": "images/scaffold-photo.png",
                    "url": "/assets/static/%s" % asset_key,
                    "mediaType": "image",
                    "fileName": "scaffold-photo.png",
                    "mimeType": "image/png",
                    "size": 42,
                },
            ],
        )
        self.assertEqual(store.lookups, ["course-v1:test"])

    def test_media_store_list_hides_contentstore_error_details(self):
        class FailingContentStore(ContentStoreStub):
            def get_all_content_for_course(self, course_key):
                self.lookups.append(course_key)
                raise RuntimeError("secret contentstore query")

        store = FailingContentStore()

        with patch.object(media_store, "HAS_STATIC_CONTENT", True), patch.object(
            media_store,
            "contentstore",
            lambda: store,
        ), patch.object(media_store.log, "exception") as log_exception:
            result = media_store.list_media({}, "course-v1:test")

        self.assertEqual(
            result,
            {"success": False, "error": "media could not be listed"},
        )
        self.assertNotIn("secret contentstore query", result["error"])
        log_exception.assert_called_once()

    def test_media_store_upload_hides_contentstore_error_details(self):
        class UploadStaticContentStub:
            @staticmethod
            def compute_location(course_key, filename):
                return "%s:%s" % (course_key, filename)

            @staticmethod
            def get_static_path_from_location(asset_key):
                return "static/%s" % asset_key

            @staticmethod
            def get_canonicalized_asset_path(course_key, portable_url, *_args):
                return "/assets/%s" % portable_url

            def __init__(self, location, filename, content_type, payload, length):
                self.location = location
                self.filename = filename
                self.content_type = content_type
                self.payload = payload
                self.length = length

        class FailingContentStore:
            def generate_thumbnail(self, _content):
                return None, None

            def save(self, _content):
                raise RuntimeError("secret upload backend path")

        with patch.object(media_store, "HAS_STATIC_CONTENT", True), patch.object(
            media_store,
            "StaticContent",
            UploadStaticContentStub,
        ), patch.object(
            media_store,
            "contentstore",
            lambda: FailingContentStore(),
        ), patch.object(media_store.log, "exception") as log_exception:
            result = media_store.upload_media(
                {
                    "mediaType": "text",
                    "filename": "notes.txt",
                    "contentType": "text/plain",
                    "dataUrl": "data:text/plain;base64,aGVsbG8=",
                },
                "course-v1:test",
            )

        self.assertEqual(result, {"success": False, "error": "media upload failed"})
        self.assertNotIn("secret upload backend path", result["error"])
        log_exception.assert_called_once()

    def test_media_store_upload_keeps_validation_errors_actionable(self):
        with patch.object(media_store, "HAS_STATIC_CONTENT", True):
            result = media_store.upload_media(
                {
                    "mediaType": "image",
                    "filename": "notes.txt",
                    "contentType": "text/plain",
                    "dataUrl": "data:text/plain;base64,aGVsbG8=",
                },
                "course-v1:test",
            )

        self.assertEqual(
            result,
            {
                "success": False,
                "error": "file does not match the requested mediaType",
            },
        )

    def test_media_handler_hides_course_key_error_details(self):
        block = make_xblock()
        block._course_key = lambda: (_ for _ in ()).throw(
            RuntimeError("secret course key"),
        )

        with patch.object(scaffold.log, "exception") as log_exception:
            result = block.resolve_media({"mediaId": "images/scaffold-photo.png"})

        self.assertEqual(
            result,
            {"success": False, "error": "media could not be resolved"},
        )
        self.assertNotIn("secret course key", result["error"])
        log_exception.assert_called_once()

    def test_student_fragment_hydrates_learner_activity_snapshot(self):
        block = make_xblock()
        block.learner_activity_snapshot_json = json.dumps(
            {
                "snapshotVersion": 1,
                "artifactId": "usage-v1",
                "activities": {
                    "flashcard-1": {
                        "activityKind": "flashcard",
                        "data": {"currentSectionId": "card-1"},
                        "completed": False,
                        "updatedAt": "2026-06-25T18:00:00Z",
                    },
                },
            },
        )

        with patch.object(scaffold, "Fragment", FragmentRecorder), patch.object(
            views_module,
            "resource_string",
            return_value="student bootstrap",
        ):
            fragment = block.student_view()

        _, payload = fragment.initialized[0]
        self.assertEqual(
            payload["learnerActivitySnapshot"],
            {
                "snapshotVersion": 1,
                "artifactId": "usage-v1",
                "activities": {
                    "flashcard-1": {
                        "activityKind": "flashcard",
                        "data": {"currentSectionId": "card-1"},
                        "completed": False,
                        "updatedAt": "2026-06-25T18:00:00Z",
                    },
                },
            },
        )

    def test_student_fragment_emits_a_learner_safe_assessment_snapshot(self):
        block = make_xblock([single_select_target(show_answer=False)])
        stored_result = {
            "isCorrect": False,
            "score": 0,
            "maxScore": 1,
            "feedback": rich_feedback("Bootstrap summary feedback"),
            "items": {
                "a": {
                    "correct": False,
                    "expected": False,
                    "given": True,
                    "feedback": rich_feedback("Bootstrap choice feedback"),
                },
                "b": {"correct": False, "expected": True, "given": False},
            },
        }
        snapshot = {
            "snapshotVersion": 1,
            "artifactId": "usage-v1",
            "problems": {
                "mcq-1": {
                    "response": {"kind": "single-select", "optionId": "b"},
                    "attemptNumber": 1,
                    "hintsShown": 0,
                    "checkResult": None,
                    "submitted": True,
                    "submissionResult": stored_result,
                },
            },
            "quizzes": {},
        }
        block.assessment_snapshot_json = json.dumps(snapshot)
        activity_snapshot = {
            "snapshotVersion": 1,
            "artifactId": "usage-v1",
            "activities": {},
        }
        block.learner_activity_snapshot_json = json.dumps(
            activity_snapshot,
        )

        with patch.object(scaffold, "Fragment", FragmentRecorder), patch.object(
            views_module,
            "resource_string",
            return_value="student bootstrap",
        ):
            fragment = block.student_view()

        _, payload = fragment.initialized[0]
        public_snapshot = payload["assessmentSnapshot"]
        public_result = public_snapshot["problems"]["mcq-1"]["submissionResult"]
        self.assertIsNone(public_result["feedback"])
        self.assertEqual(public_result["items"], {})
        public_json = json.dumps(public_snapshot, sort_keys=True)
        self.assertNotIn('"expected"', public_json)
        self.assertNotIn("Bootstrap summary feedback", public_json)
        self.assertNotIn("Bootstrap choice feedback", public_json)
        self.assertEqual(json.loads(block.assessment_snapshot_json), snapshot)
        self.assertEqual(
            payload["learnerActivitySnapshot"],
            activity_snapshot,
        )

    def test_assessment_projection_import_graph_is_one_way(self):
        module_root = Path(__file__).resolve().parents[1] / "scaffold_xblock"
        graph = scaffold_xblock_import_graph(module_root)
        non_singleton_components = non_singleton_strongly_connected_components(
            graph
        )
        self.assertEqual(non_singleton_components, [])
        self.assertEqual(
            len(graph),
            len(list(module_root.rglob("*.py"))),
        )

        projection_module = "scaffold_xblock.assessment_projection"
        public_module_name = "scaffold_xblock.public"
        quiz_module_name = "scaffold_xblock.quiz"
        projection_modules = {
            projection_module,
            public_module_name,
            quiz_module_name,
        }
        self.assertNotIn(
            public_module_name,
            reachable_modules(graph, quiz_module_name),
        )

        allowed_dependencies = {
            projection_module: set(),
            public_module_name: {projection_module, quiz_module_name},
            quiz_module_name: {projection_module},
        }
        for module_name, allowed in allowed_dependencies.items():
            dependencies = graph[module_name] & projection_modules
            self.assertLessEqual(dependencies, allowed)
        self.assertIn(projection_module, graph[public_module_name])
        self.assertIn(quiz_module_name, graph[public_module_name])
        self.assertIn(projection_module, graph[quiz_module_name])

    def test_import_graph_detects_function_local_relative_import_cycle(self):
        self.assert_scaffold_xblock_import_cycle(
            {
                "public": (
                    "def public_assessment_snapshot():\n"
                    "    from .quiz import public_quiz_attempt\n"
                ),
                "quiz": "from .public import public_assessment_result\n",
            },
            [["scaffold_xblock.public", "scaffold_xblock.quiz"]],
        )

    def test_import_graph_detects_from_package_import_cycle(self):
        self.assert_scaffold_xblock_import_cycle(
            {
                "public": "from .quiz import public_quiz_attempt\n",
                "quiz": "from scaffold_xblock import public\n",
            },
            [["scaffold_xblock.public", "scaffold_xblock.quiz"]],
        )

    def test_import_graph_detects_absolute_import_cycle(self):
        self.assert_scaffold_xblock_import_cycle(
            {
                "public": "from .quiz import public_quiz_attempt\n",
                "quiz": "import scaffold_xblock.public\n",
            },
            [["scaffold_xblock.public", "scaffold_xblock.quiz"]],
        )

    def test_import_graph_detects_cycle_through_intermediate_module(self):
        self.assert_scaffold_xblock_import_cycle(
            {
                "bridge": "from .public import public_assessment_snapshot\n",
                "public": "from .quiz import public_quiz_attempt\n",
                "quiz": "from .bridge import public_assessment_result\n",
            },
            [
                [
                    "scaffold_xblock.bridge",
                    "scaffold_xblock.public",
                    "scaffold_xblock.quiz",
                ]
            ],
        )

    def assert_scaffold_xblock_import_cycle(self, module_sources, expected_components):
        sources = {
            "__init__": "",
            "assessment_projection": "",
            "public": "",
            "quiz": "",
            **module_sources,
        }
        with TemporaryDirectory() as temporary_directory:
            module_root = Path(temporary_directory) / "scaffold_xblock"
            module_root.mkdir()
            for module_name, source in sources.items():
                (module_root / (module_name + ".py")).write_text(
                    source,
                    encoding="utf-8",
                )

            graph = scaffold_xblock_import_graph(module_root)

        self.assertEqual(
            non_singleton_strongly_connected_components(graph),
            expected_components,
        )

    def test_assessment_projection_redacts_items_and_requires_feedback_authorization(self):
        result = {
            "isCorrect": False,
            "score": 0,
            "maxScore": 1,
            "feedback": rich_feedback("Binary summary feedback"),
            "items": {
                "multi-select-option": {
                    "correct": False,
                    "expected": True,
                    "given": False,
                },
                "hotspot-region": {
                    "correct": True,
                    "expected": True,
                    "given": True,
                },
            },
        }

        redacted = assessment_projection_module.public_assessment_result(result)
        authorized = assessment_projection_module.public_assessment_result(
            result,
            include_authored_feedback=True,
        )

        self.assertEqual(
            redacted,
            {
                "isCorrect": False,
                "score": 0,
                "maxScore": 1,
                "feedback": None,
                "items": {},
            },
        )
        self.assertEqual(authorized["feedback"], result["feedback"])
        self.assertIsNot(authorized["feedback"], result["feedback"])
        self.assertEqual(authorized["items"], {})

    def test_student_fragment_quiz_snapshot_is_identity_free_and_policy_redacted(self):
        group = quiz_group(target_ids=["mcq-1"], review_detail="result_only")
        block = make_xblock([single_select_target()], groups=[group])
        stored_result = {
            "isCorrect": False,
            "score": 0,
            "maxScore": 1,
            "feedback": rich_feedback("Quiz bootstrap feedback"),
            "items": {
                "a": {"correct": False, "expected": False, "given": True},
                "b": {"correct": False, "expected": True, "given": False},
            },
        }
        snapshot = {
            "snapshotVersion": 1,
            "artifactId": "usage-v1",
            "problems": {
                "mcq-1": {
                    "response": {"kind": "single-select", "optionId": "a"},
                    "attemptNumber": 1,
                    "hintsShown": 0,
                    "checkResult": None,
                    "submitted": True,
                    "submissionResult": stored_result,
                },
            },
            "quizzes": {
                "quiz-1": {
                    "attemptId": "attempt-1",
                    "status": "completed",
                    "currentTargetId": None,
                    "submittedTargetIds": ["mcq-1"],
                    "startedAt": "2026-06-27T10:00:00Z",
                    "finishedAt": "2026-06-27T10:01:00Z",
                    "expiresAt": None,
                    "score": 0,
                    "maxScore": 1,
                    "resultsByTargetId": {"mcq-1": stored_result},
                    "answerReviewAuthorized": True,
                },
            },
        }
        block.assessment_snapshot_json = json.dumps(snapshot)

        with patch.object(scaffold, "Fragment", FragmentRecorder), patch.object(
            views_module,
            "resource_string",
            return_value="student bootstrap",
        ):
            fragment = block.student_view()

        _, payload = fragment.initialized[0]
        public_snapshot = payload["assessmentSnapshot"]
        self.assertNotIn("groupId", public_snapshot["quizzes"]["quiz-1"])
        self.assertEqual(
            public_snapshot["quizzes"]["quiz-1"]["resultsByTargetId"]["mcq-1"]["items"],
            {},
        )
        self.assertEqual(
            public_snapshot["problems"]["mcq-1"]["submissionResult"]["items"],
            {},
        )
        public_json = json.dumps(public_snapshot, sort_keys=True)
        self.assertNotIn('"expected"', public_json)
        self.assertNotIn("Quiz bootstrap feedback", public_json)
        state_codecs.serialize_assessment_snapshot(public_snapshot, "usage-v1")
        self.assertEqual(json.loads(block.assessment_snapshot_json), snapshot)

    def test_student_fragment_can_mark_media_context_as_preview(self):
        block = make_xblock()

        with patch.object(scaffold, "Fragment", FragmentRecorder), patch.object(
            views_module,
            "resource_string",
            return_value="student bootstrap",
        ):
            fragment = block.student_view({"preview": True})

        _, payload = fragment.initialized[0]
        self.assertEqual(payload["mediaContext"], "preview")

    def test_content_save_validation_returns_normalized_bundle(self):
        target = single_select_target()
        group = quiz_group(target_ids=["mcq-1"])
        payload = save_payload(
            title="  Saved lesson  ",
            assessment_targets=[target],
            assessment_groups=[group],
        )

        bundle = content_save_module.validate_content_save_bundle(
            payload,
            "usage-v1",
            scaffold.SCAFFOLD_MODES,
        )

        self.assertEqual(bundle["title"], "Saved lesson")
        self.assertEqual(bundle["artifact"], payload["artifact"])
        self.assertEqual(bundle["learner_content"], payload["learnerContent"])
        self.assertEqual(bundle["assessment_targets"], [target])
        self.assertEqual(bundle["assessment_groups"], [group])

    def test_content_save_validation_rejects_document_mode_mismatch(self):
        payload = save_payload(mode="slideshow", content=course_document(mode="page"))

        with self.assertRaisesRegex(
            content_save_module.ContentSaveValidationError,
            "artifact.mode must match artifact.content courseDocument mode",
        ):
            content_save_module.validate_content_save_bundle(
                payload,
                "usage-v1",
                scaffold.SCAFFOLD_MODES,
            )

    def test_create_artifact_persists_empty_bundle_for_selected_mode(self):
        block = make_xblock()
        block.artifact_json = ""
        block.learner_content_json = ""
        block.assessment_targets_json = "[]"
        block.assessment_groups_json = "[]"
        block.display_name = "  New lesson  "
        expected_content = course_document(
            [{"type": "paragraph"}],
            mode="slideshow",
            surface_attrs={"variant": "slide-blank"},
        )

        result = block.create_artifact({"mode": "slideshow"})

        self.assertEqual(
            result,
            {
                "success": True,
                "artifact": {
                    "id": "usage-v1",
                    "title": "New lesson",
                    "mode": "slideshow",
                    "content": expected_content,
                },
            },
        )
        self.assertEqual(block.display_name, "New lesson")
        self.assertEqual(json.loads(block.artifact_json), result["artifact"])
        self.assertEqual(json.loads(block.learner_content_json), expected_content)
        self.assertEqual(json.loads(block.assessment_targets_json), [])
        self.assertEqual(json.loads(block.assessment_groups_json), [])

    def test_create_artifact_uses_page_default_surface_variant(self):
        block = make_xblock()
        block.artifact_json = ""
        block.learner_content_json = ""

        result = block.create_artifact({"mode": "page"})

        surface = result["artifact"]["content"]["content"][0]["content"][0]
        self.assertEqual(surface["attrs"], {
            "id": "surface-1",
            "variant": "page-default",
        })

    def test_create_artifact_uses_slideshow_blank_surface_variant(self):
        block = make_xblock()
        block.artifact_json = ""
        block.learner_content_json = ""

        result = block.create_artifact({"mode": "slideshow"})

        surface = result["artifact"]["content"]["content"][0]["content"][0]
        self.assertEqual(surface["attrs"], {
            "id": "surface-1",
            "variant": "slide-blank",
        })

    def test_create_artifact_returns_existing_artifact_without_overwriting(self):
        block = make_xblock()
        existing_artifact = json.loads(block.artifact_json)

        result = block.create_artifact({"mode": "slideshow"})

        self.assertEqual(result, {"success": True, "artifact": existing_artifact})
        self.assertEqual(json.loads(block.artifact_json), existing_artifact)
        self.assertEqual(existing_artifact["mode"], "page")

    def test_create_artifact_requires_studio_write_access(self):
        block = make_xblock()
        block._has_studio_write_access = lambda: False

        result = block.create_artifact({"mode": "page"})

        self.assertEqual(
            result,
            {"success": False, "error": "authoring permission required"},
        )

    def test_create_artifact_rejects_unsupported_creation_mode(self):
        block = make_xblock()

        result = block.create_artifact({"mode": "branching"})

        self.assertEqual(
            result,
            {"success": False, "error": "artifact mode is invalid"},
        )

    def test_save_content_persists_author_learner_and_target_contracts(self):
        block = make_xblock()
        target = single_select_target()
        author_doc = course_document(
            [
                {
                    "type": "mcq",
                    "attrs": {
                        "id": "mcq-1",
                        "assessment": {"correctOptionId": "do-not-read-in-python"},
                    },
                },
            ],
        )
        learner_doc = course_document([{"type": "paragraph"}])

        result = block.save_content(
            save_payload(
                content=author_doc,
                learner_content=learner_doc,
                assessment_targets=[target],
            ),
        )

        self.assertEqual(
            result,
            {"success": True, "artifact": {"title": "Saved lesson"}},
        )
        saved_artifact = json.loads(block.artifact_json)
        self.assertEqual(
            saved_artifact,
            {
                "id": "usage-v1",
                "title": "Saved lesson",
                "mode": "page",
                "content": author_doc,
            },
        )
        self.assertEqual(json.loads(block.learner_content_json), learner_doc)
        self.assertEqual(json.loads(block.assessment_targets_json), [target])
        self.assertEqual(json.loads(block.assessment_groups_json), [])

    def test_save_content_persists_assessment_groups(self):
        block = make_xblock()
        targets = [single_select_target("mcq-1")]
        groups = [quiz_group(target_ids=["mcq-1"])]

        result = block.save_content(
            save_payload(
                assessment_targets=targets,
                assessment_groups=groups,
            ),
        )

        self.assertEqual(
            result,
            {"success": True, "artifact": {"title": "Saved lesson"}},
        )
        self.assertEqual(json.loads(block.assessment_groups_json), groups)

    def test_save_content_requires_studio_write_access(self):
        block = make_xblock()
        block._has_studio_write_access = lambda: False

        result = block.save_content(
            save_payload(),
        )

        self.assertEqual(
            result,
            {"success": False, "error": "authoring permission required"},
        )

    def test_save_content_requires_projected_assessment_targets(self):
        block = make_xblock()

        result = block.save_content(
            {
                "artifact": {
                    "id": "usage-v1",
                    "title": "Saved lesson",
                    "mode": "page",
                    "content": course_document(),
                },
                "learnerContent": course_document(),
            },
        )

        self.assertEqual(
            result,
            {"success": False, "error": "assessmentTargets must be a JSON array"},
        )

    def test_save_content_rejects_oversized_artifact(self):
        block = make_xblock()

        result = block.save_content(
            save_payload(
                content=course_document(
                    [
                        {
                            "type": "paragraph",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "x"
                                    * (scaffold.SAVE_PAYLOAD_MAX_BYTES["artifact"] + 1),
                                },
                            ],
                        },
                    ],
                ),
            ),
        )

        self.assertEqual(
            result,
            {"success": False, "error": "artifact is too large to save"},
        )

    def test_save_content_rejects_wrong_artifact_id(self):
        block = make_xblock()

        result = block.save_content(save_payload(artifact_id="other-usage"))

        self.assertEqual(
            result,
            {"success": False, "error": "artifact.id does not match activity"},
        )

    def test_save_content_rejects_oversized_assessment_groups(self):
        block = make_xblock()

        result = block.save_content(
            save_payload(
                assessment_groups=[
                    {
                        "groupId": "quiz-1",
                        "title": "x"
                        * (scaffold.SAVE_PAYLOAD_MAX_BYTES["assessmentGroups"] + 1),
                    },
                ],
            ),
        )

        self.assertEqual(
            result,
            {"success": False, "error": "assessmentGroups is too large to save"},
        )

    def test_save_content_requires_assessment_groups_array(self):
        block = make_xblock()
        payload = save_payload()
        payload["assessmentGroups"] = {"groupId": "quiz-1"}

        result = block.save_content(payload)

        self.assertEqual(
            result,
            {"success": False, "error": "assessmentGroups must be a JSON array"},
        )

    def test_save_content_requires_explicit_assessment_groups(self):
        block = make_xblock()
        payload = save_payload()
        payload.pop("assessmentGroups")

        result = block.save_content(payload)

        self.assertEqual(
            result,
            {"success": False, "error": "assessmentGroups must be a JSON array"},
        )

    def test_save_content_rejects_old_and_future_assessment_contracts(self):
        current_target = single_select_target("mcq-1")
        current_group = quiz_group(target_ids=["mcq-1"])
        old_target = dict(current_target)
        old_target.pop("schemaVersion")
        old_group = dict(current_group)
        old_group.pop("schemaVersion")
        cases = [
            ([old_target], [], "old target"),
            ([{**current_target, "schemaVersion": 2}], [], "future target"),
            ([current_target], [old_group], "old group"),
            (
                [current_target],
                [{**current_group, "schemaVersion": 2}],
                "future group",
            ),
        ]

        for targets, groups, label in cases:
            with self.subTest(label=label):
                block = make_xblock()

                result = block.save_content(
                    save_payload(
                        assessment_targets=targets,
                        assessment_groups=groups,
                    ),
                )

                self.assertFalse(result["success"])

    def test_rejected_content_saves_leave_all_content_fields_unchanged(self):
        rejected_payloads = []

        missing_groups = save_payload(title="Rejected missing groups")
        missing_groups.pop("assessmentGroups")
        rejected_payloads.append(missing_groups)
        rejected_payloads.append(save_payload(artifact_id="other-usage"))
        rejected_payloads.append(
            save_payload(learner_content={"type": "not-a-course-document"}),
        )

        invalid_target = single_select_target()
        invalid_target["schemaVersion"] = 2
        rejected_payloads.append(save_payload(assessment_targets=[invalid_target]))
        rejected_payloads.append(
            save_payload(
                assessment_targets=[single_select_target("mcq-1")],
                assessment_groups=[quiz_group(target_ids=["missing-target"])],
            ),
        )
        rejected_payloads.append(
            save_payload(
                assessment_targets=[single_select_target("mcq-1")],
                assessment_groups=[
                    {**quiz_group(target_ids=["mcq-1"]), "schemaVersion": 2},
                ],
            ),
        )

        field_names = (
            "display_name",
            "artifact_json",
            "learner_content_json",
            "assessment_targets_json",
            "assessment_groups_json",
        )
        for payload in rejected_payloads:
            with self.subTest(payload=payload):
                block = make_xblock(
                    targets=[single_select_target("existing-target")],
                )
                block.display_name = "Existing title"
                before = {name: getattr(block, name) for name in field_names}

                result = block.save_content(payload)

                self.assertFalse(result["success"])
                self.assertEqual(
                    {name: getattr(block, name) for name in field_names},
                    before,
                )

    def test_save_content_rejects_invalid_assessment_group_contracts(self):
        targets = [
            single_select_target("mcq-1"),
            single_select_target("mcq-2"),
        ]

        cases = [
            (
                [
                    {
                        **quiz_group(group_id="quiz-1", target_ids=["mcq-1"]),
                        "kind": "lesson",
                    }
                ],
                "assessmentGroups[0].kind is not supported",
            ),
            (
                [
                    quiz_group(group_id="quiz-1", target_ids=["mcq-1"]),
                    quiz_group(group_id="quiz-1", target_ids=["mcq-2"]),
                ],
                "assessmentGroups[1].groupId must be unique",
            ),
            (
                [quiz_group(target_ids=["mcq-1", "missing-target"])],
                "assessmentGroups[0].targetIds[1] must reference an assessment target",
            ),
            (
                [quiz_group(target_ids=["mcq-1", "mcq-1"])],
                "assessmentGroups[0].targetIds[1] must be unique",
            ),
            (
                [
                    {
                        **quiz_group(target_ids=["mcq-1"]),
                        "settings": {
                            **quiz_group(target_ids=["mcq-1"])["settings"],
                            "attemptsPerQuestion": 4,
                        },
                    }
                ],
                "assessmentGroups[0].settings.attemptsPerQuestion is not supported",
            ),
            (
                [
                    {
                        **quiz_group(target_ids=["mcq-1"]),
                        "settings": {
                            **quiz_group(target_ids=["mcq-1"])["settings"],
                            "timer": {"enabled": True, "durationSeconds": -1},
                        },
                    }
                ],
                "assessmentGroups[0].settings.timer.durationSeconds must be a non-negative integer",
            ),
        ]

        for groups, error in cases:
            with self.subTest(error=error):
                block = make_xblock()

                result = block.save_content(
                    save_payload(
                        assessment_targets=targets,
                        assessment_groups=groups,
                    ),
                )

                self.assertEqual(result, {"success": False, "error": error})
                self.assertEqual(json.loads(block.assessment_groups_json), [])

    def test_save_content_rejects_invalid_assessment_target_contract(self):
        block = make_xblock()
        target = single_select_target()
        target["assessment"]["kind"] = "multi-select"

        result = block.save_content(
            save_payload(assessment_targets=[target]),
        )

        self.assertEqual(
            result,
            {
                "success": False,
                "error": "assessmentTargets[0].assessment.kind must match interaction.kind",
            },
        )
        self.assertEqual(json.loads(block.assessment_targets_json), [])

    def test_save_content_rejects_non_answer_assessment_sentinels(self):
        for kind in ("none", "needs-review"):
            with self.subTest(kind=kind):
                block = make_xblock()
                target = single_select_target()
                target["assessment"] = {"kind": kind}

                result = block.save_content(
                    save_payload(assessment_targets=[target]),
                )

                self.assertEqual(
                    result,
                    {
                        "success": False,
                        "error": "assessmentTargets[0].assessment.kind is not supported",
                    },
                )
                self.assertEqual(json.loads(block.assessment_targets_json), [])

    def test_save_content_rejects_duplicate_target_ids(self):
        block = make_xblock()

        result = block.save_content(
            save_payload(
                assessment_targets=[
                    single_select_target(target_id="mcq-1"),
                    single_select_target(target_id="mcq-1"),
                ],
            ),
        )

        self.assertEqual(
            result,
            {
                "success": False,
                "error": "assessmentTargets[1].targetId must be unique",
            },
        )
        self.assertEqual(json.loads(block.assessment_targets_json), [])

    def test_media_upload_validation_rejects_svg_images(self):
        with self.assertRaisesRegex(ValueError, "not an allowed image upload"):
            scaffold.validate_media_upload(
                "image",
                "unsafe.svg",
                "image/svg+xml",
                b"<svg></svg>",
            )

    def test_media_upload_validation_rejects_disallowed_extension(self):
        with self.assertRaisesRegex(ValueError, "not an allowed image upload"):
            scaffold.validate_media_upload(
                "image",
                "unsafe.svg",
                "image/png",
                b"png bytes",
            )

    def test_media_upload_validation_rejects_mismatched_type(self):
        with self.assertRaisesRegex(ValueError, "does not match"):
            scaffold.validate_media_upload(
                "image",
                "handout.pdf",
                "application/pdf",
                b"%PDF-1.7",
            )

    def test_media_upload_validation_allows_plain_text_csv_spreadsheet(self):
        scaffold.validate_media_upload(
            "spreadsheet",
            "marks.csv",
            "text/plain",
            b"name,score\nAda,100\n",
        )

    def test_media_upload_validation_rejects_plain_text_non_csv_spreadsheets(self):
        for filename in ("marks.xlsx", "marks.ods"):
            with self.subTest(filename=filename), self.assertRaisesRegex(
                ValueError,
                "not an allowed spreadsheet upload",
            ):
                scaffold.validate_media_upload(
                    "spreadsheet",
                    filename,
                    "text/plain",
                    b"name,score\nAda,100\n",
                )

    def test_media_upload_validation_rejects_plain_text_pdf(self):
        with self.assertRaisesRegex(ValueError, "not an allowed pdf upload"):
            scaffold.validate_media_upload(
                "pdf",
                "guide.pdf",
                "text/plain",
                b"not a pdf",
            )

    def test_media_upload_validation_rejects_oversized_text(self):
        with self.assertRaisesRegex(ValueError, "text upload exceeds"):
            scaffold.validate_media_upload(
                "text",
                "notes.txt",
                "text/plain",
                b"x" * (scaffold.MEDIA_UPLOAD_MAX_BYTES["text"] + 1),
            )

    def test_learner_activity_handlers_persist_and_load_strict_user_snapshot(self):
        block = make_xblock()
        block.learner_content_json = json.dumps(
            course_document(
                [
                    {"type": "checklist", "attrs": {"id": "checklist-1"}},
                    {"type": "flashcard", "attrs": {"id": "flashcard-1"}},
                ],
            ),
        )
        unrelated_record = {
            "activityKind": "checklist",
            "data": {"checkedItemIds": ["item-1"]},
            "completed": False,
            "updatedAt": "2026-06-25T18:00:00+00:00",
        }
        block.learner_activity_snapshot_json = json.dumps(
            {
                "snapshotVersion": 1,
                "artifactId": "usage-v1",
                "activities": {"checklist-1": unrelated_record},
            },
        )

        save_result = block.save_learner_activity(
            {
                "artifactId": "usage-v1",
                "blockId": "flashcard-1",
                "record": {
                    "activityKind": "flashcard",
                    "data": {"currentSectionId": "card-2"},
                    "completed": True,
                },
                "protocolVersion": 1,
            },
        )
        load_result = block.load_learner_activity(
            {"artifactId": "usage-v1", "protocolVersion": 1},
        )

        self.assertEqual(save_result["activityKind"], "flashcard")
        self.assertEqual(save_result["data"], {"currentSectionId": "card-2"})
        self.assertTrue(save_result["completed"])
        self.assertRegex(save_result["updatedAt"], r"\+00:00$")
        self.assertEqual(load_result, json.loads(block.learner_activity_snapshot_json))
        self.assertEqual(load_result["activities"]["checklist-1"], unrelated_record)
        self.assertEqual(load_result["activities"]["flashcard-1"], save_result)

    def test_learner_activity_handler_rejects_unauthorized_blocks_atomically(self):
        block = make_xblock()
        block.learner_content_json = json.dumps(
            course_document(
                [{"type": "flashcard", "attrs": {"id": "flashcard-1"}}],
            ),
        )
        original_storage = block.learner_activity_snapshot_json

        result = block.save_learner_activity(
            {
                "artifactId": "usage-v1",
                "blockId": "flashcard-other",
                "record": {
                    "activityKind": "flashcard",
                    "data": {},
                    "completed": False,
                },
            },
        )

        self.assertFalse(result["success"])
        self.assertIn("not authorized", result["error"])
        self.assertEqual(block.learner_activity_snapshot_json, original_storage)

    def test_learner_activity_handler_maps_invalid_storage_to_a_controlled_error(self):
        block = make_xblock()
        block.learner_activity_snapshot_json = "not json"

        result = block.load_learner_activity({"artifactId": "usage-v1"})

        self.assertFalse(result["success"])
        self.assertIn("valid JSON", result["error"])

    def test_reveal_answer_reads_stored_target_contract_not_author_document(self):
        target = single_select_target()
        block = make_xblock([target])
        block.artifact_json = json.dumps(
            {
                "id": "usage-v1",
                "title": "Scaffold",
                "mode": "page",
                "content": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "mcq",
                            "attrs": {
                                "id": "mcq-1",
                                "assessment": {"correctOptionId": "wrong"},
                            },
                        },
                    ],
                },
            },
        )
        submission = block.submit_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "a"},
                "expectedAttemptNumber": 0,
            },
        )
        self.assertTrue(submission["success"])
        self.assertFalse(submission["isCorrect"])

        result = block.reveal_answer(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
            },
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["answerKey"], target["assessment"])
        self.assertEqual(result["answerKey"]["correctOptionId"], "b")
        self.assertNotIn("answers", result)

    def test_reveal_answer_rejects_before_submitted_incorrect_attempt(self):
        block = make_xblock([single_select_target()])

        result = block.reveal_answer(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
            },
        )

        self.assertEqual(
            result,
            {"success": False, "error": "answer reveal unavailable"},
        )
        self.assertEqual(block.assessment_snapshot_json, "")

    def test_reveal_answer_rejects_check_only_state(self):
        block = make_xblock(
            [single_select_target(feedback_mode="immediate", max_attempts=None)],
        )
        check = block.check_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "a"},
                "expectedAttemptNumber": 0,
            },
        )
        self.assertTrue(check["success"])
        self.assertFalse(check["isCorrect"])
        self.assertFalse(check["problem"]["submitted"])

        result = block.reveal_answer(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
            },
        )

        self.assertEqual(
            result,
            {"success": False, "error": "answer reveal unavailable"},
        )

    def test_reveal_answer_rejects_correct_submission(self):
        block = make_xblock([single_select_target()])
        submission = block.submit_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
        )
        self.assertTrue(submission["success"])
        self.assertTrue(submission["isCorrect"])

        result = block.reveal_answer(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
            },
        )

        self.assertEqual(
            result,
            {"success": False, "error": "answer reveal unavailable"},
        )

    def test_reveal_answer_rejects_corrupt_stored_state(self):
        block = make_xblock([single_select_target()])
        block.assessment_snapshot_json = "{bad json"

        result = block.reveal_answer(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
            },
        )

        self.assertEqual(
            result,
            {"success": False, "error": "answer reveal unavailable"},
        )
        self.assertEqual(block.assessment_snapshot_json, "{bad json")

    def test_standalone_handlers_reject_quiz_targets_without_side_effects(self):
        target = single_select_target(
            feedback_mode="immediate",
            max_attempts=2,
        )
        group = quiz_group(target_ids=["mcq-1"])
        existing_snapshot = {
            "snapshotVersion": 1,
            "artifactId": "usage-v1",
            "problems": {
                "mcq-1": {
                    "response": {"kind": "single-select", "optionId": "a"},
                    "attemptNumber": 1,
                    "hintsShown": 0,
                    "checkResult": None,
                    "submitted": True,
                    "submissionResult": {
                        "isCorrect": False,
                        "score": 0,
                        "maxScore": 1,
                        "feedback": None,
                        "items": {},
                    },
                },
            },
            "quizzes": {},
        }
        base_request = {
            "problemId": "artifact:usage-v1/block:mcq-1",
            "targetId": "mcq-1",
            "interactionKind": "single-select",
        }
        operations = {
            "check": lambda block: block.check_assessment(
                {
                    **base_request,
                    "response": {"kind": "single-select", "optionId": "b"},
                    "expectedAttemptNumber": 1,
                },
            ),
            "submit": lambda block: block.submit_assessment(
                {
                    **base_request,
                    "response": {"kind": "single-select", "optionId": "b"},
                    "expectedAttemptNumber": 1,
                },
            ),
            "reveal_hint": lambda block: block.reveal_hint(
                {**base_request, "hintsShown": 1},
            ),
            "reveal_answer": lambda block: block.reveal_answer(base_request),
        }

        for operation_name, operation in operations.items():
            with self.subTest(operation=operation_name):
                block = make_xblock([target], groups=[group])
                original_snapshot = json.dumps(existing_snapshot)
                block.assessment_snapshot_json = original_snapshot

                result = operation(block)

                self.assertEqual(
                    result,
                    {
                        "success": False,
                        "error": "quiz target requires quiz attempt",
                    },
                )
                self.assertEqual(block.assessment_snapshot_json, original_snapshot)
                self.assertEqual(block.attempts_count, 0)
                self.assertEqual(block.current_score, 0.0)
                self.assertEqual(block.runtime.published, [])

    def test_reveal_answer_respects_show_answer_setting(self):
        block = make_xblock([single_select_target(show_answer=False)])

        result = block.reveal_answer(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
            },
        )

        self.assertEqual(result, {"success": False, "error": "answer reveal disabled"})

    def test_reveal_hint_persists_only_the_authoritative_hint_count(self):
        block = make_xblock([single_select_target()])
        request = {
            "problemId": "artifact:usage-v1/block:mcq-1",
            "targetId": "mcq-1",
            "interactionKind": "single-select",
            "hintsShown": 1,
        }

        first = block.reveal_hint(request)
        replay = block.reveal_hint(request)
        second = block.reveal_hint({**request, "hintsShown": 2})

        self.assertEqual(first["hintsShown"], 1)
        self.assertEqual(first["problem"]["hintsShown"], 1)
        self.assertEqual(replay["problem"], first["problem"])
        self.assertEqual(second["hintsShown"], 2)
        self.assertEqual(second["problem"]["hintsShown"], 2)
        snapshot = json.loads(block.assessment_snapshot_json)
        problem = snapshot["problems"]["mcq-1"]
        self.assertEqual(problem["hintsShown"], 2)
        self.assertEqual(
            set(problem),
            {
                "response",
                "attemptNumber",
                "hintsShown",
                "checkResult",
                "submitted",
                "submissionResult",
            },
        )
        self.assertNotIn("answerKey", block.assessment_snapshot_json)
        self.assertNotIn("hintContent", block.assessment_snapshot_json)

    def test_reveal_hint_rejects_invalid_and_skipped_counts_without_mutation(self):
        request = {
            "problemId": "artifact:usage-v1/block:mcq-1",
            "targetId": "mcq-1",
            "interactionKind": "single-select",
        }

        for invalid in [None, True, 0, -1, 1.5, "1"]:
            with self.subTest(invalid=invalid):
                block = make_xblock([single_select_target()])
                result = block.reveal_hint({**request, "hintsShown": invalid})

                self.assertEqual(
                    result,
                    {
                        "success": False,
                        "error": "hintsShown must be a positive integer",
                    },
                )
                self.assertEqual(block.assessment_snapshot_json, "")

        block = make_xblock([single_select_target()])
        result = block.reveal_hint({**request, "hintsShown": 2})

        self.assertEqual(
            result,
            {
                "success": False,
                "error": "hintsShown cannot skip unrevealed hints",
            },
        )
        self.assertEqual(block.assessment_snapshot_json, "")

    def test_reveal_hint_rejects_a_malformed_complete_snapshot_before_writing(self):
        block = make_xblock([single_select_target()])
        malformed_snapshot = {
            "snapshotVersion": 1,
            "artifactId": "usage-v1",
            "problems": {
                "mcq-1": {
                    "response": None,
                    "attemptNumber": 0,
                    "hintsShown": 0,
                    "checkResult": None,
                    "submitted": False,
                },
            },
            "quizzes": {},
        }
        block.assessment_snapshot_json = json.dumps(malformed_snapshot)

        with self.assertRaises(ValueError):
            block.reveal_hint(
                {
                    "problemId": "artifact:usage-v1/block:mcq-1",
                    "targetId": "mcq-1",
                    "interactionKind": "single-select",
                    "hintsShown": 1,
                },
            )

        self.assertEqual(json.loads(block.assessment_snapshot_json), malformed_snapshot)

    def test_reveal_hint_rejects_foreign_problem_without_mutating_snapshot(self):
        block = make_xblock([single_select_target()])

        result = block.reveal_hint(
            {
                "problemId": "artifact:other-usage/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
            },
        )

        self.assertFalse(result["success"])
        self.assertEqual(block.assessment_snapshot_json, "")

    def test_submit_assessment_grades_and_persists_against_stored_target(self):
        block = make_xblock([single_select_target()])

        result = block.submit_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
        )

        self.assertTrue(result["success"])
        self.assertTrue(result["isCorrect"])
        self.assertEqual(result["score"], 1)
        public_json = json.dumps(result, sort_keys=True)
        self.assertNotIn('"expected"', public_json)
        self.assertIn("Summary feedback", public_json)
        self.assertNotIn("Choice feedback", public_json)
        self.assertEqual(result["items"], {})
        self.assertEqual(result["problem"]["submissionResult"]["items"], {})
        snapshot = json.loads(block.assessment_snapshot_json)
        stored = snapshot["problems"]["mcq-1"]
        self.assertEqual(stored["response"], {"kind": "single-select", "optionId": "b"})
        self.assertEqual(stored["attemptNumber"], 1)
        self.assertNotIn("targetId", stored)
        self.assertNotIn("interactionKind", stored)
        self.assertNotIn("points", stored)
        self.assertNotIn("isGraded", stored)
        self.assertEqual(block.current_score, 1.0)
        self.assertEqual(len(block.runtime.published), 1)
        _, event, payload = block.runtime.published[0]
        self.assertEqual(event, "grade")
        self.assertEqual(payload, {"value": 1.0, "max_value": 1.0})

    def test_submit_assessment_persists_one_canonical_problem_snapshot(self):
        block = make_xblock([single_select_target()])

        result = block.submit_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
        )

        self.assertTrue(result["success"])
        snapshot = json.loads(block.assessment_snapshot_json)
        self.assertEqual(snapshot["snapshotVersion"], 1)
        self.assertEqual(snapshot["artifactId"], "usage-v1")
        self.assertEqual(set(snapshot["problems"]), {"mcq-1"})
        self.assertEqual(snapshot["quizzes"], {})
        problem = snapshot["problems"]["mcq-1"]
        self.assertEqual(problem["attemptNumber"], 1)
        self.assertEqual(problem["hintsShown"], 0)
        self.assertTrue(problem["submitted"])
        self.assertIsNone(problem["checkResult"])
        self.assertTrue(problem["submissionResult"]["isCorrect"])
        self.assertEqual(
            set(problem),
            {
                "response",
                "attemptNumber",
                "hintsShown",
                "checkResult",
                "submitted",
                "submissionResult",
            },
        )

    def test_standalone_check_and_submit_redact_answers_but_keep_full_storage(self):
        block = make_xblock(
            [
                single_select_target(
                    feedback_mode="immediate",
                    show_answer=False,
                    max_attempts=None,
                ),
            ],
        )
        request = {
            "problemId": "artifact:usage-v1/block:mcq-1",
            "targetId": "mcq-1",
            "interactionKind": "single-select",
            "response": {"kind": "single-select", "optionId": "a"},
            "expectedAttemptNumber": 0,
        }

        checked = block.check_assessment(request)
        submitted = block.submit_assessment({**request, "expectedAttemptNumber": 1})

        for action, result in (("check", checked), ("submit", submitted)):
            with self.subTest(action=action):
                public_json = json.dumps(result, sort_keys=True)
                self.assertNotIn('"expected"', public_json)
                self.assertNotIn("Summary feedback", public_json)
                self.assertNotIn("Choice feedback", public_json)
                self.assertEqual(result["items"], {})
                result_key = "checkResult" if action == "check" else "submissionResult"
                self.assertEqual(result["problem"][result_key]["items"], {})
        stored_json = json.dumps(block._assessment_snapshot(), sort_keys=True)
        self.assertIn('"expected"', stored_json)
        self.assertIn("Summary feedback", stored_json)
        self.assertIn("Choice feedback", stored_json)

    def test_standalone_retry_converges_without_regrading_or_republishing(self):
        block = make_xblock([single_select_target()])
        request = {
            "problemId": "artifact:usage-v1/block:mcq-1",
            "targetId": "mcq-1",
            "interactionKind": "single-select",
            "response": {"kind": "single-select", "optionId": "b"},
            "expectedAttemptNumber": 0,
        }

        with patch.object(
            assessment_module,
            "grade_assessment",
            wraps=assessment_module.grade_assessment,
        ) as grade:
            accepted = block.submit_assessment(request)
            replay = block.submit_assessment(request)
            missing_sequence = dict(request)
            missing_sequence.pop("expectedAttemptNumber")
            missing = block.submit_assessment(missing_sequence)
            future = block.submit_assessment(
                {**request, "expectedAttemptNumber": 2},
            )

        self.assertTrue(accepted["success"])
        self.assertEqual(accepted["problem"], replay["problem"])
        self.assertEqual(accepted["items"], {})
        self.assertEqual(replay["problem"]["submissionResult"]["items"], {})
        self.assertEqual(accepted["problem"]["attemptNumber"], 1)
        self.assertEqual(
            missing,
            {
                "success": False,
                "error": "expectedAttemptNumber must be a nonnegative integer",
            },
        )
        self.assertEqual(
            future,
            {"success": False, "error": "expectedAttemptNumber is ahead of stored state"},
        )
        self.assertEqual(grade.call_count, 1)
        self.assertEqual(block.attempts_count, 1)
        self.assertEqual(len(block.runtime.published), 1)

    def test_immediate_check_retry_returns_the_canonical_problem_once(self):
        block = make_xblock(
            [single_select_target(feedback_mode="immediate")],
        )
        request = {
            "problemId": "artifact:usage-v1/block:mcq-1",
            "targetId": "mcq-1",
            "interactionKind": "single-select",
            "response": {"kind": "single-select", "optionId": "a"},
            "expectedAttemptNumber": 0,
        }

        first = block.check_assessment(request)
        replay = block.check_assessment(request)

        self.assertEqual(first["problem"], replay["problem"])
        self.assertEqual(first["items"], {})
        self.assertEqual(replay["problem"]["checkResult"]["items"], {})
        self.assertEqual(first["problem"]["attemptNumber"], 1)
        self.assertIsNotNone(first["problem"]["checkResult"])
        self.assertEqual(block.attempts_count, 1)
        self.assertEqual(len(block.runtime.published), 1)

    def test_quiz_start_attempt_persists_user_state(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
            ],
            groups=[group],
        )

        result = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["groupId"], "quiz-1")
        self.assertEqual(result["status"], "in_progress")
        self.assertEqual(result["currentTargetId"], "mcq-1")
        snapshot = json.loads(block.assessment_snapshot_json)
        self.assertEqual(
            snapshot["quizzes"]["quiz-1"]["attemptId"],
            result["attemptId"],
        )

    def test_quiz_start_persists_an_identity_free_canonical_attempt(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        block = make_xblock(
            [single_select_target("mcq-1"), single_select_target("mcq-2")],
            groups=[group],
        )

        result = block.start_quiz_attempt({"groupId": "quiz-1"})

        self.assertTrue(result["success"])
        self.assertEqual(result["groupId"], "quiz-1")
        snapshot = json.loads(block.assessment_snapshot_json)
        self.assertEqual(set(snapshot["quizzes"]), {"quiz-1"})
        attempt = snapshot["quizzes"]["quiz-1"]
        self.assertEqual(attempt["attemptId"], result["attemptId"])
        self.assertNotIn("groupId", attempt)
        self.assertNotIn("targetIds", attempt)
        self.assertNotIn("settings", attempt)
        self.assertNotIn("attemptCountsByTargetId", attempt)
        self.assertNotIn("attempts", snapshot["quizzes"])
        self.assertNotIn("latestByGroupId", snapshot["quizzes"])

    def test_quiz_start_uses_stored_target_order(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
            ],
            groups=[group],
        )

        result = block.start_quiz_attempt(
            {"groupId": "quiz-1"},
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["currentTargetId"], "mcq-1")
        stored = json.loads(block.assessment_snapshot_json)["quizzes"]["quiz-1"]
        self.assertNotIn("targetIds", stored)

    def test_quiz_start_returns_completed_attempt_without_restarting(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
            ],
            groups=[group],
        )
        attempt = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )
        completed = block.finish_quiz_attempt(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "responsesByTargetId": {
                    "mcq-1": {"kind": "single-select", "optionId": "b"},
                    "mcq-2": {"kind": "single-select", "optionId": "b"},
                },
            },
        )

        restarted = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )

        self.assertEqual(restarted["attemptId"], attempt["attemptId"])
        self.assertEqual(restarted["status"], "completed")
        self.assertEqual(restarted["score"], completed["score"])
        snapshot = json.loads(block.assessment_snapshot_json)
        self.assertEqual(len(snapshot["quizzes"]), 1)
        self.assertEqual(len(block.runtime.published), 1)

    def test_quiz_start_finalizes_expired_after_quiz_attempt_without_restarting(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
            ],
            groups=[group],
        )
        attempt = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )
        snapshot = json.loads(block.assessment_snapshot_json)
        snapshot["quizzes"]["quiz-1"]["expiresAt"] = "2000-01-01T00:00:00Z"
        block.assessment_snapshot_json = json.dumps(snapshot)

        restarted = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )

        self.assertEqual(restarted["attemptId"], attempt["attemptId"])
        self.assertEqual(restarted["status"], "expired")
        self.assertIsNone(restarted["currentTargetId"])
        self.assertEqual(restarted["score"], 0.0)
        self.assertEqual(restarted["maxScore"], 2.0)
        self.assertEqual(restarted["submittedTargetIds"], [])
        snapshot = json.loads(block.assessment_snapshot_json)
        self.assertEqual(len(snapshot["quizzes"]), 1)
        self.assertEqual(len(block.runtime.published), 1)
        _, event, payload = block.runtime.published[0]
        self.assertEqual(event, "grade")
        self.assertEqual(payload, {"value": 0.0, "max_value": 1.0})

    def test_quiz_start_finalizes_expired_after_each_answer_attempt_without_restarting(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
        )
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
            ],
            groups=[group],
        )
        attempt = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )
        block.submit_quiz_question(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "targetId": "mcq-1",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
        )
        snapshot = json.loads(block.assessment_snapshot_json)
        snapshot["quizzes"]["quiz-1"]["expiresAt"] = "2000-01-01T00:00:00Z"
        block.assessment_snapshot_json = json.dumps(snapshot)

        restarted = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )

        self.assertEqual(restarted["attemptId"], attempt["attemptId"])
        self.assertEqual(restarted["status"], "expired")
        self.assertEqual(restarted["score"], 1.0)
        self.assertEqual(restarted["maxScore"], 2.0)
        self.assertEqual(restarted["submittedTargetIds"], ["mcq-1"])
        snapshot = json.loads(block.assessment_snapshot_json)
        self.assertEqual(len(snapshot["quizzes"]), 1)
        self.assertEqual(block.current_score, 0.5)
        self.assertEqual(len(block.runtime.published), 1)

    def test_quiz_submit_question_persists_without_publishing_before_terminal(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
        )
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
            ],
            groups=[group],
        )
        attempt = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )

        result = block.submit_quiz_question(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "targetId": "mcq-1",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "in_progress")
        self.assertEqual(result["currentTargetId"], "mcq-2")
        self.assertEqual(result["submittedTargetIds"], ["mcq-1"])
        self.assertTrue(result["resultsByTargetId"]["mcq-1"]["isCorrect"])
        snapshot = json.loads(block.assessment_snapshot_json)
        stored = snapshot["problems"]["mcq-1"]
        self.assertEqual(stored["attemptNumber"], 1)
        self.assertTrue(stored["submitted"])
        self.assertEqual(block.current_score, 0.0)
        self.assertEqual(block.runtime.published, [])

    def test_quiz_result_only_response_redacts_answers_but_keeps_full_storage(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
            review_detail="result_only",
            attempts_per_question=2,
        )
        block = make_xblock(
            [single_select_target("mcq-1"), single_select_target("mcq-2")],
            groups=[group],
        )
        attempt = block.start_quiz_attempt({"groupId": "quiz-1"})

        result = block.submit_quiz_question(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetId": "mcq-1",
                "response": {"kind": "single-select", "optionId": "a"},
                "expectedAttemptNumber": 0,
            },
        )

        public_result = result["resultsByTargetId"]["mcq-1"]
        self.assertFalse(public_result["isCorrect"])
        self.assertIsNone(public_result["feedback"])
        self.assertEqual(public_result["items"], {})
        self.assertEqual(
            result["problemsByTargetId"]["mcq-1"]["submissionResult"],
            public_result,
        )
        public_json = json.dumps(result, sort_keys=True)
        self.assertNotIn('"expected"', public_json)
        self.assertNotIn("Summary feedback", public_json)
        self.assertNotIn("Choice feedback", public_json)

        stored = block._assessment_snapshot()
        stored_json = json.dumps(stored, sort_keys=True)
        self.assertIn('"expected"', stored_json)
        self.assertIn("Summary feedback", stored_json)
        self.assertIn("Choice feedback", stored_json)
        replay = block.start_quiz_attempt({"groupId": "quiz-1"})
        replay_json = json.dumps(replay, sort_keys=True)
        self.assertEqual(replay["resultsByTargetId"]["mcq-1"]["items"], {})
        self.assertNotIn('"expected"', replay_json)
        self.assertNotIn("Summary feedback", replay_json)
        self.assertNotIn("Choice feedback", replay_json)

    def test_quiz_none_response_redacts_question_results_but_keeps_full_storage(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
            review_detail="none",
            attempts_per_question=2,
        )
        block = make_xblock(
            [single_select_target("mcq-1"), single_select_target("mcq-2")],
            groups=[group],
        )
        attempt = block.start_quiz_attempt({"groupId": "quiz-1"})

        result = block.submit_quiz_question(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetId": "mcq-1",
                "response": {"kind": "single-select", "optionId": "a"},
                "expectedAttemptNumber": 0,
            },
        )

        self.assertEqual(result["resultsByTargetId"], {})
        public_problem = result["problemsByTargetId"]["mcq-1"]
        self.assertEqual(public_problem["attemptNumber"], 1)
        self.assertFalse(public_problem["submitted"])
        self.assertIsNone(public_problem["checkResult"])
        self.assertIsNone(public_problem["submissionResult"])
        public_json = json.dumps(result, sort_keys=True)
        self.assertNotIn('"expected"', public_json)
        self.assertNotIn("Summary feedback", public_json)
        self.assertNotIn("Choice feedback", public_json)
        stored = block._assessment_snapshot()
        self.assertTrue(
            stored["quizzes"]["quiz-1"]["resultsByTargetId"]["mcq-1"]["items"]["b"][
                "expected"
            ],
        )
        self.assertEqual(
            stored["problems"]["mcq-1"]["submissionResult"]["feedback"],
            rich_feedback("Summary feedback"),
        )

    def test_quiz_full_review_only_returns_answers_after_terminal_authorization(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
            review_detail="full_review",
            attempts_per_question=2,
        )
        block = make_xblock(
            [single_select_target("mcq-1"), single_select_target("mcq-2")],
            groups=[group],
        )
        attempt = block.start_quiz_attempt({"groupId": "quiz-1"})

        in_progress = block.submit_quiz_question(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetId": "mcq-1",
                "response": {"kind": "single-select", "optionId": "a"},
                "expectedAttemptNumber": 0,
            },
        )

        in_progress_json = json.dumps(in_progress, sort_keys=True)
        self.assertEqual(in_progress["status"], "in_progress")
        self.assertNotIn('"expected"', in_progress_json)
        self.assertNotIn("Summary feedback", in_progress_json)
        self.assertNotIn("Choice feedback", in_progress_json)

        block.submit_quiz_question(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetId": "mcq-1",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 1,
            },
        )
        completed = block.submit_quiz_question(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetId": "mcq-2",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
        )

        completed_json = json.dumps(completed, sort_keys=True)
        self.assertEqual(completed["status"], "completed")
        self.assertTrue(completed["answerReviewAuthorized"])
        self.assertIn('"expected"', completed_json)
        self.assertIn("Summary feedback", completed_json)
        self.assertIn("Choice feedback", completed_json)

    def test_quiz_question_writes_one_complete_snapshot_and_uses_problem_attempts(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
            attempts_per_question=2,
        )
        block = make_xblock(
            [single_select_target("mcq-1"), single_select_target("mcq-2")],
            groups=[group],
        )
        attempt = block.start_quiz_attempt({"groupId": "quiz-1"})
        original_set_snapshot = block._set_assessment_snapshot
        writes = []

        def record_snapshot(snapshot):
            writes.append(json.loads(json.dumps(snapshot)))
            original_set_snapshot(snapshot)

        block._set_assessment_snapshot = record_snapshot
        first = block.submit_quiz_question(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetId": "mcq-1",
                "response": {"kind": "single-select", "optionId": "a"},
                "expectedAttemptNumber": 0,
            },
        )

        self.assertTrue(first["success"])
        self.assertEqual(first["currentTargetId"], "mcq-1")
        self.assertEqual(len(writes), 1)
        problem = writes[0]["problems"]["mcq-1"]
        quiz = writes[0]["quizzes"]["quiz-1"]
        self.assertEqual(problem["attemptNumber"], 1)
        self.assertEqual(quiz["currentTargetId"], "mcq-1")
        self.assertNotIn("attemptCountsByTargetId", quiz)

        second = block.submit_quiz_question(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetId": "mcq-1",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 1,
            },
        )

        self.assertTrue(second["success"])
        self.assertEqual(second["currentTargetId"], "mcq-2")
        snapshot = json.loads(block.assessment_snapshot_json)
        self.assertEqual(snapshot["problems"]["mcq-1"]["attemptNumber"], 2)

    def test_quiz_submit_question_keeps_retryable_wrong_answer_current(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
            attempts_per_question=2,
        )
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
            ],
            groups=[group],
        )
        attempt = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )

        result = block.submit_quiz_question(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "targetId": "mcq-1",
                "response": {"kind": "single-select", "optionId": "a"},
                "expectedAttemptNumber": 0,
            },
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "in_progress")
        self.assertEqual(result["currentTargetId"], "mcq-1")
        self.assertEqual(result["submittedTargetIds"], [])
        self.assertFalse(result["resultsByTargetId"]["mcq-1"]["isCorrect"])
        snapshot = json.loads(block.assessment_snapshot_json)
        stored_attempt = snapshot["quizzes"]["quiz-1"]
        self.assertEqual(stored_attempt["currentTargetId"], "mcq-1")
        self.assertEqual(stored_attempt["submittedTargetIds"], [])
        self.assertNotIn("attemptCountsByTargetId", stored_attempt)

    def test_quiz_submit_question_rejects_skipping_retryable_current_target(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
            attempts_per_question=2,
        )
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
            ],
            groups=[group],
        )
        attempt = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )
        block.submit_quiz_question(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "targetId": "mcq-1",
                "response": {"kind": "single-select", "optionId": "a"},
                "expectedAttemptNumber": 0,
            },
        )

        result = block.submit_quiz_question(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "targetId": "mcq-2",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
        )

        self.assertEqual(
            result,
            {"success": False, "error": "quiz current question is mcq-1"},
        )
        snapshot = json.loads(block.assessment_snapshot_json)
        stored_attempt = snapshot["quizzes"]["quiz-1"]
        self.assertEqual(stored_attempt["currentTargetId"], "mcq-1")
        self.assertEqual(stored_attempt["submittedTargetIds"], [])
        self.assertEqual(set(stored_attempt["resultsByTargetId"].keys()), {"mcq-1"})
        self.assertEqual(block.current_score, 0.0)
        self.assertEqual(block.runtime.published, [])

    def test_quiz_finish_attempt_grades_aggregate_and_publishes_once(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
            ],
            groups=[group],
        )
        attempt = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )

        result = block.finish_quiz_attempt(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "responsesByTargetId": {
                    "mcq-1": {"kind": "single-select", "optionId": "b"},
                    "mcq-2": {"kind": "single-select", "optionId": "b"},
                },
            },
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["score"], 2.0)
        self.assertEqual(result["maxScore"], 2.0)
        self.assertTrue(result["answerReviewAuthorized"])
        snapshot = json.loads(block.assessment_snapshot_json)
        self.assertEqual(set(snapshot["problems"]), {"mcq-1", "mcq-2"})
        self.assertEqual(block.current_score, 1.0)
        self.assertEqual(len(block.runtime.published), 1)
        _, event, payload = block.runtime.published[0]
        self.assertEqual(event, "grade")
        self.assertEqual(payload, {"value": 1.0, "max_value": 1.0})

    def test_ungraded_quiz_targets_do_not_leak_into_later_grade_publish(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"], is_graded=False)
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
                single_select_target("standalone-1"),
            ],
            groups=[group],
        )
        attempt = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )

        quiz_result = block.finish_quiz_attempt(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "responsesByTargetId": {
                    "mcq-1": {"kind": "single-select", "optionId": "b"},
                    "mcq-2": {"kind": "single-select", "optionId": "b"},
                },
            },
        )
        standalone_result = block.submit_assessment(
            {
                "problemId": "artifact:usage-v1/block:standalone-1",
                "targetId": "standalone-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "a"},
                "expectedAttemptNumber": 0,
            },
        )

        self.assertTrue(quiz_result["success"])
        self.assertEqual(quiz_result["score"], 2.0)
        self.assertTrue(standalone_result["success"])
        self.assertFalse(standalone_result["isCorrect"])
        self.assertEqual(block.current_score, 0.0)
        self.assertEqual(len(block.runtime.published), 1)
        _, event, payload = block.runtime.published[0]
        self.assertEqual(event, "grade")
        self.assertEqual(payload, {"value": 0.0, "max_value": 1.0})

    def test_quiz_finish_rejects_after_each_answer_before_expiry(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
        )
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
            ],
            groups=[group],
        )
        attempt = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )

        result = block.finish_quiz_attempt(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "responsesByTargetId": {
                    "mcq-1": {"kind": "single-select", "optionId": "b"},
                    "mcq-2": {"kind": "single-select", "optionId": "b"},
                },
            },
        )

        self.assertEqual(
            result,
            {
                "success": False,
                "error": "quiz finish requires after_quiz timing or expired attempt",
            },
        )
        self.assertEqual(block._assessment_snapshot()["problems"], {})
        self.assertEqual(block.runtime.published, [])

    def test_quiz_finish_rejects_partial_after_quiz_before_expiry(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
            ],
            groups=[group],
        )
        attempt = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )

        result = block.finish_quiz_attempt(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "responsesByTargetId": {
                    "mcq-1": {"kind": "single-select", "optionId": "b"},
                },
            },
        )

        self.assertEqual(
            result,
            {
                "success": False,
                "error": "responsesByTargetId must include every quiz target",
            },
        )
        snapshot = json.loads(block.assessment_snapshot_json)
        stored_attempt = snapshot["quizzes"]["quiz-1"]
        self.assertEqual(stored_attempt["status"], "in_progress")
        self.assertEqual(snapshot["problems"], {})
        self.assertEqual(block.runtime.published, [])

    def test_quiz_finish_replay_returns_terminal_canonical_state_without_mutating_grade(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
            ],
            groups=[group],
        )
        attempt = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )
        first = block.finish_quiz_attempt(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "responsesByTargetId": {
                    "mcq-1": {"kind": "single-select", "optionId": "b"},
                    "mcq-2": {"kind": "single-select", "optionId": "b"},
                },
            },
        )

        second = block.finish_quiz_attempt(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "responsesByTargetId": {
                    "mcq-1": {"kind": "single-select", "optionId": "a"},
                    "mcq-2": {"kind": "single-select", "optionId": "a"},
                },
            },
        )

        self.assertTrue(first["success"])
        self.assertTrue(second["success"])
        self.assertEqual(second["quizAttempt"], first["quizAttempt"])
        self.assertEqual(second["problemsByTargetId"], first["problemsByTargetId"])
        snapshot = json.loads(block.assessment_snapshot_json)
        stored_attempt = snapshot["quizzes"]["quiz-1"]
        self.assertEqual(stored_attempt["score"], 2.0)
        self.assertEqual(stored_attempt["maxScore"], 2.0)
        self.assertEqual(block.current_score, 1.0)
        self.assertEqual(len(block.runtime.published), 1)

    def test_quiz_question_retry_converges_before_policy_or_grading(self):
        group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
            attempts_per_question=2,
        )
        block = make_xblock(
            [single_select_target("mcq-1"), single_select_target("mcq-2")],
            groups=[group],
        )
        attempt = block.start_quiz_attempt({"groupId": "quiz-1"})
        request = {
            "attemptId": attempt["attemptId"],
            "groupId": "quiz-1",
            "targetId": "mcq-1",
            "response": {"kind": "single-select", "optionId": "a"},
            "expectedAttemptNumber": 0,
        }

        with patch.object(
            quiz_module,
            "grade_assessment",
            wraps=quiz_module.grade_assessment,
        ) as grade:
            accepted = block.submit_quiz_question(request)
            replay = block.submit_quiz_question(request)
            missing_sequence = dict(request)
            missing_sequence.pop("expectedAttemptNumber")
            missing = block.submit_quiz_question(missing_sequence)
            future = block.submit_quiz_question(
                {**request, "expectedAttemptNumber": 2},
            )

        self.assertTrue(accepted["success"])
        self.assertEqual(accepted["quizAttempt"], replay["quizAttempt"])
        self.assertEqual(accepted["problemsByTargetId"], replay["problemsByTargetId"])
        self.assertEqual(accepted["problemsByTargetId"]["mcq-1"]["attemptNumber"], 1)
        self.assertEqual(
            missing,
            {
                "success": False,
                "error": "expectedAttemptNumber must be a nonnegative integer",
            },
        )
        self.assertEqual(
            future,
            {"success": False, "error": "expectedAttemptNumber is ahead of stored state"},
        )
        self.assertEqual(grade.call_count, 1)
        self.assertEqual(block.attempts_count, 1)
        self.assertEqual(block.runtime.published, [])

    def test_quiz_finish_rejects_stale_attempt(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
            ],
            groups=[group],
        )
        stale_attempt = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )
        snapshot = json.loads(block.assessment_snapshot_json)
        latest_attempt = dict(snapshot["quizzes"]["quiz-1"])
        latest_attempt["attemptId"] = "quiz:quiz-1:latest"
        snapshot["quizzes"]["quiz-1"] = latest_attempt
        block.assessment_snapshot_json = json.dumps(snapshot)

        result = block.finish_quiz_attempt(
            {
                "attemptId": stale_attempt["attemptId"],
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
                "responsesByTargetId": {
                    "mcq-1": {"kind": "single-select", "optionId": "b"},
                    "mcq-2": {"kind": "single-select", "optionId": "b"},
                },
            },
        )

        self.assertEqual(
            result,
            {"success": False, "error": "quiz attempt is not latest"},
        )
        self.assertEqual(block._assessment_snapshot()["problems"], {})
        self.assertEqual(block.runtime.published, [])

    def test_expired_after_quiz_finish_ignores_late_answers_and_is_idempotent(self):
        group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        block = make_xblock(
            [
                single_select_target("mcq-1"),
                single_select_target("mcq-2"),
            ],
            groups=[group],
        )
        attempt = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1", "mcq-2"],
                "settings": group["settings"],
            },
        )
        snapshot = json.loads(block.assessment_snapshot_json)
        snapshot["quizzes"]["quiz-1"]["expiresAt"] = "2000-01-01T00:00:00Z"
        block.assessment_snapshot_json = json.dumps(snapshot)

        with patch.object(
            quiz_module,
            "grade_assessment",
            wraps=quiz_module.grade_assessment,
        ) as grade:
            first = block.finish_quiz_attempt(
                {
                    "attemptId": attempt["attemptId"],
                    "groupId": "quiz-1",
                    "targetIds": ["mcq-1", "mcq-2"],
                    "settings": group["settings"],
                    "responsesByTargetId": {
                        "mcq-1": {"kind": "single-select", "optionId": "b"},
                    },
                },
            )
            second = block.finish_quiz_attempt(
                {
                    "attemptId": attempt["attemptId"],
                    "groupId": "quiz-1",
                    "targetIds": ["mcq-1", "mcq-2"],
                    "settings": group["settings"],
                    "responsesByTargetId": {
                        "mcq-1": {"kind": "single-select", "optionId": "b"},
                        "mcq-2": {"kind": "single-select", "optionId": "b"},
                    },
                },
            )

        self.assertTrue(first["success"])
        self.assertEqual(first["status"], "expired")
        self.assertEqual(first["score"], 0.0)
        self.assertEqual(first["maxScore"], 2.0)
        self.assertEqual(first["submittedTargetIds"], [])
        self.assertEqual(first["resultsByTargetId"], {})
        self.assertEqual(second["quizAttempt"], first["quizAttempt"])
        self.assertEqual(block._assessment_snapshot()["problems"], {})
        self.assertEqual(block.current_score, 0.0)
        self.assertEqual(len(block.runtime.published), 1)
        _, event, payload = block.runtime.published[0]
        self.assertEqual(event, "grade")
        self.assertEqual(payload, {"value": 0.0, "max_value": 1.0})
        self.assertEqual(grade.call_count, 0)

    def test_expired_after_quiz_finish_preserves_pre_expiry_accepted_answers(self):
        after_each_group = quiz_group(
            target_ids=["mcq-1", "mcq-2"],
            review_timing="after_each_answer",
        )
        block = make_xblock(
            [single_select_target("mcq-1"), single_select_target("mcq-2")],
            groups=[after_each_group],
        )
        attempt = block.start_quiz_attempt({"groupId": "quiz-1"})
        accepted = block.submit_quiz_question(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetId": "mcq-1",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
        )
        self.assertTrue(accepted["success"])

        after_quiz_group = quiz_group(target_ids=["mcq-1", "mcq-2"])
        block.assessment_groups_json = json.dumps([after_quiz_group])
        snapshot = block._assessment_snapshot()
        accepted_problem = snapshot["problems"]["mcq-1"]
        snapshot["quizzes"]["quiz-1"]["expiresAt"] = "2000-01-01T00:00:00Z"
        block.assessment_snapshot_json = json.dumps(snapshot)

        result = block.finish_quiz_attempt(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "responsesByTargetId": {
                    "mcq-2": {"kind": "single-select", "optionId": "b"},
                },
            },
        )

        self.assertTrue(result["success"])
        self.assertEqual(result["status"], "expired")
        self.assertEqual(result["score"], 1.0)
        self.assertEqual(result["maxScore"], 2.0)
        self.assertEqual(result["submittedTargetIds"], ["mcq-1"])
        self.assertEqual(set(result["resultsByTargetId"]), {"mcq-1"})
        stored = block._assessment_snapshot()
        self.assertEqual(stored["problems"], {"mcq-1": accepted_problem})
        self.assertNotIn("mcq-2", result["problemsByTargetId"])
        self.assertEqual(block.current_score, 0.5)
        self.assertEqual(len(block.runtime.published), 1)

    def test_quiz_reveal_answers_requires_full_review(self):
        group = quiz_group(
            target_ids=["mcq-1"],
            review_detail="result_only",
        )
        block = make_xblock([single_select_target("mcq-1")], groups=[group])
        attempt = block.start_quiz_attempt(
            {
                "groupId": "quiz-1",
                "targetIds": ["mcq-1"],
                "settings": group["settings"],
            },
        )
        block.finish_quiz_attempt(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "targetIds": ["mcq-1"],
                "settings": group["settings"],
                "responsesByTargetId": {
                    "mcq-1": {"kind": "single-select", "optionId": "b"},
                },
            },
        )

        result = block.reveal_quiz_answers(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
            },
        )

        self.assertEqual(
            result,
            {"success": False, "error": "quiz answer review disabled"},
        )

    def test_quiz_answer_reveal_returns_canonical_state_without_writing(self):
        group = quiz_group(
            target_ids=["mcq-1"],
            review_detail="full_review",
        )
        block = make_xblock([single_select_target("mcq-1")], groups=[group])
        attempt = block.start_quiz_attempt({"groupId": "quiz-1"})
        finished = block.finish_quiz_attempt(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "responsesByTargetId": {
                    "mcq-1": {"kind": "single-select", "optionId": "b"},
                },
            },
        )
        stored = block.assessment_snapshot_json
        writes = []
        original_set_snapshot = block._set_assessment_snapshot

        def record_snapshot(snapshot):
            writes.append(snapshot)
            original_set_snapshot(snapshot)

        block._set_assessment_snapshot = record_snapshot
        revealed = block.reveal_quiz_answers(
            {"attemptId": attempt["attemptId"], "groupId": "quiz-1"},
        )

        self.assertEqual(revealed["quizAttempt"], finished["quizAttempt"])
        self.assertEqual(revealed["problemsByTargetId"], finished["problemsByTargetId"])
        self.assertEqual(writes, [])
        self.assertEqual(block.assessment_snapshot_json, stored)

    def test_preview_submit_assessment_allows_quiz_target_without_persisting(self):
        block = make_xblock(
            [single_select_target(max_attempts=1)],
            groups=[quiz_group(target_ids=["mcq-1"])],
        )
        existing_snapshot = {
            "snapshotVersion": 1,
            "artifactId": "usage-v1",
            "problems": {
                "mcq-1": {
                    "response": {"kind": "single-select", "optionId": "a"},
                    "attemptNumber": 1,
                    "hintsShown": 0,
                    "checkResult": None,
                    "submitted": False,
                    "submissionResult": None,
                }
            },
            "quizzes": {},
        }
        block.assessment_snapshot_json = json.dumps(existing_snapshot)
        block.attempts_count = 1
        block.current_score = 0.0

        result = block.preview_submit_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
            },
        )

        self.assertTrue(result["success"])
        self.assertTrue(result["isCorrect"])
        self.assertEqual(result["score"], 1)
        self.assertEqual(json.loads(block.assessment_snapshot_json), existing_snapshot)
        self.assertEqual(block.attempts_count, 1)
        self.assertEqual(block.current_score, 0.0)
        self.assertEqual(block.runtime.published, [])

    def test_preview_assessment_requires_studio_write_access(self):
        block = make_xblock([single_select_target()])
        block._has_studio_write_access = lambda: False
        payload = {
            "problemId": "artifact:usage-v1/block:mcq-1",
            "targetId": "mcq-1",
            "interactionKind": "single-select",
            "response": {"kind": "single-select", "optionId": "b"},
        }

        self.assertEqual(
            block.preview_check_assessment(payload),
            {"success": False, "error": "authoring permission required"},
        )
        self.assertEqual(
            block.preview_submit_assessment(payload),
            {"success": False, "error": "authoring permission required"},
        )
        self.assertEqual(block.assessment_snapshot_json, "")
        self.assertEqual(block.runtime.published, [])

    def test_check_assessment_rejects_non_immediate_targets(self):
        block = make_xblock([single_select_target()])

        result = block.check_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
        )

        self.assertEqual(
            result,
            {"success": False, "error": "check is only available for immediate feedback"},
        )
        self.assertEqual(block.assessment_snapshot_json, "")
        self.assertEqual(block.runtime.published, [])

    def test_immediate_check_consumes_attempt_and_publishes_grade(self):
        block = make_xblock([single_select_target(feedback_mode="immediate")])

        result = block.check_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
        )

        self.assertTrue(result["success"])
        self.assertTrue(result["isCorrect"])
        snapshot = json.loads(block.assessment_snapshot_json)
        stored = snapshot["problems"]["mcq-1"]
        self.assertFalse(stored["submitted"])
        self.assertEqual(stored["attemptNumber"], 1)
        self.assertEqual(stored["checkResult"]["score"], 1)
        self.assertIsNone(stored["submissionResult"])
        self.assertEqual(block.current_score, 1.0)
        self.assertEqual(len(block.runtime.published), 1)
        _, event, payload = block.runtime.published[0]
        self.assertEqual(event, "grade")
        self.assertEqual(payload, {"value": 1.0, "max_value": 1.0})

    def test_preview_check_assessment_allows_quiz_target_without_persisting(self):
        block = make_xblock(
            [single_select_target(feedback_mode="immediate")],
            groups=[quiz_group(target_ids=["mcq-1"])],
        )

        result = block.preview_check_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
            },
        )

        self.assertTrue(result["success"])
        self.assertTrue(result["isCorrect"])
        self.assertEqual(block.assessment_snapshot_json, "")
        self.assertEqual(block.attempts_count, 0)
        self.assertEqual(block.current_score, 0.0)
        self.assertEqual(block.runtime.published, [])

    def test_immediate_check_respects_max_attempts(self):
        block = make_xblock([
            single_select_target(feedback_mode="immediate", max_attempts=1)
        ])

        first = block.check_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "a"},
                "expectedAttemptNumber": 0,
            },
        )
        second = block.check_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 1,
            },
        )

        self.assertTrue(first["success"])
        self.assertEqual(second, {"success": False, "error": "maximum attempts exceeded"})
        snapshot = json.loads(block.assessment_snapshot_json)
        stored = snapshot["problems"]["mcq-1"]
        self.assertEqual(stored["attemptNumber"], 1)
        self.assertEqual(stored["response"], {"kind": "single-select", "optionId": "a"})

    def test_request_problem_id_must_match_xblock_usage_id(self):
        block = make_xblock([
            single_select_target(feedback_mode="immediate", max_attempts=1)
        ])

        spoofed = block.check_assessment(
            {
                "problemId": "artifact:other-usage/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
            },
        )
        valid = block.check_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
        )

        self.assertEqual(
            spoofed,
            {"success": False, "error": "problemId, targetId, and interactionKind are required"},
        )
        self.assertTrue(valid["success"])
        problems = json.loads(block.assessment_snapshot_json)["problems"]
        self.assertNotIn("artifact:other-usage/block:mcq-1", problems)
        self.assertIn("mcq-1", problems)

    def test_scorebook_projection_uses_stored_target_settings(self):
        targets = [
            single_select_target("mcq-1", points=1),
            single_select_target("mcq-2", points=3),
            single_select_target("practice-1", points=50, is_graded=False),
        ]
        problems = {
            "mcq-1": {"submissionResult": {"score": 1}},
            "mcq-2": {"submissionResult": {"score": 0.5}},
            "practice-1": {"submissionResult": {"score": 1}},
        }

        projection = scorebook_module.build_assessment_grade_projection(
            targets,
            [],
            {"problems": problems, "quizzes": {}},
            "2026-07-17T10:00:00.123Z",
        )

        self.assertEqual(projection["normalizedScore"], 0.625)

    def test_numeric_projection_maps_weight_and_get_score_stably(self):
        block = make_xblock([single_select_target(points=2)])
        block.weight = 20

        result = block.submit_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
        )

        self.assertTrue(result["success"])
        self.assertEqual(block.current_score, 20)
        self.assertEqual(
            block.runtime.published,
            [(block, "grade", {"value": 20, "max_value": 20})],
        )
        score = block.get_score()
        self.assertEqual(score.raw_earned, 20)
        self.assertEqual(score.raw_possible, 20)

    def test_ungraded_projection_never_clears_prior_score_or_publishes_event(self):
        block = make_xblock([single_select_target(is_graded=False)])
        block.weight = 20
        block.current_score = 12

        result = block.submit_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
                "expectedAttemptNumber": 0,
            },
        )

        self.assertTrue(result["success"])
        self.assertEqual(block.current_score, 12)
        self.assertEqual(block.runtime.published, [])

    def test_successive_assessment_projections_store_ordered_change_times(self):
        block = make_xblock(
            [single_select_target("mcq-1"), single_select_target("mcq-2")],
        )

        for target_id in ["mcq-1", "mcq-2"]:
            block.submit_assessment(
                {
                    "problemId": "artifact:usage-v1/block:%s" % target_id,
                    "targetId": target_id,
                    "interactionKind": "single-select",
                    "response": {"kind": "single-select", "optionId": "b"},
                    "expectedAttemptNumber": 0,
                },
            )
            if target_id == "mcq-1":
                first_changed_at = block.assessment_grade_changed_at

        self.assertTrue(first_changed_at)
        self.assertTrue(block.assessment_grade_changed_at)
        first = datetime.fromisoformat(first_changed_at.replace("Z", "+00:00"))
        second = datetime.fromisoformat(
            block.assessment_grade_changed_at.replace("Z", "+00:00"),
        )
        self.assertLess(first, second)

    def test_request_must_match_stored_target_identity_and_interaction_kind(self):
        block = make_xblock([single_select_target()])

        wrong_target = block.submit_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "other",
                "interactionKind": "single-select",
                "response": {"kind": "single-select", "optionId": "b"},
            },
        )
        wrong_kind = block.submit_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "multi-select",
                "response": {"kind": "single-select", "optionId": "b"},
            },
        )

        self.assertEqual(
            wrong_target,
            {"success": False, "error": "targetId does not match problem"},
        )
        self.assertEqual(
            wrong_kind,
            {"success": False, "error": "interactionKind does not match problem"},
        )

    def test_request_response_kind_must_match_stored_target(self):
        block = make_xblock([single_select_target()])

        response = block.submit_assessment(
            {
                "problemId": "artifact:usage-v1/block:mcq-1",
                "targetId": "mcq-1",
                "interactionKind": "single-select",
                "response": {"kind": "multi-select", "optionIds": ["b"]},
            },
        )

        self.assertEqual(
            response,
            {"success": False, "error": "response kind does not match problem"},
        )
        self.assertEqual(block._assessment_snapshot()["problems"], {})
        self.assertEqual(block.attempts_count, 0)


if __name__ == "__main__":
    unittest.main()

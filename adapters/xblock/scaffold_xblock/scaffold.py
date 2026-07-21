import json
import logging
import uuid

from xblock.core import XBlock
from xblock.fields import Float, Integer, Scope, String
from xblock.scorable import ScorableXBlockMixin, Score

from .activity import (
    LearnerActivityOperationValidationError,
    load_learner_activity_snapshot,
    save_learner_activity_snapshot,
)
from .assessment import (
    grade_assessment_request,
    reveal_answer as reveal_standalone_answer,
    standalone_assessment_target_for_request,
)
from .errors import unexpected_error_response
from .media import MEDIA_UPLOAD_MAX_BYTES, validate_media_upload
from .media_store import (
    course_key as resolve_course_key,
    list_media as list_media_from_store,
    resolve_media as resolve_media_from_store,
    upload_media as upload_media_to_store,
)
from .payload import SAVE_PAYLOAD_MAX_BYTES
from .public import (
    public_assessment_result,
    public_assessment_snapshot,
    public_standalone_problem,
)
from .quiz import (
    finalize_expired_quiz_attempt as finalize_expired_quiz_attempt_state,
    finish_quiz_attempt as finish_quiz_attempt_state,
    iso_has_expired,
    quiz_attempt_expires_at,
    quiz_group_by_id,
    quiz_settings,
    public_quiz_problems_by_target_id,
    reveal_quiz_answers as reveal_quiz_answers_state,
    start_quiz_attempt as start_quiz_attempt_state,
    submit_quiz_question as submit_quiz_question_state,
    utc_now_iso,
)
from .scorebook import (
    build_assessment_grade_projection,
    build_submission_update,
    canonical_problem_snapshot,
    empty_problem_snapshot,
    map_grade_projection_to_xblock_event,
    problem_attempts,
)
from .state import (
    AssessmentStorageValidationError,
    artifact_from_json,
    assessment_bundle_from_json,
    assessment_grade_changed_at_is_newer,
    assessment_grade_delivery_from_json,
    assessment_snapshot_from_json,
    LearnerActivityStorageValidationError,
    learner_activity_snapshot_from_json,
    learner_content_from_json,
    next_assessment_grade_changed_at,
    serialize_assessment_grade_delivery,
    serialize_assessment_snapshot,
    serialize_learner_activity_snapshot,
)
from .validation.content_save import (
    ContentSaveValidationError,
    validate_content_save_bundle,
)
from .views import add_scaffold_view_resources

try:
    from web_fragments.fragment import Fragment
except ImportError:
    from xblock.fragment import Fragment

log = logging.getLogger(__name__)


SCAFFOLD_MODES = {"page", "slideshow", "branching"}
SCAFFOLD_CREATION_MODES = {"page", "slideshow"}
SCAFFOLD_DEFAULT_MODE = "page"


@XBlock.needs("user")
@XBlock.wants("studio_user_permissions")
class ScaffoldXBlock(ScorableXBlockMixin, XBlock):
    display_name_with_default = "Scaffold"
    category = "scaffold"
    icon_class = "problem"
    has_score = True

    display_name = String(default="Scaffold", scope=Scope.settings)
    artifact_json = String(
        default="",
        scope=Scope.content,
        help="Serialized Scaffold artifact JSON.",
    )
    learner_content_json = String(
        default="",
        scope=Scope.content,
        help="Serialized Scaffold learner-safe document JSON.",
    )
    assessment_targets_json = String(
        default="[]",
        scope=Scope.content,
        help="Serialized Scaffold assessment target contracts.",
    )
    assessment_groups_json = String(
        default="[]",
        scope=Scope.content,
        help="Serialized Scaffold assessment group contracts.",
    )
    assessment_snapshot_json = String(
        default="",
        scope=Scope.user_state,
        help="Serialized canonical learner assessment snapshot.",
    )
    assessment_grade_changed_at = String(
        default="",
        scope=Scope.user_state,
        help="Last adapter-owned neutral assessment grade projection change time.",
    )
    assessment_grade_delivery_json = String(
        default="",
        scope=Scope.user_state,
        help="Serialized adapter-private Open edX assessment grade delivery state.",
    )
    learner_activity_snapshot_json = String(
        default="",
        scope=Scope.user_state,
        help="Serialized canonical learner activity snapshot.",
    )
    attempts_count = Integer(default=0, scope=Scope.user_state)
    current_score = Float(default=0.0, scope=Scope.user_state)
    weight = Float(default=1.0, scope=Scope.settings)

    def student_view(self, context=None):
        fragment = Fragment('<div class="scaffold-xblock scaffold-student"></div>')
        add_scaffold_view_resources(self, fragment, "student", context)
        return fragment

    def studio_view(self, context=None):
        fragment = Fragment('<div class="scaffold-xblock scaffold-studio"></div>')
        add_scaffold_view_resources(self, fragment, "studio", context)
        return fragment

    def _artifact_id(self):
        return str(self.scope_ids.usage_id)

    def _artifact(self):
        return artifact_from_json(
            self.artifact_json,
            self._artifact_id(),
            self.display_name,
            SCAFFOLD_DEFAULT_MODE,
        )

    def _learner_content(self):
        return learner_content_from_json(self.learner_content_json)

    def _assessment_targets(self):
        return self._assessment_bundle()["assessment_targets"]

    def _assessment_groups(self):
        return self._assessment_bundle()["assessment_groups"]

    def _assessment_bundle(self):
        return assessment_bundle_from_json(
            self.assessment_targets_json,
            self.assessment_groups_json,
        )

    def _assessment_snapshot(self):
        return assessment_snapshot_from_json(
            self.assessment_snapshot_json,
            self._artifact_id(),
        )

    def _public_assessment_snapshot(self):
        return public_assessment_snapshot(
            self._assessment_snapshot(),
            self._assessment_targets(),
            self._assessment_groups(),
        )

    def _set_assessment_snapshot(self, snapshot):
        serialized_snapshot = serialize_assessment_snapshot(
            snapshot,
            self._artifact_id(),
        )
        changed_at = next_assessment_grade_changed_at(
            self.assessment_grade_changed_at,
        )
        build_assessment_grade_projection(
            self._assessment_targets(),
            self._assessment_groups(),
            snapshot,
            changed_at,
        )
        self.assessment_snapshot_json = serialized_snapshot
        self.assessment_grade_changed_at = changed_at

    def _assessment_grade_delivery(self):
        return assessment_grade_delivery_from_json(
            self.assessment_grade_delivery_json,
        )

    def _set_assessment_grade_delivery(self, delivery):
        self.assessment_grade_delivery_json = serialize_assessment_grade_delivery(
            delivery,
        )

    def _learner_activity_snapshot(self):
        return learner_activity_snapshot_from_json(
            self.learner_activity_snapshot_json,
            self._artifact_id(),
        )

    def _set_learner_activity_snapshot(self, snapshot):
        self.learner_activity_snapshot_json = serialize_learner_activity_snapshot(
            snapshot,
            self._artifact_id(),
        )

    def _learner_activity_block_ids(self):
        return _learner_activity_block_ids(self._learner_content())

    def _course_key(self):
        return resolve_course_key(
            self.runtime,
            getattr(self, "location", None),
            getattr(self, "scope_ids", None),
        )

    def _has_studio_write_access(self):
        try:
            permissions = self.runtime.service(self, "studio_user_permissions")
            return bool(permissions.can_write(self._course_key()))
        except Exception:  # pylint: disable=broad-except
            return False

    @XBlock.json_handler
    def create_artifact(self, data, suffix=""):
        if not self._has_studio_write_access():
            return {"success": False, "error": "authoring permission required"}

        mode = data.get("mode") if isinstance(data, dict) else None
        if mode not in SCAFFOLD_CREATION_MODES:
            return {"success": False, "error": "artifact mode is invalid"}

        existing_artifact = self._artifact()
        if isinstance(existing_artifact.get("content"), dict):
            return {"success": True, "artifact": existing_artifact}

        bundle = _create_empty_artifact_bundle(
            artifact_id=self._artifact_id(),
            title=self.display_name,
            mode=mode,
        )
        self.display_name = bundle["title"]
        self.artifact_json = json.dumps(bundle["artifact"])
        self.learner_content_json = json.dumps(bundle["learner_content"])
        self.assessment_targets_json = json.dumps(bundle["assessment_targets"])
        self.assessment_groups_json = json.dumps(bundle["assessment_groups"])
        return {"success": True, "artifact": bundle["artifact"]}

    @XBlock.json_handler
    def save_content(self, data, suffix=""):
        if not self._has_studio_write_access():
            return {"success": False, "error": "authoring permission required"}

        try:
            bundle = validate_content_save_bundle(
                data,
                self._artifact_id(),
                SCAFFOLD_MODES,
            )
        except ContentSaveValidationError as exc:
            return {"success": False, "error": str(exc)}

        self.display_name = bundle["title"]
        self.artifact_json = json.dumps(bundle["artifact"])
        self.learner_content_json = json.dumps(bundle["learner_content"])
        self.assessment_targets_json = json.dumps(bundle["assessment_targets"])
        self.assessment_groups_json = json.dumps(bundle["assessment_groups"])
        return {"success": True, "artifact": {"title": self.display_name}}

    @XBlock.json_handler
    def check_assessment(self, data, suffix=""):
        return self._handle_standalone_assessment_request(data, action="check")

    @XBlock.json_handler
    def submit_assessment(self, data, suffix=""):
        return self._handle_standalone_assessment_request(data, action="submit")

    @XBlock.json_handler
    def preview_check_assessment(self, data, suffix=""):
        if not self._has_studio_write_access():
            return {"success": False, "error": "authoring permission required"}

        return self._handle_standalone_assessment_request(
            data,
            action="check",
            persist=False,
        )

    @XBlock.json_handler
    def preview_submit_assessment(self, data, suffix=""):
        if not self._has_studio_write_access():
            return {"success": False, "error": "authoring permission required"}

        return self._handle_standalone_assessment_request(
            data,
            action="submit",
            persist=False,
        )

    @XBlock.json_handler
    def reveal_answer(self, data, suffix=""):
        try:
            snapshot = self._assessment_snapshot()
        except AssessmentStorageValidationError:
            return {"success": False, "error": "answer reveal unavailable"}

        return reveal_standalone_answer(
            data,
            self._assessment_targets(),
            self._assessment_groups(),
            self.scope_ids.usage_id,
            snapshot["problems"],
        )

    @XBlock.json_handler
    def reveal_hint(self, data, suffix=""):
        problem_id = data.get("problemId") if isinstance(data, dict) else None
        target_id = data.get("targetId") if isinstance(data, dict) else None
        interaction_kind = (
            data.get("interactionKind") if isinstance(data, dict) else None
        )
        target, error = standalone_assessment_target_for_request(
            self._assessment_targets(),
            self._assessment_groups(),
            self._artifact_id(),
            problem_id,
            target_id,
            interaction_kind,
        )
        if error:
            return {"success": False, "error": error}

        requested_hints_shown = (
            data.get("hintsShown") if isinstance(data, dict) else None
        )
        if type(requested_hints_shown) is not int or requested_hints_shown < 1:
            return {
                "success": False,
                "error": "hintsShown must be a positive integer",
            }

        snapshot = self._assessment_snapshot()
        problems = dict(snapshot["problems"])
        problem = dict(problems.get(target_id) or empty_problem_snapshot())
        current_hints_shown = problem["hintsShown"]
        if requested_hints_shown <= current_hints_shown:
            return _problem_command_response(
                {"success": True, "hintsShown": current_hints_shown},
                canonical_problem_snapshot(problems, target_id),
                target,
            )
        if requested_hints_shown > current_hints_shown + 1:
            return {
                "success": False,
                "error": "hintsShown cannot skip unrevealed hints",
            }

        problem["hintsShown"] = requested_hints_shown
        problems[target_id] = problem
        next_snapshot = dict(snapshot)
        next_snapshot["problems"] = problems
        self._set_assessment_snapshot(next_snapshot)
        return _problem_command_response(
            {"success": True, "hintsShown": problem["hintsShown"]},
            canonical_problem_snapshot(problems, target_id),
            target,
        )

    @XBlock.json_handler
    def start_quiz_attempt(self, data, suffix=""):
        self._deliver_pending_assessment_grade()
        snapshot = self._assessment_snapshot()
        assessment_groups = self._assessment_groups()
        outcome = start_quiz_attempt_state(
            data,
            assessment_groups,
            snapshot["quizzes"],
            utc_now_iso,
            lambda group_id: "quiz:%s:%s" % (group_id, uuid.uuid4().hex),
            quiz_attempt_expires_at,
            iso_has_expired,
        )
        if outcome["finalize_expired"] is not None:
            finalize = outcome["finalize_expired"]
            finalization = finalize_expired_quiz_attempt_state(
                finalize["attempt"],
                outcome["state"],
                finalize["group_id"],
                finalize["target_ids"],
                finalize["settings"],
                utc_now_iso,
            )
            snapshot["quizzes"] = finalization["state"]
            self._set_assessment_snapshot(snapshot)
            if finalization["publish_grade"]:
                self._recalculate_and_publish_current_grade()
            return _quiz_command_response(
                finalization["response"],
                snapshot["problems"],
                finalize["target_ids"],
                assessment_groups,
            )
        if outcome["state"] is not None:
            snapshot["quizzes"] = outcome["state"]
            self._set_assessment_snapshot(snapshot)
        return _quiz_command_response(
            outcome["response"],
            snapshot["problems"],
            [],
            assessment_groups,
        )

    @XBlock.json_handler
    def submit_quiz_question(self, data, suffix=""):
        self._deliver_pending_assessment_grade()
        snapshot = self._assessment_snapshot()
        assessment_groups = self._assessment_groups()
        outcome = submit_quiz_question_state(
            data,
            assessment_groups,
            self._assessment_targets(),
            snapshot["quizzes"],
            snapshot["problems"],
            self.scope_ids.usage_id,
            utc_now_iso,
            iso_has_expired,
        )
        transaction = self._build_assessment_transaction(
            snapshot,
            outcome.get("submissions", []),
            outcome["state"],
        )
        if transaction is not None:
            self._commit_assessment_transaction(transaction)
        if outcome.get("publish_grade"):
            self._recalculate_and_publish_current_grade(transaction["snapshot"])
        canonical_snapshot = transaction["snapshot"] if transaction is not None else snapshot
        target_id = data.get("targetId") if isinstance(data, dict) else None
        return _quiz_command_response(
            outcome["response"],
            canonical_snapshot["problems"],
            [target_id] if isinstance(target_id, str) else [],
            assessment_groups,
        )

    @XBlock.json_handler
    def finish_quiz_attempt(self, data, suffix=""):
        self._deliver_pending_assessment_grade()
        snapshot = self._assessment_snapshot()
        assessment_groups = self._assessment_groups()
        outcome = finish_quiz_attempt_state(
            data,
            assessment_groups,
            self._assessment_targets(),
            snapshot["quizzes"],
            self.scope_ids.usage_id,
            utc_now_iso,
            iso_has_expired,
        )
        if outcome["finalize_expired"] is not None:
            finalize = outcome["finalize_expired"]
            finalization = finalize_expired_quiz_attempt_state(
                finalize["attempt"],
                outcome["state"],
                finalize["group_id"],
                finalize["target_ids"],
                finalize["settings"],
                utc_now_iso,
            )
            snapshot["quizzes"] = finalization["state"]
            self._set_assessment_snapshot(snapshot)
            if finalization["publish_grade"]:
                self._recalculate_and_publish_current_grade()
            return _quiz_command_response(
                finalization["response"],
                snapshot["problems"],
                finalize["target_ids"],
                assessment_groups,
            )
        transaction = self._build_assessment_transaction(
            snapshot,
            outcome["submissions"],
            outcome["state"],
        )
        if transaction is not None:
            self._commit_assessment_transaction(transaction)
        if outcome["publish_grade"]:
            self._recalculate_and_publish_current_grade(transaction["snapshot"])
        canonical_snapshot = transaction["snapshot"] if transaction is not None else snapshot
        response_target_ids = (
            list(data.get("responsesByTargetId", {}).keys())
            if isinstance(data, dict) and isinstance(data.get("responsesByTargetId"), dict)
            else []
        )
        return _quiz_command_response(
            outcome["response"],
            canonical_snapshot["problems"],
            response_target_ids,
            assessment_groups,
        )

    @XBlock.json_handler
    def reveal_quiz_answers(self, data, suffix=""):
        snapshot = self._assessment_snapshot()
        assessment_groups = self._assessment_groups()
        outcome = reveal_quiz_answers_state(
            data,
            assessment_groups,
            snapshot["quizzes"],
        )
        target_ids = _quiz_target_ids(
            assessment_groups,
            data.get("groupId") if isinstance(data, dict) else None,
        )
        return _quiz_command_response(
            outcome["response"],
            snapshot["problems"],
            target_ids,
            assessment_groups,
        )

    @XBlock.json_handler
    def load_learner_activity(self, data, suffix=""):
        try:
            return load_learner_activity_snapshot(
                self._learner_activity_snapshot(),
                _without_protocol_version(data),
                self._artifact_id(),
            )
        except (
            LearnerActivityOperationValidationError,
            LearnerActivityStorageValidationError,
        ) as exc:
            return {"success": False, "error": str(exc)}

    @XBlock.json_handler
    def save_learner_activity(self, data, suffix=""):
        try:
            record, snapshot = save_learner_activity_snapshot(
                self._learner_activity_snapshot(),
                _without_protocol_version(data),
                self._artifact_id(),
                self._learner_activity_block_ids(),
            )
            self._set_learner_activity_snapshot(snapshot)
            return record
        except (
            LearnerActivityOperationValidationError,
            LearnerActivityStorageValidationError,
        ) as exc:
            return {"success": False, "error": str(exc)}

    @XBlock.json_handler
    def retry_assessment_grade_delivery(self, data, suffix=""):
        delivery = self._deliver_pending_assessment_grade()
        return {
            "success": True,
            "deliveryStatus": (
                delivery["deliveryStatus"] if delivery is not None else None
            ),
        }

    @XBlock.json_handler
    def resolve_media(self, data, suffix=""):
        try:
            return resolve_media_from_store(data, self._course_key())
        except Exception:  # pylint: disable=broad-except
            return unexpected_error_response(
                log,
                "resolve_media",
                "media could not be resolved",
            )

    @XBlock.json_handler
    def upload_media(self, data, suffix=""):
        if not self._has_studio_write_access():
            return {"success": False, "error": "authoring permission required"}

        try:
            return upload_media_to_store(data, self._course_key())
        except Exception:  # pylint: disable=broad-except
            return unexpected_error_response(
                log,
                "upload_media",
                "media upload failed",
            )

    @XBlock.json_handler
    def list_media(self, data, suffix=""):
        if not self._has_studio_write_access():
            return {"success": False, "error": "authoring permission required"}

        try:
            return list_media_from_store(data, self._course_key())
        except Exception:  # pylint: disable=broad-except
            return unexpected_error_response(
                log,
                "list_media",
                "media could not be listed",
            )

    def _handle_standalone_assessment_request(self, data, action, persist=True):
        target_id = data.get("targetId") if isinstance(data, dict) else None
        snapshot = self._assessment_snapshot()
        attempt_count = problem_attempts(snapshot["problems"], target_id)
        assessment_targets = self._assessment_targets()
        assessment_groups = self._assessment_groups()
        outcome = grade_assessment_request(
            data,
            action,
            assessment_targets,
            self.scope_ids.usage_id,
            attempt_count,
            persist=persist,
            assessment_groups=assessment_groups,
            allow_quiz_targets=not persist,
        )
        target = next(
            (
                candidate
                for candidate in assessment_targets
                if isinstance(candidate, dict)
                and candidate.get("targetId") == target_id
            ),
            None,
        )
        if persist and outcome["response"].get("success") is True:
            self._deliver_pending_assessment_grade()
        if outcome["submission"] is not None:
            update = self._apply_assessment_submission(
                snapshot,
                **outcome["submission"],
            )
            if persist:
                self._commit_assessment_update(update)
            return _problem_command_response(
                outcome["response"],
                canonical_problem_snapshot(update["snapshot"]["problems"], target_id),
                target,
                redact=persist,
            )
        if outcome["response"].get("success") is True:
            return _problem_command_response(
                outcome["response"],
                canonical_problem_snapshot(snapshot["problems"], target_id),
                target,
                redact=persist,
            )
        return outcome["response"]

    def _apply_assessment_submission(
        self,
        snapshot,
        problem_id,
        target_id,
        interaction_kind,
        response,
        result,
        points,
        is_graded,
        submitted=True,
        publish_grade=True,
    ):
        return build_submission_update(
            snapshot,
            target_id,
            response,
            result,
            is_graded,
            submitted=submitted,
            publish_grade=publish_grade,
        )

    def _build_assessment_transaction(self, snapshot, submissions, quizzes):
        if not submissions and quizzes is None:
            return None

        next_snapshot = snapshot
        attempts_delta = 0
        publish_grade = False
        for submission in submissions:
            update = self._apply_assessment_submission(
                next_snapshot,
                **submission,
            )
            next_snapshot = update["snapshot"]
            attempts_delta += update["attempts_delta"]
            publish_grade = publish_grade or update["publish_grade"]

        if quizzes is not None:
            next_snapshot = dict(next_snapshot)
            next_snapshot["quizzes"] = quizzes

        return {
            "snapshot": next_snapshot,
            "attempts_delta": attempts_delta,
            "publish_grade": publish_grade,
        }

    def _commit_assessment_transaction(self, transaction):
        self._set_assessment_snapshot(transaction["snapshot"])
        self.attempts_count += transaction["attempts_delta"]
        if transaction["publish_grade"]:
            projection = self._current_assessment_grade_projection(
                transaction["snapshot"],
            )
            self._stage_and_deliver_assessment_grade(projection)

    def _commit_assessment_update(self, update):
        self._set_assessment_snapshot(update["snapshot"])
        self.attempts_count += update["attempts_delta"]
        if update["publish_grade"]:
            projection = self._current_assessment_grade_projection(
                update["snapshot"],
            )
            self._stage_and_deliver_assessment_grade(projection)

    def _recalculate_and_publish_current_grade(self, snapshot=None):
        if snapshot is None:
            snapshot = self._assessment_snapshot()
        if not self.assessment_grade_changed_at:
            self.assessment_grade_changed_at = next_assessment_grade_changed_at("")
        projection = self._current_assessment_grade_projection(snapshot)
        self._stage_and_deliver_assessment_grade(projection)

    def _current_assessment_grade_projection(self, snapshot):
        return build_assessment_grade_projection(
            self._assessment_targets(),
            self._assessment_groups(),
            snapshot,
            self.assessment_grade_changed_at,
        )

    def _stage_and_deliver_assessment_grade(self, projection):
        staged = self._stage_assessment_grade_delivery(projection)
        if (
            staged is None
            or staged["projection"]["changedAt"] != projection["changedAt"]
        ):
            return staged
        return self._deliver_pending_assessment_grade()

    def _stage_assessment_grade_delivery(self, projection):
        current = self._assessment_grade_delivery()
        if current is not None:
            current_changed_at = current["projection"]["changedAt"]
            if current_changed_at == projection["changedAt"]:
                return current
            if not assessment_grade_changed_at_is_newer(
                projection["changedAt"],
                current_changed_at,
            ):
                return current

        delivery = {
            "projection": projection,
            "deliveryStatus": "pending",
            "attemptCount": 0,
            "lastAttemptedAt": None,
            "deliveredAt": None,
            "error": None,
        }
        self._set_assessment_grade_delivery(delivery)
        return delivery

    def _deliver_pending_assessment_grade(self):
        delivery = self._assessment_grade_delivery()
        if delivery is None or delivery["deliveryStatus"] == "delivered":
            return delivery

        attempted_at = next_assessment_grade_changed_at(
            delivery["lastAttemptedAt"] or "",
        )
        attempted_delivery = {
            **delivery,
            "deliveryStatus": "pending",
            "attemptCount": delivery["attemptCount"] + 1,
            "lastAttemptedAt": attempted_at,
            "deliveredAt": None,
            "error": None,
        }
        self._set_assessment_grade_delivery(attempted_delivery)

        try:
            event = map_grade_projection_to_xblock_event(
                attempted_delivery["projection"],
                self.weight,
            )
            if event is not None:
                self.runtime.publish(self, "grade", event)
        except Exception:  # pylint: disable=broad-except
            current = self._assessment_grade_delivery()
            if not _assessment_grade_delivery_attempt_matches(
                current,
                attempted_delivery,
            ):
                return current
            failed_delivery = {
                **attempted_delivery,
                "deliveryStatus": "failed",
                "error": "Open edX grade delivery failed",
            }
            self._set_assessment_grade_delivery(failed_delivery)
            log.warning(
                "Open edX assessment grade delivery failed for projection %s",
                attempted_delivery["projection"]["changedAt"],
                exc_info=True,
            )
            return failed_delivery

        current = self._assessment_grade_delivery()
        if not _assessment_grade_delivery_attempt_matches(
            current,
            attempted_delivery,
        ):
            return current
        if event is not None:
            self.current_score = event["value"]
        delivered = {
            **attempted_delivery,
            "deliveryStatus": "delivered",
            "deliveredAt": attempted_at,
        }
        self._set_assessment_grade_delivery(delivered)
        return delivered

    def max_score(self):
        return self.weight

    def get_score(self):
        return Score(raw_earned=self.current_score, raw_possible=self.weight)

    def set_score(self, score):
        self.current_score = score.raw_earned or 0.0

    def has_submitted_answer(self):
        return self.attempts_count > 0


def _without_protocol_version(data):
    if not isinstance(data, dict):
        return data
    request = dict(data)
    request.pop("protocolVersion", None)
    return request


def _problem_command_response(response, problem, target, redact=True):
    if not isinstance(response, dict) or response.get("success") is not True:
        return response
    if not redact:
        return {**response, "problem": problem}
    if not isinstance(target, dict):
        return {"success": False, "error": "problem not found"}

    public_response = dict(response)
    if isinstance(response.get("items"), dict):
        settings = (
            target.get("settings")
            if isinstance(target.get("settings"), dict)
            else {}
        )
        public_response = {
            "success": True,
            **public_assessment_result(
                response,
                include_authored_feedback=settings.get("showAnswer") is True,
            ),
        }
    return {
        **public_response,
        "problem": public_standalone_problem(problem, target),
    }


def _quiz_command_response(response, problems, target_ids, assessment_groups):
    if not isinstance(response, dict) or response.get("success") is not True:
        return response
    quiz_attempt = {
        key: value
        for key, value in response.items()
        if key not in {"success", "error", "quizAttempt", "problemsByTargetId"}
    }
    group = quiz_group_by_id(assessment_groups, quiz_attempt.get("groupId"))
    settings = quiz_settings(group) if group is not None else {"reviewDetail": "none"}
    return {
        **response,
        "quizAttempt": quiz_attempt,
        "problemsByTargetId": public_quiz_problems_by_target_id(
            problems,
            target_ids,
            settings,
            quiz_attempt,
        ),
    }


def _quiz_target_ids(groups, group_id):
    for group in groups if isinstance(groups, list) else []:
        if (
            isinstance(group, dict)
            and group.get("kind") == "quiz"
            and group.get("groupId") == group_id
        ):
            return [
                target_id
                for target_id in group.get("targetIds", [])
                if isinstance(target_id, str)
            ]
    return []


def _assessment_grade_delivery_attempt_matches(current, attempted):
    if current is None:
        return False
    return (
        current["projection"]["changedAt"]
        == attempted["projection"]["changedAt"]
        and current["lastAttemptedAt"] == attempted["lastAttemptedAt"]
    )


def _learner_activity_block_ids(content):
    block_ids = set()

    def visit(value):
        if isinstance(value, list):
            for item in value:
                visit(item)
            return
        if not isinstance(value, dict):
            return

        if value.get("type") in {"checklist", "flashcard"}:
            attrs = value.get("attrs")
            block_id = attrs.get("id") if isinstance(attrs, dict) else None
            if isinstance(block_id, str) and block_id.strip():
                block_ids.add(block_id)

        visit(value.get("content"))

    visit(content)
    return block_ids


def _create_empty_artifact_bundle(artifact_id, title, mode):
    content = _create_empty_course_document(mode)
    artifact_title = (
        title.strip() if isinstance(title, str) and title.strip() else "Scaffold"
    )
    return validate_content_save_bundle(
        {
            "artifact": {
                "id": artifact_id,
                "title": artifact_title,
                "mode": mode,
                "content": content,
            },
            "learnerContent": content,
            "assessmentTargets": [],
            "assessmentGroups": [],
        },
        artifact_id,
        SCAFFOLD_CREATION_MODES,
    )


def _create_empty_course_document(mode):
    surface_attrs = {"id": "surface-1"}
    surface_variant = _default_surface_variant_for_mode(mode)
    if surface_variant is not None:
        surface_attrs["variant"] = surface_variant

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
                        "attrs": surface_attrs,
                        "content": [{"type": "paragraph"}],
                    }
                ],
            }
        ],
    }


def _default_surface_variant_for_mode(mode):
    if mode == "page":
        return "page-default"
    if mode == "slideshow":
        return "slide-blank"
    return None

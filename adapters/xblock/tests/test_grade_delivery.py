import json
import unittest

from adapters.xblock.tests.test_scaffold_projection import (
    make_xblock,
    quiz_group,
    single_select_target,
)


def submission(target_id="mcq-1", option_id="b"):
    return {
        "problemId": "artifact:usage-v1/block:%s" % target_id,
        "targetId": target_id,
        "interactionKind": "single-select",
        "response": {"kind": "single-select", "optionId": option_id},
        "expectedAttemptNumber": 0,
    }


class SequencedPublishRuntime:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.attempted = []
        self.published = []

    def publish(self, block, event, payload):
        attempt = (block, event, payload)
        self.attempted.append(attempt)
        outcome = self.outcomes.pop(0) if self.outcomes else None
        if isinstance(outcome, Exception):
            raise outcome
        self.published.append(attempt)


class SupersedingPublishRuntime:
    def __init__(self, newer_delivery):
        self.newer_delivery = newer_delivery
        self.attempted = []

    def publish(self, block, event, payload):
        self.attempted.append((block, event, payload))
        block.assessment_grade_delivery_json = json.dumps(self.newer_delivery)
        block.current_score = self.newer_delivery["projection"]["normalizedScore"]


def delivery_record(block):
    return json.loads(block.assessment_grade_delivery_json)


class AssessmentGradeDeliveryTest(unittest.TestCase):
    def test_publish_failure_keeps_the_accepted_assessment_and_retryable_delivery(self):
        block = make_xblock([single_select_target()])
        block.assessment_grade_delivery_json = ""
        block.runtime = SequencedPublishRuntime(
            [RuntimeError("private grade backend detail")],
        )

        response = block.submit_assessment(submission())

        self.assertTrue(response["success"])
        self.assertTrue(response["isCorrect"])
        snapshot = json.loads(block.assessment_snapshot_json)
        self.assertEqual(snapshot["problems"]["mcq-1"]["attemptNumber"], 1)
        self.assertEqual(block.attempts_count, 1)
        self.assertEqual(block.current_score, 0.0)
        delivery = delivery_record(block)
        self.assertEqual(delivery["deliveryStatus"], "failed")
        self.assertEqual(delivery["attemptCount"], 1)
        self.assertEqual(
            delivery["projection"]["changedAt"],
            block.assessment_grade_changed_at,
        )
        self.assertEqual(delivery["error"], "Open edX grade delivery failed")
        self.assertNotIn("private grade backend detail", block.assessment_grade_delivery_json)
        self.assertNotIn("assessment_grade_delivery", block.assessment_snapshot_json)

    def test_retry_handler_delivers_once_without_consuming_another_attempt(self):
        block = make_xblock([single_select_target()])
        block.assessment_grade_delivery_json = ""
        block.runtime = SequencedPublishRuntime(
            [RuntimeError("temporary"), None],
        )
        block.submit_assessment(submission())
        accepted_snapshot = block.assessment_snapshot_json

        retry = block.retry_assessment_grade_delivery({})
        replay = block.retry_assessment_grade_delivery({})

        self.assertEqual(
            retry,
            {"success": True, "deliveryStatus": "delivered"},
        )
        self.assertEqual(replay, retry)
        self.assertEqual(block.assessment_snapshot_json, accepted_snapshot)
        self.assertEqual(block.attempts_count, 1)
        self.assertEqual(block.current_score, 1.0)
        self.assertEqual(len(block.runtime.attempted), 2)
        self.assertEqual(len(block.runtime.published), 1)
        delivery = delivery_record(block)
        self.assertEqual(delivery["deliveryStatus"], "delivered")
        self.assertEqual(delivery["attemptCount"], 2)
        self.assertIsNone(delivery["error"])

    def test_next_grade_change_retries_then_supersedes_with_the_newest_projection(self):
        block = make_xblock(
            [single_select_target("mcq-1"), single_select_target("mcq-2")],
        )
        block.assessment_grade_delivery_json = ""
        block.runtime = SequencedPublishRuntime(
            [RuntimeError("temporary"), None, None],
        )
        first = block.submit_assessment(submission("mcq-1"))
        older_delivery = delivery_record(block)

        second = block.submit_assessment(submission("mcq-2"))

        self.assertTrue(first["success"])
        self.assertTrue(second["success"])
        self.assertEqual(block.attempts_count, 2)
        self.assertEqual(
            [attempt[2]["value"] for attempt in block.runtime.attempted],
            [0.5, 0.5, 1.0],
        )
        newest_delivery = delivery_record(block)
        self.assertEqual(newest_delivery["deliveryStatus"], "delivered")
        self.assertNotEqual(
            newest_delivery["projection"]["changedAt"],
            older_delivery["projection"]["changedAt"],
        )
        self.assertEqual(newest_delivery["projection"]["normalizedScore"], 1.0)

        attempted_count = len(block.runtime.attempted)
        block._stage_assessment_grade_delivery(older_delivery["projection"])
        block._deliver_pending_assessment_grade()

        self.assertEqual(delivery_record(block), newest_delivery)
        self.assertEqual(len(block.runtime.attempted), attempted_count)

    def test_in_flight_older_attempt_cannot_overwrite_a_newer_delivery(self):
        block = make_xblock([single_select_target()])
        block.assessment_grade_delivery_json = ""
        block.runtime = SequencedPublishRuntime([RuntimeError("temporary")])
        block.submit_assessment(submission())
        older_delivery = delivery_record(block)
        newer_projection = {
            **older_delivery["projection"],
            "normalizedScore": 1.0,
            "changedAt": "2099-01-01T00:00:00.000000Z",
        }
        newer_delivery = {
            "projection": newer_projection,
            "deliveryStatus": "delivered",
            "attemptCount": 1,
            "lastAttemptedAt": "2099-01-01T00:00:01.000000Z",
            "deliveredAt": "2099-01-01T00:00:01.000000Z",
            "error": None,
        }
        block.runtime = SupersedingPublishRuntime(newer_delivery)

        result = block._deliver_pending_assessment_grade()

        self.assertEqual(result, newer_delivery)
        self.assertEqual(delivery_record(block), newer_delivery)
        self.assertEqual(block.current_score, 1.0)

    def test_quiz_grade_failure_keeps_the_completed_attempt_accepted_once(self):
        group = quiz_group(target_ids=["mcq-1"])
        block = make_xblock([single_select_target("mcq-1")], groups=[group])
        block.assessment_grade_delivery_json = ""
        block.runtime = SequencedPublishRuntime([RuntimeError("temporary")])
        attempt = block.start_quiz_attempt({"groupId": "quiz-1"})

        response = block.finish_quiz_attempt(
            {
                "attemptId": attempt["attemptId"],
                "groupId": "quiz-1",
                "responsesByTargetId": {
                    "mcq-1": {"kind": "single-select", "optionId": "b"},
                },
            },
        )

        self.assertTrue(response["success"])
        self.assertEqual(response["status"], "completed")
        snapshot = json.loads(block.assessment_snapshot_json)
        self.assertEqual(snapshot["quizzes"]["quiz-1"]["status"], "completed")
        self.assertEqual(snapshot["problems"]["mcq-1"]["attemptNumber"], 1)
        self.assertEqual(block.attempts_count, 1)
        self.assertEqual(delivery_record(block)["deliveryStatus"], "failed")


if __name__ == "__main__":
    unittest.main()

<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Scaffold is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

namespace mod_scaffold;

use mod_scaffold\local\assessment_public_projection;
use mod_scaffold\local\assessment_quiz;
use mod_scaffold\local\assessment_result_projection;
use mod_scaffold\local\grader;
use mod_scaffold\local\json_schema_validator;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests caller-owned quiz state transitions and learner projections.
 *
 * @covers \mod_scaffold\local\assessment_public_projection
 * @covers \mod_scaffold\local\assessment_quiz
 * @covers \mod_scaffold\local\assessment_result_projection
 */
final class assessment_quiz_test extends \basic_testcase {
    /**
     * @dataProvider public_projection_reference_provider
     */
    public function test_dependency_guard_detects_public_projection_reference(
        string $source,
    ): void {
        $this->assertNotSame([], self::public_projection_tokens($source));
    }

    public static function public_projection_reference_provider(): array {
        return [
            'require' => ["<?php require_once(__DIR__ . '/assessment_public_projection.php');"],
            'import' => ["<?php use mod_scaffold\\local\\assessment_public_projection;"],
            'name' => ["<?php \$projection = assessment_public_projection::class;"],
            'call' => ["<?php assessment_public_projection::snapshot(\$snapshot, []);"],
        ];
    }

    public function test_dependency_guard_ignores_comments(): void {
        $this->assertSame(
            [],
            self::public_projection_tokens("<?php // assessment_public_projection\n"),
        );
    }

    public function test_quiz_does_not_depend_on_public_projection(): void {
        $source = file_get_contents(__DIR__ . '/../classes/local/assessment_quiz.php');

        $this->assertIsString($source);
        $this->assertSame([], self::public_projection_tokens($source));
    }

    public function test_external_service_registry_exposes_quiz_lifecycle(): void {
        $source = file_get_contents(__DIR__ . '/../db/services.php');
        $this->assertIsString($source);

        foreach ([
            'mod_scaffold_start_quiz_attempt',
            'mod_scaffold_submit_quiz_question',
            'mod_scaffold_finish_quiz_attempt',
            'mod_scaffold_reveal_quiz_answers',
        ] as $operation) {
            $this->assertStringContainsString($operation, $source);
        }
    }

    public function test_result_only_projection_redacts_reconstructable_outcomes(): void {
        $result = (object) [
            'isCorrect' => false,
            'score' => 0,
            'maxScore' => 1,
            'feedback' => $this->feedback('Binary summary feedback'),
            'items' => (object) [
                'multi-select-option' => (object) [
                    'correct' => false,
                    'expected' => true,
                    'given' => false,
                ],
                'hotspot-region' => (object) [
                    'correct' => true,
                    'expected' => true,
                    'given' => true,
                ],
            ],
        ];

        $this->assert_no_item_outcomes(assessment_result_projection::result($result));
        $this->assertNull(assessment_result_projection::result($result)->feedback);
        $this->assertSame(
            $result->feedback,
            assessment_result_projection::result($result, true)->feedback,
        );
    }

    public function test_quiz_exposes_only_caller_owned_state_transitions(): void {
        $quiz = new assessment_quiz();

        foreach (['start', 'submit_question', 'finish', 'reveal'] as $method) {
            $this->assertFalse(method_exists($quiz, $method));
        }
    }

    public function test_after_each_answer_state_transitions_are_idempotent(): void {
        $targets = [$this->target('question-1'), $this->target('question-2')];
        $groups = [$this->group()];
        $snapshot = $this->snapshot();
        $times = [
            '2026-07-17T10:00:00.000000Z',
            '2026-07-17T10:00:01.000000Z',
            '2026-07-17T10:00:02.000000Z',
            '2026-07-17T10:00:03.000000Z',
        ];
        $gradecalls = 0;
        $quiz = new assessment_quiz(
            static function() use (&$times): string {
                return array_shift($times) ?? '2026-07-17T10:00:04.000000Z';
            },
            static fn(string $groupid): string => 'attempt-1',
            static function(array $target, array $response) use (&$gradecalls): array {
                $gradecalls++;
                return grader::grade_assessment($target, $response);
            },
        );

        $attempt = $quiz->start_state($snapshot, $targets, $groups, 'quiz-1');
        $this->assertSame('in_progress', $attempt->status);
        $this->assertSame('question-1', $attempt->currentTargetId);
        $this->assertFalse(property_exists($snapshot->quizzes->{'quiz-1'}, 'groupId'));

        $wrong = $quiz->submit_question_state(
            $snapshot,
            $targets,
            $groups,
            'attempt-1',
            'quiz-1',
            'question-1',
            ['kind' => 'single-select', 'optionId' => 'option-a'],
            0,
        );
        $this->assertSame('question-1', $wrong->currentTargetId);
        $this->assertSame(1, $snapshot->problems->{'question-1'}->attemptNumber);

        $wrongstate = serialize($snapshot);
        $stale = $quiz->submit_question_state(
            $snapshot,
            $targets,
            $groups,
            'attempt-1',
            'quiz-1',
            'question-1',
            ['kind' => 'single-select', 'optionId' => 'option-b'],
            0,
        );
        $this->assertSame(
            json_encode($wrong, JSON_THROW_ON_ERROR),
            json_encode($stale, JSON_THROW_ON_ERROR),
        );
        $this->assertSame($wrongstate, serialize($snapshot));
        $this->assertSame(1, $gradecalls);

        try {
            $quiz->submit_question_state(
                $snapshot,
                $targets,
                $groups,
                'attempt-1',
                'quiz-1',
                'question-1',
                ['kind' => 'single-select', 'optionId' => 'option-b'],
                2,
            );
            $this->fail('Future question sequence was accepted');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
        $this->assertSame(1, $gradecalls);

        $correct = $quiz->submit_question_state(
            $snapshot,
            $targets,
            $groups,
            'attempt-1',
            'quiz-1',
            'question-1',
            ['kind' => 'single-select', 'optionId' => 'option-b'],
            1,
        );
        $this->assertSame('question-2', $correct->currentTargetId);
        $this->assertSame(['question-1'], $correct->submittedTargetIds);

        $completed = $quiz->submit_question_state(
            $snapshot,
            $targets,
            $groups,
            'attempt-1',
            'quiz-1',
            'question-2',
            ['kind' => 'single-select', 'optionId' => 'option-b'],
            0,
        );
        $this->assertSame('completed', $completed->status);
        $this->assertSame(2.0, $completed->score);
        $this->assertSame(2.0, $completed->maxScore);
        $this->assertNull($completed->currentTargetId);
        $this->assertTrue($completed->answerReviewAuthorized);

        $revealed = $quiz->reveal_state($snapshot, $groups, 'attempt-1', 'quiz-1');
        $this->assertTrue($revealed->answerReviewAuthorized);
    }

    public function test_expired_finish_ignores_late_payload_and_is_idempotent(): void {
        $targets = [$this->target('question-1'), $this->target('question-2')];
        $groups = [$this->group('after_quiz', true, true)];
        $snapshot = $this->snapshot();
        $times = [
            '2026-07-17T10:00:00.000000Z',
            '2026-07-17T10:02:00.000000Z',
            '2026-07-17T10:02:01.000000Z',
        ];
        $gradecalls = 0;
        $quiz = new assessment_quiz(
            static function() use (&$times): string {
                return array_shift($times) ?? '2026-07-17T10:02:02.000000Z';
            },
            static fn(string $groupid): string => 'attempt-expired',
            static function(array $target, array $response) use (&$gradecalls): array {
                $gradecalls++;
                return grader::grade_assessment($target, $response);
            },
        );
        $quiz->start_state($snapshot, $targets, $groups, 'quiz-1');

        $expired = $quiz->finish_state(
            $snapshot,
            $targets,
            $groups,
            'attempt-expired',
            'quiz-1',
            ['question-1' => ['kind' => 'single-select', 'optionId' => 'option-b']],
        );
        $this->assertSame('expired', $expired->status);
        $this->assertSame(0.0, $expired->score);
        $this->assertSame(2.0, $expired->maxScore);
        $this->assertSame(0, $gradecalls);
        $this->assertSame([], get_object_vars($snapshot->quizzes->{'quiz-1'}->resultsByTargetId));
        $this->assertFalse(property_exists($snapshot->problems, 'question-1'));

        $expiredstate = serialize($snapshot);
        $duplicate = $quiz->finish_state(
            $snapshot,
            $targets,
            $groups,
            'attempt-expired',
            'quiz-1',
            ['unknown-target' => ['not' => 'a response']],
        );
        $this->assertSame(
            json_encode($expired, JSON_THROW_ON_ERROR),
            json_encode($duplicate, JSON_THROW_ON_ERROR),
        );
        $this->assertSame($expiredstate, serialize($snapshot));
        $this->assertSame(0, $gradecalls);
    }

    /**
     * @dataProvider review_detail_provider
     */
    public function test_in_progress_review_policy_never_exposes_answer_material(
        string $reviewdetail,
        bool $authorized,
    ): void {
        $targets = [$this->target('question-1'), $this->target('question-2')];
        $groups = [$this->group('after_each_answer', true, false, $reviewdetail)];
        $snapshot = $this->snapshot();
        $quiz = new assessment_quiz(
            static fn(): string => '2026-07-17T11:00:00.000000Z',
            static fn(string $groupid): string => 'attempt-after-each-' . $reviewdetail,
        );
        $attempt = $quiz->start_state($snapshot, $targets, $groups, 'quiz-1');
        $reviewed = $quiz->submit_question_state(
            $snapshot,
            $targets,
            $groups,
            $attempt->attemptId,
            'quiz-1',
            'question-1',
            ['kind' => 'single-select', 'optionId' => 'option-a'],
            0,
        );
        $this->assertSame($authorized, $reviewed->answerReviewAuthorized);

        $publicproblems = assessment_quiz::public_problems_by_target_id(
            $snapshot->problems,
            ['question-1'],
            $groups[0],
            $snapshot->quizzes->{'quiz-1'},
        );
        $storedjson = json_encode(
            $snapshot->quizzes->{'quiz-1'}->resultsByTargetId,
            JSON_THROW_ON_ERROR,
        );
        $this->assertStringContainsString('"expected"', $storedjson);
        $this->assertStringContainsString('Quiz item feedback sentinel', $storedjson);
        $this->assertStringContainsString('Quiz summary feedback sentinel', $storedjson);

        if ($reviewdetail === 'none') {
            $this->assertSame([], get_object_vars($reviewed->resultsByTargetId));
            $problem = $publicproblems->{'question-1'};
            $this->assertSame(1, $problem->attemptNumber);
            $this->assertFalse($problem->submitted);
            $this->assertNull($problem->checkResult);
            $this->assertNull($problem->submissionResult);
        } else {
            $this->assertTrue(property_exists($reviewed->resultsByTargetId, 'question-1'));
            $this->assertTrue(property_exists($publicproblems, 'question-1'));
        }

        $this->assert_no_answer_material(
            json_encode($reviewed, JSON_THROW_ON_ERROR),
        );
        $this->assert_no_answer_material(
            json_encode($publicproblems, JSON_THROW_ON_ERROR),
        );
    }

    /**
     * @dataProvider review_detail_provider
     */
    public function test_terminal_review_policy_exposes_only_authorized_detail(
        string $reviewdetail,
        bool $authorized,
    ): void {
        [$quiz, $snapshot, $groups, $attempt] = $this->completed_after_quiz($reviewdetail);
        $reviewed = assessment_quiz::public_attempt(
            $snapshot->quizzes->{'quiz-1'},
            $groups[0],
        );
        $this->assertSame($authorized, $reviewed->answerReviewAuthorized);

        $publicproblems = assessment_quiz::public_problems_by_target_id(
            $snapshot->problems,
            ['question-1', 'question-2'],
            $groups[0],
            $snapshot->quizzes->{'quiz-1'},
        );
        $storedjson = json_encode(
            $snapshot->quizzes->{'quiz-1'}->resultsByTargetId,
            JSON_THROW_ON_ERROR,
        );
        $this->assertStringContainsString('"expected"', $storedjson);
        $this->assertStringContainsString('Quiz item feedback sentinel', $storedjson);
        $this->assertStringContainsString('Quiz summary feedback sentinel', $storedjson);

        $publicjson = json_encode($reviewed, JSON_THROW_ON_ERROR);
        $problemjson = json_encode($publicproblems, JSON_THROW_ON_ERROR);
        if ($reviewdetail === 'none') {
            $this->assertSame([], get_object_vars($reviewed->resultsByTargetId));
            $problem = $publicproblems->{'question-1'};
            $this->assertFalse($problem->submitted);
            $this->assertNull($problem->checkResult);
            $this->assertNull($problem->submissionResult);
            $this->assert_no_answer_material($publicjson);
            $this->assert_no_answer_material($problemjson);
        } elseif ($reviewdetail === 'result_only') {
            foreach (get_object_vars($reviewed->resultsByTargetId) as $result) {
                $this->assert_no_item_outcomes($result);
            }
            foreach (get_object_vars($publicproblems) as $problem) {
                if ($problem->submissionResult instanceof \stdClass) {
                    $this->assert_no_item_outcomes($problem->submissionResult);
                }
            }
            $this->assert_no_answer_material($publicjson);
            $this->assert_no_answer_material($problemjson);
        } else {
            $this->assert_answer_material($publicjson);
            $this->assert_answer_material($problemjson);
        }

        $state = serialize($snapshot);
        if ($reviewdetail === 'full_review') {
            $revealed = $quiz->reveal_state(
                $snapshot,
                $groups,
                $attempt->attemptId,
                'quiz-1',
            );
            $this->assertTrue($revealed->answerReviewAuthorized);
        } else {
            try {
                $quiz->reveal_state(
                    $snapshot,
                    $groups,
                    $attempt->attemptId,
                    'quiz-1',
                );
                $this->fail('Unauthorized answer-key review was accepted');
            } catch (\moodle_exception) {
                $this->addToAssertionCount(1);
            }
        }
        $this->assertSame($state, serialize($snapshot));
    }

    public static function review_detail_provider(): array {
        return [
            'none' => ['none', false],
            'result only' => ['result_only', true],
            'full review' => ['full_review', true],
        ];
    }

    public function test_public_snapshot_is_identity_free_and_matches_contract(): void {
        [, $snapshot, $groups] = $this->completed_after_quiz('full_review');
        $publicsnapshot = assessment_public_projection::snapshot(
            $snapshot,
            [
                'targets' => [$this->target('question-1'), $this->target('question-2')],
                'groups' => $groups,
            ],
        );

        $this->assertFalse(
            property_exists($publicsnapshot->quizzes->{'quiz-1'}, 'groupId'),
        );
        json_schema_validator::validate_plugin_definition(
            'AssessmentLearnerSnapshot',
            $publicsnapshot,
            'publicAssessmentSnapshot',
        );
        $this->addToAssertionCount(1);
    }

    public function test_legacy_full_review_reveal_is_state_only(): void {
        [$quiz, $snapshot, $groups, $attempt] = $this->completed_after_quiz('full_review');
        $snapshot->quizzes->{'quiz-1'}->answerReviewAuthorized = false;
        $state = serialize($snapshot);

        $revealed = $quiz->reveal_state(
            $snapshot,
            $groups,
            $attempt->attemptId,
            'quiz-1',
        );
        $json = json_encode($revealed, JSON_THROW_ON_ERROR);
        $this->assertTrue($revealed->answerReviewAuthorized);
        $this->assertStringContainsString('"expected"', $json);
        $this->assertStringContainsString('Quiz item feedback sentinel', $json);
        $this->assertSame($state, serialize($snapshot));
    }

    public function test_expiry_reconciliation_finalizes_every_due_quiz_idempotently(): void {
        $snapshot = (object) [
            'snapshotVersion' => 1,
            'artifactId' => 'moodle-cm-42',
            'problems' => (object) [],
            'quizzes' => (object) [
                'quiz-due-one' => $this->expiry_attempt(
                    'attempt-due-one',
                    'question-1',
                    '2026-07-17T12:59:59.000000Z',
                ),
                'quiz-due-two' => $this->expiry_attempt(
                    'attempt-due-two',
                    'question-2',
                    '2026-07-17T13:00:00.000000Z',
                ),
                'quiz-future' => $this->expiry_attempt(
                    'attempt-future',
                    'question-1',
                    '2026-07-17T13:10:00.000000Z',
                ),
            ],
        ];
        $groups = [
            $this->group('after_each_answer', true, true, 'full_review', 'quiz-due-one'),
            $this->group('after_quiz', false, true, 'result_only', 'quiz-due-two'),
            $this->group('after_quiz', true, true, 'none', 'quiz-future'),
        ];
        $quiz = new assessment_quiz(
            static fn(): string => '2026-07-17T13:00:00.000000Z',
        );

        $expired = $quiz->expire_due_state(
            $snapshot,
            $groups,
            '2026-07-17T13:00:00.000000Z',
        );
        $this->assertSame(['quiz-due-one', 'quiz-due-two'], $expired);
        $this->assertSame('expired', $snapshot->quizzes->{'quiz-due-one'}->status);
        $this->assertSame('expired', $snapshot->quizzes->{'quiz-due-two'}->status);
        $this->assertSame('in_progress', $snapshot->quizzes->{'quiz-future'}->status);
        $this->assertSame(
            '2026-07-17T13:00:00.000000Z',
            $snapshot->quizzes->{'quiz-due-one'}->finishedAt,
        );
        $this->assertSame(
            [],
            $quiz->expire_due_state(
                $snapshot,
                $groups,
                '2026-07-17T13:00:01.000000Z',
            ),
        );

        $snapshot->quizzes->{'quiz-future'}->expiresAt = 'not-a-deadline';
        $this->expectException(\invalid_parameter_exception::class);
        $quiz->expire_due_state(
            $snapshot,
            $groups,
            '2026-07-17T13:00:01.000000Z',
        );
    }

    private function completed_after_quiz(string $reviewdetail): array {
        $targets = [$this->target('question-1'), $this->target('question-2')];
        $groups = [$this->group('after_quiz', true, false, $reviewdetail)];
        $snapshot = $this->snapshot();
        $quiz = new assessment_quiz(
            static fn(): string => '2026-07-17T12:00:00.000000Z',
            static fn(string $groupid): string => 'attempt-after-quiz-' . $reviewdetail,
        );
        $attempt = $quiz->start_state($snapshot, $targets, $groups, 'quiz-1');
        $quiz->finish_state(
            $snapshot,
            $targets,
            $groups,
            $attempt->attemptId,
            'quiz-1',
            [
                'question-1' => ['kind' => 'single-select', 'optionId' => 'option-b'],
                'question-2' => ['kind' => 'single-select', 'optionId' => 'option-a'],
            ],
        );
        return [$quiz, $snapshot, $groups, $attempt];
    }

    private function assert_no_item_outcomes(\stdClass $result): void {
        $this->assertSame([], get_object_vars($result->items ?? (object) []));
    }

    private static function public_projection_tokens(string $source): array {
        $references = [];
        foreach (token_get_all($source) as $token) {
            if (
                !is_array($token)
                || in_array($token[0], [T_COMMENT, T_DOC_COMMENT], true)
                || !str_contains(
                    strtolower($token[1]),
                    'assessment_public_projection',
                )
            ) {
                continue;
            }
            $references[] = $token;
        }
        return $references;
    }

    private function assert_no_answer_material(string $json): void {
        $this->assertStringNotContainsString('"expected"', $json);
        $this->assertStringNotContainsString('Quiz item feedback sentinel', $json);
        $this->assertStringNotContainsString('Quiz summary feedback sentinel', $json);
    }

    private function assert_answer_material(string $json): void {
        $this->assertStringContainsString('"expected"', $json);
        $this->assertStringContainsString('Quiz item feedback sentinel', $json);
        $this->assertStringContainsString('Quiz summary feedback sentinel', $json);
    }

    private function feedback(string $text): array {
        return [
            'kind' => 'rich-text',
            'document' => [
                'type' => 'doc',
                'content' => [[
                    'type' => 'paragraph',
                    'content' => [['type' => 'text', 'text' => $text]],
                ]],
            ],
        ];
    }

    private function target(string $targetid): array {
        return [
            'schemaVersion' => 1,
            'targetId' => $targetid,
            'blockId' => $targetid,
            'blockType' => 'mcq',
            'interaction' => [
                'kind' => 'single-select',
                'options' => [['id' => 'option-a'], ['id' => 'option-b']],
            ],
            'assessment' => [
                'kind' => 'single-select',
                'correctOptionId' => 'option-b',
                'feedbackByOptionId' => [
                    'option-a' => $this->feedback('Quiz item feedback sentinel'),
                ],
                'summaryFeedback' => $this->feedback('Quiz summary feedback sentinel'),
            ],
            'settings' => [
                'feedbackMode' => 'on_submit',
                'isGraded' => true,
                'showAnswer' => true,
                'points' => 1,
                'maxAttempts' => null,
            ],
        ];
    }

    private function group(
        string $reviewtiming = 'after_each_answer',
        bool $isgraded = true,
        bool $timerenabled = false,
        string $reviewdetail = 'full_review',
        string $groupid = 'quiz-1',
        array $targetids = ['question-1', 'question-2'],
    ): array {
        return [
            'schemaVersion' => 1,
            'kind' => 'quiz',
            'groupId' => $groupid,
            'targetIds' => $targetids,
            'settings' => [
                'allowBacktracking' => false,
                'reviewTiming' => $reviewtiming,
                'reviewDetail' => $reviewdetail,
                'attemptsPerQuestion' => 2,
                'isGraded' => $isgraded,
                'timer' => [
                    'enabled' => $timerenabled,
                    'durationSeconds' => $timerenabled ? 60 : 0,
                ],
            ],
        ];
    }

    private function snapshot(): \stdClass {
        return (object) [
            'snapshotVersion' => 1,
            'artifactId' => 'moodle-cm-42',
            'problems' => (object) [],
            'quizzes' => (object) [],
        ];
    }

    private function expiry_attempt(
        string $attemptid,
        string $targetid,
        string $expiresat,
    ): \stdClass {
        return (object) [
            'attemptId' => $attemptid,
            'status' => 'in_progress',
            'currentTargetId' => $targetid,
            'submittedTargetIds' => [],
            'startedAt' => '2026-07-17T12:00:00.000000Z',
            'finishedAt' => null,
            'expiresAt' => $expiresat,
            'score' => null,
            'maxScore' => null,
            'resultsByTargetId' => (object) [],
            'answerReviewAuthorized' => false,
        ];
    }
}

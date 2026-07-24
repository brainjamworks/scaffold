<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\assessment_grade_projector;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests Moodle grade projections from canonical assessment state.
 *
 * @covers \mod_scaffold\local\assessment_grade_projector
 */
final class assessment_grade_projector_test extends \basic_testcase {
    private const CHANGED_AT = '2026-07-17T10:00:00.123456Z';

    public function test_weighted_projection_and_moodle_scale_mapping(): void {
        $targets = [
            $this->target('target-a', 2),
            $this->target('target-b', 3),
        ];
        $projection = assessment_grade_projector::build(
            $targets,
            [],
            $this->snapshot([
                'target-a' => $this->problem(0.5),
                'target-b' => $this->problem(1.0),
            ]),
            self::CHANGED_AT,
        );

        $this->assertSame(0.8, $projection->normalizedScore);
        $this->assertSame('completed', $projection->activityStatus);
        $this->assertSame('graded', $projection->gradingStatus);
        $this->assertSame(self::CHANGED_AT, $projection->changedAt);
        $this->assertCount(4, get_object_vars($projection));
        $this->assertSame(16.0, assessment_grade_projector::to_raw_grade($projection, 20));
        $this->assertSame(16.0, assessment_grade_projector::to_raw_grade($projection, 20));
        $this->assertSame(80.0, assessment_grade_projector::to_raw_grade($projection, 100));
    }

    /**
     * @dataProvider standalone_state_provider
     */
    public function test_standalone_state_policy(
        \stdClass $snapshot,
        string $activitystatus,
        string $gradingstatus,
        ?float $score,
    ): void {
        $projection = assessment_grade_projector::build(
            [$this->target('target-a', 2), $this->target('target-b', 3)],
            [],
            $snapshot,
            self::CHANGED_AT,
        );

        $this->assertSame($activitystatus, $projection->activityStatus);
        $this->assertSame($gradingstatus, $projection->gradingStatus);
        $this->assertSame($score, $projection->normalizedScore);
        if ($activitystatus === 'in_progress' && $gradingstatus === 'graded') {
            $this->assertSame(4.0, assessment_grade_projector::to_raw_grade($projection, 20));
        }
    }

    public static function standalone_state_provider(): array {
        return [
            'not started' => [
                self::make_snapshot(),
                'not_started',
                'not_ready',
                null,
            ],
            'started without result' => [
                self::make_snapshot(['target-a' => self::make_problem(null)]),
                'in_progress',
                'not_ready',
                null,
            ],
            'provisional numeric result' => [
                self::make_snapshot(['target-a' => self::make_problem(0.5)]),
                'in_progress',
                'graded',
                0.2,
            ],
        ];
    }

    /**
     * @dataProvider quiz_state_provider
     */
    public function test_quiz_state_policy(
        string $status,
        string $activitystatus,
        ?float $score,
    ): void {
        $quizscore = match ($status) {
            'in_progress' => 1.0,
            'completed' => 0.25,
            'expired' => 0.5,
        };
        $projection = assessment_grade_projector::build(
            [$this->target('target-a', 1)],
            [$this->quiz_group()],
            $this->snapshot(
                ['target-a' => $this->problem(1.0)],
                ['quiz-1' => (object) [
                    'status' => $status,
                    'score' => $quizscore,
                    'resultsByTargetId' => (object) [
                        'target-a' => $this->grade_result($quizscore),
                    ],
                ]],
            ),
            self::CHANGED_AT,
        );

        $this->assertSame($activitystatus, $projection->activityStatus);
        $this->assertSame($score, $projection->normalizedScore);
    }

    public static function quiz_state_provider(): array {
        return [
            'in progress' => ['in_progress', 'in_progress', null],
            'completed' => ['completed', 'completed', 0.25],
            'expired' => ['expired', 'completed', 0.5],
        ];
    }

    public function test_legacy_standalone_quiz_problem_is_not_grade_credit(): void {
        $projection = assessment_grade_projector::build(
            [$this->target('target-a', 1)],
            [$this->quiz_group()],
            $this->snapshot(['target-a' => $this->problem(1.0)]),
            self::CHANGED_AT,
        );

        $this->assertNull($projection->normalizedScore);
        $this->assertSame('in_progress', $projection->activityStatus);
    }

    public function test_ungraded_activity_completes_without_grade(): void {
        $projection = assessment_grade_projector::build(
            [$this->target('practice', 5, false)],
            [],
            $this->snapshot(['practice' => $this->problem(1.0)]),
            self::CHANGED_AT,
        );

        $this->assertNull($projection->normalizedScore);
        $this->assertSame('completed', $projection->activityStatus);
        $this->assertSame('not_ready', $projection->gradingStatus);
        $this->assertNull(assessment_grade_projector::to_raw_grade($projection, 20));
    }

    public function test_all_authored_work_controls_completion_but_only_graded_work_scores(): void {
        $targets = [
            $this->target('graded', 2),
            $this->target('practice', 5, false),
        ];
        $inprogress = assessment_grade_projector::build(
            $targets,
            [],
            $this->snapshot(['graded' => $this->problem(1.0)]),
            self::CHANGED_AT,
        );
        $completed = assessment_grade_projector::build(
            $targets,
            [],
            $this->snapshot([
                'graded' => $this->problem(1.0),
                'practice' => $this->problem(0.0),
            ]),
            self::CHANGED_AT,
        );

        $this->assertSame('in_progress', $inprogress->activityStatus);
        $this->assertSame(1.0, $inprogress->normalizedScore);
        $this->assertSame('completed', $completed->activityStatus);
        $this->assertSame(1.0, $completed->normalizedScore);
    }

    public function test_ungraded_quiz_completes_without_grade(): void {
        $projection = assessment_grade_projector::build(
            [$this->target('target-a', 2, false)],
            [$this->quiz_group(false)],
            $this->snapshot(
                ['target-a' => $this->problem(1.0)],
                ['quiz-1' => (object) [
                    'status' => 'completed',
                    'score' => 1.0,
                    'resultsByTargetId' => (object) [
                        'target-a' => $this->grade_result(1.0),
                    ],
                ]],
            ),
            self::CHANGED_AT,
        );

        $this->assertSame('completed', $projection->activityStatus);
        $this->assertNull($projection->normalizedScore);
        $this->assertSame('not_ready', $projection->gradingStatus);
    }

    public function test_mixed_quiz_and_standalone_work_share_authored_weighting(): void {
        $projection = assessment_grade_projector::build(
            [
                $this->target('target-a', 1),
                $this->target('target-b', 3),
            ],
            [$this->quiz_group()],
            $this->snapshot(
                [
                    'target-a' => $this->problem(1.0),
                    'target-b' => $this->problem(0.5),
                ],
                ['quiz-1' => (object) [
                    'status' => 'completed',
                    'score' => 1.0,
                    'resultsByTargetId' => (object) [
                        'target-a' => $this->grade_result(1.0),
                    ],
                ]],
            ),
            self::CHANGED_AT,
        );

        $this->assertSame('completed', $projection->activityStatus);
        $this->assertSame(0.625, $projection->normalizedScore);
        $this->assertSame('graded', $projection->gradingStatus);
    }

    public function test_unbound_moodle_grade_scale_suppresses_grade(): void {
        $projection = assessment_grade_projector::build(
            [],
            [],
            $this->snapshot(),
            self::CHANGED_AT,
        );

        $this->assertNull($projection->normalizedScore);
        $this->assertNull(assessment_grade_projector::to_raw_grade($projection, null));
        $this->assertNull(assessment_grade_projector::to_raw_grade($projection, 0));
    }

    /**
     * @dataProvider invalid_maximum_provider
     */
    public function test_invalid_moodle_maximum_is_rejected(mixed $maximum): void {
        $projection = assessment_grade_projector::build(
            [$this->target('target-a', 1)],
            [],
            $this->snapshot(['target-a' => $this->problem(1.0)]),
            self::CHANGED_AT,
        );

        $this->expectException(\invalid_parameter_exception::class);
        assessment_grade_projector::to_raw_grade($projection, $maximum);
    }

    public static function invalid_maximum_provider(): array {
        return [
            'negative' => [-1],
            'infinite' => [INF],
            'not a number' => [NAN],
            'boolean' => [true],
            'string' => ['invalid'],
        ];
    }

    public function test_build_validates_contract_owned_projection(): void {
        $this->expectException(\invalid_parameter_exception::class);
        assessment_grade_projector::build([], [], $this->snapshot(), 'not-a-timestamp');
    }

    private function target(string $targetid, float $points, bool $isgraded = true): array {
        return [
            'targetId' => $targetid,
            'settings' => [
                'isGraded' => $isgraded,
                'points' => $points,
            ],
        ];
    }

    private function grade_result(float $score): \stdClass {
        return self::make_result($score);
    }

    private static function make_result(float $score): \stdClass {
        return (object) [
            'isCorrect' => $score === 1.0,
            'score' => $score,
            'maxScore' => 1,
            'feedback' => null,
            'items' => (object) [],
        ];
    }

    private function problem(?float $score): \stdClass {
        return self::make_problem($score);
    }

    private static function make_problem(?float $score): \stdClass {
        return (object) [
            'response' => null,
            'submitted' => $score !== null,
            'attemptNumber' => $score === null ? 0 : 1,
            'hintsShown' => 0,
            'checkResult' => null,
            'submissionResult' => $score === null ? null : self::make_result($score),
        ];
    }

    private function snapshot(array $problems = [], array $quizzes = []): \stdClass {
        return self::make_snapshot($problems, $quizzes);
    }

    private static function make_snapshot(array $problems = [], array $quizzes = []): \stdClass {
        return (object) [
            'snapshotVersion' => 1,
            'artifactId' => 'moodle-cm-42',
            'problems' => (object) $problems,
            'quizzes' => (object) $quizzes,
        ];
    }

    private function quiz_group(bool $isgraded = true): array {
        return [
            'kind' => 'quiz',
            'groupId' => 'quiz-1',
            'targetIds' => ['target-a'],
            'settings' => ['isGraded' => $isgraded],
        ];
    }
}

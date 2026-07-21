<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\activity_access;
use mod_scaffold\local\assessment_service;

defined('MOODLE_INTERNAL') || die();

/**
 * Exercises standalone assessment sequencing through Moodle DML and locking.
 *
 * @covers \mod_scaffold\local\assessment_service
 * @covers \mod_scaffold\local\assessment_state_repository
 */
final class assessment_service_test extends \advanced_testcase {
    public function test_assessment_commit_survives_immediate_publication_failure(): void {
        global $DB;

        $this->resetAfterTest();
        [$scope] = $this->create_scope(isgraded: true);
        $service = new assessment_service(
            null,
            static fn(array $target, array $response): array => self::assessment_result(true),
            static function(): never {
                throw new \RuntimeException('simulated publisher failure');
            },
        );

        $result = $service->submit(
            $scope,
            $this->problem_id($scope),
            'question-1',
            'single-select',
            ['kind' => 'single-select', 'optionId' => 'option-b'],
            0,
        );

        $this->assertSame('pending', $result['gradePublication']->status);
        $state = $DB->get_record('scaffold_assessment_state', [
            'scaffoldid' => $scope->instance->id,
            'userid' => $scope->actorid,
        ], '*', MUST_EXIST);
        $this->assertSame(1, (int) $state->staterevision);
        $publication = $DB->get_record('scaffold_grade_publications', [
            'scaffoldid' => $scope->instance->id,
            'userid' => $scope->actorid,
        ], '*', MUST_EXIST);
        $this->assertSame('pending', $publication->status);
        $this->assertSame(1, (int) $publication->staterevision);
    }

    public function test_equal_attempt_applies_once_and_stale_retry_converges(): void {
        global $DB;

        $this->resetAfterTest();
        [$scope] = $this->create_scope(maxattempts: 2, isgraded: true);
        $gradecalls = 0;
        $publicationcalls = 0;
        $service = new assessment_service(
            null,
            static function(array $target, array $response) use (&$gradecalls): array {
                $gradecalls++;
                return self::assessment_result(($response['optionId'] ?? null) === 'option-b');
            },
            static function() use (&$publicationcalls): \stdClass {
                $publicationcalls++;
                return (object) ['status' => 'observed'];
            },
        );

        $accepted = $service->submit(
            $scope,
            $this->problem_id($scope),
            'question-1',
            'single-select',
            ['kind' => 'single-select', 'optionId' => 'option-b'],
            0,
        );
        $row = $DB->get_record('scaffold_assessment_state', [
            'scaffoldid' => $scope->instance->id,
            'userid' => $scope->actorid,
        ], '*', MUST_EXIST);
        $acceptedbytes = serialize($row);

        $this->assertSame(1, $accepted['outcome']->problem->attemptNumber);
        $this->assertTrue($accepted['outcome']->problem->submitted);
        $this->assertSame('observed', $accepted['gradePublication']->status);
        $this->assertSame(1, (int) $row->staterevision);
        $publication = $DB->get_record('scaffold_grade_publications', [
            'scaffoldid' => $scope->instance->id,
            'userid' => $scope->actorid,
        ], '*', MUST_EXIST);
        $this->assertSame('pending', $publication->status);
        $this->assertSame(1, (int) $publication->staterevision);
        $this->assertSame(1, $gradecalls);
        $this->assertSame(1, $publicationcalls);

        $stale = $service->submit(
            $scope,
            $this->problem_id($scope),
            'question-1',
            'single-select',
            ['kind' => 'single-select', 'optionId' => 'option-a'],
            0,
        );

        $this->assertEquals($accepted['outcome']->problem, $stale['outcome']->problem);
        $this->assertNull($stale['gradePublication']);
        $this->assertSame(1, $gradecalls);
        $this->assertSame(1, $publicationcalls);
        $this->assertSame($acceptedbytes, serialize($DB->get_record(
            'scaffold_assessment_state',
            ['scaffoldid' => $scope->instance->id, 'userid' => $scope->actorid],
            '*',
            MUST_EXIST,
        )));

        $this->expectException(\invalid_parameter_exception::class);
        try {
            $service->submit(
                $scope,
                $this->problem_id($scope),
                'question-1',
                'single-select',
                ['kind' => 'single-select', 'optionId' => 'option-a'],
                2,
            );
        } finally {
            $this->assertSame(1, $gradecalls);
            $this->assertSame(1, $publicationcalls);
        }
    }

    public function test_policy_rejection_does_not_consume_an_attempt(): void {
        global $DB;

        $this->resetAfterTest();
        [$scope] = $this->create_scope(feedbackmode: 'on_submit', maxattempts: 1, isgraded: false);
        $service = new assessment_service();

        try {
            $service->check(
                $scope,
                $this->problem_id($scope),
                'question-1',
                'single-select',
                ['kind' => 'single-select', 'optionId' => 'option-a'],
                0,
            );
            $this->fail('Expected check policy rejection');
        } catch (\moodle_exception) {
            $this->addToAssertionCount(1);
        }
        $this->assertSame(0, $DB->count_records('scaffold_assessment_state', [
            'scaffoldid' => $scope->instance->id,
            'userid' => $scope->actorid,
        ]));
    }

    public function test_ungradable_response_does_not_consume_an_attempt(): void {
        global $DB;

        $this->resetAfterTest();
        [$scope] = $this->create_scope(maxattempts: 1, isgraded: false);
        $ungradable = new assessment_service(null, static fn(): ?array => null);
        try {
            $ungradable->submit(
                $scope,
                $this->problem_id($scope),
                'question-1',
                'single-select',
                ['kind' => 'single-select', 'optionId' => 'option-a'],
                0,
            );
            $this->fail('Expected ungradable response rejection');
        } catch (\moodle_exception) {
            $this->addToAssertionCount(1);
        }
        $this->assertSame(0, $DB->count_records('scaffold_assessment_state', [
            'scaffoldid' => $scope->instance->id,
            'userid' => $scope->actorid,
        ]));
    }

    public function test_maximum_attempt_rejection_preserves_the_accepted_state(): void {
        global $DB;

        $this->resetAfterTest();
        [$scope] = $this->create_scope(maxattempts: 1, isgraded: false);
        $service = new assessment_service();
        $accepted = $service->submit(
            $scope,
            $this->problem_id($scope),
            'question-1',
            'single-select',
            ['kind' => 'single-select', 'optionId' => 'option-a'],
            0,
        );
        $this->assertSame(1, $accepted['outcome']->problem->attemptNumber);
        try {
            $service->submit(
                $scope,
                $this->problem_id($scope),
                'question-1',
                'single-select',
                ['kind' => 'single-select', 'optionId' => 'option-b'],
                1,
            );
            $this->fail('Expected maximum-attempt rejection');
        } catch (\moodle_exception) {
            $this->addToAssertionCount(1);
        }
        $stored = json_decode((string) $DB->get_field(
            'scaffold_assessment_state',
            'snapshotjson',
            ['scaffoldid' => $scope->instance->id, 'userid' => $scope->actorid],
            MUST_EXIST,
        ));
        $this->assertSame(1, $stored->problems->{'question-1'}->attemptNumber);
    }

    public function test_hint_reveal_advances_sequentially_and_preserves_noops(): void {
        global $DB;

        $this->resetAfterTest();
        [$scope] = $this->create_scope(hintcount: 2, isgraded: false);
        $service = new assessment_service();

        $first = $service->reveal_hint(
            $scope,
            $this->problem_id($scope),
            'question-1',
            'single-select',
            1,
        );
        $firstrow = $DB->get_record('scaffold_assessment_state', [
            'scaffoldid' => $scope->instance->id,
            'userid' => $scope->actorid,
        ], '*', MUST_EXIST);
        $this->assertSame(1, $first['outcome']->problem->hintsShown);
        $this->assertSame(1, (int) $firstrow->staterevision);

        $duplicate = $service->reveal_hint(
            $scope,
            $this->problem_id($scope),
            'question-1',
            'single-select',
            1,
        );
        $this->assertSame(1, $duplicate['outcome']->problem->hintsShown);
        $this->assertSame(serialize($firstrow), serialize($DB->get_record(
            'scaffold_assessment_state',
            ['scaffoldid' => $scope->instance->id, 'userid' => $scope->actorid],
            '*',
            MUST_EXIST,
        )));

        $second = $service->reveal_hint(
            $scope,
            $this->problem_id($scope),
            'question-1',
            'single-select',
            2,
        );
        $this->assertSame(2, $second['outcome']->problem->hintsShown);
        $this->assertSame(2, (int) $DB->get_field(
            'scaffold_assessment_state',
            'staterevision',
            ['scaffoldid' => $scope->instance->id, 'userid' => $scope->actorid],
            MUST_EXIST,
        ));
        try {
            $service->reveal_hint(
                $scope,
                $this->problem_id($scope),
                'question-1',
                'single-select',
                4,
            );
            $this->fail('Expected skipped hint rejection');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
    }

    public function test_answer_reveal_requires_submitted_incorrect_canonical_problem(): void {
        global $DB;

        $this->resetAfterTest();
        [$submitscope] = $this->create_scope(maxattempts: 2, isgraded: false);
        $viewscope = activity_access::require((int) $submitscope->cm->id, 'mod/scaffold:view');
        $service = new assessment_service();

        try {
            $service->reveal_answer(
                $viewscope,
                $this->problem_id($viewscope),
                'question-1',
                'single-select',
            );
            $this->fail('Expected pre-attempt answer reveal rejection');
        } catch (\moodle_exception) {
            $this->addToAssertionCount(1);
        }
        $this->assertSame(0, $DB->count_records('scaffold_assessment_state'));

        $submitted = $service->submit(
            $submitscope,
            $this->problem_id($submitscope),
            'question-1',
            'single-select',
            ['kind' => 'single-select', 'optionId' => 'option-a'],
            0,
        );
        $this->assertTrue($submitted['outcome']->problem->submitted);
        $this->assertFalse($submitted['outcome']->problem->submissionResult->isCorrect);

        $answer = $service->reveal_answer(
            $viewscope,
            $this->problem_id($viewscope),
            'question-1',
            'single-select',
        );

        $this->assertSame('single-select', $answer['answerKey']['kind']);
        $this->assertSame('option-b', $answer['answerKey']['correctOptionId']);
        $this->assertSame(1, $DB->count_records('scaffold_assessment_state'));
    }

    public function test_standalone_commands_reject_quiz_targets_without_side_effects(): void {
        global $DB;

        $this->resetAfterTest();
        [$submitscope] = $this->create_scope(isgraded: true, quiz: true);
        $viewscope = activity_access::require((int) $submitscope->cm->id, 'mod/scaffold:view');
        $gradecalls = 0;
        $publicationcalls = 0;
        $completioncalls = 0;
        $service = new assessment_service(
            null,
            static function() use (&$gradecalls): array {
                $gradecalls++;
                return self::assessment_result(true);
            },
            static function() use (&$publicationcalls): \stdClass {
                $publicationcalls++;
                return (object) ['status' => 'observed'];
            },
            static function() use (&$completioncalls): void {
                $completioncalls++;
            },
        );
        $response = ['kind' => 'single-select', 'optionId' => 'option-b'];
        $operations = [
            'check' => fn(): array => $service->check(
                $submitscope,
                $this->problem_id($submitscope),
                'question-1',
                'single-select',
                $response,
                0,
            ),
            'submit' => fn(): array => $service->submit(
                $submitscope,
                $this->problem_id($submitscope),
                'question-1',
                'single-select',
                $response,
                0,
            ),
            'reveal_hint' => fn(): array => $service->reveal_hint(
                $submitscope,
                $this->problem_id($submitscope),
                'question-1',
                'single-select',
                1,
            ),
            'reveal_answer' => fn(): array => $service->reveal_answer(
                $viewscope,
                $this->problem_id($viewscope),
                'question-1',
                'single-select',
            ),
        ];

        foreach ($operations as $operation => $command) {
            try {
                $command();
                $this->fail('Expected standalone Quiz target rejection for ' . $operation);
            } catch (\moodle_exception $exception) {
                $this->assertSame('quiztargetrequiresquizattempt', $exception->errorcode);
                $this->assertSame('Quiz target requires a Quiz attempt', $exception->getMessage());
            }
            $this->assertSame(0, $DB->count_records('scaffold_assessment_state'));
            $this->assertSame(0, $DB->count_records('scaffold_grade_publications'));
            $this->assertSame(0, $gradecalls);
            $this->assertSame(0, $publicationcalls);
            $this->assertSame(0, $completioncalls);
        }
    }

    public function test_quiz_question_stale_retry_does_not_regrade_or_advance_state(): void {
        global $DB;

        $this->resetAfterTest();
        [$scope] = $this->create_scope(isgraded: false, quiz: true);
        $gradecalls = 0;
        $quiz = new \mod_scaffold\local\assessment_quiz(
            static fn(): string => '2026-07-18T10:00:00.000000Z',
            static fn(string $groupid): string => 'attempt-quiz-1',
            static function(array $target, array $response) use (&$gradecalls): array {
                $gradecalls++;
                return self::assessment_result(($response['optionId'] ?? null) === 'option-b');
            },
        );
        $service = new assessment_service(null, null, null, null, $quiz);
        $started = $service->start_quiz($scope, 'quiz-1');
        $this->assertSame('in_progress', $started['outcome']->quizAttempt->status);
        $this->assertSame([], get_object_vars($started['outcome']->problemsByTargetId));

        $accepted = $service->submit_quiz_question(
            $scope,
            'attempt-quiz-1',
            'quiz-1',
            'question-1',
            ['kind' => 'single-select', 'optionId' => 'option-a'],
            0,
        );
        $this->assertSame(1, $accepted['outcome']->problemsByTargetId->{'question-1'}->attemptNumber);
        $this->assertSame('question-1', $accepted['outcome']->quizAttempt->currentTargetId);
        $this->assertSame(1, $gradecalls);
        $acceptedrow = $DB->get_record('scaffold_assessment_state', [
            'scaffoldid' => $scope->instance->id,
            'userid' => $scope->actorid,
        ], '*', MUST_EXIST);

        $stale = $service->submit_quiz_question(
            $scope,
            'attempt-quiz-1',
            'quiz-1',
            'question-1',
            ['kind' => 'single-select', 'optionId' => 'option-b'],
            0,
        );
        $this->assertEquals($accepted['outcome'], $stale['outcome']);
        $this->assertSame(1, $gradecalls);
        $this->assertSame(serialize($acceptedrow), serialize($DB->get_record(
            'scaffold_assessment_state',
            ['scaffoldid' => $scope->instance->id, 'userid' => $scope->actorid],
            '*',
            MUST_EXIST,
        )));

        $this->expectException(\invalid_parameter_exception::class);
        try {
            $service->submit_quiz_question(
                $scope,
                'attempt-quiz-1',
                'quiz-1',
                'question-1',
                ['kind' => 'single-select', 'optionId' => 'option-b'],
                2,
            );
        } finally {
            $this->assertSame(1, $gradecalls);
        }
    }

    public function test_quiz_finish_and_reveal_return_terminal_state_without_rewriting(): void {
        global $DB;

        $this->resetAfterTest();
        [$scope] = $this->create_scope(isgraded: false, quiz: true, quizreviewtiming: 'after_quiz');
        $quiz = new \mod_scaffold\local\assessment_quiz(
            static fn(): string => '2026-07-18T11:00:00.000000Z',
            static fn(string $groupid): string => 'attempt-finish-1',
        );
        $service = new assessment_service(null, null, null, null, $quiz);
        $service->start_quiz($scope, 'quiz-1');
        $responses = [
            'question-1' => ['kind' => 'single-select', 'optionId' => 'option-b'],
            'question-2' => ['kind' => 'single-select', 'optionId' => 'option-a'],
        ];
        $finished = $service->finish_quiz($scope, 'attempt-finish-1', 'quiz-1', $responses);
        $this->assertSame('completed', $finished['outcome']->quizAttempt->status);
        $this->assertSame(['question-1', 'question-2'], array_keys(
            get_object_vars($finished['outcome']->problemsByTargetId),
        ));
        $terminalrow = $DB->get_record('scaffold_assessment_state', [
            'scaffoldid' => $scope->instance->id,
            'userid' => $scope->actorid,
        ], '*', MUST_EXIST);

        $duplicate = $service->finish_quiz($scope, 'attempt-finish-1', 'quiz-1', $responses);
        $this->assertEquals($finished['outcome'], $duplicate['outcome']);
        $this->assertSame(serialize($terminalrow), serialize($DB->get_record(
            'scaffold_assessment_state',
            ['scaffoldid' => $scope->instance->id, 'userid' => $scope->actorid],
            '*',
            MUST_EXIST,
        )));
        $revealed = $service->reveal_quiz($scope, 'attempt-finish-1', 'quiz-1');
        $this->assertEquals($finished['outcome']->quizAttempt, $revealed['outcome']->quizAttempt);
        $this->assertSame([], get_object_vars($revealed['outcome']->problemsByTargetId));
        $this->assertSame(serialize($terminalrow), serialize($DB->get_record(
            'scaffold_assessment_state',
            ['scaffoldid' => $scope->instance->id, 'userid' => $scope->actorid],
            '*',
            MUST_EXIST,
        )));
    }

    private function create_scope(
        string $feedbackmode = 'immediate',
        ?int $maxattempts = 2,
        bool $isgraded = false,
        int $hintcount = 2,
        bool $quiz = false,
        string $quizreviewtiming = 'after_each_answer',
    ): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $course = $this->getDataGenerator()->create_course();
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Assessment service fixture',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
        ]);
        $moduleid = $DB->get_field('modules', 'id', ['name' => 'scaffold'], MUST_EXIST);
        $cmid = $DB->insert_record('course_modules', (object) [
            'course' => $course->id,
            'module' => $moduleid,
            'instance' => $activityid,
            'section' => 0,
            'idnumber' => '',
            'added' => time(),
            'score' => 0,
            'indent' => 0,
            'visible' => 1,
            'visibleold' => 1,
            'groupmode' => 0,
            'groupingid' => 0,
            'completion' => 0,
            'completiongradeitemnumber' => null,
            'completionview' => 0,
            'completionexpected' => 0,
            'completionpassgrade' => 0,
            'showdescription' => 0,
        ]);
        course_add_cm_to_section($course, $cmid, 0);
        \context_module::instance($cmid);
        $targets = [self::target($feedbackmode, $maxattempts, $isgraded)];
        if ($quiz) {
            $targets[] = self::target($feedbackmode, $maxattempts, $isgraded, 'question-2');
        }
        $DB->set_field('scaffold', 'assessmenttargetsjson', json_encode(
            $targets,
            JSON_THROW_ON_ERROR,
        ), ['id' => $activityid]);
        $DB->set_field('scaffold', 'assessmentgroupsjson', json_encode(
            $quiz ? [self::quiz_group($quizreviewtiming, $isgraded)] : [],
            JSON_THROW_ON_ERROR,
        ), ['id' => $activityid]);
        $DB->set_field('scaffold', 'learnercontentjson', json_encode(
            self::learner_content($hintcount),
            JSON_THROW_ON_ERROR,
        ), ['id' => $activityid]);

        $learner = $this->getDataGenerator()->create_user();
        $roleid = $DB->get_field('role', 'id', ['shortname' => 'student'], MUST_EXIST);
        $this->getDataGenerator()->enrol_user($learner->id, $course->id, $roleid);
        $this->setUser($learner);

        return [activity_access::require($cmid, 'mod/scaffold:submit')];
    }

    private function problem_id(\mod_scaffold\local\activity_scope $scope): string {
        return 'artifact:moodle-cm-' . $scope->cm->id . '/block:question-1';
    }

    private static function target(
        string $feedbackmode,
        ?int $maxattempts,
        bool $isgraded,
        string $targetid = 'question-1',
    ): array {
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
                'feedbackByOptionId' => (object) [],
            ],
            'settings' => [
                'feedbackMode' => $feedbackmode,
                'isGraded' => $isgraded,
                'showAnswer' => true,
                'points' => 1,
                'maxAttempts' => $maxattempts,
            ],
        ];
    }

    private static function quiz_group(string $reviewtiming, bool $isgraded): array {
        return [
            'schemaVersion' => 1,
            'kind' => 'quiz',
            'groupId' => 'quiz-1',
            'targetIds' => ['question-1', 'question-2'],
            'settings' => [
                'allowBacktracking' => false,
                'reviewTiming' => $reviewtiming,
                'reviewDetail' => 'full_review',
                'attemptsPerQuestion' => 2,
                'isGraded' => $isgraded,
                'timer' => ['enabled' => false, 'durationSeconds' => 0],
            ],
        ];
    }

    private static function learner_content(int $hintcount): array {
        return [
            'type' => 'doc',
            'content' => [[
                'type' => 'courseDocument',
                'attrs' => ['mode' => 'page'],
                'content' => [[
                    'type' => 'surface',
                    'content' => [[
                        'type' => 'mcq',
                        'attrs' => ['id' => 'question-1'],
                        'content' => array_fill(0, $hintcount, ['type' => 'assessment_hint']),
                    ]],
                ]],
            ]],
        ];
    }

    private static function assessment_result(bool $correct): array {
        return [
            'isCorrect' => $correct,
            'score' => $correct ? 1 : 0,
            'maxScore' => 1,
            'feedback' => null,
            'items' => new \stdClass(),
        ];
    }
}

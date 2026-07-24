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

use mod_scaffold\external\finish_quiz_attempt;
use mod_scaffold\external\get_payload;
use mod_scaffold\external\load_learner_activity;
use mod_scaffold\external\reveal_hint;
use mod_scaffold\external\reveal_quiz_answers;
use mod_scaffold\external\save_learner_activity;
use mod_scaffold\external\start_quiz_attempt;
use mod_scaffold\external\submit_quiz_question;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests Moodle external-function declarations, context, and outcomes.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 *
 * @covers \mod_scaffold\external\finish_quiz_attempt
 * @covers \mod_scaffold\external\get_payload
 * @covers \mod_scaffold\external\reveal_hint
 * @covers \mod_scaffold\external\reveal_quiz_answers
 * @covers \mod_scaffold\external\start_quiz_attempt
 * @covers \mod_scaffold\external\submit_quiz_question
 */
final class external_api_test extends \advanced_testcase {
    /**
     * @dataProvider external_declaration_provider
     */
    public function test_external_declarations_are_strict(
        string $classname,
        array $parameterkeys,
        array $returnkeys,
    ): void {
        $this->assertSame(
            $parameterkeys,
            array_keys($classname::execute_parameters()->keys),
        );
        $this->assertSame(
            $returnkeys,
            array_keys($classname::execute_returns()->keys),
        );
    }

    public static function external_declaration_provider(): array {
        $quizreturns = ['success', 'outcomeJson', 'gradePublicationJson'];
        return [
            'start quiz' => [
                start_quiz_attempt::class,
                ['cmid', 'groupid'],
                $quizreturns,
            ],
            'submit quiz question' => [
                submit_quiz_question::class,
                [
                    'cmid',
                    'attemptid',
                    'groupid',
                    'targetid',
                    'responsejson',
                    'expectedattemptnumber',
                ],
                $quizreturns,
            ],
            'finish quiz' => [
                finish_quiz_attempt::class,
                ['cmid', 'attemptid', 'groupid', 'responsesjson'],
                $quizreturns,
            ],
            'reveal quiz answers' => [
                reveal_quiz_answers::class,
                ['cmid', 'attemptid', 'groupid'],
                $quizreturns,
            ],
            'reveal hint' => [
                reveal_hint::class,
                ['cmid', 'problemid', 'targetid', 'interactionkind', 'hintsshown'],
                $quizreturns,
            ],
            'get payload' => [
                get_payload::class,
                ['cmid', 'purpose'],
                [
                    'success',
                    'artifactJson',
                    'assessmentSnapshotJson',
                    'learnerActivitySnapshotJson',
                ],
            ],
            'load learner activity' => [
                load_learner_activity::class,
                ['cmid', 'artifactid'],
                ['success', 'snapshotJson'],
            ],
            'save learner activity' => [
                save_learner_activity::class,
                ['cmid', 'artifactid', 'blockid', 'recordjson'],
                ['success', 'recordJson'],
            ],
        ];
    }

    public function test_after_each_quiz_lifecycle_routes_canonical_state(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$cmid, $user, $scaffoldid] = $this->create_activity('after_each_answer', true);
        $this->setUser($user);

        $started = start_quiz_attempt::execute($cmid, 'quiz-1');
        $this->assertTrue($started['success']);
        $startedoutcome = $this->decode($started['outcomeJson']);
        $attemptid = $startedoutcome->quizAttempt->attemptId;
        $this->assertSame('in_progress', $startedoutcome->quizAttempt->status);
        $this->assertSame([], get_object_vars($startedoutcome->problemsByTargetId));

        $submitted = submit_quiz_question::execute(
            $cmid,
            $attemptid,
            'quiz-1',
            'question-1',
            '{"kind":"single-select","optionId":"option-b"}',
            0,
        );
        $this->assertTrue($submitted['success']);
        $submittedoutcome = $this->decode($submitted['outcomeJson']);
        $this->assertSame('completed', $submittedoutcome->quizAttempt->status);
        $this->assertSame(
            1,
            $submittedoutcome->problemsByTargetId->{'question-1'}->attemptNumber,
        );

        $revealed = reveal_quiz_answers::execute(
            $cmid,
            $attemptid,
            'quiz-1',
        );
        $revealedoutcome = $this->decode($revealed['outcomeJson']);
        $this->assertTrue($revealedoutcome->quizAttempt->answerReviewAuthorized);
        $this->assertSame(
            'null',
            $revealed['gradePublicationJson'],
        );
        $this->assertTrue($DB->record_exists('scaffold_assessment_state', [
            'scaffoldid' => $scaffoldid,
            'userid' => $user->id,
        ]));
    }

    public function test_after_quiz_finish_routes_response_map_and_terminal_state(): void {
        $this->resetAfterTest(true);
        [$cmid, $user] = $this->create_activity('after_quiz', true);
        $this->setUser($user);
        $started = start_quiz_attempt::execute($cmid, 'quiz-1');
        $attemptid = $this->decode($started['outcomeJson'])->quizAttempt->attemptId;

        $finished = finish_quiz_attempt::execute(
            $cmid,
            $attemptid,
            'quiz-1',
            '{"question-1":{"kind":"single-select","optionId":"option-b"}}',
        );
        $this->assertTrue($finished['success']);
        $outcome = $this->decode($finished['outcomeJson']);
        $this->assertSame('completed', $outcome->quizAttempt->status);
        $this->assertSame(
            ['question-1'],
            array_keys(get_object_vars($outcome->problemsByTargetId)),
        );

        $revealed = reveal_quiz_answers::execute($cmid, $attemptid, 'quiz-1');
        $this->assertTrue(
            $this->decode($revealed['outcomeJson'])
                ->quizAttempt
                ->answerReviewAuthorized,
        );
    }

    public function test_hint_reveal_routes_authoritative_problem_and_null_publication(): void {
        $this->resetAfterTest(true);
        [$cmid, $user] = $this->create_activity('after_each_answer', false);
        $this->setUser($user);

        $result = reveal_hint::execute(
            $cmid,
            'artifact:moodle-cm-' . $cmid . '/block:question-1',
            'question-1',
            'single-select',
            1,
        );
        $outcome = $this->decode($result['outcomeJson']);
        $this->assertTrue($result['success']);
        $this->assertSame(1, $outcome->problem->hintsShown);
        $this->assertSame('null', $result['gradePublicationJson']);
    }

    public function test_learner_activity_external_round_trip_is_lossless_and_isolated(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$cmid, $learner, $scaffoldid, $course] = $this->create_activity(
            'after_each_answer',
            false,
        );
        $artifactid = 'moodle-cm-' . $cmid;
        $this->setUser($learner);
        $empty = $this->decode(
            load_learner_activity::execute($cmid, $artifactid)['snapshotJson'],
        );
        $this->assertSame(1, $empty->snapshotVersion);
        $this->assertSame($artifactid, $empty->artifactId);
        $this->assertSame([], get_object_vars($empty->activities));

        $checklistjson = '{"activityKind":"checklist","data":{'
            . '"0":"zero","1":"one"},"completed":false}';
        $flashcardjson = '{"activityKind":"flashcard","data":{'
            . '"nestedNumericKeys":{"0":{"0":"deep-zero","1":"deep-one"},"1":"nested-one"},'
            . '"genuineArray":["array-zero",{"0":"object-zero","1":"object-one"}],'
            . '"emptyObject":{}},"completed":true}';
        $checklist = $this->decode(save_learner_activity::execute(
            $cmid,
            $artifactid,
            'checklist-1',
            $checklistjson,
        )['recordJson']);
        $flashcard = $this->decode(save_learner_activity::execute(
            $cmid,
            $artifactid,
            'flashcard-1',
            $flashcardjson,
        )['recordJson']);

        $this->assertSame('zero', $checklist->data->{'0'});
        $this->assertSame('one', $checklist->data->{'1'});
        $this->assertSame('deep-zero', $flashcard->data->nestedNumericKeys->{'0'}->{'0'});
        $this->assertSame('deep-one', $flashcard->data->nestedNumericKeys->{'0'}->{'1'});
        $this->assertSame('nested-one', $flashcard->data->nestedNumericKeys->{'1'});
        $this->assertIsArray($flashcard->data->genuineArray);
        $this->assertInstanceOf(\stdClass::class, $flashcard->data->genuineArray[1]);
        $this->assertInstanceOf(\stdClass::class, $flashcard->data->emptyObject);
        $this->assertTrue($flashcard->completed);

        $loadedjson = load_learner_activity::execute($cmid, $artifactid)['snapshotJson'];
        $loaded = $this->decode($loadedjson);
        $this->assertEquals($checklist, $loaded->activities->{'checklist-1'});
        $this->assertEquals($flashcard, $loaded->activities->{'flashcard-1'});
        $this->assertSame(1, $DB->count_records('scaffold_learner_activity', [
            'scaffoldid' => $scaffoldid,
            'userid' => $learner->id,
        ]));
        $this->assertJsonStringEqualsJsonString(
            $loadedjson,
            get_payload::execute($cmid, 'learner')['learnerActivitySnapshotJson'],
        );

        $otherlearner = $this->getDataGenerator()->create_user();
        $this->enrol_as($otherlearner, $course, 'student');
        $this->setUser($otherlearner);
        $otheruser = $this->decode(
            load_learner_activity::execute($cmid, $artifactid)['snapshotJson'],
        );
        $this->assertSame([], get_object_vars($otheruser->activities));

        [$othercmid, , , $othercourse] = $this->create_activity('after_each_answer', false);
        $this->enrol_as($learner, $othercourse, 'student');
        $this->setUser($learner);
        $otheractivity = $this->decode(load_learner_activity::execute(
            $othercmid,
            'moodle-cm-' . $othercmid,
        )['snapshotJson']);
        $this->assertSame('moodle-cm-' . $othercmid, $otheractivity->artifactId);
        $this->assertSame([], get_object_vars($otheractivity->activities));
    }

    public function test_learner_activity_external_rejects_invalid_scope_and_records(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$cmid, $learner, $scaffoldid] = $this->create_activity(
            'after_each_answer',
            false,
        );
        $artifactid = 'moodle-cm-' . $cmid;
        $this->setUser($learner);
        $checklistjson = '{"activityKind":"checklist","data":{},"completed":false}';

        $this->assert_invalid_parameter(static fn(): array => \core_external\external_api::validate_parameters(
            load_learner_activity::execute_parameters(),
            ['cmid' => [], 'artifactid' => $artifactid],
        ));
        $this->assert_moodle_exception(
            static fn(): array => load_learner_activity::execute(999999, 'moodle-cm-999999'),
        );
        foreach ([
            static fn(): array => load_learner_activity::execute($cmid, 'moodle-cm-999'),
            static fn(): array => save_learner_activity::execute(
                $cmid,
                $artifactid,
                '',
                $checklistjson,
            ),
            static fn(): array => save_learner_activity::execute(
                $cmid,
                $artifactid,
                'missing-block',
                $checklistjson,
            ),
            static fn(): array => save_learner_activity::execute(
                $cmid,
                $artifactid,
                'hidden-in-data',
                $checklistjson,
            ),
            static fn(): array => save_learner_activity::execute(
                $cmid,
                $artifactid,
                'checklist-1',
                '{"activityKind":"flashcard","data":{},"completed":false}',
            ),
            static fn(): array => save_learner_activity::execute(
                $cmid,
                $artifactid,
                'checklist-1',
                '{bad json',
            ),
            static fn(): array => save_learner_activity::execute(
                $cmid,
                $artifactid,
                'checklist-1',
                '[]',
            ),
            static fn(): array => save_learner_activity::execute(
                $cmid,
                $artifactid,
                'checklist-1',
                '{"activityKind":"checklist","data":{},"completed":false,"updatedAt":null}',
            ),
            static fn(): array => save_learner_activity::execute(
                $cmid,
                $artifactid,
                'checklist-1',
                '{"activityKind":"checklist","data":{},"completed":false,"unexpected":true}',
            ),
            static fn(): array => save_learner_activity::execute(
                $cmid,
                $artifactid,
                'checklist-1',
                '{"activityKind":"   ","data":{},"completed":false}',
            ),
            static fn(): array => save_learner_activity::execute(
                $cmid,
                $artifactid,
                'checklist-1',
                str_repeat('x', 262145),
            ),
        ] as $operation) {
            $this->assert_invalid_parameter($operation);
        }
        $this->assertSame(0, $DB->count_records('scaffold_learner_activity', [
            'scaffoldid' => $scaffoldid,
        ]));

        $viewerroleid = $DB->get_field(
            'role',
            'id',
            ['shortname' => 'student'],
            MUST_EXIST,
        );
        assign_capability(
            'mod/scaffold:view',
            CAP_PROHIBIT,
            $viewerroleid,
            \context_module::instance($cmid)->id,
            true,
        );
        accesslib_clear_all_caches_for_unit_testing();
        $this->setUser($learner);
        $this->expectException(\required_capability_exception::class);
        load_learner_activity::execute($cmid, $artifactid);
    }

    public function test_get_payload_delegates_authoring_and_learner_projections(): void {
        $this->resetAfterTest(true);
        [$cmid, $learner, , $course] = $this->create_activity(
            'after_each_answer',
            false,
        );
        $this->setUser($learner);
        $learnerpayload = get_payload::execute($cmid, 'learner');
        $this->assertTrue($learnerpayload['success']);
        $this->assertNotSame('null', $learnerpayload['assessmentSnapshotJson']);
        $this->assertArrayHasKey('learnerActivitySnapshotJson', $learnerpayload);

        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $authorpayload = get_payload::execute($cmid, 'authoring');
        $this->assertTrue($authorpayload['success']);
        $this->assertSame('null', $authorpayload['assessmentSnapshotJson']);
        $this->assertArrayNotHasKey('learnerActivitySnapshotJson', $authorpayload);

        $this->expectException(\invalid_parameter_exception::class);
        get_payload::execute($cmid, 'unknown');
    }

    public function test_external_parameter_and_capability_failures_propagate(): void {
        $this->resetAfterTest(true);
        [$cmid, , , $course] = $this->create_activity('after_each_answer', true);

        try {
            \core_external\external_api::validate_parameters(
                start_quiz_attempt::execute_parameters(),
                ['cmid' => [], 'groupid' => 'quiz-1'],
            );
            $this->fail('Invalid external parameter type was accepted');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }

        $teacher = $this->getDataGenerator()->create_user();
        $this->enrol_as($teacher, $course, 'teacher');
        $this->setUser($teacher);
        $this->expectException(\required_capability_exception::class);
        start_quiz_attempt::execute($cmid, 'quiz-1');
    }

    public function test_invalid_quiz_json_failure_propagates_without_state_change(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$cmid, $user, $scaffoldid] = $this->create_activity('after_quiz', true);
        $this->setUser($user);
        $started = start_quiz_attempt::execute($cmid, 'quiz-1');
        $attemptid = $this->decode($started['outcomeJson'])->quizAttempt->attemptId;
        $before = $DB->get_record('scaffold_assessment_state', [
            'scaffoldid' => $scaffoldid,
            'userid' => $user->id,
        ], '*', MUST_EXIST);

        try {
            finish_quiz_attempt::execute($cmid, $attemptid, 'quiz-1', '[]');
            $this->fail('List-shaped quiz response map was accepted');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
        $this->assertEquals($before, $DB->get_record(
            'scaffold_assessment_state',
            ['id' => $before->id],
            '*',
            MUST_EXIST,
        ));
    }

    private function create_activity(
        string $reviewtiming,
        bool $quiz,
    ): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');
        $course = $this->getDataGenerator()->create_course();
        $scaffoldid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'External API fixture',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
        ]);
        $moduleid = $DB->get_field('modules', 'id', ['name' => 'scaffold'], MUST_EXIST);
        $cmid = $DB->insert_record('course_modules', (object) [
            'course' => $course->id,
            'module' => $moduleid,
            'instance' => $scaffoldid,
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

        $target = $this->target();
        $artifact = [
            'id' => 'moodle-cm-' . $cmid,
            'title' => 'External API fixture',
            'mode' => 'page',
            'content' => $this->learner_content(),
        ];
        $DB->set_field(
            'scaffold',
            'artifactjson',
            json_encode($artifact, JSON_THROW_ON_ERROR),
            ['id' => $scaffoldid],
        );
        $DB->set_field(
            'scaffold',
            'learnercontentjson',
            json_encode($this->learner_content(), JSON_THROW_ON_ERROR),
            ['id' => $scaffoldid],
        );
        $DB->set_field(
            'scaffold',
            'assessmenttargetsjson',
            json_encode([$target], JSON_THROW_ON_ERROR),
            ['id' => $scaffoldid],
        );
        $DB->set_field(
            'scaffold',
            'assessmentgroupsjson',
            json_encode(
                $quiz ? [$this->quiz_group($reviewtiming)] : [],
                JSON_THROW_ON_ERROR,
            ),
            ['id' => $scaffoldid],
        );

        $user = $this->getDataGenerator()->create_user();
        $this->enrol_as($user, $course, 'student');
        return [(int) $cmid, $user, (int) $scaffoldid, $course];
    }

    private function enrol_as(
        \stdClass $user,
        \stdClass $course,
        string $roleshortname,
    ): void {
        global $DB;

        $roleid = $DB->get_field(
            'role',
            'id',
            ['shortname' => $roleshortname],
            MUST_EXIST,
        );
        $this->getDataGenerator()->enrol_user($user->id, $course->id, $roleid);
    }

    private function decode(string $json): \stdClass {
        $value = json_decode($json, false, 512, JSON_THROW_ON_ERROR);
        if (!($value instanceof \stdClass)) {
            throw new \RuntimeException('Expected external JSON object');
        }
        return $value;
    }

    private function assert_invalid_parameter(callable $operation): void {
        try {
            $operation();
            $this->fail('Expected invalid_parameter_exception');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
    }

    private function assert_moodle_exception(callable $operation): void {
        try {
            $operation();
            $this->fail('Expected moodle_exception');
        } catch (\moodle_exception) {
            $this->addToAssertionCount(1);
        }
    }

    private function target(): array {
        return [
            'schemaVersion' => 1,
            'targetId' => 'question-1',
            'blockId' => 'question-1',
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
                'feedbackMode' => 'on_submit',
                'isGraded' => false,
                'showAnswer' => true,
                'points' => 1,
                'maxAttempts' => 1,
            ],
        ];
    }

    private function quiz_group(string $reviewtiming): array {
        return [
            'schemaVersion' => 1,
            'kind' => 'quiz',
            'groupId' => 'quiz-1',
            'targetIds' => ['question-1'],
            'settings' => [
                'allowBacktracking' => false,
                'reviewTiming' => $reviewtiming,
                'reviewDetail' => 'full_review',
                'attemptsPerQuestion' => 1,
                'isGraded' => false,
                'timer' => ['enabled' => false, 'durationSeconds' => 0],
            ],
        ];
    }

    private function learner_content(): array {
        return [
            'type' => 'doc',
            'content' => [[
                'type' => 'courseDocument',
                'attrs' => ['mode' => 'page'],
                'content' => [[
                    'type' => 'surface',
                    'content' => [
                        [
                            'type' => 'checklist',
                            'attrs' => ['id' => 'checklist-1'],
                        ],
                        [
                            'type' => 'flashcard',
                            'attrs' => ['id' => 'flashcard-1'],
                        ],
                        [
                            'type' => 'mcq',
                            'attrs' => ['id' => 'question-1'],
                            'content' => [['type' => 'assessment_hint']],
                        ],
                    ],
                ]],
            ]],
        ];
    }
}

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

use mod_scaffold\local\assessment_state_repository;
use mod_scaffold\local\artifact_identity;
use mod_scaffold\local\grade_publication_repository;
use mod_scaffold\local\grade_publisher;

defined('MOODLE_INTERNAL') || die();

/**
 * Verifies learner publication against Moodle gradebook state.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 *
 * @covers \mod_scaffold\local\grade_publisher
 */
final class grade_publisher_test extends \advanced_testcase {
    public function test_grade_callback_stages_and_publishes_current_state(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user] = $this->create_fixture();
        $this->stage_scored_state($scaffold, $cm, $user, 0.75);
        (new grade_publication_repository())->delete_for_user((int) $user->id);

        scaffold_update_grades($scaffold, (int) $user->id);

        $publication = $DB->get_record('scaffold_grade_publications', [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ], '*', MUST_EXIST);
        $this->assertSame('published', $publication->status);
        $this->assertSame(1, (int) $publication->staterevision);
        $item = $this->grade_item($scaffold);
        $grade = \grade_grade::fetch(['itemid' => $item->id, 'userid' => $user->id]);
        $this->assertInstanceOf(\grade_grade::class, $grade);
        $this->assertEqualsWithDelta(75.0, (float) $grade->rawgrade, 0.00001);
    }

    public function test_pending_row_recovers_after_status_persistence_failure(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user] = $this->create_fixture();
        $this->stage_scored_state($scaffold, $cm, $user, 0.5);
        $repository = new grade_publication_repository();
        $rejectingrepository = new class($repository) {
            public function __construct(private grade_publication_repository $repository) {
            }

            public function get(int $scaffoldid, int $userid): ?\stdClass {
                return $this->repository->get($scaffoldid, $userid);
            }

            public function claim(
                int $scaffoldid,
                int $userid,
                int $staterevision,
                int $definitionversion,
            ): ?\stdClass {
                return $this->repository->claim(
                    $scaffoldid,
                    $userid,
                    $staterevision,
                    $definitionversion,
                );
            }

            public function record_status(
                int $scaffoldid,
                int $userid,
                int $staterevision,
                int $definitionversion,
                string $status,
                ?string $failurecode = null,
                ?int $retryafter = null,
            ): bool {
                return false;
            }
        };

        $first = (new grade_publisher(null, $rejectingrepository))->publish_user(
            $scaffold,
            (int) $user->id,
        );
        $this->assertSame('pending', $first->status);
        $this->assertSame('pending', $DB->get_field('scaffold_grade_publications', 'status', [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ]));

        $recovered = (new grade_publisher())->publish_user($scaffold, (int) $user->id);
        $this->assertSame('published', $recovered->status);
        $this->assertSame('published', $DB->get_field('scaffold_grade_publications', 'status', [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ]));
    }

    public function test_publishes_current_canonical_projection_to_gradebook(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user] = $this->create_fixture();
        $this->stage_scored_state($scaffold, $cm, $user, 0.5);
        $statebefore = $DB->get_record('scaffold_assessment_state', [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ], '*', MUST_EXIST);

        $outcome = (new grade_publisher())->publish_user($scaffold, (int) $user->id);

        $this->assertSame('published', $outcome->status);
        $publication = $DB->get_record('scaffold_grade_publications', [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ], '*', MUST_EXIST);
        $this->assertSame('published', $publication->status);
        $this->assertSame(1, (int) $publication->staterevision);
        $item = $this->grade_item($scaffold);
        $grade = \grade_grade::fetch(['itemid' => $item->id, 'userid' => $user->id]);
        $this->assertInstanceOf(\grade_grade::class, $grade);
        $this->assertEqualsWithDelta(50.0, (float) $grade->rawgrade, 0.00001);
        $this->assertEquals($statebefore, $DB->get_record(
            'scaffold_assessment_state',
            ['id' => $statebefore->id],
            '*',
            MUST_EXIST,
        ));
        $this->assertObjectNotHasProperty('rawgrade', $publication);
    }

    /**
     * @dataProvider grade_update_status_provider
     */
    public function test_maps_gradebook_update_statuses(
        int $returnstatus,
        string $expectedstatus,
        string $expectedcode,
        ?bool $expectedretryable,
        ?int $expectedretryafter,
    ): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user] = $this->create_fixture();
        $this->stage_scored_state($scaffold, $cm, $user, 0.5);
        $gradecalls = [];
        $publisher = new grade_publisher(
            null,
            null,
            null,
            static function(\stdClass $activity, array $grade) use (&$gradecalls, $returnstatus): int {
                $gradecalls[] = [$activity, $grade];
                return $returnstatus;
            },
            null,
            static fn(): int => 100,
        );

        $outcome = $publisher->publish_user($scaffold, (int) $user->id);
        $publication = $DB->get_record('scaffold_grade_publications', [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ], '*', MUST_EXIST);

        $this->assertSame($expectedstatus, $outcome->status);
        $this->assertSame($expectedcode, $outcome->code);
        $this->assertSame($expectedstatus, $publication->status);
        $this->assertSame($expectedcode, $publication->failurecode);
        $storedretryafter = $publication->retryafter === null ? null : (int) $publication->retryafter;
        $this->assertSame($expectedretryafter, $storedretryafter);
        $this->assertCount(1, $gradecalls);
        $this->assertSame((int) $user->id, $gradecalls[0][1]['userid']);
        $this->assertEqualsWithDelta(50.0, $gradecalls[0][1]['rawgrade'], 0.00001);
        if ($expectedretryable === null) {
            $this->assertObjectNotHasProperty('retryable', $outcome);
        } else {
            $this->assertSame($expectedretryable, $outcome->retryable);
        }
    }

    public static function grade_update_status_provider(): array {
        return [
            'retryable Moodle failure' => [
                1, // GRADE_UPDATE_FAILED.
                'failed',
                'grade_update_failed',
                true,
                160,
            ],
            'multiple grade items' => [
                2, // GRADE_UPDATE_MULTIPLE.
                'configuration_error',
                'multiple_grade_items',
                null,
                null,
            ],
            'locked grade item' => [
                4, // GRADE_UPDATE_ITEM_LOCKED.
                'locked',
                'grade_item_locked',
                null,
                null,
            ],
            'unknown status' => [
                99,
                'failed',
                'unknown_grade_update_status',
                false,
                null,
            ],
        ];
    }

    public function test_gradebook_exception_is_retryable_and_privacy_safe(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user] = $this->create_fixture();
        $this->stage_scored_state($scaffold, $cm, $user, 0.5);
        $publisher = new grade_publisher(
            null,
            null,
            null,
            static function(\stdClass $activity, array $grade): never {
                throw new \RuntimeException('sensitive gradebook detail');
            },
            null,
            static fn(): int => 100,
        );

        $outcome = $publisher->publish_user($scaffold, (int) $user->id);
        $publication = $DB->get_record('scaffold_grade_publications', [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ], '*', MUST_EXIST);

        $this->assertSame('failed', $outcome->status);
        $this->assertSame('grade_update_exception', $outcome->code);
        $this->assertTrue($outcome->retryable);
        $this->assertSame(160, $outcome->retryAfter);
        $this->assertSame('grade_update_exception', $publication->failurecode);
        $this->assertSame(160, (int) $publication->retryafter);
        $this->assertStringNotContainsString(
            'sensitive',
            json_encode($publication, JSON_THROW_ON_ERROR),
        );
    }

    public function test_respects_instructor_override_and_item_lock(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user] = $this->create_fixture();
        $this->stage_scored_state($scaffold, $cm, $user, 0.5);
        $publisher = new grade_publisher();
        $publisher->publish_user($scaffold, (int) $user->id);
        $item = $this->grade_item($scaffold);
        $grade = \grade_grade::fetch(['itemid' => $item->id, 'userid' => $user->id]);
        $grade->set_overridden(true);

        $state = (new assessment_state_repository())->mutate_state(
            (int) $scaffold->id,
            (int) $user->id,
            artifact_identity::for_course_module((int) $cm->id),
            static function(\stdClass $snapshot): \stdClass {
                $snapshot->problems->{'question-1'}->submissionResult->score = 1;
                return $snapshot;
            },
        );
        (new grade_publication_repository())->upsert_pending(
            (int) $scaffold->id,
            (int) $user->id,
            (int) $state->stateRevision,
            1,
        );
        $override = $publisher->publish_user($scaffold, (int) $user->id);
        $this->assertSame('locked', $override->status);
        $this->assertSame('instructor_override', $override->code);
        $this->assertSame('locked', $DB->get_field('scaffold_grade_publications', 'status', [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ]));

        $grade->set_overridden(false);
        $item->locked = time();
        $item->update();
        (new grade_publication_repository())->upsert_pending(
            (int) $scaffold->id,
            (int) $user->id,
            (int) $state->stateRevision,
            2,
        );
        $DB->update_record('scaffold', (object) [
            'id' => $scaffold->id,
            'assessmentdefinitionversion' => 2,
            'gradeitemversion' => 2,
            'gradeitemstatus' => 'published',
        ]);
        $locked = $publisher->publish_user($scaffold, (int) $user->id);
        $this->assertSame('locked', $locked->status);
        $this->assertSame('grade_item_locked', $locked->code);
    }

    public function test_respects_a_locked_learner_grade(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user] = $this->create_fixture();
        $this->stage_scored_state($scaffold, $cm, $user, 0.5);
        $publisher = new grade_publisher();
        $publisher->publish_user($scaffold, (int) $user->id);
        $item = $this->grade_item($scaffold);
        $grade = \grade_grade::fetch(['itemid' => $item->id, 'userid' => $user->id]);
        $this->assertInstanceOf(\grade_grade::class, $grade);
        $grade->locked = time();
        $this->assertTrue($grade->update());

        $state = (new assessment_state_repository())->mutate_state(
            (int) $scaffold->id,
            (int) $user->id,
            artifact_identity::for_course_module((int) $cm->id),
            static function(\stdClass $snapshot): \stdClass {
                $snapshot->problems->{'question-1'}->submissionResult->score = 1;
                return $snapshot;
            },
        );
        (new grade_publication_repository())->upsert_pending(
            (int) $scaffold->id,
            (int) $user->id,
            (int) $state->stateRevision,
            1,
        );

        $outcome = $publisher->publish_user($scaffold, (int) $user->id);
        $publication = $DB->get_record('scaffold_grade_publications', [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ], '*', MUST_EXIST);

        $this->assertSame('locked', $outcome->status);
        $this->assertSame('learner_grade_locked', $outcome->code);
        $this->assertSame('learner_grade_locked', $publication->failurecode);
        $this->assertEqualsWithDelta(50.0, (float) $grade->rawgrade, 0.00001);
    }

    public function test_unrecognized_conflict_requires_operator_action_without_writing(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user] = $this->create_fixture();
        $this->stage_scored_state($scaffold, $cm, $user, 0.5);
        $gradecalls = 0;
        $publisher = new grade_publisher(
            null,
            null,
            null,
            static function() use (&$gradecalls): int {
                $gradecalls++;
                return GRADE_UPDATE_OK;
            },
            static fn(\stdClass $activity, int $userid): string => 'unexpected_conflict',
        );

        $outcome = $publisher->publish_user($scaffold, (int) $user->id);
        $publication = $DB->get_record('scaffold_grade_publications', [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ], '*', MUST_EXIST);

        $this->assertSame(0, $gradecalls);
        $this->assertSame('configuration_error', $outcome->status);
        $this->assertSame('gradebook_conflict', $outcome->code);
        $this->assertSame('configuration_error', $publication->status);
        $this->assertSame('gradebook_conflict', $publication->failurecode);
    }

    public function test_null_projection_performs_no_numeric_update(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user] = $this->create_fixture();
        $state = (new assessment_state_repository())->get_or_create_state(
            (int) $scaffold->id,
            (int) $user->id,
            artifact_identity::for_course_module((int) $cm->id),
        );
        (new grade_publication_repository())->upsert_pending(
            (int) $scaffold->id,
            (int) $user->id,
            (int) $state->stateRevision,
            1,
        );

        $outcome = (new grade_publisher())->publish_user($scaffold, (int) $user->id);

        $this->assertSame('not_applicable', $outcome->status);
        $this->assertFalse($this->find_grade_item($scaffold));
        $this->assertSame('published', $DB->get_field('scaffold_grade_publications', 'status', [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ]));
        $this->assertSame(0, (int) $DB->get_field(
            'scaffold_grade_publications',
            'retrycount',
            ['scaffoldid' => $scaffold->id, 'userid' => $user->id],
        ));
    }

    /**
     * @dataProvider stale_source_provider
     */
    public function test_stale_source_identity_does_not_reach_moodle(string $field): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user] = $this->create_fixture();
        $this->stage_scored_state($scaffold, $cm, $user, 0.5);
        $DB->set_field('scaffold_grade_publications', $field, 2, [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ]);
        $gradecalls = 0;
        $publisher = new grade_publisher(
            null,
            null,
            null,
            static function() use (&$gradecalls): int {
                $gradecalls++;
                return GRADE_UPDATE_OK;
            },
        );

        $outcome = $publisher->publish_user($scaffold, (int) $user->id);

        $this->assertSame('pending', $outcome->status);
        $this->assertSame(0, $gradecalls);
    }

    public static function stale_source_provider(): array {
        return [
            'state revision changed' => ['staterevision'],
            'definition version changed' => ['definitionversion'],
        ];
    }

    public function test_retryable_failure_uses_bounded_exponential_backoff(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user] = $this->create_fixture();
        $this->stage_scored_state($scaffold, $cm, $user, 0.5);
        $DB->set_field('scaffold_grade_publications', 'retrycount', 2, [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ]);
        $repository = new grade_publication_repository($DB, static fn(): int => 100);
        $publisher = new grade_publisher(
            null,
            $repository,
            null,
            static fn(): int => GRADE_UPDATE_FAILED,
            null,
            static fn(): int => 100,
        );

        $outcome = $publisher->publish_user($scaffold, (int) $user->id);
        $publication = $repository->get((int) $scaffold->id, (int) $user->id);

        $this->assertSame('failed', $outcome->status);
        $this->assertSame(340, $outcome->retryAfter);
        $this->assertNotNull($publication);
        $this->assertSame(3, $publication->retrycount);
        $this->assertSame(340, $publication->retryafter);
    }

    private function stage_scored_state(\stdClass $scaffold, object $cm, \stdClass $user, float $score): void {
        $state = (new assessment_state_repository())->mutate_state(
            (int) $scaffold->id,
            (int) $user->id,
            artifact_identity::for_course_module((int) $cm->id),
            static function(\stdClass $snapshot) use ($score): \stdClass {
                $snapshot->problems->{'question-1'} = (object) [
                    'response' => (object) ['kind' => 'single-select', 'optionId' => 'option-a'],
                    'submitted' => true,
                    'attemptNumber' => 1,
                    'hintsShown' => 0,
                    'checkResult' => null,
                    'submissionResult' => (object) [
                        'isCorrect' => $score === 1.0,
                        'score' => $score,
                        'maxScore' => 1,
                        'feedback' => null,
                        'items' => (object) [],
                    ],
                ];
                return $snapshot;
            },
        );
        (new grade_publication_repository())->upsert_pending(
            (int) $scaffold->id,
            (int) $user->id,
            (int) $state->stateRevision,
            1,
        );
    }

    private function grade_item(\stdClass $scaffold): \grade_item {
        $item = $this->find_grade_item($scaffold);
        $this->assertInstanceOf(\grade_item::class, $item);
        return $item;
    }

    private function find_grade_item(\stdClass $scaffold): \grade_item|false {
        $items = \grade_item::fetch_all([
            'courseid' => $scaffold->course,
            'itemtype' => 'mod',
            'itemmodule' => 'scaffold',
            'iteminstance' => $scaffold->id,
            'itemnumber' => 0,
        ]);
        return $items ? reset($items) : false;
    }

    private function create_fixture(): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/mod/scaffold/lib.php');
        require_once($CFG->libdir . '/gradelib.php');

        $course = $this->getDataGenerator()->create_course();
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Grade publisher fixture',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
        ]);
        $moduleid = $DB->get_field('modules', 'id', ['name' => 'scaffold'], MUST_EXIST);
        $cmid = add_course_module((object) [
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
        $target = [
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
                'isGraded' => true,
                'showAnswer' => true,
                'points' => 1,
                'maxAttempts' => 1,
            ],
        ];
        $DB->set_field('scaffold', 'assessmenttargetsjson', json_encode([$target], JSON_THROW_ON_ERROR), [
            'id' => $activityid,
        ]);
        $scaffold = $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST);
        $user = $this->getDataGenerator()->create_user();
        return [$scaffold, get_fast_modinfo($course)->get_cm($cmid), $user];
    }
}

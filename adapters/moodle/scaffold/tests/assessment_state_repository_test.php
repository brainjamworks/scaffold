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

defined('MOODLE_INTERNAL') || die();

/**
 * Tests canonical assessment state persistence with Moodle DML and locks.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 *
 * @covers \mod_scaffold\local\assessment_state_repository
 */
final class assessment_state_repository_test extends \advanced_testcase {
    public function test_get_or_create_is_unique_scoped_and_releases_moodle_lock(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$scaffoldid, $cmid] = $this->create_activity();
        $firstuser = $this->getDataGenerator()->create_user();
        $seconduser = $this->getDataGenerator()->create_user();
        $artifactid = 'moodle-cm-' . $cmid;
        $repository = new assessment_state_repository();

        $first = $repository->get_or_create_state(
            $scaffoldid,
            (int) $firstuser->id,
            $artifactid,
        );
        $this->assertSame(0, $first->stateRevision);
        $this->assertFalse($first->changed);
        $this->assertSame($artifactid, $first->snapshot->artifactId);
        $this->assertSame([], get_object_vars($first->snapshot->problems));
        $this->assertSame([], get_object_vars($first->snapshot->quizzes));
        $this->assertSame(1, $DB->count_records('scaffold_assessment_state'));

        $repeat = $repository->get_or_create_state(
            $scaffoldid,
            (int) $firstuser->id,
            $artifactid,
        );
        $repository->get_or_create_state(
            $scaffoldid,
            (int) $seconduser->id,
            $artifactid,
        );
        $this->assertEquals($first->snapshot, $repeat->snapshot);
        $this->assertSame(2, $DB->count_records('scaffold_assessment_state'));

        $factory = \core\lock\lock_config::get_lock_factory(
            'mod_scaffold_assessment_state',
        );
        $lock = $factory->get_lock(
            'activity:' . $scaffoldid . ':learner:' . $firstuser->id,
            0,
        );
        $this->assertNotFalse($lock, 'Repository must release its learner lock');
        $lock->release();

        $dbman = $DB->get_manager();
        $this->assertTrue($dbman->index_exists(
            new \xmldb_table('scaffold_assessment_state'),
            new \xmldb_index(
                'scaffolduser',
                XMLDB_INDEX_UNIQUE,
                ['scaffoldid', 'userid'],
            ),
        ));
    }

    public function test_corrupt_stored_snapshots_are_rejected_without_rewrite(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$scaffoldid, $cmid] = $this->create_activity();
        $user = $this->getDataGenerator()->create_user();
        $artifactid = 'moodle-cm-' . $cmid;
        $repository = new assessment_state_repository();
        $repository->get_or_create($scaffoldid, (int) $user->id, $artifactid);
        $valid = $DB->get_record('scaffold_assessment_state', [
            'scaffoldid' => $scaffoldid,
            'userid' => $user->id,
        ], '*', MUST_EXIST);
        $cases = [
            'invalid JSON' => '{',
            'list root' => '[]',
            'wrong artifact' => json_encode([
                'snapshotVersion' => 1,
                'artifactId' => 'moodle-cm-other',
                'problems' => (object) [],
                'quizzes' => (object) [],
            ], JSON_THROW_ON_ERROR),
            'future version' => json_encode([
                'snapshotVersion' => 2,
                'artifactId' => $artifactid,
                'problems' => (object) [],
                'quizzes' => (object) [],
            ], JSON_THROW_ON_ERROR),
        ];

        foreach ($cases as $case => $snapshotjson) {
            $DB->set_field(
                'scaffold_assessment_state',
                'snapshotjson',
                $snapshotjson,
                ['id' => $valid->id],
            );
            $before = $DB->get_record(
                'scaffold_assessment_state',
                ['id' => $valid->id],
                '*',
                MUST_EXIST,
            );
            try {
                $repository->get_or_create($scaffoldid, (int) $user->id, $artifactid);
                $this->fail('Corrupt snapshot was accepted: ' . $case);
            } catch (\invalid_parameter_exception) {
                $this->addToAssertionCount(1);
            }
            $this->assertEquals(
                $before,
                $DB->get_record(
                    'scaffold_assessment_state',
                    ['id' => $valid->id],
                    '*',
                    MUST_EXIST,
                ),
                $case,
            );
        }
    }

    public function test_failed_and_invalid_mutations_roll_back_real_transaction(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$scaffoldid, $cmid] = $this->create_activity();
        $user = $this->getDataGenerator()->create_user();
        $artifactid = 'moodle-cm-' . $cmid;
        $repository = new assessment_state_repository();
        $repository->get_or_create($scaffoldid, (int) $user->id, $artifactid);
        $before = $DB->get_record('scaffold_assessment_state', [
            'scaffoldid' => $scaffoldid,
            'userid' => $user->id,
        ], '*', MUST_EXIST);

        try {
            $repository->mutate(
                $scaffoldid,
                (int) $user->id,
                $artifactid,
                static function(\stdClass $snapshot): never {
                    $snapshot->problems->{'question-1'} = self::problem();
                    throw new \RuntimeException('simulated mutation failure');
                },
            );
            $this->fail('Failed mutation did not escape');
        } catch (\RuntimeException $exception) {
            $this->assertSame('simulated mutation failure', $exception->getMessage());
        }
        $this->assertEquals($before, $DB->get_record(
            'scaffold_assessment_state',
            ['id' => $before->id],
            '*',
            MUST_EXIST,
        ));

        try {
            $repository->mutate(
                $scaffoldid,
                (int) $user->id,
                $artifactid,
                static fn(): array => [],
            );
            $this->fail('Non-object mutation result was accepted');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
        $this->assertEquals($before, $DB->get_record(
            'scaffold_assessment_state',
            ['id' => $before->id],
            '*',
            MUST_EXIST,
        ));

        $factory = \core\lock\lock_config::get_lock_factory(
            'mod_scaffold_assessment_state',
        );
        $lock = $factory->get_lock(
            'activity:' . $scaffoldid . ':learner:' . $user->id,
            0,
        );
        $this->assertNotFalse($lock, 'Failed mutation must release its learner lock');
        $lock->release();
    }

    public function test_revisions_advance_only_for_logical_changes(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$scaffoldid, $cmid] = $this->create_activity();
        $user = $this->getDataGenerator()->create_user();
        $artifactid = 'moodle-cm-' . $cmid;
        $repository = new assessment_state_repository();

        $created = $repository->get_or_create_state(
            $scaffoldid,
            (int) $user->id,
            $artifactid,
        );
        $noop = $repository->mutate_state(
            $scaffoldid,
            (int) $user->id,
            $artifactid,
            static fn(\stdClass $snapshot): \stdClass => $snapshot,
        );
        $this->assertFalse($noop->changed);
        $this->assertSame(0, $noop->stateRevision);
        $this->assertSame($created->changedAt, $noop->changedAt);

        $changed = $repository->mutate_state(
            $scaffoldid,
            (int) $user->id,
            $artifactid,
            static function(\stdClass $snapshot): \stdClass {
                $snapshot->problems->{'question-1'} = self::problem();
                return $snapshot;
            },
        );
        $this->assertTrue($changed->changed);
        $this->assertSame(1, $changed->stateRevision);
        $this->assertNotSame($created->changedAt, $changed->changedAt);

        $repeat = $repository->mutate_state(
            $scaffoldid,
            (int) $user->id,
            $artifactid,
            static fn(\stdClass $snapshot): \stdClass => $snapshot,
        );
        $this->assertFalse($repeat->changed);
        $this->assertSame(1, $repeat->stateRevision);
        $this->assertSame(1, (int) $DB->get_field(
            'scaffold_assessment_state',
            'staterevision',
            ['scaffoldid' => $scaffoldid, 'userid' => $user->id],
            MUST_EXIST,
        ));
    }

    public function test_quiz_deadline_projection_tracks_earliest_active_attempt(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$scaffoldid, $cmid] = $this->create_activity();
        $user = $this->getDataGenerator()->create_user();
        $artifactid = 'moodle-cm-' . $cmid;
        $repository = new assessment_state_repository();
        $repository->mutate_state(
            $scaffoldid,
            (int) $user->id,
            $artifactid,
            static function(\stdClass $snapshot): \stdClass {
                $snapshot->quizzes->{'quiz-later'} = self::attempt(
                    'attempt-later',
                    '2100-01-01T00:00:00.000000Z',
                );
                $snapshot->quizzes->{'quiz-earlier'} = self::attempt(
                    'attempt-earlier',
                    '2099-12-31T23:30:00.000000Z',
                );
                return $snapshot;
            },
        );
        $this->assertSame(strtotime('2099-12-31T23:30:00.000000Z'), (int) $DB->get_field(
            'scaffold_assessment_state',
            'nextquizexpiry',
            ['scaffoldid' => $scaffoldid, 'userid' => $user->id],
            MUST_EXIST,
        ));

        $repository->mutate_state(
            $scaffoldid,
            (int) $user->id,
            $artifactid,
            static function(\stdClass $snapshot): \stdClass {
                foreach (get_object_vars($snapshot->quizzes) as $quiz) {
                    $quiz->status = 'expired';
                    $quiz->currentTargetId = null;
                    $quiz->finishedAt = '2100-01-01T00:00:01.000000Z';
                    $quiz->score = 0.0;
                    $quiz->maxScore = 1.0;
                }
                return $snapshot;
            },
        );
        $row = $DB->get_record('scaffold_assessment_state', [
            'scaffoldid' => $scaffoldid,
            'userid' => $user->id,
        ], '*', MUST_EXIST);
        $this->assertNull($row->nextquizexpiry);
    }

    public function test_grade_publication_stages_atomically_with_state(): void {
        global $DB;

        $this->resetAfterTest(true);
        $this->preventResetByRollback();
        [$scaffoldid, $cmid] = $this->create_activity();
        $user = $this->getDataGenerator()->create_user();
        $artifactid = 'moodle-cm-' . $cmid;
        $repository = new assessment_state_repository();

        $state = $repository->mutate_with_grade_publication_state(
            $scaffoldid,
            (int) $user->id,
            $artifactid,
            static function(\stdClass $snapshot): \stdClass {
                $snapshot->problems->{'question-1'} = self::problem();
                return $snapshot;
            },
        );
        $this->assertSame(1, $state->stateRevision);
        $publication = $DB->get_record('scaffold_grade_publications', [
            'scaffoldid' => $scaffoldid,
            'userid' => $user->id,
        ], '*', MUST_EXIST);
        $this->assertSame('pending', $publication->status);
        $this->assertSame(1, (int) $publication->staterevision);

        $before = $DB->get_record('scaffold_assessment_state', [
            'scaffoldid' => $scaffoldid,
            'userid' => $user->id,
        ], '*', MUST_EXIST);
        $failing = new assessment_state_repository(
            null,
            null,
            null,
            static function(): never {
                throw new \RuntimeException('definition version unavailable');
            },
        );
        try {
            $failing->mutate_with_grade_publication_state(
                $scaffoldid,
                (int) $user->id,
                $artifactid,
                static function(\stdClass $snapshot): \stdClass {
                    $snapshot->problems->{'question-2'} = self::problem();
                    return $snapshot;
                },
            );
            $this->fail('Publication staging failure did not escape');
        } catch (\RuntimeException $exception) {
            $this->assertSame('definition version unavailable', $exception->getMessage());
        }
        $this->assertEquals($before, $DB->get_record(
            'scaffold_assessment_state',
            ['id' => $before->id],
            '*',
            MUST_EXIST,
        ));
    }

    /**
     * Creates activity.
     *
     * @return array
     */
    private function create_activity(): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');
        $course = $this->getDataGenerator()->create_course();
        $scaffoldid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Assessment state repository fixture',
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
        return [(int) $scaffoldid, (int) $cmid];
    }

    /**
     * Returns problem.
     *
     * @return \stdClass
     */
    private static function problem(): \stdClass {
        return (object) [
            'response' => null,
            'submitted' => false,
            'attemptNumber' => 0,
            'hintsShown' => 0,
            'checkResult' => null,
            'submissionResult' => null,
        ];
    }

    /**
     * Returns attempt.
     *
     * @param string $attemptid Quiz attempt ID.
     * @param string $expiresat Expiresat.
     * @return \stdClass
     */
    private static function attempt(string $attemptid, string $expiresat): \stdClass {
        return (object) [
            'attemptId' => $attemptid,
            'status' => 'in_progress',
            'currentTargetId' => 'question-1',
            'submittedTargetIds' => [],
            'startedAt' => '2099-12-31T23:00:00.000000Z',
            'finishedAt' => null,
            'expiresAt' => $expiresat,
            'score' => null,
            'maxScore' => null,
            'resultsByTargetId' => (object) [],
            'answerReviewAuthorized' => false,
        ];
    }
}

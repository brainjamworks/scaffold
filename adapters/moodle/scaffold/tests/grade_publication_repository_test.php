<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\grade_publication_repository;

defined('MOODLE_INTERNAL') || die();

/**
 * Verifies normalized learner grade-publication storage against Moodle DML.
 *
 * @covers \mod_scaffold\local\grade_publication_repository
 */
final class grade_publication_repository_test extends \advanced_testcase {
    public function test_clean_schema_has_normalized_learner_and_activity_state(): void {
        global $DB;

        $this->resetAfterTest();
        $dbman = $DB->get_manager();
        $publicationtable = new \xmldb_table('scaffold_grade_publications');

        foreach ([
            'id',
            'scaffoldid',
            'userid',
            'staterevision',
            'definitionversion',
            'status',
            'failurecode',
            'retrycount',
            'retryafter',
            'timecreated',
            'timemodified',
        ] as $fieldname) {
            $this->assertTrue($dbman->field_exists($publicationtable, new \xmldb_field($fieldname)));
        }
        $this->assertFalse($dbman->field_exists($publicationtable, new \xmldb_field('rawgrade')));
        $this->assertTrue($dbman->index_exists(
            $publicationtable,
            new \xmldb_index('scaffolduser', XMLDB_INDEX_UNIQUE, ['scaffoldid', 'userid']),
        ));
        $this->assertTrue($dbman->index_exists(
            $publicationtable,
            new \xmldb_index('statusretryafter', XMLDB_INDEX_NOTUNIQUE, ['status', 'retryafter']),
        ));
        $this->assertTrue($dbman->index_exists(
            $publicationtable,
            new \xmldb_index('definitionversion', XMLDB_INDEX_NOTUNIQUE, ['scaffoldid', 'definitionversion']),
        ));
        $this->assertTrue($dbman->index_exists(
            $publicationtable,
            new \xmldb_index('userid', XMLDB_INDEX_NOTUNIQUE, ['userid']),
        ));

        $activitytable = new \xmldb_table('scaffold');
        foreach ([
            'assessmentdefinitionversion',
            'gradeitemversion',
            'gradeitemstatus',
            'gradeitemfailurecode',
            'gradeitemretrycount',
            'gradeitemretryafter',
            'gradeitemtimemodified',
        ] as $fieldname) {
            $this->assertTrue($dbman->field_exists($activitytable, new \xmldb_field($fieldname)));
        }

        $activity = $this->create_activity();
        $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);
        $this->assertSame(1, (int) $stored->assessmentdefinitionversion);
        $this->assertSame(1, (int) $stored->gradeitemversion);
        $this->assertSame('published', $stored->gradeitemstatus);
        $this->assertSame(0, (int) $stored->gradeitemretrycount);
        $this->assertFalse($DB->record_exists('scaffold_grade_publications', [
            'scaffoldid' => $activity->id,
            'userid' => 0,
        ]));
    }

    public function test_repository_queries_transitions_and_deletes_by_owner(): void {
        global $DB;

        $this->resetAfterTest();
        $activity = $this->create_activity();
        $otheractivity = $this->create_activity();
        $user = $this->getDataGenerator()->create_user();
        $otheruser = $this->getDataGenerator()->create_user();
        $times = [100, 101, 102, 103, 104, 105];
        $repository = new grade_publication_repository(
            $DB,
            static function() use (&$times): int {
                return array_shift($times);
            },
        );

        $pending = $repository->upsert_pending((int) $activity->id, (int) $user->id, 4, 1);
        $this->assertSame('pending', $pending->status);
        $this->assertSame(4, $pending->staterevision);
        $this->assertSame(1, $pending->definitionversion);
        $this->assertSame(0, $pending->retrycount);
        $this->assertObjectNotHasProperty('rawgrade', $pending);

        $claimed = $repository->claim((int) $activity->id, (int) $user->id, 4, 1);
        $this->assertNotNull($claimed);
        $this->assertSame(1, $claimed->retrycount);
        $this->assertNull($claimed->failurecode);
        $this->assertNull($claimed->retryafter);
        $this->assertNull($repository->claim((int) $activity->id, (int) $user->id, 3, 1));
        $this->assertFalse($repository->record_status(
            (int) $activity->id,
            (int) $user->id,
            3,
            1,
            'published',
        ));
        $this->assertTrue($repository->record_status(
            (int) $activity->id,
            (int) $user->id,
            4,
            1,
            'failed',
            'grade_update_failed',
            500,
        ));

        $failed = $repository->get((int) $activity->id, (int) $user->id);
        $this->assertSame('failed', $failed->status);
        $this->assertSame('grade_update_failed', $failed->failurecode);
        $this->assertSame(500, $failed->retryafter);
        $repository->upsert_pending((int) $activity->id, (int) $user->id, 5, 1);
        $restaged = $repository->get((int) $activity->id, (int) $user->id);
        $this->assertSame(5, $restaged->staterevision);
        $this->assertSame('pending', $restaged->status);
        $this->assertSame(0, $restaged->retrycount);

        $repository->upsert_pending((int) $activity->id, (int) $otheruser->id, 2, 1);
        $repository->upsert_pending((int) $otheractivity->id, (int) $user->id, 1, 1);
        $this->assertCount(2, $repository->find_for_user((int) $user->id));
        $this->assertCount(2, $repository->find_for_activity((int) $activity->id));

        $repository->delete_for_user((int) $otheruser->id);
        $this->assertCount(1, $repository->find_for_activity((int) $activity->id));
        $repository->delete_for_activity((int) $otheractivity->id);
        $this->assertCount(1, $repository->find_for_user((int) $user->id));
    }

    public function test_claim_only_accepts_pending_or_due_retryable_failures(): void {
        global $DB;

        $this->resetAfterTest();
        $activity = $this->create_activity();
        $user = $this->getDataGenerator()->create_user();
        $repository = new grade_publication_repository($DB, static fn(): int => 100);

        $repository->upsert_pending((int) $activity->id, (int) $user->id, 1, 1);
        $this->assertNotNull($repository->claim((int) $activity->id, (int) $user->id, 1, 1));
        $repository->record_status(
            (int) $activity->id,
            (int) $user->id,
            1,
            1,
            'failed',
            'unknown_grade_update_status',
        );
        $this->assertNull($repository->claim((int) $activity->id, (int) $user->id, 1, 1));

        $repository->upsert_pending((int) $activity->id, (int) $user->id, 2, 1);
        $this->assertNotNull($repository->claim((int) $activity->id, (int) $user->id, 2, 1));
        $repository->record_status(
            (int) $activity->id,
            (int) $user->id,
            2,
            1,
            'failed',
            'grade_update_failed',
            101,
        );
        $this->assertNull($repository->claim((int) $activity->id, (int) $user->id, 2, 1));

        $repository->record_status(
            (int) $activity->id,
            (int) $user->id,
            2,
            1,
            'failed',
            'grade_update_failed',
            100,
        );
        $this->assertNotNull($repository->claim((int) $activity->id, (int) $user->id, 2, 1));
    }

    public function test_unique_identity_rejects_duplicate_learner_rows(): void {
        global $DB;

        $this->resetAfterTest();
        $activity = $this->create_activity();
        $user = $this->getDataGenerator()->create_user();
        $row = (object) [
            'scaffoldid' => $activity->id,
            'userid' => $user->id,
            'staterevision' => 1,
            'definitionversion' => 1,
            'status' => 'pending',
            'failurecode' => null,
            'retrycount' => 0,
            'retryafter' => null,
            'timecreated' => 1,
            'timemodified' => 1,
        ];
        $DB->insert_record('scaffold_grade_publications', $row);

        $this->expectException(\dml_write_exception::class);
        $DB->insert_record('scaffold_grade_publications', $row);
    }

    private function create_activity(): \stdClass {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/mod/scaffold/lib.php');
        $course = $this->getDataGenerator()->create_course();
        $id = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Grade publication fixture',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
        ]);

        return $DB->get_record('scaffold', ['id' => $id], '*', MUST_EXIST);
    }
}

<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

defined('MOODLE_INTERNAL') || die();

/**
 * Verifies complete activity-owned data deletion.
 *
 * @covers \mod_scaffold\local\activity_deletion_service
 */
final class activity_deletion_test extends \advanced_testcase {
    public function test_delete_instance_removes_all_owned_state_files_and_grade_item(): void {
        global $DB;

        $this->resetAfterTest();
        $activity = $this->create_activity('Deleted activity');
        $otheractivity = $this->create_activity('Preserved activity');
        $user = $this->getDataGenerator()->create_user();
        $this->insert_personal_rows($activity->id, $user->id);
        $this->insert_personal_rows($otheractivity->id, $user->id);
        $mediafile = $this->create_file($activity, 'media', $activity->id, 'media.txt');
        $introfile = $this->create_file($activity, 'intro', 0, 'intro.txt');
        $otherfile = $this->create_file($otheractivity, 'media', $otheractivity->id, 'other.txt');

        $this->assertTrue(scaffold_delete_instance($activity->id));

        $this->assertFalse($DB->record_exists('scaffold', ['id' => $activity->id]));
        foreach ([
            'scaffold_grade_publications',
            'scaffold_assessment_state',
            'scaffold_learner_activity',
        ] as $table) {
            $this->assertFalse($DB->record_exists($table, ['scaffoldid' => $activity->id]));
            $this->assertTrue($DB->record_exists($table, ['scaffoldid' => $otheractivity->id]));
        }
        $this->assertFalse($DB->record_exists('grade_items', [
            'itemmodule' => 'scaffold',
            'iteminstance' => $activity->id,
        ]));
        $this->assertTrue($DB->record_exists('grade_items', [
            'itemmodule' => 'scaffold',
            'iteminstance' => $otheractivity->id,
        ]));
        $this->assertFalse(get_file_storage()->get_file_by_id($mediafile->get_id()));
        $this->assertFalse(get_file_storage()->get_file_by_id($introfile->get_id()));
        $this->assertNotFalse(get_file_storage()->get_file_by_id($otherfile->get_id()));
    }

    private function create_activity(string $name): \stdClass {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $course = $this->getDataGenerator()->create_course();
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => $name,
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
        $context = \context_module::instance($cmid);
        $scaffold = $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST);
        scaffold_grade_item_apply($scaffold);

        return (object) [
            'id' => $activityid,
            'cmid' => $cmid,
            'contextid' => $context->id,
        ];
    }

    private function insert_personal_rows(int $scaffoldid, int $userid): void {
        global $DB;

        $DB->insert_record('scaffold_assessment_state', (object) [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
            'snapshotjson' => '{}',
            'staterevision' => 1,
            'nextquizexpiry' => null,
            'timecreated' => 1,
            'timemodified' => 2,
        ]);
        $DB->insert_record('scaffold_learner_activity', (object) [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
            'snapshotjson' => '{}',
            'timecreated' => 1,
            'timemodified' => 2,
        ]);
        $DB->insert_record('scaffold_grade_publications', (object) [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
            'staterevision' => 1,
            'definitionversion' => 1,
            'status' => 'pending',
            'failurecode' => null,
            'retrycount' => 0,
            'retryafter' => null,
            'timecreated' => 1,
            'timemodified' => 2,
        ]);
    }

    private function create_file(
        \stdClass $activity,
        string $filearea,
        int $itemid,
        string $filename,
    ): \stored_file {
        return get_file_storage()->create_file_from_string([
            'contextid' => $activity->contextid,
            'component' => 'mod_scaffold',
            'filearea' => $filearea,
            'itemid' => $itemid,
            'filepath' => '/',
            'filename' => $filename,
            'userid' => 0,
        ], 'activity-owned file');
    }
}

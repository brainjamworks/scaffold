<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\activity_access;
use mod_scaffold\local\activity_scope;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests the authorized activity boundary against Moodle contexts and capabilities.
 *
 * @covers \mod_scaffold\local\activity_access
 * @covers \mod_scaffold\local\activity_scope
 */
final class activity_access_test extends \advanced_testcase {
    public function test_require_returns_view_authorized_activity_scope(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course();
        $activity = $this->create_scaffold_activity($course);
        $student = $this->getDataGenerator()->create_user();
        $this->enrol_as($student, $course, 'student');
        $this->setUser($student);

        $scope = activity_access::require($activity->cmid, 'mod/scaffold:view');

        $this->assertInstanceOf(activity_scope::class, $scope);
        $this->assertSame((int) $course->id, (int) $scope->course->id);
        $this->assertSame((int) $activity->cmid, (int) $scope->cm->id);
        $this->assertSame((int) $activity->id, (int) $scope->instance->id);
        $this->assertSame((int) $student->id, $scope->actorid);
        $this->assertSame('mod/scaffold:view', $scope->capability);
        $this->assertInstanceOf(\context_module::class, $scope->context);
        $this->assertSame((int) $activity->cmid, (int) $scope->context->instanceid);
    }

    public function test_require_accepts_edit_capability_for_author(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course();
        $activity = $this->create_scaffold_activity($course);
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);

        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');

        $this->assertSame((int) $author->id, $scope->actorid);
        $this->assertSame('mod/scaffold:editcontent', $scope->capability);
    }

    public function test_require_rejects_wrong_module_type(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course();
        $page = $this->getDataGenerator()->create_module('page', ['course' => $course->id]);

        $this->expectException(\moodle_exception::class);
        activity_access::require($page->cmid, 'mod/scaffold:view');
    }

    public function test_require_validates_module_context_restriction(): void {
        $this->resetAfterTest();
        $this->setAdminUser();

        $allowedcourse = $this->getDataGenerator()->create_course();
        $othercourse = $this->getDataGenerator()->create_course();
        $activity = $this->create_scaffold_activity($othercourse);
        \core_external\external_api::set_context_restriction(\context_course::instance($allowedcourse->id));

        try {
            $this->expectException(\core_external\restricted_context_exception::class);
            activity_access::require($activity->cmid, 'mod/scaffold:view');
        } finally {
            \core_external\external_api::set_context_restriction(\context_system::instance());
        }
    }

    public function test_require_rejects_missing_capability(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course();
        $activity = $this->create_scaffold_activity($course);
        $student = $this->getDataGenerator()->create_user();
        $this->enrol_as($student, $course, 'student');
        $this->setUser($student);

        $this->expectException(\required_capability_exception::class);
        activity_access::require($activity->cmid, 'mod/scaffold:editcontent');
    }

    private function create_scaffold_activity(\stdClass $course): \stdClass {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Scaffold test activity',
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

        $activity = $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST);
        $activity->cmid = $cmid;
        return $activity;
    }

    private function enrol_as(\stdClass $user, \stdClass $course, string $roleshortname): void {
        global $DB;

        $roleid = $DB->get_field('role', 'id', ['shortname' => $roleshortname], MUST_EXIST);
        $this->getDataGenerator()->enrol_user($user->id, $course->id, $roleid);
    }
}

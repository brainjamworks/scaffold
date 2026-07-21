<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\grade_publication_repository;
use mod_scaffold\local\grade_status_report;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests authorized privacy-safe grade publication reporting.
 *
 * @covers \mod_scaffold\local\grade_status_report
 */
final class grade_status_report_test extends \advanced_testcase {
    public function test_capability_defaults_are_limited_to_editing_teachers_and_managers(): void {
        [$course, $activityid, $cm] = $this->create_activity();
        $context = \context_module::instance($cm->id);

        foreach ([
            'editingteacher' => true,
            'manager' => true,
            'teacher' => false,
            'student' => false,
        ] as $role => $expected) {
            $user = $this->getDataGenerator()->create_user();
            $roles = get_archetype_roles($role);
            $roleid = reset($roles)->id;
            if ($role === 'manager') {
                role_assign($roleid, $user->id, $context->id);
            } else {
                $this->getDataGenerator()->enrol_user($user->id, $course->id, $roleid);
            }
            $this->assertSame($expected, has_capability('mod/scaffold:viewgradestatus', $context, $user));
        }
    }

    public function test_report_exposes_effective_status_without_assessment_payloads(): void {
        global $DB;

        [$course, $activityid] = $this->create_activity();
        $users = [
            $this->getDataGenerator()->create_user(),
            $this->getDataGenerator()->create_user(),
        ];
        foreach ($users as $index => $user) {
            $DB->insert_record('scaffold_assessment_state', (object) [
                'scaffoldid' => $activityid,
                'userid' => $user->id,
                'snapshotjson' => json_encode(['secretAnswer' => 'never report'], JSON_THROW_ON_ERROR),
                'staterevision' => $index + 2,
                'nextquizexpiry' => null,
                'timecreated' => 10,
                'timemodified' => 20 + $index,
            ]);
        }
        $repository = new grade_publication_repository(null, static fn(): int => 100);
        $repository->upsert_pending($activityid, (int) $users[0]->id, 1, 1);
        $repository->record_status($activityid, (int) $users[0]->id, 1, 1, 'published');
        $repository->upsert_pending($activityid, (int) $users[1]->id, 3, 2);
        $repository->record_status(
            $activityid,
            (int) $users[1]->id,
            3,
            2,
            'configuration_error',
            'multiple_grade_items',
        );

        $report = new grade_status_report($repository);
        $pageone = $report->page($activityid, 0, 1);
        $pagetwo = $report->page($activityid, 1, 1);
        $this->assertSame(2, $pageone->total);
        $this->assertCount(1, $pageone->rows);
        $this->assertCount(1, $pagetwo->rows);
        $this->assertSame('stale', $pageone->rows[0]->status);
        $this->assertSame('configuration_error', $pagetwo->rows[0]->status);
        $this->assertSame('correct_and_requeue', $pagetwo->rows[0]->nextAction);
        $encoded = json_encode([$pageone, $pagetwo], JSON_THROW_ON_ERROR);
        foreach (['snapshot', 'response', 'result', 'answer', 'never report'] as $forbidden) {
            $this->assertStringNotContainsStringIgnoringCase($forbidden, $encoded);
        }

        $item = $report->item($activityid);
        $this->assertSame(2, $item->definitionVersion);
        $this->assertSame('published', $item->status);
        $this->assertFalse($report->requeue_user($activityid, (int) $users[0]->id));
        $this->assertTrue($report->requeue_user($activityid, (int) $users[1]->id));
        $this->assertSame('pending', $repository->get($activityid, (int) $users[1]->id)->status);
    }

    public function test_terminal_failures_require_correction_while_scheduled_failures_retry(): void {
        global $DB;

        [$course, $activityid] = $this->create_activity();
        $repository = new grade_publication_repository($DB, static fn(): int => 100);
        $DB->update_record('scaffold', (object) [
            'id' => $activityid,
            'gradeitemstatus' => 'failed',
            'gradeitemfailurecode' => 'unknown_grade_item_update_status',
            'gradeitemretrycount' => 1,
            'gradeitemretryafter' => null,
        ]);
        $report = new grade_status_report($repository, $DB);
        $this->assertSame('correct_and_requeue', $report->item($activityid)->nextAction);
        $DB->set_field('scaffold', 'gradeitemretryafter', 150, ['id' => $activityid]);
        $this->assertSame('automatic_retry', $report->item($activityid)->nextAction);

        $users = array_map(fn(): \stdClass => $this->getDataGenerator()->create_user(), range(1, 2));
        foreach ($users as $index => $user) {
            $revision = $index + 1;
            $DB->insert_record('scaffold_assessment_state', (object) [
                'scaffoldid' => $activityid,
                'userid' => $user->id,
                'snapshotjson' => '{}',
                'staterevision' => $revision,
                'nextquizexpiry' => null,
                'timecreated' => 10 + $index,
                'timemodified' => 10 + $index,
            ]);
            $repository->upsert_pending($activityid, (int) $user->id, $revision, 2);
            $repository->claim($activityid, (int) $user->id, $revision, 2);
            $repository->record_status(
                $activityid,
                (int) $user->id,
                $revision,
                2,
                'failed',
                $index === 0 ? 'unknown_grade_update_status' : 'grade_update_failed',
                $index === 0 ? null : 150,
            );
        }

        $page = $report->page($activityid, 0, 10);
        $this->assertSame('correct_and_requeue', $page->rows[0]->nextAction);
        $this->assertSame('automatic_retry', $page->rows[1]->nextAction);
    }

    private function create_activity(): array {
        global $CFG, $DB;

        $this->resetAfterTest();
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');
        $course = $this->getDataGenerator()->create_course();
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Status report fixture',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
        ]);
        $DB->update_record('scaffold', (object) [
            'id' => $activityid,
            'assessmentdefinitionversion' => 2,
            'gradeitemversion' => 2,
            'gradeitemstatus' => 'published',
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
        return [$course, $activityid, get_fast_modinfo($course)->get_cm($cmid)];
    }
}

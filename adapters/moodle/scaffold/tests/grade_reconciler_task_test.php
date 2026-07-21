<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\grade_publication_repository;
use mod_scaffold\local\grade_reconciler;

defined('MOODLE_INTERNAL') || die();

final class grade_reconciler_task_under_test extends \mod_scaffold\task\reconcile_assessment_grades {
    public function __construct(private readonly grade_reconciler $reconciler, private readonly int $limit) {
    }

    protected function create_reconciler(): grade_reconciler {
        return $this->reconciler;
    }

    protected function batch_limit(): int {
        return $this->limit;
    }
}

/**
 * Tests indexed grade recovery and scheduled aggregate reporting.
 *
 * @covers \mod_scaffold\local\grade_reconciler
 * @covers \mod_scaffold\task\reconcile_assessment_grades
 */
final class grade_reconciler_task_test extends \advanced_testcase {
    public function test_discovers_bounded_missing_stale_and_retryable_work_in_order(): void {
        global $CFG, $DB;

        $this->resetAfterTest();
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');
        $course = $this->getDataGenerator()->create_course();
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Reconciler fixture',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
        ]);
        $DB->update_record('scaffold', (object) [
            'id' => $activityid,
            'assessmentdefinitionversion' => 2,
            'gradeitemversion' => 1,
            'gradeitemstatus' => 'pending',
        ]);
        $users = array_map(fn(): \stdClass => $this->getDataGenerator()->create_user(), range(1, 5));
        foreach ($users as $index => $user) {
            $DB->insert_record('scaffold_assessment_state', (object) [
                'scaffoldid' => $activityid,
                'userid' => $user->id,
                'snapshotjson' => '{}',
                'staterevision' => $index + 1,
                'nextquizexpiry' => null,
                'timecreated' => 10 + $index,
                'timemodified' => 10 + $index,
            ]);
        }
        $repository = new grade_publication_repository(null, static fn(): int => 100);
        $repository->upsert_pending($activityid, (int) $users[1]->id, 2, 1);
        $repository->record_status($activityid, (int) $users[1]->id, 2, 1, 'published');
        $repository->upsert_pending($activityid, (int) $users[2]->id, 3, 2);
        $repository->record_status($activityid, (int) $users[2]->id, 3, 2, 'locked', 'instructor_override');
        $repository->upsert_pending($activityid, (int) $users[3]->id, 4, 2);
        $repository->record_status($activityid, (int) $users[3]->id, 4, 2, 'failed', 'grade_update_failed', 90);
        $repository->upsert_pending($activityid, (int) $users[4]->id, 5, 2);
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $repository->claim($activityid, (int) $users[4]->id, 5, 2);
            $repository->record_status(
                $activityid,
                (int) $users[4]->id,
                5,
                2,
                'failed',
                'grade_update_failed',
                90,
            );
        }

        $this->assertSame([$activityid], $repository->find_due_item_ids(10, 100, 5));
        $due = $repository->find_due_sources(2, 100, 5);
        $this->assertSame([(int) $users[0]->id, (int) $users[1]->id], array_map(
            static fn(\stdClass $source): int => (int) $source->userid,
            $due,
        ));

        $events = [];
        $itempublisher = new class($events) {
            public function __construct(private array &$events) {
            }
            public function publish(\stdClass $activity): \stdClass {
                $this->events[] = 'item';
                return (object) ['status' => 'published'];
            }
        };
        $learnerpublisher = new class($events) {
            public function __construct(private array &$events) {
            }
            public function publish_user(\stdClass $activity, int $userid): \stdClass {
                $this->events[] = 'learner';
                return (object) ['status' => 'published'];
            }
        };
        $reconciler = new grade_reconciler(
            $repository,
            $itempublisher,
            $learnerpublisher,
            null,
            static fn(): int => 100,
        );
        $output = $this->execute_task(new grade_reconciler_task_under_test($reconciler, 2));
        $this->assertSame(['item', 'item', 'learner', 'learner'], $events);
        $this->assertStringContainsString(
            'items=1 itemfailures=0 learners=2 published=2 pending=0 failed=0 skipped=0',
            $output,
        );
        foreach ($users as $user) {
            $this->assertStringNotContainsString((string) $user->id, $output);
        }
    }

    public function test_explicit_requeue_resets_only_operator_action_state(): void {
        global $CFG, $DB;

        $this->resetAfterTest();
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');
        $course = $this->getDataGenerator()->create_course();
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Requeue fixture',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
        ]);
        $user = $this->getDataGenerator()->create_user();
        $repository = new grade_publication_repository(null, static fn(): int => 100);
        $repository->upsert_pending($activityid, (int) $user->id, 1, 1);
        $repository->record_status($activityid, (int) $user->id, 1, 1, 'locked', 'grade_item_locked');

        $this->assertTrue($repository->requeue_user($activityid, (int) $user->id));
        $row = $repository->get($activityid, (int) $user->id);
        $this->assertSame('pending', $row->status);
        $this->assertNull($row->failurecode);
        $this->assertSame(0, $row->retrycount);
    }

    public function test_terminal_item_failures_are_not_automatic_but_stale_learner_work_is_due(): void {
        global $CFG, $DB;

        $this->resetAfterTest();
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');
        $course = $this->getDataGenerator()->create_course();
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Terminal retry fixture',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
        ]);
        $DB->update_record('scaffold', (object) [
            'id' => $activityid,
            'assessmentdefinitionversion' => 2,
            'gradeitemversion' => 2,
            'gradeitemstatus' => 'failed',
            'gradeitemfailurecode' => 'unknown_grade_item_update_status',
            'gradeitemretrycount' => 1,
            'gradeitemretryafter' => null,
        ]);
        $repository = new grade_publication_repository($DB, static fn(): int => 100);

        $this->assertSame([], $repository->find_due_item_ids(10, 100, 5));
        $DB->set_field('scaffold', 'gradeitemretryafter', 110, ['id' => $activityid]);
        $this->assertSame([], $repository->find_due_item_ids(10, 100, 5));
        $DB->set_field('scaffold', 'gradeitemretryafter', 90, ['id' => $activityid]);
        $this->assertSame([$activityid], $repository->find_due_item_ids(10, 100, 5));
        $DB->update_record('scaffold', (object) [
            'id' => $activityid,
            'gradeitemversion' => 1,
            'gradeitemretryafter' => null,
        ]);
        $this->assertSame([], $repository->find_due_item_ids(10, 100, 5));

        $users = array_map(fn(): \stdClass => $this->getDataGenerator()->create_user(), range(1, 4));
        foreach ($users as $index => $user) {
            $DB->insert_record('scaffold_assessment_state', (object) [
                'scaffoldid' => $activityid,
                'userid' => $user->id,
                'snapshotjson' => '{}',
                'staterevision' => $index + 1,
                'nextquizexpiry' => null,
                'timecreated' => 20 + $index,
                'timemodified' => 20 + $index,
            ]);
        }
        foreach ([null, 90, 110] as $index => $retryafter) {
            $revision = $index + 1;
            $userid = (int) $users[$index]->id;
            $repository->upsert_pending($activityid, $userid, $revision, 2);
            $repository->claim($activityid, $userid, $revision, 2);
            $repository->record_status(
                $activityid,
                $userid,
                $revision,
                2,
                'failed',
                $retryafter === null ? 'unknown_grade_update_status' : 'grade_update_failed',
                $retryafter,
            );
        }
        $staleuserid = (int) $users[3]->id;
        $repository->upsert_pending($activityid, $staleuserid, 3, 2);
        $repository->claim($activityid, $staleuserid, 3, 2);
        $repository->record_status(
            $activityid,
            $staleuserid,
            3,
            2,
            'failed',
            'unknown_grade_update_status',
        );

        $due = $repository->find_due_sources(10, 100, 5);
        $this->assertSame([(int) $users[1]->id, $staleuserid], array_map(
            static fn(\stdClass $source): int => (int) $source->userid,
            $due,
        ));
    }

    private function execute_task(grade_reconciler_task_under_test $task): string {
        ob_start();
        $task->execute();
        return (string) ob_get_clean();
    }
}

<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\activity_access;
use mod_scaffold\local\learner_activity_repository;
use mod_scaffold\local\learner_activity_service;

defined('MOODLE_INTERNAL') || die();

final class learner_activity_service_test_lock {
    public bool $released = false;

    public function release(): void {
        $this->released = true;
    }
}

final class learner_activity_service_test_lock_factory {
    public array $requests = [];
    public array $locks = [];

    public function get_lock(string $resource, int $timeout): learner_activity_service_test_lock {
        $this->requests[] = [$resource, $timeout];
        $lock = new learner_activity_service_test_lock();
        $this->locks[] = $lock;
        return $lock;
    }
}

/**
 * Tests the learner-activity service against Moodle authorization and DML.
 *
 * @covers \mod_scaffold\local\learner_activity_service
 * @covers \mod_scaffold\local\learner_activity_repository
 */
final class learner_activity_service_test extends \advanced_testcase {
    public function test_load_and_save_require_view_scope(): void {
        $this->resetAfterTest();

        [$course, $activity] = $this->create_activity();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $editscope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');
        $service = new learner_activity_service();

        $this->assert_invalid_parameter(static fn() => $service->load($editscope));
        $this->assert_invalid_parameter(static fn() => $service->save(
            $editscope,
            'moodle-cm-' . $activity->cmid,
            'checklist-1',
            self::record_json('checklist'),
        ));
    }

    public function test_save_rejects_wrong_artifact_block_and_kind(): void {
        $this->resetAfterTest();

        [$course, $activity] = $this->create_activity();
        $scope = $this->learner_scope($course, $activity->cmid);
        $service = new learner_activity_service();

        $this->assert_invalid_parameter(static fn() => $service->save(
            $scope,
            'moodle-cm-999',
            'checklist-1',
            self::record_json('checklist'),
        ));
        $this->assert_invalid_parameter(static fn() => $service->save(
            $scope,
            'moodle-cm-' . $activity->cmid,
            'missing-block',
            self::record_json('checklist'),
        ));
        $this->assert_invalid_parameter(static fn() => $service->save(
            $scope,
            'moodle-cm-' . $activity->cmid,
            'checklist-1',
            self::record_json('flashcard'),
        ));
    }

    public function test_save_assigns_server_time_and_uses_learner_lock(): void {
        $this->resetAfterTest();

        [$course, $activity] = $this->create_activity();
        $scope = $this->learner_scope($course, $activity->cmid);
        $locks = new learner_activity_service_test_lock_factory();
        $repository = new learner_activity_repository(null, $locks);
        $service = new learner_activity_service($repository);

        $record = $service->save(
            $scope,
            'moodle-cm-' . $activity->cmid,
            'checklist-1',
            self::record_json('checklist'),
        );

        $this->assertMatchesRegularExpression(
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000000Z$/',
            $record['updatedAt'],
        );
        $this->assertSame(
            [['activity:' . $activity->id . ':learner:' . $scope->actorid, 10]],
            $locks->requests,
        );
        $this->assertTrue($locks->locks[0]->released);
    }

    public function test_load_omits_orphan_records_without_deleting_persisted_state(): void {
        global $DB;

        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity();
        $scope = $this->learner_scope($course, $activity->cmid);
        $service = new learner_activity_service();
        $artifactid = 'moodle-cm-' . $activity->cmid;
        $service->save($scope, $artifactid, 'checklist-1', self::record_json('checklist'));
        $service->save($scope, $artifactid, 'flashcard-1', self::record_json('flashcard'));

        $DB->set_field(
            'scaffold',
            'learnercontentjson',
            json_encode(self::learner_content(false), JSON_THROW_ON_ERROR),
            ['id' => $activity->id],
        );
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:view');
        $active = $service->load($scope);
        $persisted = (new learner_activity_repository())->load_or_empty(
            $activity->id,
            $scope->actorid,
            $artifactid,
        );

        $this->assertSame(['checklist-1'], array_keys(get_object_vars($active['activities'])));
        $this->assertSame(
            ['checklist-1', 'flashcard-1'],
            array_keys(get_object_vars($persisted['activities'])),
        );
    }

    public function test_save_does_not_touch_assessment_grading_or_completion(): void {
        global $DB;

        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity();
        $scope = $this->learner_scope($course, $activity->cmid);
        $assessmentbefore = $DB->count_records('scaffold_assessment_state', ['scaffoldid' => $activity->id]);
        $gradesbefore = $DB->get_records('grade_items', [
            'itemmodule' => 'scaffold',
            'iteminstance' => $activity->id,
        ]);
        $completionbefore = $DB->count_records('course_modules_completion', [
            'coursemoduleid' => $activity->cmid,
            'userid' => $scope->actorid,
        ]);

        (new learner_activity_service())->save(
            $scope,
            'moodle-cm-' . $activity->cmid,
            'checklist-1',
            self::record_json('checklist'),
        );

        $this->assertSame(
            $assessmentbefore,
            $DB->count_records('scaffold_assessment_state', ['scaffoldid' => $activity->id]),
        );
        $this->assertEquals(
            $gradesbefore,
            $DB->get_records('grade_items', [
                'itemmodule' => 'scaffold',
                'iteminstance' => $activity->id,
            ]),
        );
        $this->assertSame(
            $completionbefore,
            $DB->count_records('course_modules_completion', [
                'coursemoduleid' => $activity->cmid,
                'userid' => $scope->actorid,
            ]),
        );
    }

    private function create_activity(): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $course = $this->getDataGenerator()->create_course();
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Learner activity service test',
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
        $DB->set_field(
            'scaffold',
            'learnercontentjson',
            json_encode(self::learner_content(true), JSON_THROW_ON_ERROR),
            ['id' => $activityid],
        );

        $activity = $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST);
        $activity->cmid = $cmid;
        return [$course, $activity];
    }

    private function learner_scope(\stdClass $course, int $cmid): \mod_scaffold\local\activity_scope {
        $learner = $this->getDataGenerator()->create_user();
        $this->enrol_as($learner, $course, 'student');
        $this->setUser($learner);
        return activity_access::require($cmid, 'mod/scaffold:view');
    }

    private function enrol_as(\stdClass $user, \stdClass $course, string $roleshortname): void {
        global $DB;

        $roleid = $DB->get_field('role', 'id', ['shortname' => $roleshortname], MUST_EXIST);
        $this->getDataGenerator()->enrol_user($user->id, $course->id, $roleid);
    }

    private function assert_invalid_parameter(callable $operation): void {
        try {
            $operation();
            $this->fail('Expected invalid_parameter_exception');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
    }

    private static function record_json(string $kind): string {
        return json_encode([
            'activityKind' => $kind,
            'data' => ['position' => 1],
            'completed' => false,
        ], JSON_THROW_ON_ERROR);
    }

    private static function learner_content(bool $withflashcard): array {
        $content = [[
            'type' => 'checklist',
            'attrs' => ['id' => 'checklist-1'],
        ]];
        if ($withflashcard) {
            $content[] = [
                'type' => 'flashcard',
                'attrs' => ['id' => 'flashcard-1'],
            ];
        }

        return [
            'type' => 'doc',
            'content' => [[
                'type' => 'courseDocument',
                'attrs' => ['mode' => 'page'],
                'content' => [[
                    'type' => 'surface',
                    'content' => $content,
                ]],
            ]],
        ];
    }
}

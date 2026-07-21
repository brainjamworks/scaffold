<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\activity_access;
use mod_scaffold\local\content_service;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests content projection and persistence against Moodle DML.
 *
 * @covers \mod_scaffold\local\content_service
 */
final class content_service_test extends \advanced_testcase {
    public function test_payload_returns_authoring_projection_for_edit_scope(): void {
        $this->resetAfterTest();

        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');

        $payload = (new content_service())->payload($scope, 'authoring');
        $artifact = json_decode($payload['artifactJson'], false, 512, JSON_THROW_ON_ERROR);

        $this->assertSame('author-only', $artifact->content->content[0]->attrs->audience);
        $this->assertSame('null', $payload['assessmentSnapshotJson']);
        $this->assertArrayNotHasKey('learnerActivitySnapshotJson', $payload);
    }

    public function test_payload_returns_learner_projection_for_view_scope(): void {
        $this->resetAfterTest();

        [$course, $activity] = $this->create_activity_with_content();
        $learner = $this->getDataGenerator()->create_user();
        $this->enrol_as($learner, $course, 'student');
        $this->setUser($learner);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:view');

        $payload = (new content_service())->payload($scope, 'learner');
        $artifact = json_decode($payload['artifactJson'], false, 512, JSON_THROW_ON_ERROR);

        $this->assertSame('learner-safe', $artifact->content->content[0]->attrs->audience);
        $this->assertStringNotContainsString('author-only', $payload['artifactJson']);
        $this->assertNotSame('null', $payload['assessmentSnapshotJson']);
        $this->assertArrayHasKey('learnerActivitySnapshotJson', $payload);
    }

    public function test_payload_rejects_purpose_not_proved_by_scope(): void {
        $this->resetAfterTest();

        [$course, $activity] = $this->create_activity_with_content();
        $learner = $this->getDataGenerator()->create_user();
        $this->enrol_as($learner, $course, 'student');
        $this->setUser($learner);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:view');

        $this->expectException(\invalid_parameter_exception::class);
        (new content_service())->payload($scope, 'authoring');
    }

    public function test_payload_preserves_empty_json_objects(): void {
        $this->resetAfterTest();

        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');

        $payload = (new content_service())->payload($scope, 'authoring');
        $artifact = json_decode($payload['artifactJson'], false, 512, JSON_THROW_ON_ERROR);

        $this->assertInstanceOf(\stdClass::class, $artifact->content->content[0]->attrs->settings);
        $this->assertSame([], get_object_vars($artifact->content->content[0]->attrs->settings));
    }

    public function test_save_rolls_back_coherent_bundle_when_content_dml_fails(): void {
        global $DB;

        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');
        [$artifactjson, $learnercontentjson] = $this->save_bundle($activity->cmid, str_repeat('x', 300));

        try {
            (new content_service())->save(
                $scope,
                $artifactjson,
                $learnercontentjson,
                '[]',
                '[]',
            );
            $this->fail('Expected the oversized database value to fail');
        } catch (\dml_exception) {
            $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);
            $this->assertSame('Scaffold test activity', $stored->name);
            $this->assertStringContainsString('author-only', $stored->artifactjson);
            $this->assertSame('[]', $stored->assessmenttargetsjson);
            $this->assertSame('[]', $stored->assessmentgroupsjson);
        }
    }

    public function test_save_commits_content_before_grade_item_failure(): void {
        global $DB;

        $this->preventResetByRollback();
        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');
        [$artifactjson, $learnercontentjson] = $this->save_bundle($activity->cmid, 'Committed title');
        $callbackran = false;
        $callbacktransactionactive = null;
        $diagnostic = null;
        $service = new content_service(
            static function(\stdClass $saved) use (
                $DB,
                &$callbackran,
                &$callbacktransactionactive,
            ): void {
                $callbackran = true;
                $callbacktransactionactive = $DB->is_transaction_started();
                throw new \RuntimeException('Simulated grade-item failure');
            },
            static function(\Throwable $exception, \stdClass $saved) use (&$diagnostic): void {
                $diagnostic = [
                    'message' => $exception->getMessage(),
                    'activityid' => $saved->id,
                ];
            },
        );

        $result = $service->save($scope, $artifactjson, $learnercontentjson, '[]', '[]');

        $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);
        $this->assertTrue($callbackran);
        $this->assertFalse($callbacktransactionactive);
        $this->assertSame('Committed title', $result['content']->name);
        $this->assertSame('failed', $result['gradeItemPublication']);
        $this->assertSame([
            'message' => 'Simulated grade-item failure',
            'activityid' => $activity->id,
        ], $diagnostic);
        $this->assertSame('Committed title', $stored->name);
    }

    private function create_activity_with_content(): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $course = $this->getDataGenerator()->create_course();
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

        $artifact = [
            'id' => 'moodle-cm-' . $cmid,
            'title' => 'Scaffold test activity',
            'mode' => 'page',
            'content' => [
                'type' => 'doc',
                'content' => [[
                    'type' => 'courseDocument',
                    'attrs' => [
                        'mode' => 'page',
                        'audience' => 'author-only',
                        'settings' => (object) [],
                    ],
                    'content' => [],
                ]],
            ],
        ];
        $learnercontent = [
            'type' => 'doc',
            'content' => [[
                'type' => 'courseDocument',
                'attrs' => ['mode' => 'page', 'audience' => 'learner-safe'],
                'content' => [],
            ]],
        ];
        $DB->set_field('scaffold', 'artifactjson', json_encode($artifact, JSON_THROW_ON_ERROR), ['id' => $activityid]);
        $DB->set_field(
            'scaffold',
            'learnercontentjson',
            json_encode($learnercontent, JSON_THROW_ON_ERROR),
            ['id' => $activityid],
        );

        $activity = $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST);
        $activity->cmid = $cmid;
        return [$course, $activity];
    }

    private function save_bundle(int $cmid, string $title): array {
        $artifact = [
            'id' => 'moodle-cm-' . $cmid,
            'title' => $title,
            'mode' => 'page',
            'content' => [
                'type' => 'doc',
                'content' => [[
                    'type' => 'courseDocument',
                    'attrs' => ['mode' => 'page'],
                    'content' => [],
                ]],
            ],
        ];
        $learnercontent = ['type' => 'doc', 'content' => []];
        return [
            json_encode($artifact, JSON_THROW_ON_ERROR),
            json_encode($learnercontent, JSON_THROW_ON_ERROR),
        ];
    }

    private function enrol_as(\stdClass $user, \stdClass $course, string $roleshortname): void {
        global $DB;

        $roleid = $DB->get_field('role', 'id', ['shortname' => $roleshortname], MUST_EXIST);
        $this->getDataGenerator()->enrol_user($user->id, $course->id, $roleid);
    }
}

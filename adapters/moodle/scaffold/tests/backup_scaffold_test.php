<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/backup/util/includes/backup_includes.php');
require_once($CFG->dirroot . '/backup/moodle2/backup_stepslib.php');
require_once($CFG->dirroot . '/mod/scaffold/backup/moodle2/backup_scaffold_stepslib.php');

/**
 * @covers \backup_scaffold_activity_structure_step
 */
final class backup_scaffold_test extends advanced_testcase {
    public function test_plugin_advertises_moodle_backup_support(): void {
        global $CFG;

        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $this->assertTrue(scaffold_supports(FEATURE_BACKUP_MOODLE2));
    }

    public function test_definition_backup_excludes_learner_and_derived_state_without_userinfo(): void {
        global $DB;

        $this->resetAfterTest();
        [$activity, $cmid] = $this->create_activity();
        $user = $this->getDataGenerator()->create_user();
        $this->insert_learner_state((int) $activity->id, (int) $user->id, $cmid);
        $DB->insert_record('scaffold_grade_publications', (object) [
            'scaffoldid' => $activity->id,
            'userid' => $user->id,
            'staterevision' => 7,
            'definitionversion' => 4,
            'status' => 'failed',
            'failurecode' => 'source-only-test',
            'retrycount' => 3,
            'retryafter' => time() + 60,
            'timecreated' => time(),
            'timemodified' => time(),
        ]);

        $sources = self::sources(
            (int) $activity->id,
            $cmid,
            false,
        );

        $this->assertSame((int) $activity->id, (int) $sources['activity']->id);
        $this->assertSame('moodle-cm-' . $cmid, json_decode($sources['activity']->artifactjson)->id);
        $this->assertSame([], $sources['assessmentstates']);
        $this->assertSame([], $sources['learneractivities']);
        $this->assertObjectNotHasProperty('assessmentdefinitionversion', $sources['activity']);
        $this->assertObjectNotHasProperty('gradeitemversion', $sources['activity']);
        $this->assertObjectNotHasProperty('gradeitemstatus', $sources['activity']);
    }

    public function test_userinfo_backup_contains_canonical_source_rows_for_multiple_learners(): void {
        $this->resetAfterTest();
        [$activity, $cmid] = $this->create_activity();
        $firstuser = $this->getDataGenerator()->create_user();
        $seconduser = $this->getDataGenerator()->create_user();
        $this->insert_learner_state((int) $activity->id, (int) $firstuser->id, $cmid, 'first-block');
        $this->insert_learner_state((int) $activity->id, (int) $seconduser->id, $cmid, 'second-block');

        $sources = self::sources(
            (int) $activity->id,
            $cmid,
            true,
        );

        $this->assertSame(
            [(int) $firstuser->id, (int) $seconduser->id],
            array_map(static fn(stdClass $row): int => (int) $row->userid, $sources['assessmentstates']),
        );
        $this->assertSame(
            [(int) $firstuser->id, (int) $seconduser->id],
            array_map(static fn(stdClass $row): int => (int) $row->userid, $sources['learneractivities']),
        );
        foreach ($sources['assessmentstates'] as $row) {
            $this->assertSame('moodle-cm-' . $cmid, json_decode($row->snapshotjson)->artifactId);
            $this->assertObjectNotHasProperty('staterevision', $row);
            $this->assertObjectNotHasProperty('nextquizexpiry', $row);
        }
    }

    public function test_backup_rejects_corrupt_canonical_assessment_state(): void {
        global $DB;

        $this->resetAfterTest();
        [$activity, $cmid] = $this->create_activity();
        $user = $this->getDataGenerator()->create_user();
        $this->insert_learner_state((int) $activity->id, (int) $user->id, $cmid);
        $DB->set_field(
            'scaffold_assessment_state',
            'snapshotjson',
            '{"snapshotVersion":1,"artifactId":"wrong-site","problems":{},"quizzes":{}}',
            ['scaffoldid' => $activity->id, 'userid' => $user->id],
        );

        $this->expectException(invalid_parameter_exception::class);
        self::sources((int) $activity->id, $cmid, true);
    }

    private function create_activity(): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');
        $course = $this->getDataGenerator()->create_course();
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Portable Scaffold activity',
            'intro' => '<p>Portable introduction</p>',
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
        context_module::instance($cmid);
        $artifact = [
            'id' => 'moodle-cm-' . $cmid,
            'title' => 'Portable Scaffold activity',
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
        $learnercontent = [
            'type' => 'doc',
            'content' => [[
                'type' => 'courseDocument',
                'attrs' => ['mode' => 'page'],
                'content' => [],
            ]],
        ];
        $DB->set_field('scaffold', 'artifactjson', json_encode($artifact, JSON_THROW_ON_ERROR), [
            'id' => $activityid,
        ]);
        $DB->set_field('scaffold', 'learnercontentjson', json_encode($learnercontent, JSON_THROW_ON_ERROR), [
            'id' => $activityid,
        ]);

        return [$DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST), (int) $cmid];
    }

    private static function sources(int $scaffoldid, int $cmid, bool $userinfo): array {
        $method = new ReflectionMethod(backup_scaffold_activity_structure_step::class, 'validated_sources');
        return $method->invoke(null, $scaffoldid, $cmid, $userinfo);
    }

    private function insert_learner_state(int $scaffoldid, int $userid, int $cmid, string $blockid = 'block-1'): void {
        global $DB;

        $now = time();
        $artifactid = 'moodle-cm-' . $cmid;
        $DB->insert_record('scaffold_assessment_state', (object) [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
            'snapshotjson' => json_encode((object) [
                'snapshotVersion' => 1,
                'artifactId' => $artifactid,
                'problems' => (object) [],
                'quizzes' => (object) [],
            ], JSON_THROW_ON_ERROR),
            'staterevision' => 7,
            'nextquizexpiry' => $now + 300,
            'timecreated' => $now,
            'timemodified' => $now,
        ]);
        $DB->insert_record('scaffold_learner_activity', (object) [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
            'snapshotjson' => json_encode((object) [
                'snapshotVersion' => 1,
                'artifactId' => $artifactid,
                'activities' => (object) [
                    $blockid => (object) [
                        'activityKind' => 'checklist',
                        'data' => (object) ['position' => 1],
                        'completed' => true,
                        'updatedAt' => '2026-07-18T12:00:00.000000Z',
                    ],
                ],
            ], JSON_THROW_ON_ERROR),
            'timecreated' => $now,
            'timemodified' => $now,
        ]);
    }
}

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

use mod_scaffold\local\activity_access;
use mod_scaffold\local\learner_activity_repository;
use mod_scaffold\local\learner_activity_service;


/**
 * Tests the learner-activity service against Moodle authorization and DML.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
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

        $this->assert_invalid_parameter(static fn(): array => $service->load($editscope));
        $this->assert_invalid_parameter(static fn(): array => $service->save(
            $editscope,
            'moodle-cm-' . $activity->cmid,
            'checklist-1',
            self::record_json('checklist'),
        ));
    }

    public function test_save_rejects_wrong_artifact_block_and_kind(): void {
        global $DB;

        $this->resetAfterTest();

        [$course, $activity] = $this->create_activity();
        $scope = $this->learner_scope($course, $activity->cmid);
        $service = new learner_activity_service();

        $this->assert_invalid_parameter(static fn(): array => $service->save(
            $scope,
            'moodle-cm-999',
            'checklist-1',
            self::record_json('checklist'),
        ));
        $this->assert_invalid_parameter(static fn(): array => $service->save(
            $scope,
            'moodle-cm-' . $activity->cmid,
            'missing-block',
            self::record_json('checklist'),
        ));
        $this->assert_invalid_parameter(static fn(): array => $service->save(
            $scope,
            'moodle-cm-' . $activity->cmid,
            'checklist-1',
            self::record_json('flashcard'),
        ));
        $this->assertSame(0, $DB->count_records('scaffold_learner_activity'));
    }

    public function test_save_lifecycle_uses_real_dml_and_releases_moodle_lock(): void {
        global $DB;

        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity();
        $scope = $this->learner_scope($course, $activity->cmid);
        $service = new learner_activity_service();
        $artifactid = 'moodle-cm-' . $activity->cmid;
        $empty = $service->load($scope);

        $this->assertSame(1, $empty['snapshotVersion']);
        $this->assertSame($artifactid, $empty['artifactId']);
        $this->assertSame([], get_object_vars($empty['activities']));
        $this->assertSame(0, $DB->count_records('scaffold_learner_activity'));

        $checklist = $service->save(
            $scope,
            $artifactid,
            'checklist-1',
            self::lossless_record_json(),
        );
        $this->assertMatchesRegularExpression(
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000000Z$/',
            $checklist['updatedAt'],
        );
        $this->assertInstanceOf(\stdClass::class, $checklist['data']);
        $this->assertSame('zero', $checklist['data']->{'0'});
        $this->assertSame('one', $checklist['data']->{'1'});
        $this->assertInstanceOf(\stdClass::class, $checklist['data']->emptyObject);
        $this->assertIsArray($checklist['data']->genuineArray);
        $firstrow = $DB->get_record('scaffold_learner_activity', [
            'scaffoldid' => $activity->id,
            'userid' => $scope->actorid,
        ], '*', MUST_EXIST);

        $flashcard = $service->save(
            $scope,
            $artifactid,
            'flashcard-1',
            self::record_json('flashcard', (object) ['currentCardId' => 'card-2'], true),
        );
        $loaded = $service->load($scope);
        $this->assertSame(
            ['checklist-1', 'flashcard-1'],
            array_keys(get_object_vars($loaded['activities'])),
        );
        $this->assertEquals(
            $checklist['data'],
            $loaded['activities']->{'checklist-1'}->data,
        );
        $this->assertSame(
            $flashcard['updatedAt'],
            $loaded['activities']->{'flashcard-1'}->updatedAt,
        );
        $this->assertSame(1, $DB->count_records('scaffold_learner_activity', [
            'scaffoldid' => $activity->id,
            'userid' => $scope->actorid,
        ]));

        $updated = $service->save(
            $scope,
            $artifactid,
            'checklist-1',
            self::record_json('checklist', (object) ['position' => 2], true),
        );
        $updatedrow = $DB->get_record('scaffold_learner_activity', [
            'id' => $firstrow->id,
        ], '*', MUST_EXIST);
        $this->assertTrue($updated['completed']);
        $this->assertSame((int) $firstrow->timecreated, (int) $updatedrow->timecreated);
        $this->assertGreaterThan((int) $firstrow->timemodified, (int) $updatedrow->timemodified);

        $dbman = $DB->get_manager();
        $table = new \xmldb_table('scaffold_learner_activity');
        $this->assertTrue($dbman->index_exists(
            $table,
            new \xmldb_index('scaffolduser', XMLDB_INDEX_UNIQUE, ['scaffoldid', 'userid']),
        ));
        $factory = \core\lock\lock_config::get_lock_factory('mod_scaffold_learner_activity');
        $lock = $factory->get_lock(
            'activity:' . $activity->id . ':learner:' . $scope->actorid,
            0,
        );
        $this->assertNotFalse($lock);
        $lock->release();
    }

    public function test_user_and_activity_rows_are_isolated(): void {
        global $DB;

        $this->resetAfterTest();
        [$firstcourse, $firstactivity] = $this->create_activity();
        [$secondcourse, $secondactivity] = $this->create_activity();
        $firstuser = $this->getDataGenerator()->create_user();
        $seconduser = $this->getDataGenerator()->create_user();
        $firstscope = $this->learner_scope($firstcourse, $firstactivity->cmid, $firstuser);
        $service = new learner_activity_service();
        $service->save(
            $firstscope,
            'moodle-cm-' . $firstactivity->cmid,
            'checklist-1',
            self::record_json('checklist'),
        );

        $secondscope = $this->learner_scope($firstcourse, $firstactivity->cmid, $seconduser);
        $this->assertSame([], get_object_vars($service->load($secondscope)['activities']));
        $service->save(
            $secondscope,
            'moodle-cm-' . $firstactivity->cmid,
            'checklist-1',
            self::record_json('checklist'),
        );

        $otheractivityscope = $this->learner_scope($secondcourse, $secondactivity->cmid, $firstuser);
        $otherempty = $service->load($otheractivityscope);
        $this->assertSame('moodle-cm-' . $secondactivity->cmid, $otherempty['artifactId']);
        $this->assertSame([], get_object_vars($otherempty['activities']));
        $service->save(
            $otheractivityscope,
            'moodle-cm-' . $secondactivity->cmid,
            'flashcard-1',
            self::record_json('flashcard'),
        );

        $this->assertSame(3, $DB->count_records('scaffold_learner_activity'));
        $this->assertSame(2, $DB->count_records('scaffold_learner_activity', [
            'scaffoldid' => $firstactivity->id,
        ]));
        $this->assertSame(1, $DB->count_records('scaffold_learner_activity', [
            'scaffoldid' => $secondactivity->id,
        ]));
    }

    public function test_invalid_stored_snapshots_reject_load_and_save_without_rewrite(): void {
        global $DB;

        $this->resetAfterTest(true);
        $this->preventResetByRollback();
        [$course, $activity] = $this->create_activity();
        $scope = $this->learner_scope($course, $activity->cmid);
        $service = new learner_activity_service();
        $artifactid = 'moodle-cm-' . $activity->cmid;
        $service->save(
            $scope,
            $artifactid,
            'checklist-1',
            self::record_json('checklist'),
        );
        $rowid = $DB->get_field('scaffold_learner_activity', 'id', [
            'scaffoldid' => $activity->id,
            'userid' => $scope->actorid,
        ], MUST_EXIST);
        $cases = [
            '{bad json',
            '[]',
            json_encode([
                'snapshotVersion' => 2,
                'artifactId' => $artifactid,
                'activities' => (object) [],
            ], JSON_THROW_ON_ERROR),
            json_encode([
                'snapshotVersion' => 1,
                'artifactId' => 'moodle-cm-999',
                'activities' => (object) [],
            ], JSON_THROW_ON_ERROR),
        ];
        foreach ($cases as $snapshotjson) {
            $DB->set_field('scaffold_learner_activity', 'snapshotjson', $snapshotjson, ['id' => $rowid]);
            $this->assert_invalid_parameter(static fn(): array => $service->load($scope));
            $this->assert_invalid_parameter(static fn(): array => $service->save(
                $scope,
                $artifactid,
                'checklist-1',
                self::record_json('checklist'),
            ));
            $this->assertSame(
                $snapshotjson,
                $DB->get_field('scaffold_learner_activity', 'snapshotjson', ['id' => $rowid]),
            );
        }

        $factory = \core\lock\lock_config::get_lock_factory('mod_scaffold_learner_activity');
        $lock = $factory->get_lock(
            'activity:' . $activity->id . ':learner:' . $scope->actorid,
            0,
        );
        $this->assertNotFalse($lock);
        $lock->release();
    }

    public function test_activity_map_rejects_blank_and_conflicting_stored_ids(): void {
        global $DB;

        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity();
        $learner = $this->getDataGenerator()->create_user();
        $this->enrol_as($learner, $course, 'student');
        $this->setUser($learner);
        $cases = [
            [
                'type' => 'doc',
                'content' => [['type' => 'checklist', 'attrs' => ['id' => '   ']]],
            ],
            [
                'type' => 'doc',
                'content' => [
                    ['type' => 'checklist', 'attrs' => ['id' => 'shared-id']],
                    ['type' => 'flashcard', 'attrs' => ['id' => 'shared-id']],
                ],
            ],
        ];

        foreach ($cases as $content) {
            $DB->set_field(
                'scaffold',
                'learnercontentjson',
                json_encode($content, JSON_THROW_ON_ERROR),
                ['id' => $activity->id],
            );
            $scope = activity_access::require($activity->cmid, 'mod/scaffold:view');
            $this->assert_invalid_parameter(
                static fn(): array => (new learner_activity_service())->load($scope),
            );
        }
        $this->assertSame(0, $DB->count_records('scaffold_learner_activity'));
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
        $publicationsbefore = $DB->count_records('scaffold_grade_publications', [
            'scaffoldid' => $activity->id,
        ]);
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
            $publicationsbefore,
            $DB->count_records('scaffold_grade_publications', [
                'scaffoldid' => $activity->id,
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

    /**
     * Returns learner scope.
     *
     * @param \stdClass $course Moodle course record.
     * @param int $cmid Course module ID.
     * @param \stdClass|null $learner Learner.
     * @return \mod_scaffold\local\activity_scope
     */
    private function learner_scope(
        \stdClass $course,
        int $cmid,
        ?\stdClass $learner = null,
    ): \mod_scaffold\local\activity_scope {
        $learner ??= $this->getDataGenerator()->create_user();
        $this->enrol_as($learner, $course, 'student');
        $this->setUser($learner);
        return activity_access::require($cmid, 'mod/scaffold:view');
    }

    /**
     * Returns enrol as.
     *
     * @param \stdClass $user User.
     * @param \stdClass $course Moodle course record.
     * @param string $roleshortname Roleshortname.
     */
    private function enrol_as(\stdClass $user, \stdClass $course, string $roleshortname): void {
        global $DB;

        $roleid = $DB->get_field('role', 'id', ['shortname' => $roleshortname], MUST_EXIST);
        $this->getDataGenerator()->enrol_user($user->id, $course->id, $roleid);
    }

    /**
     * Asserts invalid parameter.
     *
     * @param callable $operation Operation.
     */
    private function assert_invalid_parameter(callable $operation): void {
        try {
            $operation();
            $this->fail('Expected invalid_parameter_exception');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
    }

    /**
     * Records json.
     *
     * @param string $kind Kind.
     * @param mixed $data Data.
     * @param bool $completed Completed.
     * @return string
     */
    private static function record_json(
        string $kind,
        mixed $data = null,
        bool $completed = false,
    ): string {
        return json_encode([
            'activityKind' => $kind,
            'data' => $data ?? (object) ['position' => 1],
            'completed' => $completed,
        ], JSON_THROW_ON_ERROR);
    }

    /**
     * Returns lossless record json.
     *
     * @return string
     */
    private static function lossless_record_json(): string {
        return '{"activityKind":"checklist","data":{'
            . '"0":"zero","1":"one","emptyObject":{},'
            . '"genuineArray":["array-zero",{"0":"object-zero"}]},'
            . '"completed":false}';
    }

    /**
     * Returns learner content.
     *
     * @param bool $withflashcard Withflashcard.
     * @return array
     */
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

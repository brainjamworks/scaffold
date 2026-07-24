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
use mod_scaffold\local\assessment_projection;
use mod_scaffold\local\content_service;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests strict assessment projection and author-save persistence.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 *
 * @covers \mod_scaffold\local\assessment_projection
 * @covers \mod_scaffold\local\content_service
 */
final class assessment_projection_test extends \advanced_testcase {
    public function test_strict_projection_preserves_empty_and_populated_bundles(): void {
        $empty = assessment_projection::for_activity($this->activity_record());
        $this->assertSame(['targets' => [], 'groups' => []], $empty);

        $target = $this->target();
        $group = $this->quiz_group();
        $populated = assessment_projection::for_activity(
            $this->activity_record([$target], [$group]),
        );
        $this->assertEquals([
            'targets' => [$target],
            'groups' => [$group],
        ], $populated);
        $this->assertInstanceOf(
            \stdClass::class,
            $populated['targets'][0]['assessment']['feedbackByOptionId'],
        );
    }

    public function test_strict_projection_rejects_every_invalid_stored_bundle(): void {
        $target = $this->target();
        $group = $this->quiz_group();
        $oldtarget = $target;
        unset($oldtarget['schemaVersion']);
        $futuretarget = $target;
        $futuretarget['schemaVersion'] = 2;
        $oldgroup = $group;
        unset($oldgroup['schemaVersion']);
        $futuregroup = $group;
        $futuregroup['schemaVersion'] = 2;
        $duplicategroup = $group;
        $duplicategroup['targetIds'] = ['question-1'];
        $cases = [
            'invalid target JSON' => (object) array_merge(
                (array) $this->activity_record(),
                ['assessmenttargetsjson' => '{'],
            ),
            'old target' => $this->activity_record([$oldtarget]),
            'future target' => $this->activity_record([$futuretarget]),
            'invalid group JSON' => (object) array_merge(
                (array) $this->activity_record([$target]),
                ['assessmentgroupsjson' => '{'],
            ),
            'old group' => $this->activity_record([$target], [$oldgroup]),
            'future group' => $this->activity_record([$target], [$futuregroup]),
            'missing target' => $this->activity_record(
                [$target],
                [$this->quiz_group(['missing-target'])],
            ),
            'duplicate group id' => $this->activity_record(
                [$target],
                [$group, $duplicategroup],
            ),
        ];

        foreach ($cases as $case => $activity) {
            try {
                assessment_projection::for_activity($activity);
                $this->fail('Invalid projection was accepted: ' . $case);
            } catch (\invalid_parameter_exception) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_grade_read_validates_complete_target_and_group_bundle(): void {
        global $DB;

        $this->resetAfterTest(true);
        [, $activity] = $this->create_fixture();
        $target = $this->target();
        $DB->set_field(
            'scaffold',
            'assessmenttargetsjson',
            json_encode([$target], JSON_THROW_ON_ERROR),
            ['id' => $activity->id],
        );
        $DB->set_field(
            'scaffold',
            'assessmentgroupsjson',
            json_encode([$this->quiz_group(['missing-target'])], JSON_THROW_ON_ERROR),
            ['id' => $activity->id],
        );
        $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);

        $this->expectException(\invalid_parameter_exception::class);
        assessment_projection::raw_grade_for_user($stored, 42);
    }

    public function test_invalid_author_projection_is_rejected_before_write(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$scope, $activity] = $this->create_fixture();
        $before = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);
        [$artifactjson, $learnerjson] = $this->content_bundle(
            (int) $scope->cm->id,
            'Rejected title',
        );
        $target = $this->target();

        try {
            (new content_service())->save(
                $scope,
                $artifactjson,
                $learnerjson,
                json_encode([$target], JSON_THROW_ON_ERROR),
                json_encode(
                    [$this->quiz_group(['missing-target'])],
                    JSON_THROW_ON_ERROR,
                ),
            );
            $this->fail('Invalid target/group membership was accepted');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
        $this->assertEquals(
            $before,
            $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST),
        );

        try {
            (new content_service())->save(
                $scope,
                $artifactjson,
                $learnerjson,
                json_encode([$target], JSON_THROW_ON_ERROR),
                json_encode(
                    [$this->quiz_group(), $this->quiz_group()],
                    JSON_THROW_ON_ERROR,
                ),
            );
            $this->fail('Duplicate group identity was accepted');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
        $this->assertEquals(
            $before,
            $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST),
        );
    }

    public function test_valid_author_save_commits_projection_without_learner_writes(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$scope, $activity] = $this->create_fixture();
        [$artifactjson, $learnerjson] = $this->content_bundle(
            (int) $scope->cm->id,
            'Saved lesson',
        );
        $target = $this->target();
        $group = $this->quiz_group();
        $refreshes = [];
        $service = new content_service(
            static function(\stdClass $saved) use (&$refreshes): int {
                $refreshes[] = clone $saved;
                return 0;
            },
        );

        $result = $service->save(
            $scope,
            $artifactjson,
            $learnerjson,
            json_encode([$target], JSON_THROW_ON_ERROR),
            json_encode([$group], JSON_THROW_ON_ERROR),
        );
        $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);

        $this->assertSame('Saved lesson', $result['content']->name);
        $this->assertSame('published', $result['gradeItemPublication']);
        $this->assertSame('Saved lesson', $stored->name);
        $this->assertEquals(
            json_decode(json_encode([$target], JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR),
            json_decode($stored->assessmenttargetsjson, false, 512, JSON_THROW_ON_ERROR),
        );
        $this->assertEquals(
            json_decode(json_encode([$group], JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR),
            json_decode($stored->assessmentgroupsjson, false, 512, JSON_THROW_ON_ERROR),
        );
        $this->assertSame(2, (int) $stored->assessmentdefinitionversion);
        $this->assertSame('pending', $stored->gradeitemstatus);
        $this->assertCount(1, $refreshes);
        $this->assertSame(0, $DB->count_records('scaffold_assessment_state'));
        $this->assertSame(0, $DB->count_records('scaffold_grade_publications'));
    }

    public function test_title_only_save_refreshes_metadata_without_definition_change(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$scope, $activity] = $this->create_fixture();
        [$artifactjson, $learnerjson] = $this->content_bundle(
            (int) $scope->cm->id,
            'Renamed lesson',
        );
        $refreshes = 0;
        $service = new content_service(
            static function() use (&$refreshes): int {
                $refreshes++;
                return 0;
            },
        );

        $service->save($scope, $artifactjson, $learnerjson, '[]', '[]');
        $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);

        $this->assertSame('Renamed lesson', $stored->name);
        $this->assertSame(1, (int) $stored->assessmentdefinitionversion);
        $this->assertSame('pending', $stored->gradeitemstatus);
        $this->assertSame(1, $refreshes);
        $this->assertSame(0, $DB->count_records('scaffold_assessment_state'));
        $this->assertSame(0, $DB->count_records('scaffold_grade_publications'));
    }

    private function create_fixture(): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');
        $course = $this->getDataGenerator()->create_course();
        $scaffoldid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Existing lesson',
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
        $author = $this->getDataGenerator()->create_user();
        $roleid = $DB->get_field('role', 'id', ['shortname' => 'editingteacher'], MUST_EXIST);
        $this->getDataGenerator()->enrol_user($author->id, $course->id, $roleid);
        $this->setUser($author);
        $scope = activity_access::require($cmid, 'mod/scaffold:editcontent');
        return [$scope, $DB->get_record('scaffold', ['id' => $scaffoldid], '*', MUST_EXIST)];
    }

    private function activity_record(array $targets = [], array $groups = []): \stdClass {
        return (object) [
            'assessmenttargetsjson' => json_encode($targets, JSON_THROW_ON_ERROR),
            'assessmentgroupsjson' => json_encode($groups, JSON_THROW_ON_ERROR),
        ];
    }

    private function content_bundle(int $cmid, string $title): array {
        $content = [
            'type' => 'doc',
            'content' => [[
                'type' => 'courseDocument',
                'attrs' => ['mode' => 'page'],
                'content' => [],
            ]],
        ];
        return [
            json_encode([
                'id' => 'moodle-cm-' . $cmid,
                'title' => $title,
                'mode' => 'page',
                'content' => $content,
            ], JSON_THROW_ON_ERROR),
            json_encode($content, JSON_THROW_ON_ERROR),
        ];
    }

    private function target(): array {
        return [
            'schemaVersion' => 1,
            'targetId' => 'question-1',
            'blockId' => 'block-question-1',
            'blockType' => 'mcq',
            'interaction' => [
                'kind' => 'single-select',
                'options' => [['id' => 'option-a'], ['id' => 'option-b']],
            ],
            'assessment' => [
                'kind' => 'single-select',
                'correctOptionId' => 'option-b',
                'feedbackByOptionId' => (object) [],
            ],
            'settings' => [
                'feedbackMode' => 'on_submit',
                'isGraded' => true,
                'showAnswer' => true,
                'points' => 1,
                'maxAttempts' => null,
            ],
        ];
    }

    private function quiz_group(array $targetids = ['question-1']): array {
        return [
            'schemaVersion' => 1,
            'kind' => 'quiz',
            'groupId' => 'quiz-1',
            'targetIds' => $targetids,
            'settings' => [
                'allowBacktracking' => true,
                'reviewTiming' => 'after_quiz',
                'reviewDetail' => 'result_only',
                'attemptsPerQuestion' => 1,
                'isGraded' => true,
                'timer' => ['enabled' => false, 'durationSeconds' => 0],
            ],
        ];
    }
}

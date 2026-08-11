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
        $futuretarget['schemaVersion'] = 3;
        $oldgroup = $group;
        unset($oldgroup['schemaVersion']);
        $futuregroup = $group;
        $futuregroup['schemaVersion'] = 3;
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

    public function test_projection_upgrades_version_one_bundle_in_memory(): void {
        $target = $this->target();
        $target['schemaVersion'] = 1;
        $group = $this->quiz_group();
        $group['schemaVersion'] = 1;
        unset($group['settings']['passingScore']);
        $activity = $this->activity_record([$target], [$group]);

        $projection = assessment_projection::for_activity($activity);

        $this->assertSame(2, $projection['targets'][0]['schemaVersion']);
        $this->assertSame(2, $projection['groups'][0]['schemaVersion']);
        $this->assertNull($projection['groups'][0]['settings']['passingScore']);
        $this->assertSame(1, json_decode($activity->assessmenttargetsjson)[0]->schemaVersion);
        $this->assertSame(1, json_decode($activity->assessmentgroupsjson)[0]->schemaVersion);
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

    public function test_canonical_save_does_not_validate_separate_assessment_projection(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$scope, $activity] = $this->create_fixture();
        $DB->set_field('scaffold', 'assessmenttargetsjson', '{', ['id' => $activity->id]);
        $DB->set_field('scaffold', 'assessmentgroupsjson', '{', ['id' => $activity->id]);
        $artifactjson = $this->content_bundle(
            (int) $scope->cm->id,
            'Canonical title',
        );

        (new content_service())->save($scope, $artifactjson);

        $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);
        $this->assertSame('Existing lesson', $stored->name);
        $this->assertSame('Canonical title', json_decode($stored->artifactjson)->title);
        $this->assertSame('{', $stored->assessmenttargetsjson);
        $this->assertSame('{', $stored->assessmentgroupsjson);
    }

    public function test_canonical_save_preserves_learner_publication_and_assessment_projection(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$scope, $activity] = $this->create_fixture();
        $artifactjson = $this->content_bundle(
            (int) $scope->cm->id,
            'Saved lesson',
        );
        $target = $this->target();
        $group = $this->quiz_group();
        $learnerjson = json_encode([
            'type' => 'doc',
            'content' => [['type' => 'paragraph', 'attrs' => ['audience' => 'learner-safe']]],
        ], JSON_THROW_ON_ERROR);
        $targetsjson = json_encode([$target], JSON_THROW_ON_ERROR);
        $groupsjson = json_encode([$group], JSON_THROW_ON_ERROR);
        $DB->set_field('scaffold', 'learnercontentjson', $learnerjson, ['id' => $activity->id]);
        $DB->set_field('scaffold', 'assessmenttargetsjson', $targetsjson, ['id' => $activity->id]);
        $DB->set_field('scaffold', 'assessmentgroupsjson', $groupsjson, ['id' => $activity->id]);
        $DB->set_field('scaffold', 'assessmentdefinitionversion', 7, ['id' => $activity->id]);
        $refreshes = [];
        $service = new content_service(
            static function (\stdClass $saved) use (&$refreshes): int {
                $refreshes[] = clone $saved;
                return 0;
            },
        );

        $result = $service->save($scope, $artifactjson);
        $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);

        $this->assertSame('Existing lesson', $result['content']->name);
        $this->assertNotSame('', $result['artifactRevision']);
        $this->assertSame('Existing lesson', $stored->name);
        $this->assertSame($learnerjson, $stored->learnercontentjson);
        $this->assertSame($targetsjson, $stored->assessmenttargetsjson);
        $this->assertSame($groupsjson, $stored->assessmentgroupsjson);
        $this->assertSame(7, (int) $stored->assessmentdefinitionversion);
        $this->assertSame('pending', $stored->gradeitemstatus);
        $this->assertCount(0, $refreshes);
        $this->assertSame(0, $DB->count_records('scaffold_assessment_state'));
        $this->assertSame(0, $DB->count_records('scaffold_grade_publications'));
    }

    public function test_title_only_save_remains_a_private_draft_change(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$scope, $activity] = $this->create_fixture();
        $artifactjson = $this->content_bundle(
            (int) $scope->cm->id,
            'Renamed lesson',
        );
        $refreshes = 0;
        $service = new content_service(
            static function () use (&$refreshes): int {
                $refreshes++;
                return 0;
            },
        );

        $service->save($scope, $artifactjson);
        $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);

        $this->assertSame('Existing lesson', $stored->name);
        $this->assertSame('Renamed lesson', json_decode($stored->artifactjson)->title);
        $this->assertSame(1, (int) $stored->assessmentdefinitionversion);
        $this->assertSame('pending', $stored->gradeitemstatus);
        $this->assertSame(0, $refreshes);
        $this->assertSame(0, $DB->count_records('scaffold_assessment_state'));
        $this->assertSame(0, $DB->count_records('scaffold_grade_publications'));
    }

    /**
     * Creates fixture.
     *
     * @return array
     */
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

    /**
     * Returns activity record.
     *
     * @param array $targets Targets.
     * @param array $groups Groups.
     * @return \stdClass
     */
    private function activity_record(array $targets = [], array $groups = []): \stdClass {
        return (object) [
            'assessmenttargetsjson' => json_encode($targets, JSON_THROW_ON_ERROR),
            'assessmentgroupsjson' => json_encode($groups, JSON_THROW_ON_ERROR),
        ];
    }

    /**
     * Returns content bundle.
     *
     * @param int $cmid Course module ID.
     * @param string $title Title.
     * @return string
     */
    private function content_bundle(int $cmid, string $title): string {
        $content = [
            'type' => 'doc',
            'content' => [[
                'type' => 'courseDocument',
                'attrs' => [
                    'mode' => 'page',
                    'schemaVersion' => 4,
                    'requiresScaffoldPlus' => false,
                ],
                'content' => [],
            ]],
        ];
        return json_encode([
            'id' => 'moodle-cm-' . $cmid,
            'title' => $title,
            'mode' => 'page',
            'content' => $content,
        ], JSON_THROW_ON_ERROR);
    }

    /**
     * Returns target.
     *
     * @return array
     */
    private function target(): array {
        return [
            'schemaVersion' => 2,
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

    /**
     * Returns quiz group.
     *
     * @param array $targetids Targetids.
     * @return array
     */
    private function quiz_group(array $targetids = ['question-1']): array {
        return [
            'schemaVersion' => 2,
            'kind' => 'quiz',
            'groupId' => 'quiz-1',
            'targetIds' => $targetids,
            'settings' => [
                'allowBacktracking' => true,
                'reviewTiming' => 'after_quiz',
                'reviewDetail' => 'result_only',
                'attemptsPerQuestion' => 1,
                'isGraded' => true,
                'passingScore' => null,
                'timer' => ['enabled' => false, 'durationSeconds' => 0],
            ],
        ];
    }
}

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
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Scaffold. If not, see <https://www.gnu.org/licenses/>.

namespace mod_scaffold;

use mod_scaffold\completion\custom_completion;
use mod_scaffold\local\assessment_state_repository;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests Scaffold custom completion against Moodle completion and DML.
 *
 * @covers \mod_scaffold\completion\custom_completion
 */
final class custom_completion_test extends \advanced_testcase {
    public function test_rule_metadata_and_real_assessment_state_projection(): void {
        global $DB;

        $this->resetAfterTest(true);
        [$activity, $cm] = $this->create_activity();
        $learner = $this->getDataGenerator()->create_user();
        $completion = new custom_completion($cm, (int) $learner->id);

        $this->assertSame(
            ['completionactivitystatus'],
            custom_completion::get_defined_custom_rules(),
        );
        $this->assertSame(
            [
                'completionactivitystatus' =>
                    get_string('completiondetail:activitystatus', 'scaffold'),
            ],
            $completion->get_custom_rule_descriptions(),
        );
        $this->assertSame(
            [
                'completionview',
                'completionactivitystatus',
                'completionusegrade',
                'completionpassgrade',
            ],
            $completion->get_sort_order(),
        );
        $this->assertSame(
            COMPLETION_INCOMPLETE,
            $completion->get_state('completionactivitystatus'),
        );
        $this->assertSame(0, $DB->count_records('scaffold_assessment_state'));

        $repository = new assessment_state_repository();
        $artifactid = 'moodle-cm-' . $cm->id;
        $repository->mutate(
            (int) $activity->id,
            (int) $learner->id,
            $artifactid,
            static function(\stdClass $snapshot): \stdClass {
                $snapshot->problems->{'question-1'} = self::problem(null);
                return $snapshot;
            },
        );
        $this->assertSame(
            COMPLETION_INCOMPLETE,
            $completion->get_state('completionactivitystatus'),
        );

        $repository->mutate(
            (int) $activity->id,
            (int) $learner->id,
            $artifactid,
            static function(\stdClass $snapshot): \stdClass {
                $snapshot->problems->{'question-1'} = self::problem(1.0);
                return $snapshot;
            },
        );
        $this->assertSame(
            COMPLETION_COMPLETE,
            $completion->get_state('completionactivitystatus'),
        );
        $this->assertSame(1, $DB->count_records('scaffold_assessment_state'));
        $this->assertSame(1, (int) $activity->completionactivitystatus);
    }

    public function test_unknown_rule_is_rejected_by_moodle_completion_base_class(): void {
        $this->resetAfterTest(true);
        [, $cm] = $this->create_activity();
        $learner = $this->getDataGenerator()->create_user();
        $completion = new custom_completion($cm, (int) $learner->id);

        $this->expectException(\coding_exception::class);
        $completion->get_state('unknownrule');
    }

    public function test_module_form_uses_suffix_and_persists_an_unchecked_rule(): void {
        global $CFG;

        require_once($CFG->dirroot . '/mod/scaffold/mod_form.php');
        $form = (new \ReflectionClass(\mod_scaffold_mod_form::class))
            ->newInstanceWithoutConstructor();
        $form->set_suffix('_bulk');

        $this->assertSame('_bulk', $form->get_suffix());
        $this->assertTrue($form->completion_rule_enabled([
            'completionactivitystatus_bulk' => 1,
        ]));
        $this->assertFalse($form->completion_rule_enabled([]));

        $data = (object) ['completionunlocked' => 1];
        $form->data_postprocessing($data);
        $this->assertTrue(property_exists($data, 'completionactivitystatus_bulk'));
        $this->assertSame(0, $data->completionactivitystatus_bulk);
    }

    /**
     * @return array{\stdClass, \cm_info, \stdClass}
     */
    private function create_activity(): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $course = $this->getDataGenerator()->create_course(['enablecompletion' => 1]);
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Custom completion fixture',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
            'completionactivitystatus' => 1,
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
            'completion' => COMPLETION_TRACKING_AUTOMATIC,
            'completiongradeitemnumber' => null,
            'completionview' => 0,
            'completionexpected' => 0,
            'completionpassgrade' => 0,
            'showdescription' => 0,
        ]);
        course_add_cm_to_section($course, $cmid, 0);
        $DB->set_field(
            'scaffold',
            'assessmenttargetsjson',
            json_encode([self::target()], JSON_THROW_ON_ERROR),
            ['id' => $activityid],
        );
        rebuild_course_cache((int) $course->id, true);

        return [
            $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST),
            get_fast_modinfo($course)->get_cm($cmid),
            $course,
        ];
    }

    private static function target(): array {
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
                'maxAttempts' => 1,
            ],
        ];
    }

    private static function problem(?float $score): \stdClass {
        return (object) [
            'response' => null,
            'submitted' => $score !== null,
            'attemptNumber' => $score === null ? 0 : 1,
            'hintsShown' => 0,
            'checkResult' => null,
            'submissionResult' => $score === null ? null : (object) [
                'isCorrect' => $score === 1.0,
                'score' => $score,
                'maxScore' => 1,
                'feedback' => null,
                'items' => (object) [],
            ],
        ];
    }
}

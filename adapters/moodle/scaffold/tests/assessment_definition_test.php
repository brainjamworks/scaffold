<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\assessment_definition;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests grade-relevant assessment definition identity.
 *
 * @covers \mod_scaffold\local\assessment_definition
 */
final class assessment_definition_test extends \advanced_testcase {
    public function test_fingerprint_is_canonical_and_ignores_presentation_settings(): void {
        $targetone = $this->target('target-b', 2.0, true);
        $targettwo = $this->target('target-a', 1.0, true);
        $group = $this->group('quiz-b', ['target-b', 'target-a'], true);

        $reorderedtargetone = $targetone;
        $reorderedtargetone['settings']['feedbackMode'] = 'immediate';
        $reorderedtargetone['settings']['showAnswer'] = false;
        $reorderedtargetone['settings']['maxAttempts'] = 9;
        $reorderedtargetone['assessment']['feedbackByOptionId'] = ['option-a' => 'Changed'];
        $reorderedgroup = $group;
        $reorderedgroup['targetIds'] = ['target-a', 'target-b'];
        $reorderedgroup['settings']['reviewTiming'] = 'immediate';
        $reorderedgroup['settings']['allowBacktracking'] = false;

        $first = assessment_definition::fingerprint([$targetone, $targettwo], [$group], 100.0);
        $second = assessment_definition::fingerprint(
            [$targettwo, $reorderedtargetone],
            [$reorderedgroup],
            100.0,
        );

        $this->assertSame($first, $second);
    }

    public function test_fingerprint_changes_for_each_grade_projection_input(): void {
        $targets = [
            $this->target('target-a', 1.0, true),
            $this->target('target-b', 2.0, true),
        ];
        $groups = [$this->group('quiz-a', ['target-a'], true)];
        $baseline = assessment_definition::fingerprint($targets, $groups, 100.0);

        $points = $targets;
        $points[0]['settings']['points'] = 3;
        $targetgrading = $targets;
        $targetgrading[0]['settings']['isGraded'] = false;
        $membership = $groups;
        $membership[0]['targetIds'][] = 'target-b';
        $groupgrading = $groups;
        $groupgrading[0]['settings']['isGraded'] = false;

        $this->assertNotSame($baseline, assessment_definition::fingerprint($points, $groups, 100.0));
        $this->assertNotSame($baseline, assessment_definition::fingerprint($targetgrading, $groups, 100.0));
        $this->assertNotSame($baseline, assessment_definition::fingerprint($targets, $membership, 100.0));
        $this->assertNotSame($baseline, assessment_definition::fingerprint($targets, $groupgrading, 100.0));
        $this->assertNotSame($baseline, assessment_definition::fingerprint($targets, $groups, 50.0));
        $this->assertNotSame($baseline, assessment_definition::fingerprint([], [], 100.0));
    }

    public function test_instance_updates_separate_title_metadata_from_grade_semantics(): void {
        global $CFG, $DB;

        $this->resetAfterTest();
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $course = $this->getDataGenerator()->create_course();
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Original title',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
        ]);
        $DB->update_record('scaffold', (object) [
            'id' => $activityid,
            'gradeitemversion' => 1,
            'gradeitemstatus' => 'published',
        ]);

        scaffold_update_instance((object) [
            'instance' => $activityid,
            'course' => $course->id,
            'name' => 'Renamed title',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
        ]);
        $renamed = $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST);
        $this->assertSame(1, (int) $renamed->assessmentdefinitionversion);
        $this->assertSame(1, (int) $renamed->gradeitemversion);
        $this->assertSame('published', $renamed->gradeitemstatus);

        $DB->update_record('scaffold', (object) [
            'id' => $activityid,
            'gradeitemversion' => 1,
            'gradeitemstatus' => 'published',
        ]);
        scaffold_update_instance((object) [
            'instance' => $activityid,
            'course' => $course->id,
            'name' => 'Renamed title',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 50,
        ]);
        $rescaled = $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST);
        $this->assertSame(2, (int) $rescaled->assessmentdefinitionversion);
        $this->assertSame(2, (int) $rescaled->gradeitemversion);
        $this->assertSame('published', $rescaled->gradeitemstatus);
        $this->assertSame(0, $DB->count_records('scaffold_grade_publications', ['scaffoldid' => $activityid]));
    }

    private function target(string $targetid, float $points, bool $isgraded): array {
        return [
            'schemaVersion' => 1,
            'targetId' => $targetid,
            'blockId' => 'block-' . $targetid,
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
                'isGraded' => $isgraded,
                'showAnswer' => true,
                'points' => $points,
                'maxAttempts' => null,
            ],
        ];
    }

    private function group(string $groupid, array $targetids, bool $isgraded): array {
        return [
            'schemaVersion' => 1,
            'kind' => 'quiz',
            'groupId' => $groupid,
            'targetIds' => $targetids,
            'settings' => [
                'allowBacktracking' => true,
                'reviewTiming' => 'after_quiz',
                'reviewDetail' => 'result_only',
                'attemptsPerQuestion' => 1,
                'isGraded' => $isgraded,
                'timer' => ['enabled' => false, 'durationSeconds' => 0],
            ],
        ];
    }
}

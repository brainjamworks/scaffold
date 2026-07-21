<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\grade_item_publisher;

defined('MOODLE_INTERNAL') || die();

/**
 * Tests activity grade-item publication independently from learner grades.
 *
 * @covers \mod_scaffold\local\grade_item_publisher
 */
final class grade_item_publisher_test extends \advanced_testcase {
    public function test_publishes_withdraws_and_recreates_the_activity_item(): void {
        global $CFG, $DB;

        $this->resetAfterTest();
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');
        require_once($CFG->libdir . '/gradelib.php');

        $course = $this->getDataGenerator()->create_course();
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Lifecycle item',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
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
        $target = $this->target(true);
        $DB->update_record('scaffold', (object) [
            'id' => $activityid,
            'assessmenttargetsjson' => json_encode([$target], JSON_THROW_ON_ERROR),
            'assessmentdefinitionversion' => 2,
            'gradeitemversion' => 1,
            'gradeitemstatus' => 'pending',
        ]);

        $published = (new grade_item_publisher())->publish((object) ['id' => $activityid]);
        $this->assertSame('published', $published->status);
        $current = $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST);
        $this->assertSame(2, (int) $current->gradeitemversion);
        $this->assertSame('published', $current->gradeitemstatus);
        $item = $this->grade_item($current);
        $this->assertSame('Lifecycle item', $item->itemname);
        $this->assertEqualsWithDelta(100.0, (float) $item->grademax, 0.00001);

        $DB->update_record('scaffold', (object) [
            'id' => $activityid,
            'grade' => 0,
            'assessmentdefinitionversion' => 3,
            'gradeitemstatus' => 'pending',
        ]);
        $withdrawn = (new grade_item_publisher())->publish((object) ['id' => $activityid]);
        $this->assertSame('published', $withdrawn->status);
        $this->assertTrue($withdrawn->withdrawn);
        $current = $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST);
        $this->assertSame(3, (int) $current->gradeitemversion);
        $this->assertFalse($this->find_grade_item($current));

        $DB->update_record('scaffold', (object) [
            'id' => $activityid,
            'grade' => 50,
            'assessmentdefinitionversion' => 4,
            'gradeitemstatus' => 'pending',
        ]);
        $reenabled = (new grade_item_publisher())->publish((object) ['id' => $activityid]);
        $this->assertSame('published', $reenabled->status);
        $item = $this->grade_item($DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST));
        $this->assertEqualsWithDelta(50.0, (float) $item->grademax, 0.00001);

        $target['settings']['isGraded'] = false;
        $DB->update_record('scaffold', (object) [
            'id' => $activityid,
            'assessmenttargetsjson' => json_encode([$target], JSON_THROW_ON_ERROR),
            'assessmentdefinitionversion' => 5,
            'gradeitemstatus' => 'pending',
        ]);
        $nosources = (new grade_item_publisher())->publish((object) ['id' => $activityid]);
        $this->assertTrue($nosources->withdrawn);
        $this->assertFalse($this->find_grade_item(
            $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST),
        ));
    }

    public function test_maps_failures_and_rejects_a_stale_result(): void {
        $activity = (object) [
            'id' => 7,
            'course' => 3,
            'name' => 'Current item',
            'grade' => 100,
            'assessmenttargetsjson' => json_encode([$this->target(true)], JSON_THROW_ON_ERROR),
            'assessmentgroupsjson' => '[]',
            'assessmentdefinitionversion' => 2,
            'gradeitemversion' => 1,
            'gradeitemstatus' => 'pending',
        ];
        $persisted = [];
        $publisher = new grade_item_publisher(
            static fn(int $id): \stdClass => clone $activity,
            static fn(\stdClass $loaded): int => GRADE_UPDATE_MULTIPLE,
            static fn(\stdClass $loaded): int => GRADE_UPDATE_OK,
            static function(\stdClass $loaded, array $status) use (&$persisted): bool {
                $persisted = $status;
                return true;
            },
            static fn(): int => 100,
        );
        $outcome = $publisher->publish((object) ['id' => 7]);
        $this->assertSame('configuration_error', $outcome->status);
        $this->assertSame('multiple_grade_items', $outcome->code);
        $this->assertFalse($outcome->retryable);
        $this->assertNull($outcome->retryAfter);
        $this->assertSame('configuration_error', $persisted['gradeitemstatus']);
        $this->assertSame(1, $persisted['gradeitemretrycount']);
        $this->assertNull($persisted['gradeitemretryafter']);

        $stale = new grade_item_publisher(
            static fn(int $id): \stdClass => clone $activity,
            static fn(\stdClass $loaded): int => GRADE_UPDATE_OK,
            static fn(\stdClass $loaded): int => GRADE_UPDATE_OK,
            static fn(\stdClass $loaded, array $status): bool => false,
        );
        $this->assertSame('pending', $stale->publish((object) ['id' => 7])->status);
    }

    public function test_retryable_failures_use_capped_exponential_backoff(): void {
        foreach ([
            [0, 1, 160],
            [1, 2, 220],
            [6, 7, 3700],
        ] as [$currentretrycount, $expectedretrycount, $expectedretryafter]) {
            $activity = (object) [
                'id' => 7,
                'course' => 3,
                'name' => 'Current item',
                'grade' => 100,
                'assessmenttargetsjson' => json_encode([$this->target(true)], JSON_THROW_ON_ERROR),
                'assessmentgroupsjson' => '[]',
                'assessmentdefinitionversion' => 2,
                'gradeitemversion' => 1,
                'gradeitemstatus' => 'failed',
                'gradeitemretrycount' => $currentretrycount,
            ];
            $persisted = [];
            $publisher = new grade_item_publisher(
                static fn(int $id): \stdClass => clone $activity,
                static fn(\stdClass $loaded): int => GRADE_UPDATE_FAILED,
                static fn(\stdClass $loaded): int => GRADE_UPDATE_OK,
                static function(\stdClass $loaded, array $status) use (&$persisted): bool {
                    $persisted = $status;
                    return true;
                },
                static fn(): int => 100,
            );

            $outcome = $publisher->publish((object) ['id' => 7]);

            $this->assertSame('failed', $outcome->status);
            $this->assertTrue($outcome->retryable);
            $this->assertSame($expectedretryafter, $outcome->retryAfter);
            $this->assertSame($expectedretrycount, $persisted['gradeitemretrycount']);
            $this->assertSame($expectedretryafter, $persisted['gradeitemretryafter']);
        }
    }

    private function target(bool $isgraded): array {
        return [
            'schemaVersion' => 1,
            'targetId' => 'question-1',
            'blockId' => 'question-1',
            'blockType' => 'mcq',
            'interaction' => [
                'kind' => 'single-select',
                'options' => [['id' => 'a'], ['id' => 'b']],
            ],
            'assessment' => [
                'kind' => 'single-select',
                'correctOptionId' => 'b',
                'feedbackByOptionId' => (object) [],
            ],
            'settings' => [
                'feedbackMode' => 'on_submit',
                'isGraded' => $isgraded,
                'showAnswer' => true,
                'points' => 1,
                'maxAttempts' => 1,
            ],
        ];
    }

    private function grade_item(\stdClass $scaffold): \grade_item {
        $item = $this->find_grade_item($scaffold);
        $this->assertInstanceOf(\grade_item::class, $item);
        return $item;
    }

    private function find_grade_item(\stdClass $scaffold): \grade_item|false {
        $items = \grade_item::fetch_all([
            'courseid' => $scaffold->course,
            'itemtype' => 'mod',
            'itemmodule' => 'scaffold',
            'iteminstance' => $scaffold->id,
            'itemnumber' => 0,
        ]);
        return $items ? reset($items) : false;
    }
}

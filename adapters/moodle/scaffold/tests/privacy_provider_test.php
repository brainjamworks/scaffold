<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\transform;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;
use core_privacy\tests\request\approved_contextlist;

defined('MOODLE_INTERNAL') || die();

/**
 * Verifies the Scaffold privacy inventory and request handling.
 *
 * @covers \mod_scaffold\privacy\provider
 */
final class privacy_provider_test extends \core_privacy\tests\provider_testcase {
    public function test_metadata_declares_every_learner_owned_field(): void {
        $metadata = provider::get_metadata(new collection('mod_scaffold'))->get_collection();
        $actual = [];
        foreach ($metadata as $item) {
            $actual[$item->get_name()] = array_keys($item->get_privacy_fields());
        }

        $this->assertSame(
            [
                'scaffold_assessment_state' => [
                    'scaffoldid',
                    'userid',
                    'snapshotjson',
                    'staterevision',
                    'nextquizexpiry',
                    'timecreated',
                    'timemodified',
                ],
                'scaffold_learner_activity' => [
                    'scaffoldid',
                    'userid',
                    'snapshotjson',
                    'timecreated',
                    'timemodified',
                ],
                'scaffold_grade_publications' => [
                    'scaffoldid',
                    'userid',
                    'staterevision',
                    'definitionversion',
                    'status',
                    'failurecode',
                    'retrycount',
                    'retryafter',
                    'timecreated',
                    'timemodified',
                ],
            ],
            $actual,
        );
    }

    public function test_context_discovery_combines_every_owner_without_duplicates(): void {
        global $DB;

        $this->resetAfterTest();
        $user = $this->getDataGenerator()->create_user();
        $assessmentactivity = $this->create_activity('Assessment state');
        $learneractivity = $this->create_activity('Learner activity');
        $publicationactivity = $this->create_activity('Grade publication');
        $combinedactivity = $this->create_activity('Combined state');
        $missingmoduleactivity = $this->create_activity('Missing module');
        $this->create_activity('Activity metadata only');

        $this->insert_assessment_state($assessmentactivity->id, $user->id);
        $this->insert_learner_activity($learneractivity->id, $user->id);
        $this->insert_grade_publication($publicationactivity->id, $user->id);
        $this->insert_assessment_state($combinedactivity->id, $user->id);
        $this->insert_learner_activity($combinedactivity->id, $user->id);
        $this->insert_grade_publication($combinedactivity->id, $user->id);
        $this->insert_assessment_state($missingmoduleactivity->id, $user->id);
        $DB->delete_records('course_modules', ['id' => $missingmoduleactivity->cmid]);

        $actual = array_map('intval', provider::get_contexts_for_userid($user->id)->get_contextids());
        sort($actual);
        $expected = [
            $assessmentactivity->contextid,
            $learneractivity->contextid,
            $publicationactivity->contextid,
            $combinedactivity->contextid,
        ];
        sort($expected);

        $this->assertSame($expected, $actual);
        $this->assertSame([], provider::get_contexts_for_userid(-1)->get_contextids());
    }

    public function test_user_discovery_combines_every_owner_without_duplicates(): void {
        $this->resetAfterTest();
        $activity = $this->create_activity('User discovery');
        $assessmentuser = $this->getDataGenerator()->create_user();
        $learneruser = $this->getDataGenerator()->create_user();
        $combineduser = $this->getDataGenerator()->create_user();

        $this->insert_assessment_state($activity->id, $assessmentuser->id);
        $this->insert_learner_activity($activity->id, $learneruser->id);
        $this->insert_assessment_state($activity->id, $combineduser->id);
        $this->insert_learner_activity($activity->id, $combineduser->id);
        $this->insert_grade_publication($activity->id, $combineduser->id);
        $this->insert_assessment_state($activity->id, 999999999);

        $users = new userlist(\context_module::instance($activity->cmid), 'mod_scaffold');
        provider::get_users_in_context($users);
        $actual = array_map('intval', $users->get_userids());
        sort($actual);
        $expected = [(int) $assessmentuser->id, (int) $learneruser->id, (int) $combineduser->id];
        sort($expected);

        $this->assertSame($expected, $actual);

        $systemusers = new userlist(\context_system::instance(), 'mod_scaffold');
        provider::get_users_in_context($systemusers);
        $this->assertSame([], $systemusers->get_userids());
    }

    public function test_export_writes_complete_isolated_canonical_data(): void {
        $this->resetAfterTest();
        $activity = $this->create_activity('Privacy export');
        $otheractivity = $this->create_activity('Unapproved activity');
        $user = $this->getDataGenerator()->create_user();
        $otheruser = $this->getDataGenerator()->create_user();
        $assessmentsnapshot = self::assessment_snapshot($activity->cmid, 'learner-answer');
        $otherassessmentsnapshot = self::assessment_snapshot($activity->cmid, 'other-answer');
        $learnersnapshot = self::learner_activity_snapshot($activity->cmid, 'orphan-block');

        $this->insert_assessment_state($activity->id, $user->id, $assessmentsnapshot, 7, 10, 20);
        $this->insert_assessment_state($activity->id, $otheruser->id, $otherassessmentsnapshot, 8, 11, 21);
        $this->insert_learner_activity($activity->id, $user->id, $learnersnapshot, 30, 40);
        $this->insert_grade_publication($activity->id, $user->id, 7, 3, 'failed', 'grade_update_failed', 2, 50, 60, 70);
        $this->insert_assessment_state(
            $otheractivity->id,
            $user->id,
            self::assessment_snapshot($otheractivity->cmid, 'unapproved-answer'),
        );

        provider::export_user_data(new approved_contextlist(
            $user,
            'mod_scaffold',
            [$activity->contextid],
        ));

        $context = \context_module::instance($activity->cmid);
        $assessment = writer::with_context($context)->get_data([
            get_string('privacy:metadata:scaffold_assessment_state', 'scaffold'),
        ]);
        $learneractivity = writer::with_context($context)->get_data([
            get_string('privacy:metadata:scaffold_learner_activity', 'scaffold'),
        ]);
        $publication = writer::with_context($context)->get_data([
            get_string('privacy:metadata:scaffold_grade_publications', 'scaffold'),
        ]);

        $this->assertEquals($assessmentsnapshot, $assessment->snapshot);
        $this->assertSame(7, $assessment->state_revision);
        $this->assertNull($assessment->next_quiz_expiry);
        $this->assertSame(transform::datetime(10), $assessment->time_created);
        $this->assertSame(transform::datetime(20), $assessment->time_modified);
        $this->assertEquals($learnersnapshot, $learneractivity->snapshot);
        $this->assertSame(transform::datetime(30), $learneractivity->time_created);
        $this->assertSame(transform::datetime(40), $learneractivity->time_modified);
        $this->assertSame(7, $publication->state_revision);
        $this->assertSame(3, $publication->definition_version);
        $this->assertSame('failed', $publication->status);
        $this->assertSame('grade_update_failed', $publication->failure_code);
        $this->assertSame(2, $publication->retry_count);
        $this->assertSame(transform::datetime(50), $publication->retry_after);
        $this->assertSame(transform::datetime(60), $publication->time_created);
        $this->assertSame(transform::datetime(70), $publication->time_modified);
        $this->assertEmpty(writer::with_context($context)->get_data([]));
        $this->assertFalse(writer::with_context(\context_module::instance($otheractivity->cmid))->has_any_data());
        $this->assertStringNotContainsString('other-answer', json_encode($assessment, JSON_THROW_ON_ERROR));
    }

    public function test_export_rejects_corrupt_persisted_state_without_exposing_payload(): void {
        global $DB;

        $this->resetAfterTest();
        $activity = $this->create_activity('Corrupt privacy export');
        $user = $this->getDataGenerator()->create_user();
        $this->insert_assessment_state($activity->id, $user->id);
        $DB->set_field(
            'scaffold_assessment_state',
            'snapshotjson',
            '{"answer":"secret-answer"',
            ['scaffoldid' => $activity->id, 'userid' => $user->id],
        );

        try {
            provider::export_user_data(new approved_contextlist(
                $user,
                'mod_scaffold',
                [$activity->contextid],
            ));
            $this->fail('Expected corrupt persisted state to block privacy export');
        } catch (\invalid_parameter_exception $exception) {
            $this->assertStringNotContainsString('secret-answer', $exception->getMessage());
        }
    }

    public function test_delete_data_for_user_is_context_scoped_and_preserves_course_media(): void {
        $this->resetAfterTest();
        $activity = $this->create_activity('Single-user deletion');
        $otheractivity = $this->create_activity('Unapproved deletion');
        $user = $this->getDataGenerator()->create_user();
        $otheruser = $this->getDataGenerator()->create_user();
        $this->insert_all_personal_rows($activity->id, $user->id);
        $this->insert_all_personal_rows($activity->id, $otheruser->id);
        $this->insert_all_personal_rows($otheractivity->id, $user->id);
        $media = $this->create_course_media($activity, 'preserved.txt');

        provider::delete_data_for_user(new approved_contextlist(
            $user,
            'mod_scaffold',
            [\context_system::instance()->id, $activity->contextid],
        ));

        $this->assert_personal_rows_exist($activity->id, $user->id, false);
        $this->assert_personal_rows_exist($activity->id, $otheruser->id, true);
        $this->assert_personal_rows_exist($otheractivity->id, $user->id, true);
        $this->assertNotFalse(get_file_storage()->get_file_by_id($media->get_id()));
    }

    public function test_delete_data_for_users_removes_only_approved_users(): void {
        $this->resetAfterTest();
        $activity = $this->create_activity('Bulk-user deletion');
        $firstuser = $this->getDataGenerator()->create_user();
        $seconduser = $this->getDataGenerator()->create_user();
        $remaininguser = $this->getDataGenerator()->create_user();
        foreach ([$firstuser, $seconduser, $remaininguser] as $user) {
            $this->insert_all_personal_rows($activity->id, $user->id);
        }

        provider::delete_data_for_users(new approved_userlist(
            \context_module::instance($activity->cmid),
            'mod_scaffold',
            [$firstuser->id, $seconduser->id, 999999999],
        ));

        $this->assert_personal_rows_exist($activity->id, $firstuser->id, false);
        $this->assert_personal_rows_exist($activity->id, $seconduser->id, false);
        $this->assert_personal_rows_exist($activity->id, $remaininguser->id, true);
    }

    public function test_delete_data_for_all_users_is_context_scoped(): void {
        $this->resetAfterTest();
        $activity = $this->create_activity('Context deletion');
        $otheractivity = $this->create_activity('Other context');
        $firstuser = $this->getDataGenerator()->create_user();
        $seconduser = $this->getDataGenerator()->create_user();
        foreach ([$firstuser, $seconduser] as $user) {
            $this->insert_all_personal_rows($activity->id, $user->id);
            $this->insert_all_personal_rows($otheractivity->id, $user->id);
        }

        provider::delete_data_for_all_users_in_context(\context_system::instance());
        provider::delete_data_for_all_users_in_context(\context_module::instance($activity->cmid));

        foreach ([$firstuser, $seconduser] as $user) {
            $this->assert_personal_rows_exist($activity->id, $user->id, false);
            $this->assert_personal_rows_exist($otheractivity->id, $user->id, true);
        }
    }

    private function create_activity(string $name): \stdClass {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $course = $this->getDataGenerator()->create_course();
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => $name,
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
        $context = \context_module::instance($cmid);

        return (object) [
            'id' => $activityid,
            'cmid' => $cmid,
            'contextid' => $context->id,
        ];
    }

    private function insert_assessment_state(
        int $scaffoldid,
        int $userid,
        ?\stdClass $snapshot = null,
        int $staterevision = 1,
        int $timecreated = 1,
        int $timemodified = 2,
    ): void {
        global $DB;

        $DB->insert_record('scaffold_assessment_state', (object) [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
            'snapshotjson' => json_encode($snapshot ?? (object) [], JSON_THROW_ON_ERROR),
            'staterevision' => $staterevision,
            'nextquizexpiry' => null,
            'timecreated' => $timecreated,
            'timemodified' => $timemodified,
        ]);
    }

    private function insert_learner_activity(
        int $scaffoldid,
        int $userid,
        ?\stdClass $snapshot = null,
        int $timecreated = 1,
        int $timemodified = 2,
    ): void {
        global $DB;

        $DB->insert_record('scaffold_learner_activity', (object) [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
            'snapshotjson' => json_encode($snapshot ?? (object) [], JSON_THROW_ON_ERROR),
            'timecreated' => $timecreated,
            'timemodified' => $timemodified,
        ]);
    }

    private function insert_grade_publication(
        int $scaffoldid,
        int $userid,
        int $staterevision = 1,
        int $definitionversion = 1,
        string $status = 'pending',
        ?string $failurecode = null,
        int $retrycount = 0,
        ?int $retryafter = null,
        int $timecreated = 1,
        int $timemodified = 2,
    ): void {
        global $DB;

        $DB->insert_record('scaffold_grade_publications', (object) [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
            'staterevision' => $staterevision,
            'definitionversion' => $definitionversion,
            'status' => $status,
            'failurecode' => $failurecode,
            'retrycount' => $retrycount,
            'retryafter' => $retryafter,
            'timecreated' => $timecreated,
            'timemodified' => $timemodified,
        ]);
    }

    private function insert_all_personal_rows(int $scaffoldid, int $userid): void {
        $this->insert_assessment_state($scaffoldid, $userid);
        $this->insert_learner_activity($scaffoldid, $userid);
        $this->insert_grade_publication($scaffoldid, $userid);
    }

    private function assert_personal_rows_exist(int $scaffoldid, int $userid, bool $expected): void {
        global $DB;

        foreach ([
            'scaffold_assessment_state',
            'scaffold_learner_activity',
            'scaffold_grade_publications',
        ] as $table) {
            $this->assertSame($expected, $DB->record_exists($table, [
                'scaffoldid' => $scaffoldid,
                'userid' => $userid,
            ]));
        }
    }

    private function create_course_media(\stdClass $activity, string $filename): \stored_file {
        return get_file_storage()->create_file_from_string([
            'contextid' => $activity->contextid,
            'component' => 'mod_scaffold',
            'filearea' => 'media',
            'itemid' => $activity->id,
            'filepath' => '/',
            'filename' => $filename,
            'userid' => 0,
        ], 'course-owned media');
    }

    private static function assessment_snapshot(int $cmid, string $response): \stdClass {
        return (object) [
            'snapshotVersion' => 1,
            'artifactId' => 'moodle-cm-' . $cmid,
            'problems' => (object) [
                'problem-1' => (object) [
                    'response' => (object) [
                        'kind' => 'single-select',
                        'optionId' => $response,
                    ],
                    'attemptNumber' => 1,
                    'hintsShown' => 0,
                    'checkResult' => null,
                    'submitted' => false,
                    'submissionResult' => null,
                ],
            ],
            'quizzes' => (object) [],
        ];
    }

    private static function learner_activity_snapshot(int $cmid, string $blockid): \stdClass {
        return (object) [
            'snapshotVersion' => 1,
            'artifactId' => 'moodle-cm-' . $cmid,
            'activities' => (object) [
                $blockid => (object) [
                    'activityKind' => 'checklist',
                    'data' => (object) ['position' => 1],
                    'completed' => true,
                    'updatedAt' => '2026-07-18T12:00:00.000000Z',
                ],
            ],
        ];
    }
}

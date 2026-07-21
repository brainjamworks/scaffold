<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\assessment_state_repository;
use mod_scaffold\local\assessment_service;
use mod_scaffold\local\activity_scope;
use mod_scaffold\local\artifact_identity;
use mod_scaffold\local\content_service;
use mod_scaffold\local\quiz_expiry_reconciler;

defined('MOODLE_INTERNAL') || die();

final class quiz_expiry_tracking_repository extends assessment_state_repository {
    public bool $mutationactive = false;

    public function mutate_state(
        int $scaffoldid,
        int $userid,
        string $artifactid,
        callable $mutation,
    ): \stdClass {
        $this->mutationactive = true;
        try {
            return parent::mutate_state($scaffoldid, $userid, $artifactid, $mutation);
        } finally {
            $this->mutationactive = false;
        }
    }
}

/**
 * Verifies server-authoritative Quiz expiry against real Moodle DML and locks.
 *
 * @covers \mod_scaffold\local\quiz_expiry_reconciler
 */
final class quiz_expiry_test extends \advanced_testcase {
    public function test_learner_load_reconciles_once_after_commit_while_authoring_load_stays_read_only(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user, $course] = $this->create_fixture();
        $artifactid = artifact_identity::for_course_module((int) $cm->id);
        $repository = new quiz_expiry_tracking_repository();
        $repository->mutate_state(
            (int) $scaffold->id,
            (int) $user->id,
            $artifactid,
            static function(\stdClass $snapshot): \stdClass {
                $snapshot->quizzes->{'quiz-due-graded'} = self::attempt(
                    'attempt-lazy',
                    '2026-07-18T09:59:59.000000Z',
                    'quiz-due-graded-question-1',
                );
                return $snapshot;
            },
        );
        $gradecalls = [];
        $completioncalls = [];
        $reconciler = new quiz_expiry_reconciler(
            $repository,
            null,
            static fn(): string => '2026-07-18T10:00:00.000000Z',
            static function(\stdClass $activity, int $userid, string $artifactid) use (
                $repository,
                &$gradecalls,
            ): \stdClass {
                $gradecalls[] = [$repository->mutationactive, (int) $activity->id, $userid, $artifactid];
                return (object) ['status' => 'published'];
            },
            static function(\stdClass $activity, $cm, int $userid) use ($repository, &$completioncalls): void {
                $completioncalls[] = [
                    $repository->mutationactive,
                    (int) $activity->id,
                    (int) $cm->id,
                    $userid,
                ];
            },
        );
        $service = new content_service(null, null, $reconciler);
        $context = \context_module::instance((int) $cm->id);

        $author = $this->getDataGenerator()->create_user();
        $authorscope = new activity_scope(
            $course,
            $cm,
            $context,
            $scaffold,
            (int) $author->id,
            'mod/scaffold:editcontent',
        );
        $service->payload($authorscope, 'authoring');
        $this->assertFalse($DB->record_exists('scaffold_assessment_state', [
            'scaffoldid' => $scaffold->id,
            'userid' => $author->id,
        ]));

        $learnerscope = new activity_scope(
            $course,
            $cm,
            $context,
            $scaffold,
            (int) $user->id,
            'mod/scaffold:view',
        );
        $payload = $service->payload($learnerscope, 'learner');
        $snapshot = json_decode($payload['assessmentSnapshotJson'], false, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('expired', $snapshot->quizzes->{'quiz-due-graded'}->status);
        $this->assertSame([[false, (int) $scaffold->id, (int) $user->id, $artifactid]], $gradecalls);
        $this->assertSame([
            [false, (int) $scaffold->id, (int) $cm->id, (int) $user->id],
        ], $completioncalls);

        $service->payload($learnerscope, 'learner');
        $this->assertCount(1, $gradecalls);
        $this->assertCount(1, $completioncalls);
    }

    public function test_post_deadline_command_observes_expired_state_before_sequence_policy(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user, $course] = $this->create_fixture();
        $artifactid = artifact_identity::for_course_module((int) $cm->id);
        $repository = new assessment_state_repository();
        $repository->mutate_state(
            (int) $scaffold->id,
            (int) $user->id,
            $artifactid,
            static function(\stdClass $snapshot): \stdClass {
                $snapshot->quizzes->{'quiz-due-graded'} = self::attempt(
                    'attempt-command',
                    '2026-07-18T09:59:59.000000Z',
                    'quiz-due-graded-question-1',
                );
                return $snapshot;
            },
        );
        $gradecalls = 0;
        $completioncalls = 0;
        $reconciler = new quiz_expiry_reconciler(
            $repository,
            null,
            static fn(): string => '2026-07-18T10:00:00.000000Z',
            static function() use (&$gradecalls): \stdClass {
                $gradecalls++;
                return (object) ['status' => 'published'];
            },
            static function() use (&$completioncalls): void {
                $completioncalls++;
            },
        );
        $service = new assessment_service(null, null, null, null, null, $reconciler);
        $scope = new activity_scope(
            $course,
            $cm,
            \context_module::instance((int) $cm->id),
            $scaffold,
            (int) $user->id,
            'mod/scaffold:submit',
        );

        $result = $service->submit_quiz_question(
            $scope,
            'attempt-command',
            'quiz-due-graded',
            'quiz-due-graded-question-1',
            ['kind' => 'single-select', 'optionId' => 'option-b'],
            0,
        );
        $this->assertSame('expired', $result['outcome']->quizAttempt->status);
        $this->assertSame([], get_object_vars($result['outcome']->problemsByTargetId));
        $this->assertSame(1, $gradecalls);
        $this->assertSame(1, $completioncalls);
        $this->assertSame(2, (int) $DB->get_field(
            'scaffold_assessment_state',
            'staterevision',
            ['scaffoldid' => $scaffold->id, 'userid' => $user->id],
            MUST_EXIST,
        ));
    }

    public function test_reconcile_expires_every_due_quiz_in_one_revision_and_preserves_future_work(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user] = $this->create_fixture();
        $artifactid = artifact_identity::for_course_module((int) $cm->id);
        $repository = new assessment_state_repository();
        $repository->mutate_state(
            (int) $scaffold->id,
            (int) $user->id,
            $artifactid,
            static function(\stdClass $snapshot): \stdClass {
                $snapshot->quizzes->{'quiz-due-graded'} = self::attempt(
                    'attempt-due-graded',
                    '2026-07-18T09:59:59.000000Z',
                    'quiz-due-graded-question-1',
                );
                $snapshot->quizzes->{'quiz-due-ungraded'} = self::attempt(
                    'attempt-due-ungraded',
                    '2026-07-18T10:00:00.000000Z',
                    'quiz-due-ungraded-question-1',
                );
                $snapshot->quizzes->{'quiz-future'} = self::attempt(
                    'attempt-future',
                    '2026-07-18T10:10:00.000000Z',
                    'quiz-future-question-1',
                );
                return $snapshot;
            },
        );

        $reconciler = new quiz_expiry_reconciler(
            $repository,
            null,
            static fn(): string => '2026-07-18T10:00:00.000000Z',
        );
        $outcome = $reconciler->reconcile_user($scaffold, (int) $user->id, $artifactid);

        $this->assertTrue($outcome->changed);
        $this->assertSame(2, $outcome->stateRevision);
        $this->assertSame(['quiz-due-graded', 'quiz-due-ungraded'], $outcome->expiredGroupIds);
        $this->assertTrue($outcome->gradeRequired);
        $this->assertTrue($outcome->completionRequired);
        $row = $DB->get_record('scaffold_assessment_state', [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ], '*', MUST_EXIST);
        $snapshot = json_decode((string) $row->snapshotjson, false, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('expired', $snapshot->quizzes->{'quiz-due-graded'}->status);
        $this->assertSame('expired', $snapshot->quizzes->{'quiz-due-ungraded'}->status);
        $this->assertSame('in_progress', $snapshot->quizzes->{'quiz-future'}->status);
        $this->assertSame(strtotime('2026-07-18T10:10:00.000000Z'), (int) $row->nextquizexpiry);

        $before = serialize($row);
        $repeat = $reconciler->reconcile_user($scaffold, (int) $user->id, $artifactid);
        $this->assertFalse($repeat->changed);
        $this->assertSame([], $repeat->expiredGroupIds);
        $this->assertSame($before, serialize($DB->get_record(
            'scaffold_assessment_state',
            ['scaffoldid' => $scaffold->id, 'userid' => $user->id],
            '*',
            MUST_EXIST,
        )));

        $request = $repository->mutate_state(
            (int) $scaffold->id,
            (int) $user->id,
            $artifactid,
            static function(\stdClass $current): \stdClass {
                if ($current->quizzes->{'quiz-due-graded'}->status === 'in_progress') {
                    $current->quizzes->{'quiz-due-graded'}->currentTargetId = null;
                }
                return $current;
            },
        );
        $this->assertFalse($request->changed, 'serialized request must observe the already-expired state');
        $this->assertSame(2, $request->stateRevision);
    }

    public function test_reconcile_rejects_corrupt_stored_deadline_without_rewriting_state(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm, $user] = $this->create_fixture();
        $artifactid = artifact_identity::for_course_module((int) $cm->id);
        $snapshot = (object) [
            'snapshotVersion' => 1,
            'artifactId' => $artifactid,
            'problems' => (object) [],
            'quizzes' => (object) [
                'quiz-due-graded' => self::attempt(
                    'attempt-corrupt',
                    'not-a-deadline',
                    'quiz-due-graded-question-1',
                ),
            ],
        ];
        $recordid = $DB->insert_record('scaffold_assessment_state', (object) [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
            'snapshotjson' => json_encode($snapshot, JSON_THROW_ON_ERROR),
            'staterevision' => 1,
            'nextquizexpiry' => 1,
            'timecreated' => 1,
            'timemodified' => 1,
        ]);
        $before = serialize($DB->get_record('scaffold_assessment_state', ['id' => $recordid], '*', MUST_EXIST));

        try {
            (new quiz_expiry_reconciler(
                null,
                null,
                static fn(): string => '2026-07-18T10:00:00.000000Z',
            ))->reconcile_user($scaffold, (int) $user->id, $artifactid);
            $this->fail('Expected corrupt stored deadline rejection');
        } catch (\invalid_parameter_exception) {
            $this->addToAssertionCount(1);
        }
        $this->assertSame(
            $before,
            serialize($DB->get_record('scaffold_assessment_state', ['id' => $recordid], '*', MUST_EXIST)),
        );
    }

    private function create_fixture(): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $course = $this->getDataGenerator()->create_course();
        $scaffoldid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Quiz expiry fixture',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
            'completionactivitystatus' => 1,
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
        $scaffold = $DB->get_record('scaffold', ['id' => $scaffoldid], '*', MUST_EXIST);
        $targets = [];
        foreach (['quiz-due-graded', 'quiz-due-ungraded', 'quiz-future'] as $groupid) {
            $targets[] = self::target($groupid . '-question-1');
            $targets[] = self::target($groupid . '-question-2');
        }
        $groups = [
            self::group('quiz-due-graded', true, 'after_each_answer'),
            self::group('quiz-due-ungraded', false),
            self::group('quiz-future', true),
        ];
        $DB->set_field('scaffold', 'assessmenttargetsjson', json_encode($targets, JSON_THROW_ON_ERROR), [
            'id' => $scaffoldid,
        ]);
        $DB->set_field('scaffold', 'assessmentgroupsjson', json_encode($groups, JSON_THROW_ON_ERROR), [
            'id' => $scaffoldid,
        ]);
        $scaffold = $DB->get_record('scaffold', ['id' => $scaffoldid], '*', MUST_EXIST);
        $user = $this->getDataGenerator()->create_user();
        return [$scaffold, get_fast_modinfo($course)->get_cm($cmid), $user, $course];
    }

    private static function target(string $targetid): array {
        return [
            'schemaVersion' => 1,
            'targetId' => $targetid,
            'blockId' => $targetid,
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

    private static function group(
        string $groupid,
        bool $isgraded,
        string $reviewtiming = 'after_quiz',
    ): array {
        return [
            'schemaVersion' => 1,
            'kind' => 'quiz',
            'groupId' => $groupid,
            'targetIds' => [$groupid . '-question-1', $groupid . '-question-2'],
            'settings' => [
                'allowBacktracking' => false,
                'reviewTiming' => $reviewtiming,
                'reviewDetail' => 'full_review',
                'attemptsPerQuestion' => 1,
                'isGraded' => $isgraded,
                'timer' => ['enabled' => true, 'durationSeconds' => 60],
            ],
        ];
    }

    private static function attempt(string $attemptid, string $expiresat, string $currenttargetid): \stdClass {
        return (object) [
            'attemptId' => $attemptid,
            'status' => 'in_progress',
            'currentTargetId' => $currenttargetid,
            'submittedTargetIds' => [],
            'startedAt' => '2026-07-18T09:00:00.000000Z',
            'finishedAt' => null,
            'expiresAt' => $expiresat,
            'score' => null,
            'maxScore' => null,
            'resultsByTargetId' => (object) [],
            'answerReviewAuthorized' => false,
        ];
    }
}

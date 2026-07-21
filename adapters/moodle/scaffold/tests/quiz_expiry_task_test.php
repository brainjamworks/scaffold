<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold;

use mod_scaffold\local\assessment_state_repository;
use mod_scaffold\local\artifact_identity;
use mod_scaffold\local\quiz_expiry_reconciler;

defined('MOODLE_INTERNAL') || die();

final class quiz_expiry_task_under_test extends \mod_scaffold\task\reconcile_quiz_expiry {
    public function __construct(
        private readonly quiz_expiry_reconciler $reconciler,
        private readonly int $limit,
    ) {
    }

    protected function create_reconciler(): quiz_expiry_reconciler {
        return $this->reconciler;
    }

    protected function batch_limit(): int {
        return $this->limit;
    }
}

final class quiz_expiry_unavailable_lock_factory {
    public function get_lock(string $resource, int $timeout): bool {
        return false;
    }
}

/**
 * Verifies bounded scheduled Quiz expiry recovery against Moodle DML.
 *
 * @covers \mod_scaffold\task\reconcile_quiz_expiry
 * @covers \mod_scaffold\local\quiz_expiry_reconciler
 */
final class quiz_expiry_task_test extends \advanced_testcase {
    private const NOW = '2026-07-18T10:00:00.000000Z';

    public function test_task_processes_only_a_bounded_due_batch_and_applies_effects_once(): void {
        $this->resetAfterTest();
        [$scaffold, $cm] = $this->create_fixture();
        $users = [
            $this->getDataGenerator()->create_user(),
            $this->getDataGenerator()->create_user(),
            $this->getDataGenerator()->create_user(),
            $this->getDataGenerator()->create_user(),
        ];
        $artifactid = artifact_identity::for_course_module((int) $cm->id);
        $repository = new assessment_state_repository();
        foreach (array_slice($users, 0, 3) as $index => $user) {
            $this->create_state(
                $repository,
                $scaffold,
                (int) $user->id,
                $artifactid,
                'attempt-due-' . $index,
                '2026-07-18T09:59:59.000000Z',
            );
        }
        $this->create_state(
            $repository,
            $scaffold,
            (int) $users[3]->id,
            $artifactid,
            'attempt-future',
            '2026-07-18T10:10:00.000000Z',
        );

        $gradecalls = [];
        $completioncalls = [];
        $reconciler = new quiz_expiry_reconciler(
            $repository,
            null,
            static fn(): string => self::NOW,
            static function(\stdClass $activity, int $userid, string $artifactid) use (&$gradecalls): \stdClass {
                $gradecalls[] = [(int) $activity->id, $userid, $artifactid];
                return (object) ['status' => 'published'];
            },
            static function(
                \stdClass $activity,
                \cm_info $cm,
                int $userid,
            ) use (&$completioncalls): void {
                $completioncalls[] = [(int) $activity->id, (int) $cm->id, $userid];
            },
        );

        $firstoutput = $this->execute_task(new quiz_expiry_task_under_test($reconciler, 2));
        $this->assertStringContainsString('selected=2 changed=2 unchanged=0 skipped=0 failed=0', $firstoutput);
        $this->assertSame('expired', $this->quiz_status($scaffold, $users[0]));
        $this->assertSame('expired', $this->quiz_status($scaffold, $users[1]));
        $this->assertSame('in_progress', $this->quiz_status($scaffold, $users[2]));
        $this->assertSame('in_progress', $this->quiz_status($scaffold, $users[3]));
        $this->assertCount(2, $gradecalls);
        $this->assertCount(2, $completioncalls);
        $this->assertStringNotContainsString('attempt-due', $firstoutput);

        $secondoutput = $this->execute_task(new quiz_expiry_task_under_test($reconciler, 2));
        $this->assertStringContainsString('selected=1 changed=1 unchanged=0 skipped=0 failed=0', $secondoutput);
        $this->assertSame('expired', $this->quiz_status($scaffold, $users[2]));
        $this->assertSame('in_progress', $this->quiz_status($scaffold, $users[3]));
        $this->assertCount(3, $gradecalls);
        $this->assertCount(3, $completioncalls);

        $repeatoutput = $this->execute_task(new quiz_expiry_task_under_test($reconciler, 2));
        $this->assertStringContainsString('selected=0 changed=0 unchanged=0 skipped=0 failed=0', $repeatoutput);
        $this->assertCount(3, $gradecalls);
        $this->assertCount(3, $completioncalls);
    }

    public function test_batch_applies_real_moodle_completion_for_expired_quiz(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm] = $this->create_fixture();
        $user = $this->getDataGenerator()->create_and_enrol(get_course((int) $scaffold->course), 'student');
        $artifactid = artifact_identity::for_course_module((int) $cm->id);
        $repository = new assessment_state_repository();
        $this->create_state(
            $repository,
            $scaffold,
            (int) $user->id,
            $artifactid,
            'attempt-real-completion',
            '2026-07-18T09:59:59.000000Z',
        );
        $reconciler = new quiz_expiry_reconciler(
            $repository,
            null,
            static fn(): string => self::NOW,
            static fn(): \stdClass => (object) ['status' => 'published'],
        );

        $outcome = $reconciler->reconcile_due_batch(10);

        $this->assertSame(1, $outcome->changed);
        $this->assertSame(COMPLETION_COMPLETE, (int) $DB->get_field(
            'course_modules_completion',
            'completionstate',
            ['coursemoduleid' => $cm->id, 'userid' => $user->id],
            MUST_EXIST,
        ));
    }

    public function test_task_revalidates_stale_deadlines_and_continues_after_missing_or_corrupt_rows(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm] = $this->create_fixture();
        $artifactid = artifact_identity::for_course_module((int) $cm->id);
        $repository = new assessment_state_repository();
        $staleuser = $this->getDataGenerator()->create_user();
        $validuser = $this->getDataGenerator()->create_user();
        $missingactivityuser = $this->getDataGenerator()->create_user();
        $corruptuser = $this->getDataGenerator()->create_user();
        $this->create_state(
            $repository,
            $scaffold,
            (int) $staleuser->id,
            $artifactid,
            'attempt-stale',
            '2026-07-18T10:10:00.000000Z',
        );
        $DB->set_field('scaffold_assessment_state', 'nextquizexpiry', strtotime(self::NOW) - 1, [
            'scaffoldid' => $scaffold->id,
            'userid' => $staleuser->id,
        ]);
        $this->create_state(
            $repository,
            $scaffold,
            (int) $validuser->id,
            $artifactid,
            'attempt-valid',
            '2026-07-18T09:59:59.000000Z',
        );
        $this->insert_candidate(
            999999,
            (int) $missingactivityuser->id,
            'moodle-cm-missing',
            self::attempt('attempt-missing-activity', '2026-07-18T09:59:59.000000Z'),
        );
        $this->insert_candidate(
            (int) $scaffold->id,
            999999,
            $artifactid,
            self::attempt('attempt-missing-user', '2026-07-18T09:59:59.000000Z'),
        );
        $corruptid = $this->insert_candidate(
            (int) $scaffold->id,
            (int) $corruptuser->id,
            $artifactid,
            null,
        );

        $output = $this->execute_task(new quiz_expiry_task_under_test(
            new quiz_expiry_reconciler(
                $repository,
                null,
                static fn(): string => self::NOW,
                static fn(): \stdClass => (object) ['status' => 'published'],
                static function(): void {
                },
            ),
            10,
        ));

        $this->assertStringContainsString('selected=5 changed=1 unchanged=1 skipped=2 failed=1', $output);
        $this->assertStringContainsString('status=missing_activity', $output);
        $this->assertStringContainsString('status=missing_user', $output);
        $this->assertMatchesRegularExpression(
            '/state=' . $corruptid . ' activity=\d+ user=\d+ status=reconcile_failed/',
            $output,
        );
        $this->assertSame('in_progress', $this->quiz_status($scaffold, $staleuser));
        $this->assertSame('expired', $this->quiz_status($scaffold, $validuser));
        $this->assertStringNotContainsString('attempt-missing', $output);
    }

    public function test_lock_contention_leaves_the_candidate_eligible_for_a_later_run(): void {
        global $DB;

        $this->resetAfterTest();
        [$scaffold, $cm] = $this->create_fixture();
        $user = $this->getDataGenerator()->create_user();
        $artifactid = artifact_identity::for_course_module((int) $cm->id);
        $repository = new assessment_state_repository();
        $this->create_state(
            $repository,
            $scaffold,
            (int) $user->id,
            $artifactid,
            'attempt-contended',
            '2026-07-18T09:59:59.000000Z',
        );
        $nextquizexpiry = (int) $DB->get_field('scaffold_assessment_state', 'nextquizexpiry', [
            'scaffoldid' => $scaffold->id,
            'userid' => $user->id,
        ], MUST_EXIST);
        $contended = new quiz_expiry_reconciler(
            new assessment_state_repository($DB, new quiz_expiry_unavailable_lock_factory()),
            null,
            static fn(): string => self::NOW,
        );

        $failedoutput = $this->execute_task(new quiz_expiry_task_under_test($contended, 10));
        $this->assertStringContainsString('selected=1 changed=0 unchanged=0 skipped=0 failed=1', $failedoutput);
        $this->assertStringContainsString('status=lock_unavailable', $failedoutput);
        $this->assertSame('in_progress', $this->quiz_status($scaffold, $user));
        $this->assertSame($nextquizexpiry, (int) $DB->get_field(
            'scaffold_assessment_state',
            'nextquizexpiry',
            ['scaffoldid' => $scaffold->id, 'userid' => $user->id],
            MUST_EXIST,
        ));

        $recoveredoutput = $this->execute_task(new quiz_expiry_task_under_test(
            new quiz_expiry_reconciler(
                $repository,
                null,
                static fn(): string => self::NOW,
                static fn(): \stdClass => (object) ['status' => 'published'],
                static function(): void {
                },
            ),
            10,
        ));
        $this->assertStringContainsString('selected=1 changed=1 unchanged=0 skipped=0 failed=0', $recoveredoutput);
        $this->assertSame('expired', $this->quiz_status($scaffold, $user));
    }

    private function create_fixture(): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $course = $this->getDataGenerator()->create_course(['enablecompletion' => 1]);
        $scaffoldid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Quiz expiry task fixture',
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
            'completion' => COMPLETION_TRACKING_AUTOMATIC,
            'completiongradeitemnumber' => null,
            'completionview' => 0,
            'completionexpected' => 0,
            'completionpassgrade' => 0,
            'showdescription' => 0,
        ]);
        course_add_cm_to_section($course, $cmid, 0);
        $targets = [self::target('question-1')];
        $groups = [self::group('quiz-due-graded')];
        $DB->set_field('scaffold', 'assessmenttargetsjson', json_encode($targets, JSON_THROW_ON_ERROR), [
            'id' => $scaffoldid,
        ]);
        $DB->set_field('scaffold', 'assessmentgroupsjson', json_encode($groups, JSON_THROW_ON_ERROR), [
            'id' => $scaffoldid,
        ]);
        $scaffold = $DB->get_record('scaffold', ['id' => $scaffoldid], '*', MUST_EXIST);
        return [$scaffold, get_fast_modinfo($course)->get_cm($cmid)];
    }

    private function create_state(
        assessment_state_repository $repository,
        \stdClass $scaffold,
        int $userid,
        string $artifactid,
        string $attemptid,
        string $expiresat,
    ): void {
        $repository->mutate_state(
            (int) $scaffold->id,
            $userid,
            $artifactid,
            static function(\stdClass $snapshot) use ($attemptid, $expiresat): \stdClass {
                $snapshot->quizzes->{'quiz-due-graded'} = self::attempt($attemptid, $expiresat);
                return $snapshot;
            },
        );
    }

    private function insert_candidate(
        int $scaffoldid,
        int $userid,
        string $artifactid,
        ?\stdClass $attempt,
    ): int {
        global $DB;

        $snapshotjson = $attempt === null
            ? '{invalid'
            : json_encode((object) [
                'snapshotVersion' => 1,
                'artifactId' => $artifactid,
                'problems' => (object) [],
                'quizzes' => (object) ['quiz-due-graded' => $attempt],
            ], JSON_THROW_ON_ERROR);
        return (int) $DB->insert_record('scaffold_assessment_state', (object) [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
            'snapshotjson' => $snapshotjson,
            'staterevision' => 1,
            'nextquizexpiry' => strtotime(self::NOW) - 1,
            'timecreated' => strtotime(self::NOW) - 60,
            'timemodified' => strtotime(self::NOW) - 60,
        ]);
    }

    private function quiz_status(\stdClass $scaffold, \stdClass $user): string {
        global $DB;

        $snapshot = json_decode((string) $DB->get_field(
            'scaffold_assessment_state',
            'snapshotjson',
            ['scaffoldid' => $scaffold->id, 'userid' => $user->id],
            MUST_EXIST,
        ), false, 512, JSON_THROW_ON_ERROR);
        return (string) $snapshot->quizzes->{'quiz-due-graded'}->status;
    }

    private function execute_task(quiz_expiry_task_under_test $task): string {
        ob_start();
        try {
            $task->execute();
            return (string) ob_get_contents();
        } finally {
            ob_end_clean();
        }
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

    private static function group(string $groupid): array {
        return [
            'schemaVersion' => 1,
            'kind' => 'quiz',
            'groupId' => $groupid,
            'targetIds' => ['question-1'],
            'settings' => [
                'allowBacktracking' => false,
                'reviewTiming' => 'after_each_answer',
                'reviewDetail' => 'full_review',
                'attemptsPerQuestion' => 1,
                'isGraded' => true,
                'timer' => ['enabled' => true, 'durationSeconds' => 60],
            ],
        ];
    }

    private static function attempt(string $attemptid, string $expiresat): \stdClass {
        return (object) [
            'attemptId' => $attemptid,
            'status' => 'in_progress',
            'currentTargetId' => 'question-1',
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

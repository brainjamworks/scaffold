<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

require_once(__DIR__ . '/artifact_identity.php');
require_once(__DIR__ . '/assessment_projection.php');

final class expiry_outcome {
    public function __construct(
        public bool $changed,
        public int $stateRevision,
        public string $changedAt,
        public array $expiredGroupIds,
        public bool $gradeRequired,
        public bool $completionRequired,
        public \stdClass $snapshot,
        public ?\stdClass $gradePublication = null,
    ) {
    }
}

final class expiry_batch_outcome {
    public function __construct(
        public int $selected,
        public int $changed,
        public int $unchanged,
        public int $skipped,
        public int $failed,
        public array $events,
    ) {
    }
}

/**
 * Owns the locked, idempotent server-time Quiz expiry transition.
 */
final class quiz_expiry_reconciler {
    private assessment_state_repository $repository;
    private assessment_quiz $quiz;
    private \Closure $clock;
    private \Closure $gradepublisher;
    private \Closure $completionupdater;

    public function __construct(
        ?assessment_state_repository $repository = null,
        ?assessment_quiz $quiz = null,
        ?callable $clock = null,
        ?callable $gradepublisher = null,
        ?callable $completionupdater = null,
    ) {
        $this->repository = $repository ?? new assessment_state_repository();
        $this->quiz = $quiz ?? new assessment_quiz();
        $this->clock = \Closure::fromCallable($clock ?? static function(): string {
            $now = microtime(true);
            $seconds = (int) floor($now);
            $micros = (int) floor(($now - $seconds) * 1000000);
            return gmdate('Y-m-d\TH:i:s', $seconds) . sprintf('.%06dZ', $micros);
        });
        $this->gradepublisher = \Closure::fromCallable(
            $gradepublisher ?? static fn(\stdClass $scaffold, int $userid, string $artifactid): ?\stdClass =>
                (new grade_publisher())->publish_user($scaffold, $userid),
        );
        $this->completionupdater = \Closure::fromCallable(
            $completionupdater ?? static function(\stdClass $scaffold, $cm, int $userid): void {
                global $CFG;

                require_once($CFG->dirroot . '/mod/scaffold/lib.php');
                scaffold_update_completion($scaffold, $cm, $userid);
            },
        );
    }

    public function reconcile_user(
        \stdClass $scaffold,
        int $userid,
        string $artifactid,
    ): expiry_outcome {
        $projection = assessment_projection::for_activity($scaffold);
        $now = ($this->clock)();
        if (!is_string($now)) {
            throw new \invalid_parameter_exception('Server Quiz reconciliation time is invalid');
        }

        $states = $this->repository->find_states_for_activity(
            (int) $scaffold->id,
            $artifactid,
            $userid,
        );
        if (!isset($states[$userid])) {
            return new expiry_outcome(
                false,
                0,
                $now,
                [],
                false,
                false,
                (object) [
                    'snapshotVersion' => 1,
                    'artifactId' => $artifactid,
                    'problems' => (object) [],
                    'quizzes' => (object) [],
                ],
            );
        }
        $current = $states[$userid];
        if (!self::snapshot_has_due_quiz($current->snapshot, $now)) {
            return new expiry_outcome(
                false,
                $current->stateRevision,
                $current->changedAt,
                [],
                false,
                false,
                $current->snapshot,
            );
        }

        $graderequired = self::snapshot_has_due_graded_quiz(
            $current->snapshot,
            $projection['groups'],
            $now,
        );
        $expiredgroupids = [];
        $mutation = function(\stdClass $snapshot) use (&$expiredgroupids, $now, $projection): \stdClass {
            $expiredgroupids = $this->quiz->expire_due_state(
                $snapshot,
                $projection['groups'],
                $now,
            );
            return $snapshot;
        };
        if ($graderequired) {
            $state = $this->repository->mutate_with_grade_publication_state(
                (int) $scaffold->id,
                $userid,
                $artifactid,
                $mutation,
            );
        } else {
            $state = $this->repository->mutate_state(
                (int) $scaffold->id,
                $userid,
                $artifactid,
                $mutation,
            );
        }

        return new expiry_outcome(
            $state->changed,
            $state->stateRevision,
            $state->changedAt,
            $expiredgroupids,
            $state->changed && $graderequired,
            $state->changed,
            $state->snapshot,
        );
    }

    public function reconcile_user_and_apply_effects(
        \stdClass $scaffold,
        $cm,
        int $userid,
        string $artifactid,
    ): expiry_outcome {
        $outcome = $this->reconcile_user($scaffold, $userid, $artifactid);
        if (!$outcome->changed) {
            return $outcome;
        }

        if ($outcome->completionRequired && !empty($scaffold->completionactivitystatus)) {
            try {
                ($this->completionupdater)($scaffold, $cm, $userid);
            } catch (\Throwable) {
                // Canonical Quiz expiry is already committed.
            }
        }
        if ($outcome->gradeRequired) {
            try {
                $publication = ($this->gradepublisher)($scaffold, $userid, $artifactid);
                $outcome->gradePublication = $publication instanceof \stdClass ? $publication : null;
            } catch (\Throwable) {
                $outcome->gradePublication = (object) ['status' => 'pending'];
            }
        }
        return $outcome;
    }

    public function reconcile_due_batch(int $limit): expiry_batch_outcome {
        global $DB;

        if ($limit < 1) {
            throw new \invalid_parameter_exception('Quiz expiry batch limit must be positive');
        }
        $now = ($this->clock)();
        if (!is_string($now)) {
            throw new \invalid_parameter_exception('Server Quiz reconciliation time is invalid');
        }
        try {
            $nowtimestamp = (new \DateTimeImmutable($now))->getTimestamp();
        } catch (\Throwable) {
            throw new \invalid_parameter_exception('Server Quiz reconciliation time is invalid');
        }

        $candidates = $DB->get_records_select(
            'scaffold_assessment_state',
            'nextquizexpiry IS NOT NULL AND nextquizexpiry <= :now',
            ['now' => $nowtimestamp],
            'nextquizexpiry ASC, id ASC',
            'id, scaffoldid, userid',
            0,
            $limit,
        );
        $changed = 0;
        $unchanged = 0;
        $skipped = 0;
        $failed = 0;
        $events = [];
        foreach ($candidates as $candidate) {
            $stateid = (int) $candidate->id;
            $scaffoldid = (int) $candidate->scaffoldid;
            $userid = (int) $candidate->userid;
            $event = [
                'stateId' => $stateid,
                'scaffoldId' => $scaffoldid,
                'userId' => $userid,
                'status' => '',
            ];
            $scaffold = $DB->get_record('scaffold', ['id' => $scaffoldid]);
            if (!$scaffold) {
                $event['status'] = 'missing_activity';
                $events[] = $event;
                $skipped++;
                continue;
            }
            if (!$DB->record_exists('user', ['id' => $userid])) {
                $event['status'] = 'missing_user';
                $events[] = $event;
                $skipped++;
                continue;
            }
            $cm = get_coursemodule_from_instance('scaffold', $scaffoldid, (int) $scaffold->course);
            if (!$cm) {
                $event['status'] = 'missing_activity';
                $events[] = $event;
                $skipped++;
                continue;
            }
            $cm = get_fast_modinfo((int) $scaffold->course)->get_cm((int) $cm->id);

            try {
                $outcome = $this->reconcile_user_and_apply_effects(
                    $scaffold,
                    $cm,
                    $userid,
                    artifact_identity::for_course_module((int) $cm->id),
                );
                if ($outcome->changed) {
                    $event['status'] = 'changed';
                    $changed++;
                } else {
                    $event['status'] = 'unchanged';
                    $unchanged++;
                }
            } catch (\Throwable $exception) {
                $event['status'] = self::is_lock_unavailable($exception)
                    ? 'lock_unavailable'
                    : 'reconcile_failed';
                $failed++;
            }
            $events[] = $event;
        }

        return new expiry_batch_outcome(
            count($candidates),
            $changed,
            $unchanged,
            $skipped,
            $failed,
            $events,
        );
    }

    private static function snapshot_has_due_quiz(\stdClass $snapshot, string $now): bool {
        try {
            $servernow = new \DateTimeImmutable($now);
        } catch (\Throwable) {
            throw new \invalid_parameter_exception('Server Quiz reconciliation time is invalid');
        }
        foreach (get_object_vars($snapshot->quizzes ?? (object) []) as $attempt) {
            if (!($attempt instanceof \stdClass) || ($attempt->status ?? null) !== 'in_progress') {
                continue;
            }
            $expiresat = $attempt->expiresAt ?? null;
            if ($expiresat === null) {
                continue;
            }
            if (!is_string($expiresat) || $expiresat === '') {
                throw new \invalid_parameter_exception('Stored Quiz expiry is invalid');
            }
            try {
                if (new \DateTimeImmutable($expiresat) <= $servernow) {
                    return true;
                }
            } catch (\Throwable) {
                throw new \invalid_parameter_exception('Stored Quiz expiry is invalid');
            }
        }
        return false;
    }

    private static function snapshot_has_due_graded_quiz(
        \stdClass $snapshot,
        array $groups,
        string $now,
    ): bool {
        $gradedgroups = [];
        foreach ($groups as $group) {
            if (($group['kind'] ?? null) === 'quiz'
                && ($group['settings']['isGraded'] ?? true) === true
                && is_string($group['groupId'] ?? null)) {
                $gradedgroups[$group['groupId']] = true;
            }
        }
        try {
            $servernow = new \DateTimeImmutable($now);
        } catch (\Throwable) {
            throw new \invalid_parameter_exception('Server Quiz reconciliation time is invalid');
        }
        foreach (get_object_vars($snapshot->quizzes ?? (object) []) as $groupid => $attempt) {
            if (!isset($gradedgroups[$groupid])
                || !($attempt instanceof \stdClass)
                || ($attempt->status ?? null) !== 'in_progress'
                || !is_string($attempt->expiresAt ?? null)) {
                continue;
            }
            try {
                if (new \DateTimeImmutable($attempt->expiresAt) <= $servernow) {
                    return true;
                }
            } catch (\Throwable) {
                throw new \invalid_parameter_exception('Stored Quiz expiry is invalid');
            }
        }
        return false;
    }

    private static function is_lock_unavailable(\Throwable $exception): bool {
        return $exception instanceof \moodle_exception
            && (($exception->errorcode ?? null) === 'Could not acquire assessment state lock'
                || str_contains($exception->getMessage(), 'Could not acquire assessment state lock'));
    }
}

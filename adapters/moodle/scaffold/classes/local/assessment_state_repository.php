<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

require_once(__DIR__ . '/grade_publication_repository.php');

class assessment_state_insert_collision extends \RuntimeException {
}

class assessment_state_repository {
    private const LOCK_TYPE = 'mod_scaffold_assessment_state';
    private const LOCK_TIMEOUT_SECONDS = 10;
    private const SNAPSHOT_VERSION = 1;

    private $database;
    private $lockfactory;
    private $publicationrepository;
    private \Closure $definitionversionloader;

    public function __construct(
        $database = null,
        $lockfactory = null,
        $publicationrepository = null,
        ?callable $definitionversionloader = null,
    ) {
        if ($database === null) {
            global $DB;
            $database = $DB;
        }

        $this->database = $database;
        $this->lockfactory = $lockfactory;
        $this->publicationrepository = $publicationrepository ?? new grade_publication_repository($database);
        $this->definitionversionloader = \Closure::fromCallable(
            $definitionversionloader ?? function(int $scaffoldid): int {
                return (int) $this->database->get_field(
                    'scaffold',
                    'assessmentdefinitionversion',
                    ['id' => $scaffoldid],
                    MUST_EXIST,
                );
            },
        );
    }

    public function get_or_create(int $scaffoldid, int $userid, string $artifactid): \stdClass {
        return $this->get_or_create_state($scaffoldid, $userid, $artifactid)->snapshot;
    }

    public function get_or_create_state(int $scaffoldid, int $userid, string $artifactid): \stdClass {
        return $this->with_lock(
            $scaffoldid,
            $userid,
            fn(): \stdClass => $this->transact($scaffoldid, $userid, $artifactid, null, true),
        );
    }

    public function mutate(
        int $scaffoldid,
        int $userid,
        string $artifactid,
        callable $mutation,
    ): \stdClass {
        return $this->mutate_state($scaffoldid, $userid, $artifactid, $mutation)->snapshot;
    }

    public function mutate_state(
        int $scaffoldid,
        int $userid,
        string $artifactid,
        callable $mutation,
    ): \stdClass {
        return $this->with_lock(
            $scaffoldid,
            $userid,
            fn(): \stdClass => $this->transact($scaffoldid, $userid, $artifactid, $mutation, true),
        );
    }

    public function mutate_with_grade_publication(
        int $scaffoldid,
        int $userid,
        string $artifactid,
        callable $mutation,
    ): \stdClass {
        return $this->mutate_with_grade_publication_state(
            $scaffoldid,
            $userid,
            $artifactid,
            $mutation,
        )->snapshot;
    }

    public function mutate_with_grade_publication_state(
        int $scaffoldid,
        int $userid,
        string $artifactid,
        callable $mutation,
    ): \stdClass {
        return $this->with_lock(
            $scaffoldid,
            $userid,
            fn(): \stdClass => $this->transact(
                $scaffoldid,
                $userid,
                $artifactid,
                $mutation,
                true,
                true,
            ),
        );
    }

    public function with_learner_lock(
        int $scaffoldid,
        int $userid,
        callable $operation,
    ): mixed {
        return $this->with_lock($scaffoldid, $userid, $operation);
    }

    public function find_for_activity(
        int $scaffoldid,
        string $artifactid,
        ?int $userid = null,
    ): array {
        return array_map(
            static fn(\stdClass $state): \stdClass => $state->snapshot,
            $this->find_states_for_activity($scaffoldid, $artifactid, $userid),
        );
    }

    public function find_states_for_activity(
        int $scaffoldid,
        string $artifactid,
        ?int $userid = null,
    ): array {
        $conditions = ['scaffoldid' => $scaffoldid];
        if ($userid !== null) {
            $conditions['userid'] = $userid;
        }

        $states = [];
        foreach ($this->database->get_records('scaffold_assessment_state', $conditions) as $record) {
            $recorduserid = (int) $record->userid;
            if (array_key_exists($recorduserid, $states)) {
                throw new \invalid_parameter_exception('Duplicate assessment state for learner');
            }
            $states[$recorduserid] = (object) [
                'snapshot' => $this->decode_snapshot((string) $record->snapshotjson, $artifactid),
                'changedAt' => self::changed_at((int) $record->timemodified),
                'stateRevision' => (int) ($record->staterevision ?? 1),
                'changed' => false,
            ];
        }

        return $states;
    }

    public function add_contexts_for_user(
        \core_privacy\local\request\contextlist $contextlist,
        int $userid,
    ): void {
        $sql = "SELECT DISTINCT ctx.id
                  FROM {scaffold_assessment_state} state
                  JOIN {course_modules} cm ON cm.instance = state.scaffoldid
                  JOIN {modules} module ON module.id = cm.module AND module.name = :modulename
                  JOIN {context} ctx ON ctx.instanceid = cm.id AND ctx.contextlevel = :contextlevel
                 WHERE state.userid = :userid";
        $contextlist->add_from_sql($sql, [
            'modulename' => 'scaffold',
            'contextlevel' => CONTEXT_MODULE,
            'userid' => $userid,
        ]);
    }

    public function add_users_for_activity(
        \core_privacy\local\request\userlist $userlist,
        int $scaffoldid,
    ): void {
        $sql = "SELECT DISTINCT userid
                  FROM {scaffold_assessment_state}
                 WHERE scaffoldid = :scaffoldid";
        $userlist->add_from_sql('userid', $sql, ['scaffoldid' => $scaffoldid]);
    }

    public function get_for_privacy_export(
        int $scaffoldid,
        int $userid,
        string $artifactid,
    ): ?\stdClass {
        $record = $this->database->get_record('scaffold_assessment_state', [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
        ]);
        if (!$record) {
            return null;
        }

        return (object) [
            'snapshot' => $this->decode_snapshot((string) $record->snapshotjson, $artifactid),
            'staterevision' => (int) $record->staterevision,
            'nextquizexpiry' => $record->nextquizexpiry === null ? null : (int) $record->nextquizexpiry,
            'timecreated' => (int) $record->timecreated,
            'timemodified' => (int) $record->timemodified,
        ];
    }

    public function delete_for_activity(int $scaffoldid): void {
        $this->database->delete_records('scaffold_assessment_state', ['scaffoldid' => $scaffoldid]);
    }

    public function delete_for_user_in_activity(int $scaffoldid, int $userid): void {
        $this->database->delete_records('scaffold_assessment_state', [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
        ]);
    }

    public function delete_for_users_in_activity(int $scaffoldid, array $userids): void {
        if ($userids === []) {
            return;
        }
        [$usersql, $params] = $this->database->get_in_or_equal($userids, SQL_PARAMS_NAMED, 'privacyuser');
        $this->database->delete_records_select(
            'scaffold_assessment_state',
            "scaffoldid = :scaffoldid AND userid {$usersql}",
            ['scaffoldid' => $scaffoldid] + $params,
        );
    }

    private function transact(
        int $scaffoldid,
        int $userid,
        string $artifactid,
        ?callable $mutation,
        bool $retryinsert,
        bool $stagepublication = false,
    ): \stdClass {
        try {
            return $this->transact_once(
                $scaffoldid,
                $userid,
                $artifactid,
                $mutation,
                $stagepublication,
            );
        } catch (assessment_state_insert_collision $exception) {
            if (!$retryinsert) {
                throw $exception->getPrevious() ?? $exception;
            }

            return $this->transact(
                $scaffoldid,
                $userid,
                $artifactid,
                $mutation,
                false,
                $stagepublication,
            );
        }
    }

    private function transact_once(
        int $scaffoldid,
        int $userid,
        string $artifactid,
        ?callable $mutation,
        bool $stagepublication,
    ): \stdClass {
        $transaction = $this->database->start_delegated_transaction();
        try {
            $record = $this->database->get_record('scaffold_assessment_state', [
                'scaffoldid' => $scaffoldid,
                'userid' => $userid,
            ]);
            $snapshot = $record
                ? $this->decode_snapshot((string) $record->snapshotjson, $artifactid)
                : $this->empty_snapshot($artifactid);
            $timemodified = $record ? (int) $record->timemodified : time();
            $staterevision = $record ? (int) ($record->staterevision ?? 1) : 0;
            $nextquizexpiry = $record && property_exists($record, 'nextquizexpiry')
                ? ($record->nextquizexpiry === null ? null : (int) $record->nextquizexpiry)
                : self::next_quiz_expiry($snapshot);
            $snapshotjson = null;
            $changed = $mutation !== null;

            if ($mutation !== null) {
                $originalsnapshotjson = $record ? $this->encode_snapshot($snapshot) : null;
                $timemodified = self::next_modified_time($record ? (int) $record->timemodified : null);
                $snapshot = $mutation($snapshot, self::changed_at($timemodified));
                if (!($snapshot instanceof \stdClass)) {
                    throw new \invalid_parameter_exception('Assessment state mutation must return a JSON object');
                }
                $this->validate_snapshot($snapshot, $artifactid);
                $snapshotjson = $this->encode_snapshot($snapshot);
                if ($record && $snapshotjson === $originalsnapshotjson) {
                    $changed = false;
                    $timemodified = (int) $record->timemodified;
                }
            }

            if ($changed) {
                $staterevision++;
                $nextquizexpiry = self::next_quiz_expiry($snapshot);
            }

            if (!$record || $changed) {
                if (!$record) {
                    $timemodified = self::next_modified_time(null);
                }
                $snapshotjson ??= $this->encode_snapshot($snapshot);
                if ($record) {
                    $update = (object) [
                        'id' => $record->id,
                        'snapshotjson' => $snapshotjson,
                        'staterevision' => $staterevision,
                        'nextquizexpiry' => $nextquizexpiry,
                        'timemodified' => $timemodified,
                    ];
                    $this->database->update_record('scaffold_assessment_state', $update);
                } else {
                    try {
                        $this->database->insert_record('scaffold_assessment_state', (object) [
                            'scaffoldid' => $scaffoldid,
                            'userid' => $userid,
                            'snapshotjson' => $snapshotjson,
                            'staterevision' => $staterevision,
                            'nextquizexpiry' => $nextquizexpiry,
                            'timecreated' => $timemodified,
                            'timemodified' => $timemodified,
                        ]);
                    } catch (\dml_write_exception $exception) {
                        throw new assessment_state_insert_collision(
                            'Assessment state was created concurrently',
                            0,
                            $exception,
                        );
                    }
                }
            }

            if ($stagepublication && $changed) {
                $definitionversion = ($this->definitionversionloader)($scaffoldid);
                $this->publicationrepository->upsert_pending(
                    $scaffoldid,
                    $userid,
                    $staterevision,
                    $definitionversion,
                );
            }

            $transaction->allow_commit();
            return (object) [
                'snapshot' => $snapshot,
                'changedAt' => self::changed_at($timemodified),
                'stateRevision' => $staterevision,
                'changed' => $changed,
            ];
        } catch (\Throwable $exception) {
            $transaction->rollback($exception);
        }
    }

    private function with_lock(int $scaffoldid, int $userid, callable $operation): mixed {
        $factory = $this->lockfactory ?? \core\lock\lock_config::get_lock_factory(self::LOCK_TYPE);
        $lock = $factory->get_lock(
            'activity:' . $scaffoldid . ':learner:' . $userid,
            self::LOCK_TIMEOUT_SECONDS,
        );
        if (!$lock) {
            throw new \moodle_exception('Could not acquire assessment state lock');
        }

        try {
            return $operation();
        } finally {
            $lock->release();
        }
    }

    private function empty_snapshot(string $artifactid): \stdClass {
        $snapshot = (object) [
            'snapshotVersion' => self::SNAPSHOT_VERSION,
            'artifactId' => $artifactid,
            'problems' => (object) [],
            'quizzes' => (object) [],
        ];
        $this->validate_snapshot($snapshot, $artifactid);
        return $snapshot;
    }

    private function decode_snapshot(string $raw, string $artifactid): \stdClass {
        try {
            $snapshot = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \invalid_parameter_exception('Stored assessment snapshot is invalid JSON');
        }
        if (!($snapshot instanceof \stdClass)) {
            throw new \invalid_parameter_exception('Stored assessment snapshot must be a JSON object');
        }

        $this->validate_snapshot($snapshot, $artifactid);
        return $snapshot;
    }

    private function encode_snapshot(\stdClass $snapshot): string {
        try {
            return json_encode($snapshot, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \invalid_parameter_exception('Assessment snapshot cannot be encoded as JSON');
        }
    }

    private static function next_modified_time(?int $previous): int {
        $now = time();
        return $previous === null ? $now : max($now, $previous + 1);
    }

    private static function changed_at(int $timemodified): string {
        return gmdate('Y-m-d\TH:i:s', $timemodified) . '.000000Z';
    }

    private static function next_quiz_expiry(\stdClass $snapshot): ?int {
        $next = null;
        foreach (get_object_vars($snapshot->quizzes ?? (object) []) as $quiz) {
            if (($quiz->status ?? null) !== 'in_progress' || ($quiz->expiresAt ?? null) === null) {
                continue;
            }
            $expiry = strtotime((string) $quiz->expiresAt);
            if ($expiry === false) {
                throw new \invalid_parameter_exception('Stored assessment Quiz expiry is invalid');
            }
            $next = $next === null ? $expiry : min($next, $expiry);
        }
        return $next;
    }

    private function validate_snapshot(\stdClass $snapshot, string $artifactid): void {
        json_schema_validator::validate_plugin_definition(
            'AssessmentLearnerSnapshot',
            $snapshot,
            'assessmentSnapshot',
        );
        if (($snapshot->artifactId ?? null) !== $artifactid) {
            throw new \invalid_parameter_exception('Assessment snapshot artifactId does not match activity');
        }
    }
}

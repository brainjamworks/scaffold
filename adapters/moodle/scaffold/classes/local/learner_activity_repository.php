<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

class learner_activity_insert_collision extends \RuntimeException {
}

class learner_activity_repository {
    private const LOCK_TYPE = 'mod_scaffold_learner_activity';
    private const LOCK_TIMEOUT_SECONDS = 10;
    private const SNAPSHOT_VERSION = 1;
    private const TABLE = 'scaffold_learner_activity';

    private $database;
    private $lockfactory;

    public function __construct($database = null, $lockfactory = null) {
        if ($database === null) {
            global $DB;
            $database = $DB;
        }

        $this->database = $database;
        $this->lockfactory = $lockfactory;
    }

    public function load_or_empty(int $scaffoldid, int $userid, string $artifactid): array {
        $record = $this->database->get_record(self::TABLE, [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
        ]);
        if (!$record) {
            return $this->empty_snapshot($artifactid);
        }

        return $this->decode_snapshot((string) $record->snapshotjson, $artifactid);
    }

    public function load_active(
        int $scaffoldid,
        int $userid,
        string $artifactid,
        array $authorizedactivities,
    ): array {
        $snapshot = $this->load_or_empty($scaffoldid, $userid, $artifactid);
        $active = (object) [];
        foreach (get_object_vars($snapshot['activities']) as $blockid => $record) {
            if (!array_key_exists($blockid, $authorizedactivities)
                || !($record instanceof \stdClass)
                || ($record->activityKind ?? null) !== $authorizedactivities[$blockid]) {
                continue;
            }
            $active->{$blockid} = $record;
        }
        $snapshot['activities'] = $active;
        $this->validate_snapshot($snapshot, $artifactid);
        return $snapshot;
    }

    public function save_record(
        int $scaffoldid,
        int $userid,
        string $artifactid,
        string $blockid,
        array $record,
        array $authorizedactivities,
    ): array {
        return $this->with_lock(
            $scaffoldid,
            $userid,
            fn(): array => $this->transact_save(
                $scaffoldid,
                $userid,
                $artifactid,
                $blockid,
                $record,
                $authorizedactivities,
                true,
            ),
        );
    }

    public function delete_for_activity(int $scaffoldid): void {
        $this->database->delete_records(self::TABLE, ['scaffoldid' => $scaffoldid]);
    }

    public function add_contexts_for_user(
        \core_privacy\local\request\contextlist $contextlist,
        int $userid,
    ): void {
        $sql = "SELECT DISTINCT ctx.id
                  FROM {scaffold_learner_activity} state
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
                  FROM {scaffold_learner_activity}
                 WHERE scaffoldid = :scaffoldid";
        $userlist->add_from_sql('userid', $sql, ['scaffoldid' => $scaffoldid]);
    }

    public function get_for_privacy_export(
        int $scaffoldid,
        int $userid,
        string $artifactid,
    ): ?\stdClass {
        $record = $this->database->get_record(self::TABLE, [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
        ]);
        if (!$record) {
            return null;
        }

        return (object) [
            'snapshot' => (object) $this->decode_snapshot((string) $record->snapshotjson, $artifactid),
            'timecreated' => (int) $record->timecreated,
            'timemodified' => (int) $record->timemodified,
        ];
    }

    public function delete_for_user_in_activity(int $scaffoldid, int $userid): void {
        $this->database->delete_records(self::TABLE, [
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
            self::TABLE,
            "scaffoldid = :scaffoldid AND userid {$usersql}",
            ['scaffoldid' => $scaffoldid] + $params,
        );
    }

    private function transact_save(
        int $scaffoldid,
        int $userid,
        string $artifactid,
        string $blockid,
        array $requestedrecord,
        array $authorizedactivities,
        bool $retryinsert,
    ): array {
        try {
            return $this->transact_save_once(
                $scaffoldid,
                $userid,
                $artifactid,
                $blockid,
                $requestedrecord,
                $authorizedactivities,
            );
        } catch (learner_activity_insert_collision $exception) {
            if (!$retryinsert) {
                throw $exception->getPrevious() ?? $exception;
            }

            return $this->transact_save(
                $scaffoldid,
                $userid,
                $artifactid,
                $blockid,
                $requestedrecord,
                $authorizedactivities,
                false,
            );
        }
    }

    private function transact_save_once(
        int $scaffoldid,
        int $userid,
        string $artifactid,
        string $blockid,
        array $requestedrecord,
        array $authorizedactivities,
    ): array {
        $transaction = $this->database->start_delegated_transaction();
        try {
            $row = $this->database->get_record(self::TABLE, [
                'scaffoldid' => $scaffoldid,
                'userid' => $userid,
            ]);
            $snapshot = $row
                ? $this->decode_snapshot((string) $row->snapshotjson, $artifactid)
                : $this->empty_snapshot($artifactid);

            $this->validate_authorized_activities($authorizedactivities, $artifactid);
            $validatedrecord = $this->validate_requested_record($requestedrecord);
            if (!array_key_exists($blockid, $authorizedactivities)) {
                throw new \invalid_parameter_exception('Learner activity blockId is not authorized for this activity');
            }
            if ($authorizedactivities[$blockid] !== $validatedrecord['activityKind']) {
                throw new \invalid_parameter_exception('Learner activity kind does not match the authorized activity');
            }

            $timemodified = self::next_modified_time($row ? (int) $row->timemodified : null);
            $authoritativerecord = $validatedrecord + [
                'updatedAt' => self::changed_at($timemodified),
            ];
            learner_activity_validator::validate_definition(
                'LearnerActivityRecord',
                $authoritativerecord,
                'learnerActivityRecord',
            );

            $snapshot['activities']->{$blockid} = (object) $authoritativerecord;
            $this->validate_snapshot($snapshot, $artifactid);
            $snapshotjson = $this->encode_snapshot($snapshot);

            if ($row) {
                $this->database->update_record(self::TABLE, (object) [
                    'id' => $row->id,
                    'snapshotjson' => $snapshotjson,
                    'timemodified' => $timemodified,
                ]);
            } else {
                try {
                    $this->database->insert_record(self::TABLE, (object) [
                        'scaffoldid' => $scaffoldid,
                        'userid' => $userid,
                        'snapshotjson' => $snapshotjson,
                        'timecreated' => $timemodified,
                        'timemodified' => $timemodified,
                    ]);
                } catch (\dml_write_exception $exception) {
                    throw new learner_activity_insert_collision(
                        'Learner activity state was created concurrently',
                        0,
                        $exception,
                    );
                }
            }

            $transaction->allow_commit();
            return $authoritativerecord;
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
            throw new \moodle_exception('Could not acquire learner activity state lock');
        }

        try {
            return $operation();
        } finally {
            $lock->release();
        }
    }

    private function empty_snapshot(string $artifactid): array {
        $snapshot = [
            'snapshotVersion' => self::SNAPSHOT_VERSION,
            'artifactId' => $artifactid,
            'activities' => (object) [],
        ];
        $this->validate_snapshot($snapshot, $artifactid);
        return $snapshot;
    }

    private function decode_snapshot(string $raw, string $artifactid): array {
        try {
            $snapshot = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \invalid_parameter_exception('Stored learner activity snapshot is invalid JSON');
        }
        if (!($snapshot instanceof \stdClass)) {
            throw new \invalid_parameter_exception('Stored learner activity snapshot must be a JSON object');
        }

        $decoded = (array) $snapshot;
        $this->validate_snapshot($decoded, $artifactid);
        return $decoded;
    }

    private function encode_snapshot(array $snapshot): string {
        try {
            return json_encode($snapshot, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \invalid_parameter_exception('Learner activity snapshot cannot be encoded as JSON');
        }
    }

    private function validate_snapshot(array $snapshot, string $artifactid): void {
        learner_activity_validator::validate_definition(
            'LearnerActivitySnapshot',
            $snapshot,
            'learnerActivitySnapshot',
        );
        if (($snapshot['artifactId'] ?? null) !== $artifactid) {
            throw new \invalid_parameter_exception('Learner activity snapshot artifactId does not match activity');
        }
    }

    private function validate_requested_record(array $record): array {
        if (count($record) !== 3
            || !array_key_exists('activityKind', $record)
            || !array_key_exists('data', $record)
            || !array_key_exists('completed', $record)) {
            throw new \invalid_parameter_exception('Learner activity save record has an invalid shape');
        }

        $candidate = $record + ['updatedAt' => null];
        learner_activity_validator::validate_definition(
            'LearnerActivityRecord',
            $candidate,
            'learnerActivityRecord',
        );
        return $record;
    }

    private function validate_authorized_activities(array $authorizedactivities, string $artifactid): void {
        $records = (object) [];
        foreach ($authorizedactivities as $blockid => $activitykind) {
            if (!is_string($blockid)) {
                throw new \invalid_parameter_exception('Authorized learner activity blockId must be a string');
            }
            $records->{$blockid} = (object) [
                'activityKind' => $activitykind,
                'data' => (object) [],
                'completed' => false,
                'updatedAt' => null,
            ];
        }

        $this->validate_snapshot([
            'snapshotVersion' => self::SNAPSHOT_VERSION,
            'artifactId' => $artifactid,
            'activities' => $records,
        ], $artifactid);
    }

    private static function next_modified_time(?int $previous): int {
        $now = time();
        return $previous === null ? $now : max($now, $previous + 1);
    }

    private static function changed_at(int $timemodified): string {
        return gmdate('Y-m-d\TH:i:s', $timemodified) . '.000000Z';
    }
}

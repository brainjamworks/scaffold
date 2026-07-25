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

namespace mod_scaffold\local;


/**
 * Persists and queries learner activity snapshots.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class learner_activity_repository {
    /**
     * LOCK TYPE.
     */
    private const LOCK_TYPE = 'mod_scaffold_learner_activity';
    /**
     * LOCK TIMEOUT SECONDS.
     */
    private const LOCK_TIMEOUT_SECONDS = 10;
    /**
     * SNAPSHOT VERSION.
     */
    private const SNAPSHOT_VERSION = 1;
    /**
     * TABLE.
     */
    private const TABLE = 'scaffold_learner_activity';

    /** @var \moodle_database Moodle database connection. */
    private $database;
    /** @var \core\lock\lock_factory Moodle lock factory. */
    private $lockfactory;

    /**
     * Creates a new learner activity repository instance.
     *
     * @param object|null $database Moodle database connection.
     * @param object|null $lockfactory Moodle lock factory.
     */
    public function __construct(?object $database = null, ?object $lockfactory = null) {
        if ($database === null) {
            global $DB;
            $database = $DB;
        }

        $this->database = $database;
        $this->lockfactory = $lockfactory;
    }

    /**
     * Loads or empty.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @return array
     */
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

    /**
     * Loads active.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @param array $authorizedactivities Authorizedactivities.
     * @return array
     */
    public function load_active(
        int $scaffoldid,
        int $userid,
        string $artifactid,
        array $authorizedactivities,
    ): array {
        $snapshot = $this->load_or_empty($scaffoldid, $userid, $artifactid);
        $active = (object) [];
        foreach (get_object_vars($snapshot['activities']) as $blockid => $record) {
            if (
                !array_key_exists($blockid, $authorizedactivities)
                || !($record instanceof \stdClass)
                || ($record->activityKind ?? null) !== $authorizedactivities[$blockid]
            ) {
                continue;
            }
            $active->{$blockid} = $record;
        }
        $snapshot['activities'] = $active;
        $this->validate_snapshot($snapshot, $artifactid);
        return $snapshot;
    }

    /**
     * Saves record.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @param string $blockid Learner activity block ID.
     * @param array $record Record.
     * @param array $authorizedactivities Authorizedactivities.
     * @return array
     */
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

    /**
     * Deletes for activity.
     *
     * @param int $scaffoldid Scaffold activity ID.
     */
    public function delete_for_activity(int $scaffoldid): void {
        $this->database->delete_records(self::TABLE, ['scaffoldid' => $scaffoldid]);
    }

    /**
     * Adds contexts for user.
     *
     * @param \core_privacy\local\request\contextlist $contextlist Contextlist.
     * @param int $userid User ID.
     */
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

    /**
     * Adds users for activity.
     *
     * @param \core_privacy\local\request\userlist $userlist Userlist.
     * @param int $scaffoldid Scaffold activity ID.
     */
    public function add_users_for_activity(
        \core_privacy\local\request\userlist $userlist,
        int $scaffoldid,
    ): void {
        $sql = "SELECT DISTINCT userid
                  FROM {scaffold_learner_activity}
                 WHERE scaffoldid = :scaffoldid";
        $userlist->add_from_sql('userid', $sql, ['scaffoldid' => $scaffoldid]);
    }

    /**
     * Returns records prepared for privacy export.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @return \stdClass|null
     */
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

    /**
     * Deletes for user in activity.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     */
    public function delete_for_user_in_activity(int $scaffoldid, int $userid): void {
        $this->database->delete_records(self::TABLE, [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
        ]);
    }

    /**
     * Deletes for users in activity.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param array $userids Userids.
     */
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

    /**
     * Runs a transaction for save.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @param string $blockid Learner activity block ID.
     * @param array $requestedrecord Requestedrecord.
     * @param array $authorizedactivities Authorizedactivities.
     * @param bool $retryinsert Retryinsert.
     * @return array
     */
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

    /**
     * Runs a transaction for save once.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @param string $blockid Learner activity block ID.
     * @param array $requestedrecord Requestedrecord.
     * @param array $authorizedactivities Authorizedactivities.
     * @return array
     */
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

    /**
     * Runs with lock.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param callable $operation Operation.
     * @return mixed
     */
    private function with_lock(int $scaffoldid, int $userid, callable $operation): mixed {
        $factory = $this->lockfactory ?? \core\lock\lock_config::get_lock_factory(self::LOCK_TYPE);
        $lock = $factory->get_lock(
            'activity:' . $scaffoldid . ':learner:' . $userid,
            self::LOCK_TIMEOUT_SECONDS,
        );
        if (!$lock) {
            throw new \moodle_exception('learneractivitystatelockfailed', 'scaffold');
        }

        try {
            return $operation();
        } finally {
            $lock->release();
        }
    }

    /**
     * Builds an empty snapshot.
     *
     * @param string $artifactid Scaffold artifact ID.
     * @return array
     */
    private function empty_snapshot(string $artifactid): array {
        $snapshot = [
            'snapshotVersion' => self::SNAPSHOT_VERSION,
            'artifactId' => $artifactid,
            'activities' => (object) [],
        ];
        $this->validate_snapshot($snapshot, $artifactid);
        return $snapshot;
    }

    /**
     * Decodes snapshot.
     *
     * @param string $raw Raw.
     * @param string $artifactid Scaffold artifact ID.
     * @return array
     */
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

    /**
     * Encodes snapshot.
     *
     * @param array $snapshot Canonical assessment snapshot.
     * @return string
     */
    private function encode_snapshot(array $snapshot): string {
        try {
            return json_encode($snapshot, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \invalid_parameter_exception('Learner activity snapshot cannot be encoded as JSON');
        }
    }

    /**
     * Validates snapshot.
     *
     * @param array $snapshot Canonical assessment snapshot.
     * @param string $artifactid Scaffold artifact ID.
     */
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

    /**
     * Validates requested record.
     *
     * @param array $record Record.
     * @return array
     */
    private function validate_requested_record(array $record): array {
        if (
            count($record) !== 3
            || !array_key_exists('activityKind', $record)
            || !array_key_exists('data', $record)
            || !array_key_exists('completed', $record)
        ) {
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

    /**
     * Validates authorized activities.
     *
     * @param array $authorizedactivities Authorizedactivities.
     * @param string $artifactid Scaffold artifact ID.
     */
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

    /**
     * Returns the next modified time.
     *
     * @param int|null $previous Previous.
     * @return int
     */
    private static function next_modified_time(?int $previous): int {
        $now = time();
        return $previous === null ? $now : max($now, $previous + 1);
    }

    /**
     * Returns changed at.
     *
     * @param int $timemodified Timemodified.
     * @return string
     */
    private static function changed_at(int $timemodified): string {
        return gmdate('Y-m-d\TH:i:s', $timemodified) . '.000000Z';
    }
}

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

defined('MOODLE_INTERNAL') || die();

require_once(__DIR__ . '/grade_publication_repository.php');

/**
 * Persists and queries learner assessment state.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class assessment_state_repository {
    /**
     * Error code raised when the assessment state lock is unavailable.
     */
    public const LOCK_UNAVAILABLE_ERROR_CODE = 'assessmentstatelockfailed';

    /**
     * LOCK TYPE.
     */
    private const LOCK_TYPE = 'mod_scaffold_assessment_state';
    /**
     * LOCK TIMEOUT SECONDS.
     */
    private const LOCK_TIMEOUT_SECONDS = 10;
    /**
     * SNAPSHOT VERSION.
     */
    private const SNAPSHOT_VERSION = 2;

    /** @var \moodle_database Moodle database connection. */
    private $database;
    /** @var \core\lock\lock_factory Moodle lock factory. */
    private $lockfactory;
    /** @var grade_publication_repository Grade publication repository. */
    private $publicationrepository;
    /** @var \Closure Definitionversionloader. */
    private \Closure $definitionversionloader;

    /**
     * Creates a new assessment state repository instance.
     *
     * @param object|null $database Moodle database connection.
     * @param object|null $lockfactory Moodle lock factory.
     * @param object|null $publicationrepository Grade publication repository.
     * @param callable|null $definitionversionloader Definitionversionloader.
     */
    public function __construct(
        ?object $database = null,
        ?object $lockfactory = null,
        ?object $publicationrepository = null,
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
            $definitionversionloader ?? function (int $scaffoldid): int {
                return (int) $this->database->get_field(
                    'scaffold',
                    'assessmentdefinitionversion',
                    ['id' => $scaffoldid],
                    MUST_EXIST,
                );
            },
        );
    }

    /**
     * Returns existing state or creates its initial record.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @return \stdClass
     */
    public function get_or_create(int $scaffoldid, int $userid, string $artifactid): \stdClass {
        return $this->get_or_create_state($scaffoldid, $userid, $artifactid)->snapshot;
    }

    /**
     * Returns existing state or creates its initial state.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @return \stdClass
     */
    public function get_or_create_state(int $scaffoldid, int $userid, string $artifactid): \stdClass {
        return $this->with_lock(
            $scaffoldid,
            $userid,
            fn(): \stdClass => $this->transact($scaffoldid, $userid, $artifactid, null, true),
        );
    }

    /**
     * Mutates canonical state under the caller-owned lock.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @param callable $mutation Mutation.
     * @return \stdClass
     */
    public function mutate(
        int $scaffoldid,
        int $userid,
        string $artifactid,
        callable $mutation,
    ): \stdClass {
        return $this->mutate_state($scaffoldid, $userid, $artifactid, $mutation)->snapshot;
    }

    /**
     * Mutates state.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @param callable $mutation Mutation.
     * @return \stdClass
     */
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

    /**
     * Mutates with grade publication.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @param callable $mutation Mutation.
     * @return \stdClass
     */
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

    /**
     * Mutates with grade publication state.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @param callable $mutation Mutation.
     * @return \stdClass
     */
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

    /**
     * Runs with learner lock.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param callable $operation Operation.
     * @return mixed
     */
    public function with_learner_lock(
        int $scaffoldid,
        int $userid,
        callable $operation,
    ): mixed {
        return $this->with_lock($scaffoldid, $userid, $operation);
    }

    /**
     * Finds for activity.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param string $artifactid Scaffold artifact ID.
     * @param int|null $userid User ID.
     * @return array
     */
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

    /**
     * Finds states for activity.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param string $artifactid Scaffold artifact ID.
     * @param int|null $userid User ID.
     * @return array
     */
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
                  FROM {scaffold_assessment_state}
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

    /**
     * Deletes for activity.
     *
     * @param int $scaffoldid Scaffold activity ID.
     */
    public function delete_for_activity(int $scaffoldid): void {
        $this->database->delete_records('scaffold_assessment_state', ['scaffoldid' => $scaffoldid]);
    }

    /**
     * Deletes for user in activity.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     */
    public function delete_for_user_in_activity(int $scaffoldid, int $userid): void {
        $this->database->delete_records('scaffold_assessment_state', [
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
            'scaffold_assessment_state',
            "scaffoldid = :scaffoldid AND userid {$usersql}",
            ['scaffoldid' => $scaffoldid] + $params,
        );
    }

    /**
     * Runs a state mutation in a delegated transaction.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @param callable|null $mutation Mutation.
     * @param bool $retryinsert Retryinsert.
     * @param bool $stagepublication Stagepublication.
     * @return \stdClass
     */
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

    /**
     * Runs a transaction for once.
     *
     * @param int $scaffoldid Scaffold activity ID.
     * @param int $userid User ID.
     * @param string $artifactid Scaffold artifact ID.
     * @param callable|null $mutation Mutation.
     * @param bool $stagepublication Stagepublication.
     * @return \stdClass
     */
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
            throw new \moodle_exception(self::LOCK_UNAVAILABLE_ERROR_CODE, 'scaffold');
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
     * @return \stdClass
     */
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

    /**
     * Decodes snapshot.
     *
     * @param string $raw Raw.
     * @param string $artifactid Scaffold artifact ID.
     * @return \stdClass
     */
    private function decode_snapshot(string $raw, string $artifactid): \stdClass {
        try {
            $snapshot = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \invalid_parameter_exception('Stored assessment snapshot is invalid JSON');
        }
        if (!($snapshot instanceof \stdClass)) {
            throw new \invalid_parameter_exception('Stored assessment snapshot must be a JSON object');
        }

        $snapshot = assessment_contract_migrator::upgrade_snapshot($snapshot);
        $this->validate_snapshot($snapshot, $artifactid);
        return $snapshot;
    }

    /**
     * Encodes snapshot.
     *
     * @param \stdClass $snapshot Canonical assessment snapshot.
     * @return string
     */
    private function encode_snapshot(\stdClass $snapshot): string {
        try {
            return json_encode($snapshot, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \invalid_parameter_exception('Assessment snapshot cannot be encoded as JSON');
        }
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

    /**
     * Returns the next quiz expiry.
     *
     * @param \stdClass $snapshot Canonical assessment snapshot.
     * @return int|null
     */
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

    /**
     * Validates snapshot.
     *
     * @param \stdClass $snapshot Canonical assessment snapshot.
     * @param string $artifactid Scaffold artifact ID.
     */
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

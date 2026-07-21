<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

class grade_publication_repository {
    private const TABLE = 'scaffold_grade_publications';
    private const STATUSES = ['pending', 'published', 'failed', 'locked', 'configuration_error'];

    private $database;
    private $clock;

    public function __construct($database = null, ?callable $clock = null) {
        if ($database === null) {
            global $DB;
            $database = $DB;
        }
        $this->database = $database;
        $this->clock = $clock ?? static fn(): int => time();
    }

    public function get(int $scaffoldid, int $userid): ?\stdClass {
        $record = $this->database->get_record(self::TABLE, [
            'scaffoldid' => $scaffoldid,
            'userid' => $userid,
        ]);
        return $record ? $this->normalize($record) : null;
    }

    public function find_for_activity(int $scaffoldid): array {
        return $this->normalize_records($this->database->get_records(
            self::TABLE,
            ['scaffoldid' => $scaffoldid],
            'id ASC',
        ));
    }

    public function find_for_user(int $userid): array {
        return $this->normalize_records($this->database->get_records(
            self::TABLE,
            ['userid' => $userid],
            'id ASC',
        ));
    }

    public function add_contexts_for_user(
        \core_privacy\local\request\contextlist $contextlist,
        int $userid,
    ): void {
        $sql = "SELECT DISTINCT ctx.id
                  FROM {scaffold_grade_publications} publication
                  JOIN {course_modules} cm ON cm.instance = publication.scaffoldid
                  JOIN {modules} module ON module.id = cm.module AND module.name = :modulename
                  JOIN {context} ctx ON ctx.instanceid = cm.id AND ctx.contextlevel = :contextlevel
                 WHERE publication.userid = :userid";
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
                  FROM {scaffold_grade_publications}
                 WHERE scaffoldid = :scaffoldid";
        $userlist->add_from_sql('userid', $sql, ['scaffoldid' => $scaffoldid]);
    }

    public function find_due_item_ids(int $limit, int $now, int $maxretries): array {
        $this->validate_recovery_query($limit, $now, $maxretries);
        $sql = "SELECT id
                  FROM {scaffold}
                 WHERE gradeitemstatus = :pending
                    OR (gradeitemstatus = :published
                        AND gradeitemversion <> assessmentdefinitionversion)
                    OR (gradeitemstatus = :failed
                        AND gradeitemretrycount < :maxretries
                        AND gradeitemretryafter IS NOT NULL
                        AND gradeitemretryafter <= :now)
              ORDER BY id ASC";
        return array_map('intval', $this->database->get_fieldset_sql($sql, [
            'pending' => 'pending',
            'published' => 'published',
            'failed' => 'failed',
            'maxretries' => $maxretries,
            'now' => $now,
        ], 0, $limit));
    }

    public function find_due_sources(int $limit, int $now, int $maxretries): array {
        $this->validate_recovery_query($limit, $now, $maxretries);
        $sql = "SELECT s.id AS stateid,
                       s.scaffoldid,
                       s.userid,
                       s.staterevision,
                       c.assessmentdefinitionversion AS definitionversion
                  FROM {scaffold_assessment_state} s
                  JOIN {scaffold} c ON c.id = s.scaffoldid
             LEFT JOIN {scaffold_grade_publications} p
                    ON p.scaffoldid = s.scaffoldid AND p.userid = s.userid
                 WHERE c.grade > 0
                   AND (p.id IS NULL
                        OR p.staterevision <> s.staterevision
                        OR p.definitionversion <> c.assessmentdefinitionversion
                        OR p.status = :pending
                        OR (p.status = :failed
                            AND p.retrycount < :maxretries
                            AND p.retryafter IS NOT NULL
                            AND p.retryafter <= :now))
              ORDER BY s.id ASC";
        return array_values($this->database->get_records_sql($sql, [
            'pending' => 'pending',
            'failed' => 'failed',
            'maxretries' => $maxretries,
            'now' => $now,
        ], 0, $limit));
    }

    public function upsert_pending(
        int $scaffoldid,
        int $userid,
        int $staterevision,
        int $definitionversion,
    ): \stdClass {
        $this->validate_source_identity($scaffoldid, $userid, $staterevision, $definitionversion);
        $current = $this->get($scaffoldid, $userid);
        if ($current !== null
            && $current->staterevision === $staterevision
            && $current->definitionversion === $definitionversion) {
            return $current;
        }

        $now = ($this->clock)();
        if ($current === null) {
            $id = $this->database->insert_record(self::TABLE, (object) [
                'scaffoldid' => $scaffoldid,
                'userid' => $userid,
                'staterevision' => $staterevision,
                'definitionversion' => $definitionversion,
                'status' => 'pending',
                'failurecode' => null,
                'retrycount' => 0,
                'retryafter' => null,
                'timecreated' => $now,
                'timemodified' => $now,
            ]);
            return $this->normalize($this->database->get_record(self::TABLE, ['id' => $id], '*', MUST_EXIST));
        }

        $this->database->update_record(self::TABLE, (object) [
            'id' => $current->id,
            'staterevision' => $staterevision,
            'definitionversion' => $definitionversion,
            'status' => 'pending',
            'failurecode' => null,
            'retrycount' => 0,
            'retryafter' => null,
            'timemodified' => $now,
        ]);
        return $this->normalize($this->database->get_record(self::TABLE, ['id' => $current->id], '*', MUST_EXIST));
    }

    public function claim(
        int $scaffoldid,
        int $userid,
        int $expectedstaterevision,
        int $expecteddefinitionversion,
    ): ?\stdClass {
        $current = $this->matching($scaffoldid, $userid, $expectedstaterevision, $expecteddefinitionversion);
        if ($current === null || !in_array($current->status, ['pending', 'failed'], true)) {
            return null;
        }
        $now = ($this->clock)();
        if ($current->status === 'failed'
            && ($current->retryafter === null || $current->retryafter > $now)) {
            return null;
        }

        $this->database->update_record(self::TABLE, (object) [
            'id' => $current->id,
            'status' => 'pending',
            'failurecode' => null,
            'retrycount' => $current->retrycount + 1,
            'retryafter' => null,
            'timemodified' => $now,
        ]);
        return $this->normalize($this->database->get_record(self::TABLE, ['id' => $current->id], '*', MUST_EXIST));
    }

    public function record_status(
        int $scaffoldid,
        int $userid,
        int $expectedstaterevision,
        int $expecteddefinitionversion,
        string $status,
        ?string $failurecode = null,
        ?int $retryafter = null,
    ): bool {
        $this->validate_status($status, $failurecode, $retryafter);
        $current = $this->matching($scaffoldid, $userid, $expectedstaterevision, $expecteddefinitionversion);
        if ($current === null) {
            return false;
        }

        $this->database->update_record(self::TABLE, (object) [
            'id' => $current->id,
            'status' => $status,
            'failurecode' => $failurecode,
            'retryafter' => $retryafter,
            'timemodified' => ($this->clock)(),
        ]);
        return true;
    }

    public function delete_for_activity(int $scaffoldid): void {
        $this->database->delete_records(self::TABLE, ['scaffoldid' => $scaffoldid]);
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

    public function delete_for_user(int $userid): void {
        $this->database->delete_records(self::TABLE, ['userid' => $userid]);
    }

    public function requeue_user(int $scaffoldid, int $userid): bool {
        $current = $this->get($scaffoldid, $userid);
        if ($current === null || !in_array($current->status, ['failed', 'locked', 'configuration_error'], true)) {
            return false;
        }
        $this->database->update_record(self::TABLE, (object) [
            'id' => $current->id,
            'status' => 'pending',
            'failurecode' => null,
            'retrycount' => 0,
            'retryafter' => null,
            'timemodified' => ($this->clock)(),
        ]);
        return true;
    }

    public function requeue_item(int $scaffoldid): bool {
        $current = $this->database->get_record('scaffold', ['id' => $scaffoldid]);
        if (!$current || !in_array($current->gradeitemstatus, ['failed', 'locked', 'configuration_error'], true)) {
            return false;
        }
        $this->database->update_record('scaffold', (object) [
            'id' => $scaffoldid,
            'gradeitemstatus' => 'pending',
            'gradeitemfailurecode' => null,
            'gradeitemretrycount' => 0,
            'gradeitemretryafter' => null,
            'gradeitemtimemodified' => ($this->clock)(),
        ]);
        return true;
    }

    private function matching(
        int $scaffoldid,
        int $userid,
        int $staterevision,
        int $definitionversion,
    ): ?\stdClass {
        $current = $this->get($scaffoldid, $userid);
        if ($current === null
            || $current->staterevision !== $staterevision
            || $current->definitionversion !== $definitionversion) {
            return null;
        }
        return $current;
    }

    private function normalize_records(array $records): array {
        return array_map(fn(\stdClass $record): \stdClass => $this->normalize($record), $records);
    }

    private function normalize(\stdClass $record): \stdClass {
        $record->id = (int) $record->id;
        $record->scaffoldid = (int) $record->scaffoldid;
        $record->userid = (int) $record->userid;
        $record->staterevision = (int) $record->staterevision;
        $record->definitionversion = (int) $record->definitionversion;
        $record->retrycount = (int) $record->retrycount;
        $record->retryafter = $record->retryafter === null ? null : (int) $record->retryafter;
        $record->timecreated = (int) $record->timecreated;
        $record->timemodified = (int) $record->timemodified;
        $this->validate_source_identity(
            $record->scaffoldid,
            $record->userid,
            $record->staterevision,
            $record->definitionversion,
        );
        $this->validate_status($record->status, $record->failurecode, $record->retryafter);
        if ($record->retrycount < 0) {
            throw new \invalid_parameter_exception('Stored grade publication retry count is invalid');
        }
        return $record;
    }

    private function validate_source_identity(
        int $scaffoldid,
        int $userid,
        int $staterevision,
        int $definitionversion,
    ): void {
        if ($scaffoldid <= 0 || $userid <= 0 || $staterevision < 0 || $definitionversion <= 0) {
            throw new \invalid_parameter_exception('Grade publication source identity is invalid');
        }
    }

    private function validate_status(string $status, ?string $failurecode, ?int $retryafter): void {
        if (!in_array($status, self::STATUSES, true)
            || ($failurecode !== null && preg_match('/^[a-z][a-z0-9_]*$/D', $failurecode) !== 1)
            || ($retryafter !== null && $retryafter < 0)) {
            throw new \invalid_parameter_exception('Grade publication status is invalid');
        }
    }

    private function validate_recovery_query(int $limit, int $now, int $maxretries): void {
        if ($limit <= 0 || $limit > 1000 || $now < 0 || $maxretries <= 0) {
            throw new \invalid_parameter_exception('Grade publication recovery query is invalid');
        }
    }
}

<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

final class grade_status_report {
    private $repository;
    private $database;

    public function __construct($repository = null, $database = null) {
        if ($database === null) {
            global $DB;
            $database = $DB;
        }
        $this->database = $database;
        $this->repository = $repository ?? new grade_publication_repository($database);
    }

    public function item(int $scaffoldid): \stdClass {
        $activity = $this->database->get_record('scaffold', ['id' => $scaffoldid], '*', MUST_EXIST);
        $definitionversion = (int) $activity->assessmentdefinitionversion;
        $itemversion = (int) $activity->gradeitemversion;
        $status = (string) $activity->gradeitemstatus;
        if ($itemversion !== $definitionversion && !in_array($status, ['locked', 'configuration_error'], true)) {
            $status = 'stale';
        }
        $retryafter = $activity->gradeitemretryafter === null ? null : (int) $activity->gradeitemretryafter;
        return (object) [
            'definitionVersion' => $definitionversion,
            'itemVersion' => $itemversion,
            'status' => $status,
            'code' => $activity->gradeitemfailurecode,
            'retryCount' => (int) $activity->gradeitemretrycount,
            'retryAfter' => $retryafter,
            'modifiedAt' => (int) $activity->gradeitemtimemodified,
            'nextAction' => self::next_action(
                $status,
                (int) $activity->gradeitemretrycount,
                $retryafter,
            ),
        ];
    }

    public function page(int $scaffoldid, int $page, int $perpage): \stdClass {
        if ($scaffoldid <= 0 || $page < 0 || $perpage <= 0 || $perpage > 100) {
            throw new \invalid_parameter_exception('Grade status report page is invalid');
        }
        $params = ['scaffoldid' => $scaffoldid];
        $total = $this->database->count_records('scaffold_assessment_state', $params);
        $sql = "SELECT s.id AS stateid,
                       s.userid,
                       s.staterevision AS currentstaterevision,
                       c.assessmentdefinitionversion AS currentdefinitionversion,
                       p.staterevision,
                       p.definitionversion,
                       p.status,
                       p.failurecode,
                       p.retrycount,
                       p.retryafter,
                       p.timemodified
                  FROM {scaffold_assessment_state} s
                  JOIN {scaffold} c ON c.id = s.scaffoldid
             LEFT JOIN {scaffold_grade_publications} p
                    ON p.scaffoldid = s.scaffoldid AND p.userid = s.userid
                 WHERE s.scaffoldid = :scaffoldid
              ORDER BY s.id ASC";
        $records = $this->database->get_records_sql($sql, $params, $page * $perpage, $perpage);
        $rows = [];
        foreach ($records as $record) {
            $stale = $record->status === null
                || (int) $record->staterevision !== (int) $record->currentstaterevision
                || (int) $record->definitionversion !== (int) $record->currentdefinitionversion;
            $status = $stale ? 'stale' : (string) $record->status;
            $retrycount = $record->retrycount === null ? 0 : (int) $record->retrycount;
            $retryafter = $record->retryafter === null ? null : (int) $record->retryafter;
            $rows[] = (object) [
                'userId' => (int) $record->userid,
                'stateRevision' => (int) $record->currentstaterevision,
                'definitionVersion' => (int) $record->currentdefinitionversion,
                'status' => $status,
                'code' => $stale ? null : $record->failurecode,
                'retryCount' => $retrycount,
                'retryAfter' => $retryafter,
                'modifiedAt' => $record->timemodified === null ? null : (int) $record->timemodified,
                'nextAction' => self::next_action($status, $retrycount, $retryafter),
            ];
        }
        return (object) [
            'total' => $total,
            'page' => $page,
            'perPage' => $perpage,
            'rows' => $rows,
        ];
    }

    public function requeue_user(int $scaffoldid, int $userid): bool {
        return $this->repository->requeue_user($scaffoldid, $userid);
    }

    public function requeue_item(int $scaffoldid): bool {
        return $this->repository->requeue_item($scaffoldid);
    }

    private static function next_action(string $status, int $retrycount, ?int $retryafter): string {
        if (in_array($status, ['locked', 'configuration_error'], true)
            || ($status === 'failed' && ($retryafter === null || $retrycount >= 5))) {
            return 'correct_and_requeue';
        }
        return match ($status) {
            'published' => 'none',
            'failed' => 'automatic_retry',
            default => 'wait',
        };
    }
}

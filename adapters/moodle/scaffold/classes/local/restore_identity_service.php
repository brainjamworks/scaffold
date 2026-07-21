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

final class restore_identity_service {
    private const RECONCILIATION_BATCH_SIZE = 100;

    public static function repair(string $destinationartifactid, \stdClass $source): \stdClass {
        if ($destinationartifactid === '') {
            throw new \invalid_parameter_exception('Destination artifact identity is required');
        }
        if (property_exists($source, 'artifactjson')) {
            return self::repair_activity($destinationartifactid, $source);
        }
        if (property_exists($source, 'problems') || property_exists($source, 'quizzes')) {
            return self::repair_assessment_snapshot($destinationartifactid, $source);
        }
        if (property_exists($source, 'activities')) {
            return self::repair_learner_activity_snapshot($destinationartifactid, $source);
        }
        throw new \invalid_parameter_exception('Restore source has an unknown canonical shape');
    }

    public static function assessment_next_expiry(\stdClass $snapshot): ?int {
        json_schema_validator::validate_plugin_definition(
            'AssessmentLearnerSnapshot',
            $snapshot,
            'assessmentSnapshot',
        );
        $next = null;
        foreach (get_object_vars($snapshot->quizzes ?? (object) []) as $quiz) {
            if (($quiz->status ?? null) !== 'in_progress' || ($quiz->expiresAt ?? null) === null) {
                continue;
            }
            $expiry = strtotime((string) $quiz->expiresAt);
            if ($expiry === false) {
                throw new \invalid_parameter_exception('Restored assessment Quiz expiry is invalid');
            }
            $next = $next === null ? $expiry : min($next, $expiry);
        }
        return $next;
    }

    public static function rebuild_host_projections(int $scaffoldid, int $cmid): void {
        global $CFG, $DB;

        if ($scaffoldid <= 0 || $cmid <= 0) {
            throw new \invalid_parameter_exception('Restored Scaffold identity is invalid');
        }
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');
        require_once($CFG->libdir . '/completionlib.php');

        $scaffold = $DB->get_record('scaffold', ['id' => $scaffoldid], '*', MUST_EXIST);
        $cm = get_fast_modinfo((int) $scaffold->course)->get_cm($cmid);
        (new grade_item_publisher())->publish($scaffold);
        $scaffold = $DB->get_record('scaffold', ['id' => $scaffoldid], '*', MUST_EXIST);
        $artifactid = artifact_identity::for_course_module($cmid);
        $rows = $DB->get_records(
            'scaffold_assessment_state',
            ['scaffoldid' => $scaffoldid],
            'id ASC',
            'id, userid',
            0,
            self::RECONCILIATION_BATCH_SIZE,
        );
        $expiryreconciler = new quiz_expiry_reconciler();
        $staterepository = new assessment_state_repository();
        $publicationrepository = new grade_publication_repository();
        foreach ($rows as $row) {
            $userid = (int) $row->userid;
            $expiryreconciler->reconcile_user_and_apply_effects(
                $scaffold,
                $cm,
                $userid,
                $artifactid,
            );
            $states = $staterepository->find_states_for_activity($scaffoldid, $artifactid, $userid);
            $state = $states[$userid] ?? null;
            if ($state instanceof \stdClass) {
                $publicationrepository->upsert_pending(
                    $scaffoldid,
                    $userid,
                    (int) $state->stateRevision,
                    (int) $scaffold->assessmentdefinitionversion,
                );
            }
        }
        (new grade_reconciler())->reconcile_due(self::RECONCILIATION_BATCH_SIZE);

        $completion = new \completion_info(get_course((int) $scaffold->course));
        if ($completion->is_enabled($cm)) {
            $completion->reset_all_state($cm);
            foreach ($rows as $row) {
                $completion->update_state($cm, COMPLETION_UNKNOWN, (int) $row->userid);
            }
        }
    }

    private static function repair_activity(string $destinationartifactid, \stdClass $source): \stdClass {
        $repaired = clone $source;
        $artifact = self::decode_object((string) $source->artifactjson, 'Restored Scaffold artifact');
        $artifact->id = $destinationartifactid;
        self::validate_artifact($artifact, $destinationartifactid);
        $repaired->artifactjson = self::encode($artifact, 'Restored Scaffold artifact');

        content_service::read_json_nullable_object((string) ($repaired->learnercontentjson ?? ''));
        assessment_projection::for_activity($repaired);
        return $repaired;
    }

    private static function repair_assessment_snapshot(
        string $destinationartifactid,
        \stdClass $source,
    ): \stdClass {
        $repaired = clone $source;
        $repaired->artifactId = $destinationartifactid;
        json_schema_validator::validate_plugin_definition(
            'AssessmentLearnerSnapshot',
            $repaired,
            'assessmentSnapshot',
        );
        return $repaired;
    }

    private static function repair_learner_activity_snapshot(
        string $destinationartifactid,
        \stdClass $source,
    ): \stdClass {
        $repaired = clone $source;
        $repaired->artifactId = $destinationartifactid;
        learner_activity_validator::validate_definition(
            'LearnerActivitySnapshot',
            $repaired,
            'learnerActivitySnapshot',
        );
        return $repaired;
    }

    private static function validate_artifact(\stdClass $artifact, string $destinationartifactid): void {
        if (($artifact->id ?? null) !== $destinationartifactid) {
            throw new \invalid_parameter_exception('Restored Scaffold artifact id is invalid');
        }
        if (!is_string($artifact->title ?? null) || trim($artifact->title) === '') {
            throw new \invalid_parameter_exception('Restored Scaffold artifact title is invalid');
        }
        if (!in_array($artifact->mode ?? null, ['page', 'slideshow'], true)) {
            throw new \invalid_parameter_exception('Restored Scaffold artifact mode is invalid');
        }
        if (!(($artifact->content ?? null) instanceof \stdClass)) {
            throw new \invalid_parameter_exception('Restored Scaffold artifact content must be a JSON object');
        }
        $document = $artifact->content;
        $coursedocument = is_array($document->content ?? null) ? ($document->content[0] ?? null) : null;
        if (($document->type ?? null) !== 'doc'
            || !($coursedocument instanceof \stdClass)
            || ($coursedocument->type ?? null) !== 'courseDocument'
            || (($coursedocument->attrs->mode ?? null) !== $artifact->mode)) {
            throw new \invalid_parameter_exception('Restored Scaffold artifact document mode is invalid');
        }
    }

    private static function decode_object(string $raw, string $name): \stdClass {
        try {
            $value = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \invalid_parameter_exception($name . ' is invalid JSON');
        }
        if (!($value instanceof \stdClass)) {
            throw new \invalid_parameter_exception($name . ' must be a JSON object');
        }
        return $value;
    }

    private static function encode(\stdClass $value, string $name): string {
        try {
            return json_encode($value, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \invalid_parameter_exception($name . ' cannot be encoded as JSON');
        }
    }
}

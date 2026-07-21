<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

defined('MOODLE_INTERNAL') || die();

final class backup_scaffold_activity_structure_step extends backup_activity_structure_step {
    protected function define_structure() {
        $scaffold = new backup_nested_element('scaffold', ['id'], [
            'name',
            'intro',
            'introformat',
            'artifactjson',
            'learnercontentjson',
            'assessmenttargetsjson',
            'assessmentgroupsjson',
            'grade',
            'completionactivitystatus',
            'timecreated',
            'timemodified',
        ]);
        $assessmentstates = new backup_nested_element('assessment_states');
        $assessmentstate = new backup_nested_element('assessment_state', ['id'], [
            'userid',
            'snapshotjson',
            'timecreated',
            'timemodified',
        ]);
        $learneractivities = new backup_nested_element('learner_activities');
        $learneractivity = new backup_nested_element('learner_activity', ['id'], [
            'userid',
            'snapshotjson',
            'timecreated',
            'timemodified',
        ]);

        $scaffold->add_child($assessmentstates);
        $assessmentstates->add_child($assessmentstate);
        $scaffold->add_child($learneractivities);
        $learneractivities->add_child($learneractivity);

        $sources = self::validated_sources(
            (int) $this->task->get_activityid(),
            (int) $this->task->get_moduleid(),
            (bool) $this->get_setting_value('userinfo'),
        );
        $scaffold->set_source_array([$sources['activity']]);
        $assessmentstate->set_source_array($sources['assessmentstates']);
        $learneractivity->set_source_array($sources['learneractivities']);

        $assessmentstate->annotate_ids('user', 'userid');
        $learneractivity->annotate_ids('user', 'userid');
        $scaffold->annotate_files('mod_scaffold', 'intro', null);
        $scaffold->annotate_files('mod_scaffold', 'media', 'id');

        return $this->prepare_activity_structure($scaffold);
    }

    protected static function validated_sources(int $scaffoldid, int $cmid, bool $userinfo): array {
        global $DB;

        $activity = $DB->get_record('scaffold', ['id' => $scaffoldid], implode(', ', [
            'id',
            'name',
            'intro',
            'introformat',
            'artifactjson',
            'learnercontentjson',
            'assessmenttargetsjson',
            'assessmentgroupsjson',
            'grade',
            'completionactivitystatus',
            'timecreated',
            'timemodified',
        ]), MUST_EXIST);
        $artifactid = \mod_scaffold\local\artifact_identity::for_course_module($cmid);
        self::validate_activity($activity, $artifactid);

        if (!$userinfo) {
            return [
                'activity' => $activity,
                'assessmentstates' => [],
                'learneractivities' => [],
            ];
        }

        $assessmentstates = array_values($DB->get_records(
            'scaffold_assessment_state',
            ['scaffoldid' => $scaffoldid],
            'userid ASC, id ASC',
            'id, userid, snapshotjson, timecreated, timemodified',
        ));
        foreach ($assessmentstates as $state) {
            self::validate_assessment_snapshot((string) $state->snapshotjson, $artifactid);
        }

        $learneractivities = array_values($DB->get_records(
            'scaffold_learner_activity',
            ['scaffoldid' => $scaffoldid],
            'userid ASC, id ASC',
            'id, userid, snapshotjson, timecreated, timemodified',
        ));
        foreach ($learneractivities as $state) {
            self::validate_learner_activity_snapshot((string) $state->snapshotjson, $artifactid);
        }

        return [
            'activity' => $activity,
            'assessmentstates' => $assessmentstates,
            'learneractivities' => $learneractivities,
        ];
    }

    private static function validate_activity(\stdClass $activity, string $artifactid): void {
        $artifact = self::decode_object((string) $activity->artifactjson, 'Stored Scaffold artifact');
        if (($artifact->id ?? null) !== $artifactid) {
            throw new \invalid_parameter_exception('Stored Scaffold artifact id does not match activity');
        }
        if (!is_string($artifact->title ?? null) || trim($artifact->title) === '') {
            throw new \invalid_parameter_exception('Stored Scaffold artifact title is invalid');
        }
        if (!in_array($artifact->mode ?? null, ['page', 'slideshow'], true)) {
            throw new \invalid_parameter_exception('Stored Scaffold artifact mode is invalid');
        }
        if (!(($artifact->content ?? null) instanceof \stdClass)) {
            throw new \invalid_parameter_exception('Stored Scaffold artifact content must be a JSON object');
        }

        \mod_scaffold\local\content_service::read_json_nullable_object((string) $activity->learnercontentjson);
        \mod_scaffold\local\assessment_projection::for_activity($activity);
    }

    private static function validate_assessment_snapshot(string $raw, string $artifactid): void {
        $snapshot = self::decode_object($raw, 'Stored assessment snapshot');
        \mod_scaffold\local\json_schema_validator::validate_plugin_definition(
            'AssessmentLearnerSnapshot',
            $snapshot,
            'assessmentSnapshot',
        );
        if (($snapshot->artifactId ?? null) !== $artifactid) {
            throw new \invalid_parameter_exception('Assessment snapshot artifactId does not match activity');
        }
    }

    private static function validate_learner_activity_snapshot(string $raw, string $artifactid): void {
        $snapshot = self::decode_object($raw, 'Stored learner activity snapshot');
        \mod_scaffold\local\learner_activity_validator::validate_definition(
            'LearnerActivitySnapshot',
            $snapshot,
            'learnerActivitySnapshot',
        );
        if (($snapshot->artifactId ?? null) !== $artifactid) {
            throw new \invalid_parameter_exception('Learner activity snapshot artifactId does not match activity');
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
}

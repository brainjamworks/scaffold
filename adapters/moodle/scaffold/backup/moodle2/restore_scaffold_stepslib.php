<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

defined('MOODLE_INTERNAL') || die();

use mod_scaffold\local\artifact_identity;
use mod_scaffold\local\restore_identity_service;

final class restore_scaffold_activity_structure_step extends restore_activity_structure_step {
    protected function define_structure(): array {
        $paths = [new restore_path_element('scaffold', '/activity/scaffold')];
        if ($this->get_setting_value('userinfo')) {
            $paths[] = new restore_path_element(
                'scaffold_assessment_state',
                '/activity/scaffold/assessment_states/assessment_state',
            );
            $paths[] = new restore_path_element(
                'scaffold_learner_activity',
                '/activity/scaffold/learner_activities/learner_activity',
            );
        }
        return $this->prepare_activity_structure($paths);
    }

    protected function process_scaffold($data): void {
        global $DB;

        $activity = (object) $data;
        $activity->course = $this->get_courseid();
        $activity = restore_identity_service::repair(
            artifact_identity::for_course_module((int) $this->task->get_moduleid()),
            $activity,
        );
        unset($activity->id);
        $activity->assessmentdefinitionversion = 1;
        $activity->gradeitemversion = 0;
        $activity->gradeitemstatus = 'pending';
        $activity->gradeitemfailurecode = null;
        $activity->gradeitemretrycount = 0;
        $activity->gradeitemretryafter = null;
        $activity->gradeitemtimemodified = 0;

        $newitemid = $DB->insert_record('scaffold', $activity);
        $this->apply_activity_instance($newitemid);
    }

    protected function process_scaffold_assessment_state($data): void {
        global $DB;

        $state = (object) $data;
        $olduserid = (int) $state->userid;
        $userid = (int) $this->get_mappingid('user', $olduserid, 0);
        if ($userid === 0) {
            $this->log(
                'Mapped user ID not found for user ' . $olduserid
                    . ', Scaffold activity ' . $this->get_new_parentid('scaffold')
                    . '. Skipping assessment state',
                backup::LOG_INFO,
            );
            return;
        }

        $snapshot = restore_identity_service::repair(
            artifact_identity::for_course_module((int) $this->task->get_moduleid()),
            self::decode_snapshot((string) $state->snapshotjson, 'assessment'),
        );
        unset($state->id);
        $state->scaffoldid = $this->get_new_parentid('scaffold');
        $state->userid = $userid;
        $state->snapshotjson = self::encode_snapshot($snapshot, 'assessment');
        $state->staterevision = 1;
        $state->nextquizexpiry = restore_identity_service::assessment_next_expiry($snapshot);
        $DB->insert_record('scaffold_assessment_state', $state);
    }

    protected function process_scaffold_learner_activity($data): void {
        global $DB;

        $state = (object) $data;
        $olduserid = (int) $state->userid;
        $userid = (int) $this->get_mappingid('user', $olduserid, 0);
        if ($userid === 0) {
            $this->log(
                'Mapped user ID not found for user ' . $olduserid
                    . ', Scaffold activity ' . $this->get_new_parentid('scaffold')
                    . '. Skipping learner activity state',
                backup::LOG_INFO,
            );
            return;
        }

        $snapshot = restore_identity_service::repair(
            artifact_identity::for_course_module((int) $this->task->get_moduleid()),
            self::decode_snapshot((string) $state->snapshotjson, 'learner activity'),
        );
        unset($state->id);
        $state->scaffoldid = $this->get_new_parentid('scaffold');
        $state->userid = $userid;
        $state->snapshotjson = self::encode_snapshot($snapshot, 'learner activity');
        $DB->insert_record('scaffold_learner_activity', $state);
    }

    protected function after_execute(): void {
        $this->add_related_files('mod_scaffold', 'intro', null);
        $this->add_related_files('mod_scaffold', 'media', 'scaffold');
    }

    private static function decode_snapshot(string $raw, string $name): \stdClass {
        try {
            $snapshot = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new invalid_parameter_exception('Restored ' . $name . ' snapshot is invalid JSON');
        }
        if (!($snapshot instanceof \stdClass)) {
            throw new invalid_parameter_exception('Restored ' . $name . ' snapshot must be a JSON object');
        }
        return $snapshot;
    }

    private static function encode_snapshot(\stdClass $snapshot, string $name): string {
        try {
            return json_encode($snapshot, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new invalid_parameter_exception('Restored ' . $name . ' snapshot cannot be encoded');
        }
    }
}

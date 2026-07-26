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

use mod_scaffold\local\artifact_identity;
use mod_scaffold\local\restore_identity_service;

/**
 * Restore structure step for a Scaffold activity.
 *
 * Restores activity records and rewrites persisted Scaffold identities.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class restore_scaffold_activity_structure_step extends restore_activity_structure_step {
    #[\Override]
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

    /**
     * Processes scaffold.
     *
     * @param mixed $data Data.
     */
    protected function process_scaffold(mixed $data): void {
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

    /**
     * Processes assessment state.
     *
     * @param mixed $data Data.
     */
    protected function process_scaffold_assessment_state(mixed $data): void {
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

        $snapshot = \mod_scaffold\local\assessment_contract_migrator::upgrade_snapshot(
            self::decode_snapshot((string) $state->snapshotjson, 'assessment'),
        );
        $snapshot = restore_identity_service::repair(
            artifact_identity::for_course_module((int) $this->task->get_moduleid()),
            $snapshot,
        );
        unset($state->id);
        $state->scaffoldid = $this->get_new_parentid('scaffold');
        $state->userid = $userid;
        $state->snapshotjson = self::encode_snapshot($snapshot, 'assessment');
        $state->staterevision = 1;
        $state->nextquizexpiry = restore_identity_service::assessment_next_expiry($snapshot);
        $DB->insert_record('scaffold_assessment_state', $state);
    }

    /**
     * Processes learner activity.
     *
     * @param mixed $data Data.
     */
    protected function process_scaffold_learner_activity(mixed $data): void {
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

    #[\Override]
    protected function after_execute(): void {
        $this->add_related_files('mod_scaffold', 'intro', null);
        $this->add_related_files('mod_scaffold', 'media', 'scaffold');
    }

    /**
     * Decodes snapshot.
     *
     * @param string $raw Raw.
     * @param string $name Name.
     * @return \stdClass
     */
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

    /**
     * Encodes snapshot.
     *
     * @param \stdClass $snapshot Canonical assessment snapshot.
     * @param string $name Name.
     * @return string
     */
    private static function encode_snapshot(\stdClass $snapshot, string $name): string {
        try {
            return json_encode($snapshot, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new invalid_parameter_exception('Restored ' . $name . ' snapshot cannot be encoded');
        }
    }
}

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

namespace mod_scaffold\external;

defined('MOODLE_INTERNAL') || die();

use mod_scaffold\local\activity_access;
use mod_scaffold\local\learner_activity_service;

/**
 * External API for saving learner activity.
 *
 * Validates and persists an authorised learner activity snapshot.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class save_learner_activity extends \core_external\external_api {
    /**
     * Defines the external function parameters.
     *
     * @return \core_external\external_function_parameters
     */
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'artifactid' => new \core_external\external_value(PARAM_RAW, 'Scaffold artifact id'),
            'blockid' => new \core_external\external_value(PARAM_RAW, 'Learner activity block id'),
            'recordjson' => new \core_external\external_value(PARAM_RAW, 'Timestamp-free learner activity record JSON'),
        ]);
    }

    /**
     * Executes the external function.
     *
     * @param int $cmid Course module ID.
     * @param string $artifactid Scaffold artifact ID.
     * @param string $blockid Learner activity block ID.
     * @param string $recordjson Recordjson.
     * @return array
     */
    public static function execute(
        int $cmid,
        string $artifactid,
        string $blockid,
        string $recordjson,
    ): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'artifactid' => $artifactid,
            'blockid' => $blockid,
            'recordjson' => $recordjson,
        ]);
        $scope = activity_access::require($params['cmid'], 'mod/scaffold:view');
        $record = (new learner_activity_service())->save(
            $scope,
            $params['artifactid'],
            $params['blockid'],
            $params['recordjson'],
        );

        return [
            'success' => true,
            'recordJson' => json_encode($record, JSON_THROW_ON_ERROR),
        ];
    }

    /**
     * Defines the external function return value.
     *
     * @return \core_external\external_single_structure
     */
    public static function execute_returns(): \core_external\external_single_structure {
        return new \core_external\external_single_structure([
            'success' => new \core_external\external_value(PARAM_BOOL, 'Success flag'),
            'recordJson' => new \core_external\external_value(PARAM_RAW, 'Authoritative learner activity record JSON'),
        ]);
    }
}

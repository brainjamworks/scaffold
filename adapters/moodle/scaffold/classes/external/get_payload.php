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


use mod_scaffold\local\activity_access;
use mod_scaffold\local\content_service;

/**
 * External API for retrieving a Scaffold payload.
 *
 * Loads the authorised authoring or runtime projection for an activity.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_payload extends \core_external\external_api {
    /**
     * Defines the external function parameters.
     *
     * @return \core_external\external_function_parameters
     */
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'purpose' => new \core_external\external_value(
                PARAM_ALPHA,
                'Requested payload projection',
            ),
        ]);
    }

    /**
     * Executes the external function.
     *
     * @param int $cmid Course module ID.
     * @param string $purpose Purpose.
     * @return array
     */
    public static function execute(int $cmid, string $purpose): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'purpose' => $purpose,
        ]);

        if ($params['purpose'] === 'authoring') {
            $scope = activity_access::require(
                $params['cmid'],
                'mod/scaffold:editcontent',
            );
        } else if ($params['purpose'] === 'learner') {
            $scope = activity_access::require($params['cmid'], 'mod/scaffold:view');
        } else {
            throw new \invalid_parameter_exception('Unknown payload purpose');
        }

        return (new content_service())->payload($scope, $params['purpose']);
    }

    /**
     * Defines the external function return value.
     *
     * @return \core_external\external_single_structure
     */
    public static function execute_returns(): \core_external\external_single_structure {
        return new \core_external\external_single_structure([
            'success' => new \core_external\external_value(PARAM_BOOL, 'Success flag'),
            'artifactJson' => new \core_external\external_value(PARAM_RAW, 'Scaffold artifact JSON'),
            'assessmentSnapshotJson' => new \core_external\external_value(PARAM_RAW, 'Canonical learner assessment snapshot JSON'),
            'learnerActivitySnapshotJson' => new \core_external\external_value(
                PARAM_RAW,
                'Canonical learner activity snapshot JSON',
                VALUE_OPTIONAL,
            ),
        ]);
    }
}

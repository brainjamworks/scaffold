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
use mod_scaffold\local\assessment_service;
use mod_scaffold\local\content_service;

/**
 * External API for finishing a quiz attempt.
 *
 * Completes an authorised attempt and returns its assessment outcome.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class finish_quiz_attempt extends \core_external\external_api {
    /**
     * Defines the external function parameters.
     *
     * @return \core_external\external_function_parameters
     */
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'attemptid' => new \core_external\external_value(PARAM_RAW, 'Quiz attempt id'),
            'groupid' => new \core_external\external_value(PARAM_RAW, 'Quiz group id'),
            'responsesjson' => new \core_external\external_value(PARAM_RAW, 'Responses by target id JSON'),
        ]);
    }

    /**
     * Executes the external function.
     *
     * @param int $cmid Course module ID.
     * @param string $attemptid Quiz attempt ID.
     * @param string $groupid Assessment group ID.
     * @param string $responsesjson Responsesjson.
     * @return array
     */
    public static function execute(
        int $cmid,
        string $attemptid,
        string $groupid,
        string $responsesjson,
    ): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'attemptid' => $attemptid,
            'groupid' => $groupid,
            'responsesjson' => $responsesjson,
        ]);
        $scope = activity_access::require($params['cmid'], 'mod/scaffold:submit');
        $result = (new assessment_service())->finish_quiz(
            $scope,
            $params['attemptid'],
            $params['groupid'],
            content_service::read_json_object($params['responsesjson'], []),
        );
        return [
            'success' => true,
            'outcomeJson' => json_encode($result['outcome'], JSON_THROW_ON_ERROR),
            'gradePublicationJson' => json_encode($result['gradePublication'], JSON_THROW_ON_ERROR),
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
            'outcomeJson' => new \core_external\external_value(PARAM_RAW, 'Canonical Quiz outcome JSON'),
            'gradePublicationJson' => new \core_external\external_value(PARAM_RAW, 'Moodle grade publication JSON'),
        ]);
    }
}

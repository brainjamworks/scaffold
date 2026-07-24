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

/**
 * External API for revealing an assessment answer.
 *
 * Reveals the authorised answer for a specific assessment target.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class reveal_answer extends \core_external\external_api {
    /**
     * Defines the external function parameters.
     *
     * @return \core_external\external_function_parameters
     */
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'problemid' => new \core_external\external_value(PARAM_RAW, 'Runtime problem id'),
            'targetid' => new \core_external\external_value(PARAM_RAW, 'Assessment target id'),
            'interactionkind' => new \core_external\external_value(PARAM_ALPHANUMEXT, 'Interaction kind'),
        ]);
    }

    /**
     * Executes the external function.
     *
     * @param int $cmid Course module ID.
     * @param string $problemid Runtime problem ID.
     * @param string $targetid Assessment target ID.
     * @param string $interactionkind Interactionkind.
     * @return array
     */
    public static function execute(
        int $cmid,
        string $problemid,
        string $targetid,
        string $interactionkind,
    ): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'problemid' => $problemid,
            'targetid' => $targetid,
            'interactionkind' => $interactionkind,
        ]);
        $scope = activity_access::require($params['cmid'], 'mod/scaffold:view');
        $answer = (new assessment_service())->reveal_answer(
            $scope,
            $params['problemid'],
            $params['targetid'],
            $params['interactionkind'],
        );

        return [
            'success' => true,
            'answerJson' => json_encode($answer),
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
            'answerJson' => new \core_external\external_value(PARAM_RAW, 'Answer reveal JSON'),
        ]);
    }
}

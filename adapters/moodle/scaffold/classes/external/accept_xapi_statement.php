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

use core_xapi\handler;
use core_xapi\local\statement;
use core_xapi\local\statement\item_agent;
use mod_scaffold\local\activity_access;

/**
 * Accepts Core-owned xAPI templates into Moodle's xAPI event pipeline.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class accept_xapi_statement extends \core_external\external_api {
    /** Host placement extension added before Moodle validates the statement. */
    private const CMID_EXTENSION = 'https://scaffold.ac/xapi/extensions/moodle-course-module-id';

    /**
     * Defines request parameters.
     *
     * @return \core_external\external_function_parameters
     */
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'statementjson' => new \core_external\external_value(PARAM_RAW, 'Core xAPI statement template JSON'),
        ]);
    }

    /**
     * Accepts one statement for the authenticated learner.
     *
     * @param int $cmid Course module ID.
     * @param string $statementjson Core statement template JSON.
     * @return array
     */
    public static function execute(int $cmid, string $statementjson): array {
        global $USER;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'statementjson' => $statementjson,
        ]);
        activity_access::require($params['cmid'], 'mod/scaffold:view');

        if (strlen($params['statementjson']) > 65536) {
            throw new \invalid_parameter_exception('xAPI statement exceeds the maximum accepted size');
        }

        $data = json_decode($params['statementjson']);
        if (!$data instanceof \stdClass) {
            throw new \invalid_parameter_exception('xAPI statement must be a JSON object');
        }
        if (property_exists($data, 'actor')) {
            throw new \invalid_parameter_exception('xAPI actor is supplied by Moodle');
        }

        $data->actor = item_agent::create_from_user($USER)->get_data();
        if (!isset($data->context) || !$data->context instanceof \stdClass) {
            $data->context = new \stdClass();
        }
        if (!isset($data->context->extensions) || !$data->context->extensions instanceof \stdClass) {
            $data->context->extensions = new \stdClass();
        }
        $extension = self::CMID_EXTENSION;
        $data->context->extensions->{$extension} = $params['cmid'];

        $statement = statement::create_from_data($data);
        $result = handler::create('mod_scaffold')->process_statements([$statement]);
        if (($result[0] ?? false) !== true) {
            throw new \invalid_parameter_exception('xAPI statement was not accepted');
        }

        return ['success' => true];
    }

    /**
     * Defines response fields.
     *
     * @return \core_external\external_single_structure
     */
    public static function execute_returns(): \core_external\external_single_structure {
        return new \core_external\external_single_structure([
            'success' => new \core_external\external_value(PARAM_BOOL, 'Success flag'),
        ]);
    }
}

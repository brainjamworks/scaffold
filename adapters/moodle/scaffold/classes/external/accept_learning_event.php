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
use mod_scaffold\learning_event\validator;
use mod_scaffold\local\activity_access;

/**
 * Accepts a canonical actorless Learning Event into Moodle's xAPI projection.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class accept_learning_event extends \core_external\external_api {
    /**
     * Defines the external function parameters.
     *
     * @return \core_external\external_function_parameters Parameters.
     */
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'eventjson' => new \core_external\external_value(PARAM_RAW, 'Canonical Learning Event JSON'),
        ]);
    }

    /**
     * Accepts one event after access and strict validation.
     *
     * @param int $cmid Course module id.
     * @param string $eventjson Canonical Learning Event JSON.
     * @return array Success response.
     */
    public static function execute(int $cmid, string $eventjson): array {
        global $USER;
        $params = self::validate_parameters(self::execute_parameters(), ['cmid' => $cmid, 'eventjson' => $eventjson]);
        activity_access::require($params['cmid'], 'mod/scaffold:view');
        $event = validator::validate_json($params['eventjson']);

        $statementdata = clone $event;
        $statementdata->actor = item_agent::create_from_user($USER)->get_data();
        $statementdata->context = isset($statementdata->context) ? clone $statementdata->context : new \stdClass();
        $statementdata->context->extensions = isset($statementdata->context->extensions)
            ? clone $statementdata->context->extensions : new \stdClass();
        $extension = validator::CMID_EXTENSION;
        if (property_exists($statementdata->context->extensions, $extension)) {
            throw new \invalid_parameter_exception('Learning Event Moodle context is supplied by Moodle');
        }
        $statementdata->context->extensions->{$extension} = $params['cmid'];

        $statement = statement::create_from_data($statementdata);
        $result = handler::create('mod_scaffold')->process_statements([$statement]);
        if (($result[0] ?? false) !== true) throw new \invalid_parameter_exception('Learning Event was not accepted');
        return ['success' => true];
    }

    /**
     * Defines the external function response.
     *
     * @return \core_external\external_single_structure Response definition.
     */
    public static function execute_returns(): \core_external\external_single_structure {
        return new \core_external\external_single_structure([
            'success' => new \core_external\external_value(PARAM_BOOL, 'Success flag'),
        ]);
    }
}

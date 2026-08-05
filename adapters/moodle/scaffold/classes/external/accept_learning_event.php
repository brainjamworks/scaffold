<?php

namespace mod_scaffold\external;

use core_xapi\handler;
use core_xapi\local\statement;
use core_xapi\local\statement\item_agent;
use mod_scaffold\learning_event\validator;
use mod_scaffold\local\activity_access;

/** Accepts a canonical actorless Learning Event into Moodle's xAPI projection. */
class accept_learning_event extends \core_external\external_api {
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'eventjson' => new \core_external\external_value(PARAM_RAW, 'Canonical Learning Event JSON'),
        ]);
    }

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

    public static function execute_returns(): \core_external\external_single_structure {
        return new \core_external\external_single_structure([
            'success' => new \core_external\external_value(PARAM_BOOL, 'Success flag'),
        ]);
    }
}

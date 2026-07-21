<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\external;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/externallib.php');

use mod_scaffold\local\activity_access;
use mod_scaffold\local\assessment_service;

class start_quiz_attempt extends \external_api {
    public static function execute_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid' => new \external_value(PARAM_INT, 'Course module id'),
            'groupid' => new \external_value(PARAM_RAW, 'Quiz group id'),
        ]);
    }

    public static function execute(int $cmid, string $groupid): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'groupid' => $groupid,
        ]);
        $scope = activity_access::require($params['cmid'], 'mod/scaffold:submit');
        $result = (new assessment_service())->start_quiz($scope, $params['groupid']);
        return [
            'success' => true,
            'outcomeJson' => json_encode($result['outcome'], JSON_THROW_ON_ERROR),
            'gradePublicationJson' => json_encode($result['gradePublication'], JSON_THROW_ON_ERROR),
        ];
    }

    public static function execute_returns(): \external_single_structure {
        return new \external_single_structure([
            'success' => new \external_value(PARAM_BOOL, 'Success flag'),
            'outcomeJson' => new \external_value(PARAM_RAW, 'Canonical Quiz outcome JSON'),
            'gradePublicationJson' => new \external_value(PARAM_RAW, 'Moodle grade publication JSON'),
        ]);
    }
}

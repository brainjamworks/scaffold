<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\external;

defined('MOODLE_INTERNAL') || die();

use mod_scaffold\local\activity_access;
use mod_scaffold\local\assessment_service;

class reveal_quiz_answers extends \core_external\external_api {
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'attemptid' => new \core_external\external_value(PARAM_RAW, 'Quiz attempt id'),
            'groupid' => new \core_external\external_value(PARAM_RAW, 'Quiz group id'),
        ]);
    }

    public static function execute(int $cmid, string $attemptid, string $groupid): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'attemptid' => $attemptid,
            'groupid' => $groupid,
        ]);
        $scope = activity_access::require($params['cmid'], 'mod/scaffold:submit');
        $result = (new assessment_service())->reveal_quiz(
            $scope,
            $params['attemptid'],
            $params['groupid'],
        );
        return [
            'success' => true,
            'outcomeJson' => json_encode($result['outcome'], JSON_THROW_ON_ERROR),
            'gradePublicationJson' => json_encode($result['gradePublication'], JSON_THROW_ON_ERROR),
        ];
    }

    public static function execute_returns(): \core_external\external_single_structure {
        return new \core_external\external_single_structure([
            'success' => new \core_external\external_value(PARAM_BOOL, 'Success flag'),
            'outcomeJson' => new \core_external\external_value(PARAM_RAW, 'Canonical Quiz outcome JSON'),
            'gradePublicationJson' => new \core_external\external_value(PARAM_RAW, 'Moodle grade publication JSON'),
        ]);
    }
}

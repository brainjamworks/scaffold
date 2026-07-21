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
use mod_scaffold\local\content_service;

class submit_quiz_question extends \external_api {
    public static function execute_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid' => new \external_value(PARAM_INT, 'Course module id'),
            'attemptid' => new \external_value(PARAM_RAW, 'Quiz attempt id'),
            'groupid' => new \external_value(PARAM_RAW, 'Quiz group id'),
            'targetid' => new \external_value(PARAM_RAW, 'Assessment target id'),
            'responsejson' => new \external_value(PARAM_RAW, 'Response JSON'),
            'expectedattemptnumber' => new \external_value(PARAM_INT, 'Expected canonical attempt count'),
        ]);
    }

    public static function execute(
        int $cmid,
        string $attemptid,
        string $groupid,
        string $targetid,
        string $responsejson,
        int $expectedattemptnumber,
    ): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'attemptid' => $attemptid,
            'groupid' => $groupid,
            'targetid' => $targetid,
            'responsejson' => $responsejson,
            'expectedattemptnumber' => $expectedattemptnumber,
        ]);
        $scope = activity_access::require($params['cmid'], 'mod/scaffold:submit');
        $result = (new assessment_service())->submit_quiz_question(
            $scope,
            $params['attemptid'],
            $params['groupid'],
            $params['targetid'],
            content_service::read_json_object($params['responsejson'], []),
            $params['expectedattemptnumber'],
        );
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

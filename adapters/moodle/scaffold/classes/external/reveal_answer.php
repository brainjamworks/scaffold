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

class reveal_answer extends \external_api {
    public static function execute_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid' => new \external_value(PARAM_INT, 'Course module id'),
            'problemid' => new \external_value(PARAM_RAW, 'Runtime problem id'),
            'targetid' => new \external_value(PARAM_RAW, 'Assessment target id'),
            'interactionkind' => new \external_value(PARAM_ALPHANUMEXT, 'Interaction kind'),
        ]);
    }

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

    public static function execute_returns(): \external_single_structure {
        return new \external_single_structure([
            'success' => new \external_value(PARAM_BOOL, 'Success flag'),
            'answerJson' => new \external_value(PARAM_RAW, 'Answer reveal JSON'),
        ]);
    }
}

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
use mod_scaffold\local\content_service;

class get_payload extends \external_api {
    public static function execute_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid' => new \external_value(PARAM_INT, 'Course module id'),
            'purpose' => new \external_value(
                PARAM_ALPHA,
                'Requested payload projection',
            ),
        ]);
    }

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
        } elseif ($params['purpose'] === 'learner') {
            $scope = activity_access::require($params['cmid'], 'mod/scaffold:view');
        } else {
            throw new \invalid_parameter_exception('Unknown payload purpose');
        }

        return (new content_service())->payload($scope, $params['purpose']);
    }

    public static function execute_returns(): \external_single_structure {
        return new \external_single_structure([
            'success' => new \external_value(PARAM_BOOL, 'Success flag'),
            'artifactJson' => new \external_value(PARAM_RAW, 'Scaffold artifact JSON'),
            'assessmentSnapshotJson' => new \external_value(PARAM_RAW, 'Canonical learner assessment snapshot JSON'),
            'learnerActivitySnapshotJson' => new \external_value(
                PARAM_RAW,
                'Canonical learner activity snapshot JSON',
                VALUE_OPTIONAL,
            ),
        ]);
    }
}

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
use mod_scaffold\local\learner_activity_service;

class load_learner_activity extends \external_api {
    public static function execute_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid' => new \external_value(PARAM_INT, 'Course module id'),
            'artifactid' => new \external_value(PARAM_RAW, 'Scaffold artifact id'),
        ]);
    }

    public static function execute(int $cmid, string $artifactid): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'artifactid' => $artifactid,
        ]);
        $scope = activity_access::require($params['cmid'], 'mod/scaffold:view');
        $service = new learner_activity_service();
        $service->require_artifact($scope, $params['artifactid']);
        $snapshot = $service->load($scope);

        return [
            'success' => true,
            'snapshotJson' => json_encode($snapshot, JSON_THROW_ON_ERROR),
        ];
    }

    public static function execute_returns(): \external_single_structure {
        return new \external_single_structure([
            'success' => new \external_value(PARAM_BOOL, 'Success flag'),
            'snapshotJson' => new \external_value(PARAM_RAW, 'Canonical learner activity snapshot JSON'),
        ]);
    }
}

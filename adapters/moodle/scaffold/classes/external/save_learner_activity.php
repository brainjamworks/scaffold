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

class save_learner_activity extends \external_api {
    public static function execute_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid' => new \external_value(PARAM_INT, 'Course module id'),
            'artifactid' => new \external_value(PARAM_RAW, 'Scaffold artifact id'),
            'blockid' => new \external_value(PARAM_RAW, 'Learner activity block id'),
            'recordjson' => new \external_value(PARAM_RAW, 'Timestamp-free learner activity record JSON'),
        ]);
    }

    public static function execute(
        int $cmid,
        string $artifactid,
        string $blockid,
        string $recordjson,
    ): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'artifactid' => $artifactid,
            'blockid' => $blockid,
            'recordjson' => $recordjson,
        ]);
        $scope = activity_access::require($params['cmid'], 'mod/scaffold:view');
        $record = (new learner_activity_service())->save(
            $scope,
            $params['artifactid'],
            $params['blockid'],
            $params['recordjson'],
        );

        return [
            'success' => true,
            'recordJson' => json_encode($record, JSON_THROW_ON_ERROR),
        ];
    }

    public static function execute_returns(): \external_single_structure {
        return new \external_single_structure([
            'success' => new \external_value(PARAM_BOOL, 'Success flag'),
            'recordJson' => new \external_value(PARAM_RAW, 'Authoritative learner activity record JSON'),
        ]);
    }
}

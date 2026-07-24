<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\external;

defined('MOODLE_INTERNAL') || die();

use mod_scaffold\local\activity_access;
use mod_scaffold\local\media_service;

class resolve_media extends \core_external\external_api {
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'mediaid' => new \core_external\external_value(PARAM_TEXT, 'Scaffold media id'),
        ]);
    }

    public static function execute(int $cmid, string $mediaid): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'mediaid' => $mediaid,
        ]);
        $scope = activity_access::require($params['cmid'], 'mod/scaffold:view');
        $media = media_service::resolve_media($scope->instance, $scope->context, $params['mediaid']);

        return [
            'success' => true,
            'mediaId' => $media['mediaId'],
            'url' => $media['url'],
        ];
    }

    public static function execute_returns(): \core_external\external_single_structure {
        return new \core_external\external_single_structure([
            'success' => new \core_external\external_value(PARAM_BOOL, 'Success flag'),
            'mediaId' => new \core_external\external_value(PARAM_TEXT, 'Scaffold media id'),
            'url' => new \core_external\external_value(PARAM_RAW, 'Resolved media URL'),
        ]);
    }
}

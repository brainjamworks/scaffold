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
use mod_scaffold\local\media_service;

class upload_media extends \external_api {
    public static function execute_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid' => new \external_value(PARAM_INT, 'Course module id'),
            'mediatype' => new \external_value(PARAM_ALPHANUMEXT, 'Scaffold upload media type'),
            'filename' => new \external_value(PARAM_FILE, 'Original filename'),
            'contenttype' => new \external_value(PARAM_RAW, 'Content type'),
            'dataurl' => new \external_value(PARAM_RAW, 'Base64 data URL'),
        ]);
    }

    public static function execute(
        int $cmid,
        string $mediatype,
        string $filename,
        string $contenttype,
        string $dataurl,
    ): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'mediatype' => $mediatype,
            'filename' => $filename,
            'contenttype' => $contenttype,
            'dataurl' => $dataurl,
        ]);
        $scope = activity_access::require($params['cmid'], 'mod/scaffold:editcontent');
        $media = media_service::upload_media(
            $scope->instance,
            $scope->cm,
            $scope->context,
            $params['mediatype'],
            $params['filename'],
            $params['contenttype'],
            $params['dataurl'],
        );

        return [
            'success' => true,
            'mediaId' => $media['mediaId'],
            'url' => $media['url'],
        ];
    }

    public static function execute_returns(): \external_single_structure {
        return new \external_single_structure([
            'success' => new \external_value(PARAM_BOOL, 'Success flag'),
            'mediaId' => new \external_value(PARAM_TEXT, 'Scaffold media id'),
            'url' => new \external_value(PARAM_RAW, 'Resolved media URL'),
        ]);
    }
}

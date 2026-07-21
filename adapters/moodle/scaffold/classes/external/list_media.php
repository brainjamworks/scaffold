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

class list_media extends \external_api {
    public static function execute_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid' => new \external_value(PARAM_INT, 'Course module id'),
            'kind' => new \external_value(
                PARAM_TEXT,
                'Filter kind: media, documents, all',
                VALUE_DEFAULT,
                '',
            ),
            'mediatype' => new \external_value(
                PARAM_TEXT,
                'Specific media type to filter by',
                VALUE_DEFAULT,
                '',
            ),
        ]);
    }

    public static function execute(int $cmid, string $kind = '', string $mediatype = ''): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'kind' => $kind,
            'mediatype' => $mediatype,
        ]);

        $scope = activity_access::require($params['cmid'], 'mod/scaffold:editcontent');

        $items = media_service::list_media(
            $scope->instance,
            $scope->context,
            $params['kind'] !== '' ? $params['kind'] : null,
            $params['mediatype'] !== '' ? $params['mediatype'] : null,
        );

        return [
            'success' => true,
            'items' => $items,
        ];
    }

    public static function execute_returns(): \external_single_structure {
        return new \external_single_structure([
            'success' => new \external_value(PARAM_BOOL, 'Success flag'),
            'items' => new \external_multiple_structure(
                new \external_single_structure([
                    'id' => new \external_value(PARAM_TEXT, 'Scaffold media id'),
                    'url' => new \external_value(PARAM_RAW, 'Fetchable URL'),
                    'mediaType' => new \external_value(PARAM_TEXT, 'Inferred media type'),
                    'fileName' => new \external_value(PARAM_TEXT, 'Original file name'),
                    'mimeType' => new \external_value(PARAM_TEXT, 'MIME type'),
                    'size' => new \external_value(PARAM_INT, 'Size in bytes'),
                    'createdAt' => new \external_value(
                        PARAM_TEXT,
                        'ISO8601 upload timestamp',
                        VALUE_OPTIONAL,
                        null,
                        NULL_ALLOWED,
                    ),
                ]),
            ),
        ]);
    }
}

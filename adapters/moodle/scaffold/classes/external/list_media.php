<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Scaffold is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

namespace mod_scaffold\external;

defined('MOODLE_INTERNAL') || die();

use mod_scaffold\local\activity_access;
use mod_scaffold\local\media_service;

class list_media extends \core_external\external_api {
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'kind' => new \core_external\external_value(
                PARAM_TEXT,
                'Filter kind: media, documents, all',
                VALUE_DEFAULT,
                '',
            ),
            'mediatype' => new \core_external\external_value(
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

    public static function execute_returns(): \core_external\external_single_structure {
        return new \core_external\external_single_structure([
            'success' => new \core_external\external_value(PARAM_BOOL, 'Success flag'),
            'items' => new \core_external\external_multiple_structure(
                new \core_external\external_single_structure([
                    'id' => new \core_external\external_value(PARAM_TEXT, 'Scaffold media id'),
                    'url' => new \core_external\external_value(PARAM_RAW, 'Fetchable URL'),
                    'mediaType' => new \core_external\external_value(PARAM_TEXT, 'Inferred media type'),
                    'fileName' => new \core_external\external_value(PARAM_TEXT, 'Original file name'),
                    'mimeType' => new \core_external\external_value(PARAM_TEXT, 'MIME type'),
                    'size' => new \core_external\external_value(PARAM_INT, 'Size in bytes'),
                    'createdAt' => new \core_external\external_value(
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

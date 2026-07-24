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


use mod_scaffold\local\activity_access;
use mod_scaffold\local\media_service;

/**
 * External API for uploading activity media.
 *
 * Validates and stores an authorised media file for a Scaffold activity.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class upload_media extends \core_external\external_api {
    /**
     * Defines the external function parameters.
     *
     * @return \core_external\external_function_parameters
     */
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'mediatype' => new \core_external\external_value(PARAM_ALPHANUMEXT, 'Scaffold upload media type'),
            'filename' => new \core_external\external_value(PARAM_FILE, 'Original filename'),
            'contenttype' => new \core_external\external_value(PARAM_RAW, 'Content type'),
            'dataurl' => new \core_external\external_value(PARAM_RAW, 'Base64 data URL'),
        ]);
    }

    /**
     * Executes the external function.
     *
     * @param int $cmid Course module ID.
     * @param string $mediatype Mediatype.
     * @param string $filename Filename.
     * @param string $contenttype Contenttype.
     * @param string $dataurl Dataurl.
     * @return array
     */
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

    /**
     * Defines the external function return value.
     *
     * @return \core_external\external_single_structure
     */
    public static function execute_returns(): \core_external\external_single_structure {
        return new \core_external\external_single_structure([
            'success' => new \core_external\external_value(PARAM_BOOL, 'Success flag'),
            'mediaId' => new \core_external\external_value(PARAM_TEXT, 'Scaffold media id'),
            'url' => new \core_external\external_value(PARAM_RAW, 'Resolved media URL'),
        ]);
    }
}

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

/**
 * External API for resolving activity media.
 *
 * Returns an authorised media reference for a Scaffold activity.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class resolve_media extends \core_external\external_api {
    /**
     * Defines the external function parameters.
     *
     * @return \core_external\external_function_parameters
     */
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'mediaid' => new \core_external\external_value(PARAM_TEXT, 'Scaffold media id'),
        ]);
    }

    /**
     * Executes the external function.
     *
     * @param int $cmid Course module ID.
     * @param string $mediaid Mediaid.
     * @return array
     */
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

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
use mod_scaffold\local\content_service;

/**
 * External API for saving Scaffold content.
 *
 * Validates and persists the authored content for an activity.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class save_content extends \core_external\external_api {
    /**
     * Defines the external function parameters.
     *
     * @return \core_external\external_function_parameters
     */
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'artifactjson' => new \core_external\external_value(PARAM_RAW, 'Scaffold artifact JSON'),
            'learnercontentjson' => new \core_external\external_value(PARAM_RAW, 'Learner content JSON'),
            'assessmenttargetsjson' => new \core_external\external_value(PARAM_RAW, 'Assessment targets JSON'),
            'assessmentgroupsjson' => new \core_external\external_value(PARAM_RAW, 'Assessment groups JSON'),
        ]);
    }

    /**
     * Executes the external function.
     *
     * @param int $cmid Course module ID.
     * @param string $artifactjson Artifactjson.
     * @param string $learnercontentjson Learnercontentjson.
     * @param string $assessmenttargetsjson Assessmenttargetsjson.
     * @param string $assessmentgroupsjson Assessmentgroupsjson.
     * @return array
     */
    public static function execute(
        int $cmid,
        string $artifactjson,
        string $learnercontentjson,
        string $assessmenttargetsjson,
        string $assessmentgroupsjson,
    ): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'artifactjson' => $artifactjson,
            'learnercontentjson' => $learnercontentjson,
            'assessmenttargetsjson' => $assessmenttargetsjson,
            'assessmentgroupsjson' => $assessmentgroupsjson,
        ]);
        $scope = activity_access::require($params['cmid'], 'mod/scaffold:editcontent');
        $result = (new content_service())->save(
            $scope,
            $params['artifactjson'],
            $params['learnercontentjson'],
            $params['assessmenttargetsjson'],
            $params['assessmentgroupsjson'],
        );

        return [
            'success' => true,
            'artifact' => ['title' => $result['content']->name],
            'gradeItemPublication' => $result['gradeItemPublication'],
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
            'artifact' => new \core_external\external_single_structure([
                'title' => new \core_external\external_value(PARAM_TEXT, 'Saved artifact title'),
            ]),
            'gradeItemPublication' => new \core_external\external_value(
                PARAM_ALPHA,
                'Grade-item publication status after content confirmation',
            ),
        ]);
    }
}

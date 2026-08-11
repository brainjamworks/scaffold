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
use mod_scaffold\local\content_service;

/**
 * External API for explicitly publishing a saved Scaffold revision.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class publish_content extends \core_external\external_api {
    /**
     * Defines request parameters.
     *
     * @return \core_external\external_function_parameters
     */
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'sourceartifactrevision' => new \core_external\external_value(
                PARAM_ALPHANUM,
                'Opaque saved artifact revision',
            ),
            'artifactmetadatajson' => new \core_external\external_value(
                PARAM_RAW,
                'Published safe artifact metadata JSON',
            ),
            'learnercontentjson' => new \core_external\external_value(
                PARAM_RAW,
                'Published learner content JSON',
            ),
            'assessmenttargetsjson' => new \core_external\external_value(
                PARAM_RAW,
                'Private published assessment targets JSON',
            ),
            'assessmentgroupsjson' => new \core_external\external_value(
                PARAM_RAW,
                'Private published assessment groups JSON',
            ),
        ]);
    }

    /**
     * Publishes one saved revision.
     *
     * @param int $cmid Course module ID.
     * @param string $sourceartifactrevision Source artifact revision.
     * @param string $artifactmetadatajson Published artifact metadata JSON.
     * @param string $learnercontentjson Learner content JSON.
     * @param string $assessmenttargetsjson Assessment targets JSON.
     * @param string $assessmentgroupsjson Assessment groups JSON.
     * @return array
     */
    public static function execute(
        int $cmid,
        string $sourceartifactrevision,
        string $artifactmetadatajson,
        string $learnercontentjson,
        string $assessmenttargetsjson,
        string $assessmentgroupsjson,
    ): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'sourceartifactrevision' => $sourceartifactrevision,
            'artifactmetadatajson' => $artifactmetadatajson,
            'learnercontentjson' => $learnercontentjson,
            'assessmenttargetsjson' => $assessmenttargetsjson,
            'assessmentgroupsjson' => $assessmentgroupsjson,
        ]);
        $scope = activity_access::require($params['cmid'], 'mod/scaffold:editcontent');
        $result = (new content_service())->publish(
            $scope,
            $params['sourceartifactrevision'],
            $params['artifactmetadatajson'],
            $params['learnercontentjson'],
            $params['assessmenttargetsjson'],
            $params['assessmentgroupsjson'],
        );
        return [
            'success' => true,
            'publicationStatusJson' => json_encode($result['status'], JSON_THROW_ON_ERROR),
        ];
    }

    /**
     * Defines response structure.
     *
     * @return \core_external\external_single_structure
     */
    public static function execute_returns(): \core_external\external_single_structure {
        return new \core_external\external_single_structure([
            'success' => new \core_external\external_value(PARAM_BOOL, 'Success flag'),
            'publicationStatusJson' => new \core_external\external_value(
                PARAM_RAW,
                'Authoritative publication status JSON',
            ),
        ]);
    }
}

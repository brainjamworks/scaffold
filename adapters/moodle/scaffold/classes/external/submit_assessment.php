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
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Scaffold. If not, see <https://www.gnu.org/licenses/>.

namespace mod_scaffold\external;

defined('MOODLE_INTERNAL') || die();

use mod_scaffold\local\activity_access;
use mod_scaffold\local\assessment_service;
use mod_scaffold\local\content_service;

class submit_assessment extends \core_external\external_api {
    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([
            'cmid' => new \core_external\external_value(PARAM_INT, 'Course module id'),
            'problemid' => new \core_external\external_value(PARAM_RAW, 'Runtime problem id'),
            'targetid' => new \core_external\external_value(PARAM_RAW, 'Assessment target id'),
            'interactionkind' => new \core_external\external_value(PARAM_ALPHANUMEXT, 'Interaction kind'),
            'responsejson' => new \core_external\external_value(PARAM_RAW, 'Response JSON'),
            'expectedattemptnumber' => new \core_external\external_value(PARAM_INT, 'Expected canonical attempt count'),
        ]);
    }

    public static function execute(
        int $cmid,
        string $problemid,
        string $targetid,
        string $interactionkind,
        string $responsejson,
        int $expectedattemptnumber,
    ): array {
        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'problemid' => $problemid,
            'targetid' => $targetid,
            'interactionkind' => $interactionkind,
            'responsejson' => $responsejson,
            'expectedattemptnumber' => $expectedattemptnumber,
        ]);
        $scope = activity_access::require($params['cmid'], 'mod/scaffold:submit');
        $result = (new assessment_service())->submit(
            $scope,
            $params['problemid'],
            $params['targetid'],
            $params['interactionkind'],
            content_service::read_json_object($params['responsejson'], []),
            $params['expectedattemptnumber'],
        );

        return [
            'success' => true,
            'outcomeJson' => json_encode($result['outcome'], JSON_THROW_ON_ERROR),
            'gradePublicationJson' => json_encode($result['gradePublication'], JSON_THROW_ON_ERROR),
        ];
    }

    public static function execute_returns(): \core_external\external_single_structure {
        return new \core_external\external_single_structure([
            'success' => new \core_external\external_value(PARAM_BOOL, 'Success flag'),
            'outcomeJson' => new \core_external\external_value(PARAM_RAW, 'Canonical assessment outcome JSON'),
            'gradePublicationJson' => new \core_external\external_value(PARAM_RAW, 'Moodle grade publication JSON'),
        ]);
    }
}

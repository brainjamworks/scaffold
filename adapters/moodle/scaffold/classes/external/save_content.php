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
use mod_scaffold\local\content_service;

class save_content extends \external_api {
    public static function execute_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid' => new \external_value(PARAM_INT, 'Course module id'),
            'artifactjson' => new \external_value(PARAM_RAW, 'Scaffold artifact JSON'),
            'learnercontentjson' => new \external_value(PARAM_RAW, 'Learner content JSON'),
            'assessmenttargetsjson' => new \external_value(PARAM_RAW, 'Assessment targets JSON'),
            'assessmentgroupsjson' => new \external_value(PARAM_RAW, 'Assessment groups JSON'),
        ]);
    }

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

    public static function execute_returns(): \external_single_structure {
        return new \external_single_structure([
            'success' => new \external_value(PARAM_BOOL, 'Success flag'),
            'artifact' => new \external_single_structure([
                'title' => new \external_value(PARAM_TEXT, 'Saved artifact title'),
            ]),
            'gradeItemPublication' => new \external_value(
                PARAM_ALPHA,
                'Grade-item publication status after content confirmation',
            ),
        ]);
    }
}

<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

class assessment_target_validator {
    public static function validate_targets(array $targets): array {
        if (!array_is_list($targets)) {
            throw new \invalid_parameter_exception('assessmenttargetsjson must be a JSON array');
        }

        $targetids = [];
        foreach ($targets as $index => $target) {
            json_schema_validator::validate_plugin_definition(
                'AssessmentTargetContract',
                $target,
                'assessmentTargets[' . $index . ']',
            );
            $targetid = $target->targetId;
            if (isset($targetids[$targetid])) {
                throw new \invalid_parameter_exception('assessmentTargets contains duplicate targetId: ' . $targetid);
            }
            $targetids[$targetid] = true;
        }

        return $targets;
    }
}

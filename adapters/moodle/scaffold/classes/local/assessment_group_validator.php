<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

class assessment_group_validator {
    public static function validate_groups(array $groups, array $targets): array {
        if (!array_is_list($groups)) {
            throw new \invalid_parameter_exception('assessmentgroupsjson must be a JSON array');
        }

        $targetids = [];
        foreach ($targets as $target) {
            $targetid = self::object_property($target, 'targetId');
            if (is_string($targetid)) {
                $targetids[$targetid] = true;
            }
        }

        $groupids = [];
        foreach ($groups as $index => $group) {
            $path = 'assessmentGroups[' . $index . ']';
            json_schema_validator::validate_plugin_definition(
                'AssessmentGroupContract',
                $group,
                $path,
            );

            $groupid = self::object_property($group, 'groupId');
            if (array_key_exists($groupid, $groupids)) {
                throw new \invalid_parameter_exception($path . '.groupId must be unique');
            }
            $groupids[$groupid] = true;

            foreach (self::object_property($group, 'targetIds') as $targetid) {
                if (!array_key_exists($targetid, $targetids)) {
                    throw new \invalid_parameter_exception(
                        $path . '.targetIds references an unknown assessment target',
                    );
                }
            }
        }

        self::quiz_group_id_by_target_id($groups);
        return $groups;
    }

    public static function quiz_group_id_by_target_id(array $groups): array {
        $ownership = [];
        foreach ($groups as $group) {
            if (self::object_property($group, 'kind') !== 'quiz') {
                continue;
            }

            $groupid = self::object_property($group, 'groupId');
            $targetids = self::object_property($group, 'targetIds');
            if (!is_string($groupid) || !is_array($targetids)) {
                throw new \invalid_parameter_exception('Quiz target ownership cannot be determined');
            }

            foreach ($targetids as $targetid) {
                if (isset($ownership[$targetid]) && $ownership[$targetid] !== $groupid) {
                    throw new \invalid_parameter_exception(
                        'Assessment target ' . $targetid . ' belongs to multiple Quiz groups',
                    );
                }
                $ownership[$targetid] = $groupid;
            }
        }
        return $ownership;
    }

    private static function object_property(mixed $value, string $name): mixed {
        if ($value instanceof \stdClass) {
            return $value->{$name} ?? null;
        }
        if (is_array($value) && !array_is_list($value)) {
            return $value[$name] ?? null;
        }
        return null;
    }
}

<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

final class assessment_projection {
    public static function for_activity(\stdClass $scaffold): array {
        return self::from_json(
            $scaffold->assessmenttargetsjson ?? '',
            $scaffold->assessmentgroupsjson ?? '',
            'stored assessment targets',
            'stored assessment groups',
        );
    }

    public static function from_json(
        string $targetsjson,
        string $groupsjson,
        string $targetsname,
        string $groupsname,
    ): array {
        $targets = self::decode_required_list($targetsjson, $targetsname);
        $groups = self::decode_required_list($groupsjson, $groupsname);
        $validatedtargets = assessment_target_validator::validate_targets($targets);
        $validatedgroups = assessment_group_validator::validate_groups($groups, $validatedtargets);

        return [
            'targets' => array_map([self::class, 'json_value_to_php'], $validatedtargets),
            'groups' => array_map([self::class, 'json_value_to_php'], $validatedgroups),
        ];
    }

    public static function for_user(\stdClass $scaffold, int $userid): \stdClass {
        $projection = self::for_activity($scaffold);
        $state = (new assessment_state_repository())->get_or_create_state(
            (int) $scaffold->id,
            $userid,
            artifact_identity::for_course_module(self::course_module_id($scaffold)),
        );

        return assessment_grade_projector::build(
            $projection['targets'],
            $projection['groups'],
            $state->snapshot,
            $state->changedAt,
        );
    }

    public static function activity_status_for_user(
        \stdClass $scaffold,
        int $cmid,
        int $userid,
    ): string {
        $states = (new assessment_state_repository())->find_states_for_activity(
            (int) $scaffold->id,
            artifact_identity::for_course_module($cmid),
            $userid,
        );
        if (!isset($states[$userid])) {
            return 'not_started';
        }

        $projection = self::for_activity($scaffold);
        $state = $states[$userid];
        return assessment_grade_projector::build(
            $projection['targets'],
            $projection['groups'],
            $state->snapshot,
            $state->changedAt,
        )->activityStatus;
    }

    public static function raw_grade_for_user(\stdClass $scaffold, int $userid): ?float {
        return assessment_grade_projector::to_raw_grade(
            self::for_user($scaffold, $userid),
            $scaffold->grade ?? null,
        );
    }

    public static function grade_records_for_activity(\stdClass $scaffold, int $userid = 0): array {
        $batch = self::for_activity_users($scaffold, $userid);
        $grades = [];
        foreach ($batch['projections'] as $snapshotuserid => $gradeprojection) {
            $rawgrade = assessment_grade_projector::to_raw_grade(
                $gradeprojection,
                $scaffold->grade ?? null,
            );
            if ($rawgrade === null) {
                continue;
            }
            $grades[$snapshotuserid] = [
                'userid' => $snapshotuserid,
                'rawgrade' => $rawgrade,
            ];
        }
        return $grades;
    }

    public static function for_activity_users(\stdClass $scaffold, int $userid = 0): array {
        $projection = self::for_activity($scaffold);
        $artifactid = artifact_identity::for_course_module(self::course_module_id($scaffold));
        $states = (new assessment_state_repository())->find_states_for_activity(
            (int) $scaffold->id,
            $artifactid,
            $userid > 0 ? $userid : null,
        );

        $gradeprojections = [];
        foreach ($states as $snapshotuserid => $state) {
            $gradeprojections[$snapshotuserid] = assessment_grade_projector::build(
                $projection['targets'],
                $projection['groups'],
                $state->snapshot,
                $state->changedAt,
            );
        }

        return [
            'artifactId' => $artifactid,
            'projections' => $gradeprojections,
        ];
    }

    private static function decode_required_list(string $raw, string $name): array {
        try {
            $value = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \invalid_parameter_exception($name . ' must contain valid JSON');
        }
        if (!is_array($value) || !array_is_list($value)) {
            throw new \invalid_parameter_exception($name . ' must be a JSON array');
        }
        return $value;
    }

    private static function json_object_to_array(\stdClass $value): array {
        $result = [];
        foreach (get_object_vars($value) as $key => $child) {
            $result[$key] = self::json_value_to_php($child);
        }
        return $result;
    }

    private static function json_value_to_php(mixed $value): mixed {
        if ($value instanceof \stdClass) {
            return get_object_vars($value) === [] ? $value : self::json_object_to_array($value);
        }
        if (is_array($value)) {
            return array_map([self::class, 'json_value_to_php'], $value);
        }
        return $value;
    }

    private static function course_module_id(\stdClass $scaffold): int {
        if (isset($scaffold->coursemodule) && (int) $scaffold->coursemodule > 0) {
            return (int) $scaffold->coursemodule;
        }

        $cm = get_coursemodule_from_instance(
            'scaffold',
            (int) $scaffold->id,
            isset($scaffold->course) ? (int) $scaffold->course : 0,
            false,
            MUST_EXIST,
        );
        return (int) $cm->id;
    }
}

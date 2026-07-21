<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

class assessment_grade_projector {
    public static function build(
        array $targets,
        array $groups,
        \stdClass $snapshot,
        string $changedat,
    ): \stdClass {
        $problems = $snapshot->problems instanceof \stdClass ? $snapshot->problems : new \stdClass();
        $quizzes = $snapshot->quizzes instanceof \stdClass ? $snapshot->quizzes : new \stdClass();
        $grouppolicy = self::quiz_group_policy_by_target_id($groups);
        $groupedtargetids = array_fill_keys(array_keys($grouppolicy), true);
        $totalpoints = 0.0;
        $earnedpoints = 0.0;
        $hasnumericresult = self::has_authoritative_quiz_result($groups, $quizzes);

        foreach ($targets as $target) {
            $targetid = is_string($target['targetId'] ?? null) ? $target['targetId'] : '';
            if ($targetid === '' || !self::target_contributes_to_score($target, $grouppolicy[$targetid] ?? null)) {
                continue;
            }

            $points = self::target_points($target);
            $totalpoints += $points;
            $grouppolicyfortarget = $grouppolicy[$targetid] ?? null;
            if ($grouppolicyfortarget !== null) {
                $result = self::authoritative_quiz_result(
                    $quizzes,
                    $grouppolicyfortarget['groupid'],
                    $targetid,
                );
            } else {
                $problem = property_exists($problems, $targetid) ? $problems->{$targetid} : null;
                $result = self::authoritative_problem_result($problem);
            }
            if ($result === null) {
                continue;
            }
            $hasnumericresult = true;
            $earnedpoints += (float) $result->score * $points;
        }

        $normalizedscore = null;
        if ($hasnumericresult && $totalpoints > 0) {
            $normalizedscore = $earnedpoints / $totalpoints;
        }

        $haspersistedactivity = count(get_object_vars($problems)) > 0 || count(get_object_vars($quizzes)) > 0;
        $standaloneisterminal = self::standalone_targets_are_terminal(
            $targets,
            $groupedtargetids,
            $problems,
        );
        $quizzesareterminal = self::quiz_attempts_are_terminal($groups, $quizzes);

        if (!$haspersistedactivity) {
            $activitystatus = 'not_started';
        } else if ($standaloneisterminal && $quizzesareterminal) {
            $activitystatus = 'completed';
        } else {
            $activitystatus = 'in_progress';
        }

        $projection = (object) [
            'normalizedScore' => $normalizedscore,
            'activityStatus' => $activitystatus,
            'gradingStatus' => $normalizedscore === null ? 'not_ready' : 'graded',
            'changedAt' => $changedat,
        ];
        json_schema_validator::validate_plugin_definition(
            'AssessmentGradeProjection',
            $projection,
            'assessmentGradeProjection',
        );
        return $projection;
    }

    public static function to_raw_grade(\stdClass $projection, mixed $maximum): ?float {
        json_schema_validator::validate_plugin_definition(
            'AssessmentGradeProjection',
            $projection,
            'assessmentGradeProjection',
        );
        if ($projection->normalizedScore === null) {
            return null;
        }
        if ($maximum === null || (is_numeric($maximum) && (float) $maximum === 0.0)) {
            return null;
        }
        if (is_bool($maximum) || !is_numeric($maximum)) {
            throw new \invalid_parameter_exception('Moodle activity grade maximum must be a positive finite number');
        }
        $numericmaximum = (float) $maximum;
        if (!is_finite($numericmaximum) || $numericmaximum < 0) {
            throw new \invalid_parameter_exception('Moodle activity grade maximum must be a positive finite number');
        }
        return (float) $projection->normalizedScore * $numericmaximum;
    }

    public static function to_moodle_grade_record(
        \stdClass $projection,
        mixed $maximum,
        int $userid,
    ): ?array {
        if ($userid <= 0) {
            throw new \invalid_parameter_exception('Moodle grade learner identity must be positive');
        }
        $rawgrade = self::to_raw_grade($projection, $maximum);
        if ($rawgrade === null) {
            return null;
        }
        return [
            'userid' => $userid,
            'rawgrade' => $rawgrade,
        ];
    }

    private static function target_points(array $target): float {
        $settings = is_array($target['settings'] ?? null) ? $target['settings'] : [];
        $points = $settings['points'] ?? 1;
        return is_numeric($points) ? max(0.0, (float) $points) : 1.0;
    }

    private static function target_is_graded(array $target): bool {
        $settings = is_array($target['settings'] ?? null) ? $target['settings'] : [];
        return array_key_exists('isGraded', $settings) ? $settings['isGraded'] === true : true;
    }

    private static function target_contributes_to_score(array $target, ?array $grouppolicy): bool {
        if (!self::target_is_graded($target)) {
            return false;
        }
        return $grouppolicy === null || $grouppolicy['hasgradedgroup'];
    }

    private static function authoritative_problem_result(mixed $problem): ?\stdClass {
        if (!($problem instanceof \stdClass)) {
            return null;
        }
        $result = $problem->submissionResult instanceof \stdClass
            ? $problem->submissionResult
            : ($problem->checkResult instanceof \stdClass ? $problem->checkResult : null);
        return self::authoritative_stored_result($result);
    }

    private static function authoritative_quiz_result(
        \stdClass $quizzes,
        string $groupid,
        string $targetid,
    ): ?\stdClass {
        $attempt = property_exists($quizzes, $groupid) ? $quizzes->{$groupid} : null;
        if (!($attempt instanceof \stdClass)
            || !in_array($attempt->status ?? null, ['completed', 'expired'], true)) {
            return null;
        }
        $results = $attempt->resultsByTargetId ?? null;
        $result = $results instanceof \stdClass && property_exists($results, $targetid)
            ? $results->{$targetid}
            : null;
        return self::authoritative_stored_result($result);
    }

    private static function authoritative_stored_result(mixed $result): ?\stdClass {
        if (!($result instanceof \stdClass)
            || !is_numeric($result->score ?? null)
            || !is_finite((float) $result->score)) {
            return null;
        }
        return $result;
    }

    private static function has_authoritative_quiz_result(array $groups, \stdClass $quizzes): bool {
        foreach ($groups as $group) {
            if (($group['kind'] ?? null) !== 'quiz') {
                continue;
            }
            $settings = is_array($group['settings'] ?? null) ? $group['settings'] : [];
            if (($settings['isGraded'] ?? true) === false) {
                continue;
            }
            $groupid = is_string($group['groupId'] ?? null) ? $group['groupId'] : '';
            $attempt = $groupid !== '' && property_exists($quizzes, $groupid) ? $quizzes->{$groupid} : null;
            if ($attempt instanceof \stdClass
                && in_array($attempt->status ?? null, ['completed', 'expired'], true)
                && is_numeric($attempt->score ?? null)
                && is_finite((float) $attempt->score)) {
                return true;
            }
        }
        return false;
    }

    private static function standalone_targets_are_terminal(
        array $targets,
        array $groupedtargetids,
        \stdClass $problems,
    ): bool {
        foreach ($targets as $target) {
            $targetid = is_string($target['targetId'] ?? null) ? $target['targetId'] : '';
            if ($targetid === '' || isset($groupedtargetids[$targetid])) {
                continue;
            }
            $problem = property_exists($problems, $targetid) ? $problems->{$targetid} : null;
            if (self::authoritative_problem_result($problem) === null) {
                return false;
            }
        }
        return true;
    }

    private static function quiz_attempts_are_terminal(array $groups, \stdClass $quizzes): bool {
        foreach ($groups as $group) {
            if (($group['kind'] ?? null) !== 'quiz') {
                continue;
            }
            $groupid = is_string($group['groupId'] ?? null) ? $group['groupId'] : '';
            $attempt = $groupid !== '' && property_exists($quizzes, $groupid) ? $quizzes->{$groupid} : null;
            if (!($attempt instanceof \stdClass)
                || !in_array($attempt->status ?? null, ['completed', 'expired'], true)) {
                return false;
            }
        }
        return true;
    }

    private static function quiz_group_policy_by_target_id(array $groups): array {
        $ownership = assessment_group_validator::quiz_group_id_by_target_id($groups);
        $groupsbyid = [];
        foreach ($groups as $group) {
            if (($group['kind'] ?? null) === 'quiz' && is_string($group['groupId'] ?? null)) {
                $groupsbyid[$group['groupId']] = $group;
            }
        }

        $policy = [];
        foreach ($ownership as $targetid => $groupid) {
            $group = $groupsbyid[$groupid];
            $settings = is_array($group['settings'] ?? null) ? $group['settings'] : [];
            $groupisgraded = ($settings['isGraded'] ?? true) === true;
            $policy[$targetid] = [
                'groupid' => $groupid,
                'hasgradedgroup' => $groupisgraded,
            ];
        }
        return $policy;
    }
}

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

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

require_once(__DIR__ . '/assessment_result_projection.php');
require_once(__DIR__ . '/assessment_quiz.php');

/**
 * Builds the learner-visible assessment projection.
 *
 * Removes protected assessment details from public runtime payloads.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class assessment_public_projection {
    /**
     * Returns snapshot.
     *
     * @param \stdClass $snapshot Canonical assessment snapshot.
     * @param array $projection Projection.
     * @return \stdClass
     */
    public static function snapshot(\stdClass $snapshot, array $projection): \stdClass {
        $publicproblems = [];
        $publicquizzes = [];
        $targetsbyid = [];
        foreach ($projection['targets'] as $target) {
            $targetid = $target['targetId'] ?? null;
            if (is_string($targetid)) {
                $targetsbyid[$targetid] = $target;
            }
        }

        $ownership = assessment_group_validator::quiz_group_id_by_target_id($projection['groups']);
        foreach ($targetsbyid as $targetid => $target) {
            if (isset($ownership[$targetid]) || !property_exists($snapshot->problems, $targetid)) {
                continue;
            }
            $problem = $snapshot->problems->{$targetid};
            if ($problem instanceof \stdClass) {
                $publicproblems[$targetid] = self::problem($problem, $target);
            }
        }

        foreach ($projection['groups'] as $group) {
            if (($group['kind'] ?? null) !== 'quiz' || !is_string($group['groupId'] ?? null)) {
                continue;
            }
            $groupid = $group['groupId'];
            $attempt = $snapshot->quizzes->{$groupid} ?? null;
            if (!($attempt instanceof \stdClass)) {
                continue;
            }
            $publicattempt = assessment_quiz::public_attempt($attempt, $group);
            unset($publicattempt->groupId);
            $publicquizzes[$groupid] = $publicattempt;
            foreach (get_object_vars(assessment_quiz::public_problems_by_target_id(
                $snapshot->problems,
                $group['targetIds'] ?? [],
                $group,
                $attempt,
            )) as $targetid => $problem) {
                $publicproblems[$targetid] = $problem;
            }
        }

        return (object) [
            'snapshotVersion' => $snapshot->snapshotVersion,
            'artifactId' => $snapshot->artifactId,
            'problems' => (object) $publicproblems,
            'quizzes' => (object) $publicquizzes,
        ];
    }

    /**
     * Returns problem.
     *
     * @param \stdClass $problem Problem.
     * @param array $target Target.
     * @return \stdClass
     */
    public static function problem(\stdClass $problem, array $target): \stdClass {
        $publicproblem = self::copy_object($problem);
        $settings = is_array($target['settings'] ?? null) ? $target['settings'] : [];
        $includeauthoredfeedback = ($settings['showAnswer'] ?? null) === true;
        foreach (['checkResult', 'submissionResult'] as $field) {
            $result = $problem->{$field} ?? null;
            $publicproblem->{$field} = $result instanceof \stdClass
                ? assessment_result_projection::result($result, $includeauthoredfeedback)
                : null;
        }
        return $publicproblem;
    }

    /**
     * Copies object.
     *
     * @param \stdClass $value Value.
     * @return \stdClass
     */
    private static function copy_object(\stdClass $value): \stdClass {
        return json_decode(
            json_encode($value, JSON_THROW_ON_ERROR),
            false,
            512,
            JSON_THROW_ON_ERROR,
        );
    }
}

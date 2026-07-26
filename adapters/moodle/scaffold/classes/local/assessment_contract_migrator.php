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


/**
 * Pure upgrades for portable assessment definitions and learner snapshots.
 *
 * Callers remain responsible for validating the upgraded value against the current contract.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class assessment_contract_migrator {
    /**
     * Upgrades one complete target and group bundle.
     *
     * @param array $targets Targets.
     * @param array $groups Groups.
     * @return array
     */
    public static function upgrade_definitions(array $targets, array $groups): array {
        $upgradedtargets = self::copy_value($targets);
        $upgradedgroups = self::copy_value($groups);
        $versions = [];

        foreach ([$upgradedtargets, $upgradedgroups] as $definitions) {
            foreach ($definitions as $definition) {
                if (!($definition instanceof \stdClass)) {
                    throw new \invalid_parameter_exception('Assessment definitions must be objects');
                }
                if (!property_exists($definition, 'schemaVersion') || !is_int($definition->schemaVersion)) {
                    throw new \invalid_parameter_exception('Assessment definition version is invalid');
                }
                $versions[$definition->schemaVersion] = true;
            }
        }

        if (count($versions) > 1) {
            throw new \invalid_parameter_exception('Assessment definition versions are mixed');
        }
        $version = array_key_first($versions);
        if ($version === null) {
            return ['targets' => $upgradedtargets, 'groups' => $upgradedgroups];
        }
        if (!in_array($version, [1, 2], true)) {
            throw new \invalid_parameter_exception('Assessment definition version is unsupported');
        }
        if ($version === 2) {
            return ['targets' => $upgradedtargets, 'groups' => $upgradedgroups];
        }

        foreach ($upgradedgroups as $group) {
            $settings = $group->settings ?? null;
            if (
                $settings instanceof \stdClass
                && property_exists($settings, 'passingScore')
            ) {
                throw new \invalid_parameter_exception(
                    'Version 1 assessment group contains version 2 fields',
                );
            }
        }
        foreach ($upgradedtargets as $target) {
            $target->schemaVersion = 2;
        }
        foreach ($upgradedgroups as $group) {
            $group->schemaVersion = 2;
            $settings = $group->settings ?? null;
            if (($group->kind ?? null) === 'quiz' && $settings instanceof \stdClass) {
                $settings->passingScore = null;
            }
        }

        return ['targets' => $upgradedtargets, 'groups' => $upgradedgroups];
    }

    /**
     * Upgrades one learner assessment snapshot.
     *
     * @param \stdClass $snapshot Snapshot.
     * @return \stdClass
     */
    public static function upgrade_snapshot(\stdClass $snapshot): \stdClass {
        $upgraded = self::copy_value($snapshot);
        if (
            !property_exists($upgraded, 'snapshotVersion')
            || !is_int($upgraded->snapshotVersion)
        ) {
            throw new \invalid_parameter_exception('Assessment snapshot version is invalid');
        }
        if (!in_array($upgraded->snapshotVersion, [1, 2], true)) {
            throw new \invalid_parameter_exception('Assessment snapshot version is unsupported');
        }
        if ($upgraded->snapshotVersion === 2) {
            return $upgraded;
        }

        $quizzes = $upgraded->quizzes ?? null;
        if ($quizzes instanceof \stdClass) {
            foreach (get_object_vars($quizzes) as $attempt) {
                if (!($attempt instanceof \stdClass)) {
                    continue;
                }
                if (property_exists($attempt, 'successStatus')) {
                    throw new \invalid_parameter_exception(
                        'Version 1 assessment snapshot contains version 2 fields',
                    );
                }
                $attempt->successStatus = null;
            }
        }
        $upgraded->snapshotVersion = 2;
        return $upgraded;
    }

    /**
     * Deep copies a JSON-shaped value while preserving empty object encoding.
     *
     * @param mixed $value Value.
     * @return mixed
     */
    private static function copy_value(mixed $value): mixed {
        if ($value instanceof \stdClass) {
            $copy = new \stdClass();
            foreach (get_object_vars($value) as $key => $entry) {
                $copy->{$key} = self::copy_value($entry);
            }
            return $copy;
        }
        if (is_array($value)) {
            $copy = [];
            foreach ($value as $key => $entry) {
                $copy[$key] = self::copy_value($entry);
            }
            return $copy;
        }
        return $value;
    }
}

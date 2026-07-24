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
 * Validates assessment target definitions.
 *
 * Enforces the supported target and interaction contracts.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
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

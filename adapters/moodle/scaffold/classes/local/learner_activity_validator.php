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
 * Validates learner activity records.
 *
 * Enforces the canonical snapshot and block record contracts.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class learner_activity_validator {
    /** @var ?json_schema_validator Shared schema validator. */
    private static ?json_schema_validator $validator = null;

    /**
     * Validates definition.
     *
     * @param string $definition Definition.
     * @param mixed $value Value.
     * @param string $path Path.
     */
    public static function validate_definition(string $definition, mixed $value, string $path = '$'): void {
        self::$validator ??= new json_schema_validator(
            dirname(__DIR__, 2) . '/schemas/learner-activity.schema.json',
        );
        self::$validator->validate_definition($definition, $value, $path);
    }
}

<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

class learner_activity_validator {
    private static ?json_schema_validator $validator = null;

    public static function validate_definition(string $definition, mixed $value, string $path = '$'): void {
        self::$validator ??= new json_schema_validator(
            dirname(__DIR__, 2) . '/schemas/learner-activity.schema.json',
        );
        self::$validator->validate_definition($definition, $value, $path);
    }
}

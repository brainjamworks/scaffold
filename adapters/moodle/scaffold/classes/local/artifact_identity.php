<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

final class artifact_identity {
    private const PREFIX = 'moodle-cm-';

    public static function for_course_module(int $cmid): string {
        return self::PREFIX . $cmid;
    }
}

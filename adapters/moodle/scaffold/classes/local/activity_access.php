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
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Scaffold. If not, see <https://www.gnu.org/licenses/>.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

final class activity_access {
    public static function require(int $cmid, string $capability): activity_scope {
        global $DB, $USER;

        [$course, $cm] = get_course_and_cm_from_cmid($cmid, 'scaffold');
        $context = \context_module::instance($cm->id);
        \core_external\external_api::validate_context($context);
        require_capability($capability, $context);

        $instance = $DB->get_record('scaffold', ['id' => $cm->instance], '*', MUST_EXIST);

        return new activity_scope(
            $course,
            $cm,
            $context,
            $instance,
            (int) $USER->id,
            $capability,
        );
    }
}

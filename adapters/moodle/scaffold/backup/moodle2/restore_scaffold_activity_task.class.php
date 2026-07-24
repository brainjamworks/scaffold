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

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/mod/scaffold/backup/moodle2/restore_scaffold_stepslib.php');

final class restore_scaffold_activity_task extends restore_activity_task {
    #[\Override]
    protected function define_my_settings(): void {
    }

    #[\Override]
    protected function define_my_steps(): void {
        $this->add_step(new restore_scaffold_activity_structure_step(
            'scaffold_structure',
            'scaffold.xml',
        ));
    }

    #[\Override]
    public static function define_decode_contents(): array {
        return [];
    }

    #[\Override]
    public static function define_decode_rules(): array {
        return [];
    }

    #[\Override]
    public static function define_restore_log_rules(): array {
        return [];
    }

    public static function define_restore_log_rules_for_course(): array {
        return [];
    }

    public function after_restore(): void {
        \mod_scaffold\local\restore_identity_service::rebuild_host_projections(
            (int) $this->get_activityid(),
            (int) $this->get_moduleid(),
        );
    }
}

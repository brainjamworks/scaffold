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

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/mod/scaffold/backup/moodle2/backup_scaffold_stepslib.php');

final class backup_scaffold_activity_task extends backup_activity_task {
    #[\Override]
    protected function define_my_settings(): void {
    }

    #[\Override]
    protected function define_my_steps(): void {
        $this->add_step(new backup_scaffold_activity_structure_step(
            'scaffold_structure',
            'scaffold.xml',
        ));
    }

    #[\Override]
    public static function encode_content_links($content) {
        return $content;
    }
}

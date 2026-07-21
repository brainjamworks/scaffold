<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/mod/scaffold/backup/moodle2/backup_scaffold_stepslib.php');

final class backup_scaffold_activity_task extends backup_activity_task {
    protected function define_my_settings(): void {
    }

    protected function define_my_steps(): void {
        $this->add_step(new backup_scaffold_activity_structure_step(
            'scaffold_structure',
            'scaffold.xml',
        ));
    }

    public static function encode_content_links($content) {
        return $content;
    }
}

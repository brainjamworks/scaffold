<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

require('../../config.php');

$id = required_param('id', PARAM_INT);
$course = $DB->get_record('course', ['id' => $id], '*', MUST_EXIST);

require_course_login($course);

$PAGE->set_url('/mod/scaffold/index.php', ['id' => $id]);
$PAGE->set_title(get_string('modulenameplural', 'scaffold'));
$PAGE->set_heading($course->fullname);

echo $OUTPUT->header();

$modinfo = get_fast_modinfo($course);
$instances = $modinfo->get_instances_of('scaffold');

if (!$instances) {
    echo $OUTPUT->notification(get_string('noactivities', 'moodle'), 'info');
} else {
    $table = new html_table();
    $table->head = [get_string('name')];
    foreach ($instances as $cm) {
        if (!$cm->uservisible) {
            continue;
        }
        $table->data[] = [
            html_writer::link(new moodle_url('/mod/scaffold/view.php', ['id' => $cm->id]), format_string($cm->name)),
        ];
    }
    echo html_writer::table($table);
}

echo $OUTPUT->footer();

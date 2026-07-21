<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

require('../../config.php');
require_once($CFG->libdir . '/completionlib.php');

$id = required_param('id', PARAM_INT);
[$course, $cm] = get_course_and_cm_from_cmid($id, 'scaffold');
$scaffold = $DB->get_record('scaffold', ['id' => $cm->instance], '*', MUST_EXIST);
$context = context_module::instance($cm->id);

require_login($course, true, $cm);
require_capability('mod/scaffold:view', $context);

if (has_capability('mod/scaffold:editcontent', $context)) {
    $contentservice = new \mod_scaffold\local\content_service();
    $authorartifact = $contentservice->project_artifact(
        $scaffold,
        (int) $cm->id,
        true,
    );
    $storedartifact = \mod_scaffold\local\content_service::read_json_object(
        $scaffold->artifactjson ?? '',
        [],
    );
    if (array_key_exists('content', $storedartifact) && $authorartifact['content'] === null) {
        redirect(new moodle_url('/mod/scaffold/author.php', ['id' => $cm->id]));
    }
}

$completion = new completion_info($course);
$completion->set_module_viewed($cm);

$PAGE->set_url('/mod/scaffold/view.php', ['id' => $cm->id]);
$PAGE->set_title(format_string($scaffold->name));
$PAGE->set_heading(format_string($course->fullname));
$PAGE->set_context($context);

$rootid = html_writer::random_id('scaffold-moodle-');
$bundleurl = (new moodle_url('/mod/scaffold/public/moodle-ui.js'))->out(false);
$innerurl = (new moodle_url('/mod/scaffold/public/moodle-inner.html'))->out(false);
$PAGE->requires->js_call_amd('mod_scaffold/bootstrap', 'init', [
    $rootid,
    [
        'cmid' => (int) $cm->id,
        'scaffoldid' => (int) $scaffold->id,
        'surface' => 'learner',
        'bundleUrl' => $bundleurl,
        'innerUrl' => $innerurl,
        'wwwroot' => $CFG->wwwroot,
        'sesskey' => sesskey(),
    ],
]);

echo $OUTPUT->header();

if (trim($scaffold->intro ?? '') !== '') {
    echo $OUTPUT->box(format_module_intro('scaffold', $scaffold, $cm->id), 'generalbox mod_introbox', 'scaffoldintro');
}

echo html_writer::div('', 'scaffold-moodle', ['id' => $rootid]);

echo $OUTPUT->footer();

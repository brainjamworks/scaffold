<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

require_once(__DIR__ . '/../../config.php');

use mod_scaffold\local\grade_status_report;

$id = required_param('id', PARAM_INT);
$page = optional_param('page', 0, PARAM_INT);
[$course, $cm] = get_course_and_cm_from_cmid($id, 'scaffold');
$context = context_module::instance($cm->id);
require_login($course, true, $cm);
require_capability('mod/scaffold:viewgradestatus', $context);

$report = new grade_status_report();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    require_sesskey();
    $target = required_param('target', PARAM_ALPHA);
    $confirmed = required_param('confirm', PARAM_BOOL);
    if (!$confirmed) {
        throw new moodle_exception('confirmationnotenabled', 'error');
    }
    if ($target === 'item') {
        $changed = $report->requeue_item((int) $cm->instance);
    } else if ($target === 'user') {
        $userid = required_param('userid', PARAM_INT);
        $changed = $report->requeue_user((int) $cm->instance, $userid);
    } else {
        throw new invalid_parameter_exception('Unknown grade publication requeue target');
    }
    error_log(sprintf(
        'Scaffold grade publication requeue activity=%d actor=%d changed=%d',
        (int) $cm->instance,
        (int) $USER->id,
        $changed ? 1 : 0,
    ));
    redirect(new moodle_url('/mod/scaffold/grade_status.php', ['id' => $cm->id, 'page' => $page]));
}

$PAGE->set_url('/mod/scaffold/grade_status.php', ['id' => $cm->id, 'page' => $page]);
$PAGE->set_context($context);
$PAGE->set_title(get_string('gradestatus', 'scaffold'));
$PAGE->set_heading(format_string($course->fullname));

$item = $report->item((int) $cm->instance);
$learnerpage = $report->page((int) $cm->instance, $page, 50);

echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('gradestatus', 'scaffold'));

$itemtable = new html_table();
$itemtable->head = ['Scope', 'Status', 'Code', 'Version', 'Retries', 'Next action'];
$itemtable->data[] = [
    'Activity item',
    s($item->status),
    s($item->code ?? ''),
    $item->itemVersion . ' / ' . $item->definitionVersion,
    (string) $item->retryCount,
    s($item->nextAction),
];
echo html_writer::table($itemtable);
if ($item->nextAction === 'correct_and_requeue') {
    echo scaffold_grade_status_requeue_form($cm->id, $page, 'item');
}

$table = new html_table();
$table->head = ['User ID', 'Status', 'Code', 'State revision', 'Definition version', 'Retries', 'Next action'];
foreach ($learnerpage->rows as $row) {
    $action = s($row->nextAction);
    if ($row->nextAction === 'correct_and_requeue') {
        $action .= scaffold_grade_status_requeue_form($cm->id, $page, 'user', $row->userId);
    }
    $table->data[] = [
        (string) $row->userId,
        s($row->status),
        s($row->code ?? ''),
        (string) $row->stateRevision,
        (string) $row->definitionVersion,
        (string) $row->retryCount,
        $action,
    ];
}
echo html_writer::table($table);
echo $OUTPUT->paging_bar($learnerpage->total, $page, $learnerpage->perPage, $PAGE->url);
echo $OUTPUT->footer();

function scaffold_grade_status_requeue_form(int $cmid, int $page, string $target, ?int $userid = null): string {
    $fields = html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'id', 'value' => $cmid]);
    $fields .= html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'page', 'value' => $page]);
    $fields .= html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'target', 'value' => $target]);
    $fields .= html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'sesskey', 'value' => sesskey()]);
    if ($userid !== null) {
        $fields .= html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'userid', 'value' => $userid]);
    }
    $fields .= html_writer::checkbox('confirm', 1, false, get_string('gradestatusconfirm', 'scaffold'), [
        'required' => 'required',
    ]);
    $fields .= html_writer::empty_tag('input', [
        'type' => 'submit',
        'value' => get_string('gradestatusrequeue', 'scaffold'),
    ]);
    return html_writer::tag('form', $fields, [
        'method' => 'post',
        'action' => new moodle_url('/mod/scaffold/grade_status.php'),
    ]);
}

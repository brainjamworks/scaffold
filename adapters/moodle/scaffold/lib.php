<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

defined('MOODLE_INTERNAL') || die();

const SCAFFOLD_EMPTY_ARTIFACT_JSON = '{"id":"","title":"Scaffold","mode":"page","content":null}';
const SCAFFOLD_EMPTY_TARGETS_JSON = '[]';

function scaffold_supports(string $feature): bool|string|null {
    return match ($feature) {
        FEATURE_MOD_INTRO => true,
        FEATURE_COMPLETION_TRACKS_VIEWS => true,
        FEATURE_COMPLETION_HAS_RULES => true,
        FEATURE_GRADE_HAS_GRADE => true,
        FEATURE_BACKUP_MOODLE2 => true,
        FEATURE_SHOW_DESCRIPTION => true,
        FEATURE_MOD_PURPOSE => MOD_PURPOSE_INTERACTIVECONTENT,
        default => null,
    };
}

function scaffold_get_coursemodule_info(stdClass $coursemodule): cached_cm_info|false {
    global $DB;

    $scaffold = $DB->get_record(
        'scaffold',
        ['id' => $coursemodule->instance],
        'id, completionactivitystatus',
    );
    if (!$scaffold) {
        return false;
    }

    $info = new cached_cm_info();
    if ($coursemodule->completion == COMPLETION_TRACKING_AUTOMATIC) {
        $info->customdata['customcompletionrules']['completionactivitystatus'] =
            (int) $scaffold->completionactivitystatus;
    }
    return $info;
}

function mod_scaffold_get_completion_active_rule_descriptions($cm): array {
    if ($cm->completion != COMPLETION_TRACKING_AUTOMATIC
        || empty($cm->customdata['customcompletionrules']['completionactivitystatus'])) {
        return [];
    }
    return [get_string('completiondetail:activitystatus', 'scaffold')];
}

function scaffold_update_completion(
    stdClass $scaffold,
    \cm_info $cm,
    int $userid,
): void {
    global $CFG;

    if (empty($scaffold->completionactivitystatus)) {
        return;
    }

    require_once($CFG->libdir . '/completionlib.php');
    $completion = new completion_info(get_course((int) $cm->course));
    if ($completion->is_enabled($cm)) {
        $completion->update_state($cm, COMPLETION_COMPLETE, $userid);
    }
}

function scaffold_is_branded(): bool {
    return true;
}

function scaffold_add_instance(stdClass $instancedata, ?mod_scaffold_mod_form $mform = null): int {
    global $DB;

    $time = time();
    $instancedata->timecreated = $time;
    $instancedata->timemodified = $time;
    $artifact = json_decode(SCAFFOLD_EMPTY_ARTIFACT_JSON, true);
    $artifact['title'] = $instancedata->name;
    $instancedata->artifactjson = json_encode($artifact);
    $instancedata->learnercontentjson = 'null';
    $instancedata->assessmenttargetsjson = SCAFFOLD_EMPTY_TARGETS_JSON;
    $instancedata->assessmentgroupsjson = SCAFFOLD_EMPTY_TARGETS_JSON;
    $instancedata->grade = scaffold_normalize_grade($instancedata->grade ?? 100);

    $transaction = $DB->start_delegated_transaction();
    try {
        $id = $DB->insert_record('scaffold', $instancedata);
        $transaction->allow_commit();
    } catch (Throwable $exception) {
        $transaction->rollback($exception);
    }
    $instancedata->id = $id;
    scaffold_grade_item_update($instancedata);

    return $id;
}

function scaffold_update_instance(stdClass $instancedata, ?mod_scaffold_mod_form $mform = null): bool {
    global $DB;

    $current = $DB->get_record('scaffold', ['id' => $instancedata->instance], '*', MUST_EXIST);
    $updated = clone $instancedata;
    $updated->id = $updated->instance;
    unset($updated->instance);
    $updated->timemodified = time();
    $updated->grade = scaffold_normalize_grade($updated->grade ?? $current->grade);

    $projection = \mod_scaffold\local\assessment_projection::for_activity($current);
    $currentfingerprint = \mod_scaffold\local\assessment_definition::fingerprint(
        $projection['targets'],
        $projection['groups'],
        (float) $current->grade,
    );
    $nextfingerprint = \mod_scaffold\local\assessment_definition::fingerprint(
        $projection['targets'],
        $projection['groups'],
        (float) $updated->grade,
    );
    $definitionchanged = !hash_equals($currentfingerprint, $nextfingerprint);
    if ($definitionchanged) {
        $updated->assessmentdefinitionversion = (int) $current->assessmentdefinitionversion + 1;
    }
    if ($definitionchanged || (string) $updated->name !== (string) $current->name) {
        \mod_scaffold\local\content_service::mark_grade_item_pending($updated);
    }

    $transaction = $DB->start_delegated_transaction();
    try {
        $result = $DB->update_record('scaffold', $updated);
        $transaction->allow_commit();
    } catch (Throwable $exception) {
        $transaction->rollback($exception);
    }
    scaffold_grade_item_update($updated);

    return $result;
}

function scaffold_delete_instance(int $id): bool {
    global $DB;

    $scaffold = $DB->get_record('scaffold', ['id' => $id]);
    if (!$scaffold) {
        return false;
    }

    $coursemodule = get_coursemodule_from_instance('scaffold', $id, (int) $scaffold->course);
    if (!$coursemodule) {
        return false;
    }
    $context = \context_module::instance((int) $coursemodule->id);
    (new \mod_scaffold\local\activity_deletion_service())->delete_owned_state($id, $context);
    scaffold_grade_item_delete($scaffold);
    $DB->delete_records('scaffold', ['id' => $id]);

    return true;
}

function scaffold_grade_item_update(stdClass $scaffold, $grades = null): int {
    if ($grades === null) {
        $outcome = (new \mod_scaffold\local\grade_item_publisher())->publish($scaffold);
        return match ($outcome->status) {
            'published' => GRADE_UPDATE_OK,
            'locked' => GRADE_UPDATE_ITEM_LOCKED,
            'configuration_error' => GRADE_UPDATE_MULTIPLE,
            default => GRADE_UPDATE_FAILED,
        };
    }

    return scaffold_grade_item_apply($scaffold, $grades);
}

function scaffold_grade_item_apply(stdClass $scaffold, $grades = null): int {
    global $CFG;

    require_once($CFG->libdir . '/gradelib.php');

    $grade = scaffold_normalize_grade($scaffold->grade ?? 100);
    $params = [
        'itemname' => $scaffold->name,
        'gradetype' => $grade > 0 ? GRADE_TYPE_VALUE : GRADE_TYPE_NONE,
        'grademax' => $grade,
        'grademin' => 0,
    ];

    return grade_update(
        'mod/scaffold',
        $scaffold->course,
        'mod',
        'scaffold',
        $scaffold->id,
        0,
        $grades,
        $params,
    );
}

function scaffold_grade_publication_conflict(stdClass $scaffold, int $userid): ?string {
    global $CFG;

    require_once($CFG->libdir . '/gradelib.php');

    $items = grade_item::fetch_all([
        'courseid' => $scaffold->course,
        'itemtype' => 'mod',
        'itemmodule' => 'scaffold',
        'iteminstance' => $scaffold->id,
        'itemnumber' => 0,
    ]);
    if (!$items || count($items) !== 1) {
        return null;
    }

    $item = reset($items);
    if ($item->is_locked()) {
        return 'grade_item_locked';
    }

    $grade = grade_grade::fetch([
        'itemid' => $item->id,
        'userid' => $userid,
    ]);
    if (!$grade) {
        return null;
    }
    $grade->grade_item = $item;
    if ($grade->is_overridden()) {
        return 'instructor_override';
    }
    if ($grade->is_locked()) {
        return 'learner_grade_locked';
    }
    return null;
}

function scaffold_grade_item_delete(stdClass $scaffold): int {
    return scaffold_grade_item_withdraw($scaffold);
}

function scaffold_grade_item_withdraw(stdClass $scaffold): int {
    global $CFG;

    require_once($CFG->libdir . '/gradelib.php');

    return grade_update(
        'mod/scaffold',
        $scaffold->course,
        'mod',
        'scaffold',
        $scaffold->id,
        0,
        null,
        ['deleted' => 1],
    );
}

function scaffold_update_grades(stdClass $scaffold, int $userid = 0): void {
    global $DB;

    scaffold_grade_item_update($scaffold);
    $current = $DB->get_record('scaffold', ['id' => $scaffold->id], '*', MUST_EXIST);
    $cm = get_coursemodule_from_instance('scaffold', (int) $scaffold->id, (int) $current->course);
    if (!$cm) {
        return;
    }
    $artifactid = \mod_scaffold\local\artifact_identity::for_course_module((int) $cm->id);
    $staterepository = new \mod_scaffold\local\assessment_state_repository();
    $publicationrepository = new \mod_scaffold\local\grade_publication_repository();
    $publisher = new \mod_scaffold\local\grade_publisher();
    $states = $staterepository->find_states_for_activity(
        (int) $current->id,
        $artifactid,
        $userid > 0 ? $userid : null,
    );
    foreach ($states as $stateuserid => $state) {
        $publicationrepository->upsert_pending(
            (int) $current->id,
            (int) $stateuserid,
            (int) $state->stateRevision,
            (int) $current->assessmentdefinitionversion,
        );
        $publisher->publish_user($current, (int) $stateuserid);
    }
}

function mod_scaffold_pluginfile(
    stdClass $course,
    stdClass $cm,
    context $context,
    string $filearea,
    array $args,
    bool $forcedownload,
    array $options = [],
): bool {
    if ($context->contextlevel !== CONTEXT_MODULE) {
        return false;
    }

    if ($filearea !== 'media') {
        return false;
    }

    require_login($course, true, $cm);

    if (!has_capability('mod/scaffold:view', $context)) {
        return false;
    }

    $scaffoldid = array_shift($args);
    if (!is_numeric($scaffoldid) || (int) $scaffoldid !== (int) $cm->instance) {
        return false;
    }

    $filename = array_pop($args);
    if (!$filename) {
        return false;
    }
    $filepath = $args ? '/' . implode('/', $args) . '/' : '/';

    $fs = get_file_storage();
    $file = $fs->get_file($context->id, 'mod_scaffold', $filearea, (int) $scaffoldid, $filepath, $filename);
    if (!$file) {
        return false;
    }

    send_stored_file($file, DAYSECS, 0, $forcedownload, $options);
}

function scaffold_normalize_grade(mixed $grade): float {
    if (!is_numeric($grade)) {
        return 100.0;
    }

    return max(0.0, (float) $grade);
}

function scaffold_extend_settings_navigation(
    settings_navigation $settings,
    navigation_node $node,
): void {
    $cm = $settings->get_page()->cm;
    if (!$cm) {
        return;
    }

    $context = context_module::instance($cm->id);
    $canedit = has_capability('mod/scaffold:editcontent', $context);
    $canviewgrades = has_capability('mod/scaffold:viewgradestatus', $context);
    if (!$canedit && !$canviewgrades) {
        return;
    }

    if ($canedit) {
        $node->add(
            get_string('editscaffoldcontent', 'scaffold'),
            new moodle_url('/mod/scaffold/author.php', ['id' => $cm->id]),
            navigation_node::TYPE_SETTING,
            null,
            'scaffold-edit-content',
        );
    }
    if ($canviewgrades) {
        $node->add(
            get_string('gradestatus', 'scaffold'),
            new moodle_url('/mod/scaffold/grade_status.php', ['id' => $cm->id]),
            navigation_node::TYPE_SETTING,
            null,
            'scaffold-grade-status',
        );
    }
}

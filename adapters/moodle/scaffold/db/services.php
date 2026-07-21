<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

defined('MOODLE_INTERNAL') || die();

$functions = [
    'mod_scaffold_get_payload' => [
        'classname' => 'mod_scaffold\external\get_payload',
        'description' => 'Load Scaffold activity payload.',
        'type' => 'read',
        'ajax' => true,
    ],
    'mod_scaffold_save_content' => [
        'classname' => 'mod_scaffold\external\save_content',
        'description' => 'Save Scaffold authoring content.',
        'type' => 'write',
        'ajax' => true,
    ],
    'mod_scaffold_load_learner_activity' => [
        'classname' => 'mod_scaffold\external\load_learner_activity',
        'description' => 'Load the current learner activity snapshot.',
        'type' => 'read',
        'ajax' => true,
    ],
    'mod_scaffold_save_learner_activity' => [
        'classname' => 'mod_scaffold\external\save_learner_activity',
        'description' => 'Save one learner activity record.',
        'type' => 'write',
        'ajax' => true,
    ],
    'mod_scaffold_check_assessment' => [
        'classname' => 'mod_scaffold\external\check_assessment',
        'description' => 'Check a Scaffold assessment response.',
        'type' => 'write',
        'ajax' => true,
    ],
    'mod_scaffold_submit_assessment' => [
        'classname' => 'mod_scaffold\external\submit_assessment',
        'description' => 'Submit a Scaffold assessment response.',
        'type' => 'write',
        'ajax' => true,
    ],
    'mod_scaffold_reveal_answer' => [
        'classname' => 'mod_scaffold\external\reveal_answer',
        'description' => 'Reveal a Scaffold assessment answer.',
        'type' => 'read',
        'ajax' => true,
    ],
    'mod_scaffold_reveal_hint' => [
        'classname' => 'mod_scaffold\external\reveal_hint',
        'description' => 'Persist a Scaffold assessment hint reveal.',
        'type' => 'write',
        'ajax' => true,
    ],
    'mod_scaffold_start_quiz_attempt' => [
        'classname' => 'mod_scaffold\external\start_quiz_attempt',
        'description' => 'Start a Scaffold Quiz attempt.',
        'type' => 'write',
        'ajax' => true,
    ],
    'mod_scaffold_submit_quiz_question' => [
        'classname' => 'mod_scaffold\external\submit_quiz_question',
        'description' => 'Submit one Scaffold Quiz question.',
        'type' => 'write',
        'ajax' => true,
    ],
    'mod_scaffold_finish_quiz_attempt' => [
        'classname' => 'mod_scaffold\external\finish_quiz_attempt',
        'description' => 'Finish or expire a Scaffold Quiz attempt.',
        'type' => 'write',
        'ajax' => true,
    ],
    'mod_scaffold_reveal_quiz_answers' => [
        'classname' => 'mod_scaffold\external\reveal_quiz_answers',
        'description' => 'Authorize Scaffold Quiz answer review.',
        'type' => 'write',
        'ajax' => true,
    ],
    'mod_scaffold_upload_media' => [
        'classname' => 'mod_scaffold\external\upload_media',
        'description' => 'Upload Scaffold managed media or attachment files.',
        'type' => 'write',
        'ajax' => true,
    ],
    'mod_scaffold_resolve_media' => [
        'classname' => 'mod_scaffold\external\resolve_media',
        'description' => 'Resolve Scaffold managed media or attachment files.',
        'type' => 'read',
        'ajax' => true,
    ],
    'mod_scaffold_list_media' => [
        'classname' => 'mod_scaffold\external\list_media',
        'description' => 'List previously uploaded Scaffold media for the activity.',
        'type' => 'read',
        'ajax' => true,
    ],
];

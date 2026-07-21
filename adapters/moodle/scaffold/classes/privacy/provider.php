<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\transform;
use core_privacy\local\request\userlist;
use core_privacy\local\request\writer;
use mod_scaffold\local\assessment_state_repository;
use mod_scaffold\local\grade_publication_repository;
use mod_scaffold\local\learner_activity_repository;

defined('MOODLE_INTERNAL') || die();

final class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\plugin\provider,
    \core_privacy\local\request\core_userlist_provider {
    public static function get_metadata(collection $items): collection {
        $items->add_database_table(
            'scaffold_assessment_state',
            [
                'scaffoldid' => 'privacy:metadata:scaffold_assessment_state:scaffoldid',
                'userid' => 'privacy:metadata:scaffold_assessment_state:userid',
                'snapshotjson' => 'privacy:metadata:scaffold_assessment_state:snapshotjson',
                'staterevision' => 'privacy:metadata:scaffold_assessment_state:staterevision',
                'nextquizexpiry' => 'privacy:metadata:scaffold_assessment_state:nextquizexpiry',
                'timecreated' => 'privacy:metadata:scaffold_assessment_state:timecreated',
                'timemodified' => 'privacy:metadata:scaffold_assessment_state:timemodified',
            ],
            'privacy:metadata:scaffold_assessment_state',
        );
        $items->add_database_table(
            'scaffold_learner_activity',
            [
                'scaffoldid' => 'privacy:metadata:scaffold_learner_activity:scaffoldid',
                'userid' => 'privacy:metadata:scaffold_learner_activity:userid',
                'snapshotjson' => 'privacy:metadata:scaffold_learner_activity:snapshotjson',
                'timecreated' => 'privacy:metadata:scaffold_learner_activity:timecreated',
                'timemodified' => 'privacy:metadata:scaffold_learner_activity:timemodified',
            ],
            'privacy:metadata:scaffold_learner_activity',
        );
        $items->add_database_table(
            'scaffold_grade_publications',
            [
                'scaffoldid' => 'privacy:metadata:scaffold_grade_publications:scaffoldid',
                'userid' => 'privacy:metadata:scaffold_grade_publications:userid',
                'staterevision' => 'privacy:metadata:scaffold_grade_publications:staterevision',
                'definitionversion' => 'privacy:metadata:scaffold_grade_publications:definitionversion',
                'status' => 'privacy:metadata:scaffold_grade_publications:status',
                'failurecode' => 'privacy:metadata:scaffold_grade_publications:failurecode',
                'retrycount' => 'privacy:metadata:scaffold_grade_publications:retrycount',
                'retryafter' => 'privacy:metadata:scaffold_grade_publications:retryafter',
                'timecreated' => 'privacy:metadata:scaffold_grade_publications:timecreated',
                'timemodified' => 'privacy:metadata:scaffold_grade_publications:timemodified',
            ],
            'privacy:metadata:scaffold_grade_publications',
        );

        return $items;
    }

    public static function get_contexts_for_userid(int $userid): contextlist {
        $contextlist = new contextlist();
        (new assessment_state_repository())->add_contexts_for_user($contextlist, $userid);
        (new learner_activity_repository())->add_contexts_for_user($contextlist, $userid);
        (new grade_publication_repository())->add_contexts_for_user($contextlist, $userid);
        return $contextlist;
    }

    public static function get_users_in_context(userlist $userlist): void {
        $context = $userlist->get_context();
        if (!$context instanceof \context_module) {
            return;
        }

        $coursemodule = get_coursemodule_from_id('scaffold', $context->instanceid);
        if (!$coursemodule) {
            return;
        }

        (new assessment_state_repository())->add_users_for_activity($userlist, (int) $coursemodule->instance);
        (new learner_activity_repository())->add_users_for_activity($userlist, (int) $coursemodule->instance);
        (new grade_publication_repository())->add_users_for_activity($userlist, (int) $coursemodule->instance);
    }

    public static function export_user_data(approved_contextlist $contextlist): void {
        if ($contextlist->count() === 0) {
            return;
        }

        $userid = (int) $contextlist->get_user()->id;
        $assessmentrepository = new assessment_state_repository();
        $activityrepository = new learner_activity_repository();
        $publicationrepository = new grade_publication_repository();
        foreach ($contextlist->get_contexts() as $context) {
            if (!$context instanceof \context_module) {
                continue;
            }
            $coursemodule = get_coursemodule_from_id('scaffold', $context->instanceid);
            if (!$coursemodule) {
                continue;
            }

            $scaffoldid = (int) $coursemodule->instance;
            $artifactid = 'moodle-cm-' . $coursemodule->id;
            $assessment = $assessmentrepository->get_for_privacy_export($scaffoldid, $userid, $artifactid);
            if ($assessment !== null) {
                writer::with_context($context)->export_data(
                    [get_string('privacy:metadata:scaffold_assessment_state', 'scaffold')],
                    (object) [
                        'snapshot' => $assessment->snapshot,
                        'state_revision' => $assessment->staterevision,
                        'next_quiz_expiry' => self::datetime_or_null($assessment->nextquizexpiry),
                        'time_created' => transform::datetime($assessment->timecreated),
                        'time_modified' => transform::datetime($assessment->timemodified),
                    ],
                );
            }

            $activity = $activityrepository->get_for_privacy_export($scaffoldid, $userid, $artifactid);
            if ($activity !== null) {
                writer::with_context($context)->export_data(
                    [get_string('privacy:metadata:scaffold_learner_activity', 'scaffold')],
                    (object) [
                        'snapshot' => $activity->snapshot,
                        'time_created' => transform::datetime($activity->timecreated),
                        'time_modified' => transform::datetime($activity->timemodified),
                    ],
                );
            }

            $publication = $publicationrepository->get($scaffoldid, $userid);
            if ($publication !== null) {
                writer::with_context($context)->export_data(
                    [get_string('privacy:metadata:scaffold_grade_publications', 'scaffold')],
                    (object) [
                        'state_revision' => $publication->staterevision,
                        'definition_version' => $publication->definitionversion,
                        'status' => $publication->status,
                        'failure_code' => $publication->failurecode,
                        'retry_count' => $publication->retrycount,
                        'retry_after' => self::datetime_or_null($publication->retryafter),
                        'time_created' => transform::datetime($publication->timecreated),
                        'time_modified' => transform::datetime($publication->timemodified),
                    ],
                );
            }
        }
    }

    public static function delete_data_for_all_users_in_context(\context $context): void {
        $scaffoldid = self::scaffoldid_for_context($context);
        if ($scaffoldid === null) {
            return;
        }

        (new grade_publication_repository())->delete_for_activity($scaffoldid);
        (new assessment_state_repository())->delete_for_activity($scaffoldid);
        (new learner_activity_repository())->delete_for_activity($scaffoldid);
    }

    public static function delete_data_for_user(approved_contextlist $contextlist): void {
        if ($contextlist->count() === 0) {
            return;
        }

        $userid = (int) $contextlist->get_user()->id;
        foreach ($contextlist->get_contexts() as $context) {
            $scaffoldid = self::scaffoldid_for_context($context);
            if ($scaffoldid === null) {
                continue;
            }
            (new grade_publication_repository())->delete_for_user_in_activity($scaffoldid, $userid);
            (new assessment_state_repository())->delete_for_user_in_activity($scaffoldid, $userid);
            (new learner_activity_repository())->delete_for_user_in_activity($scaffoldid, $userid);
        }
    }

    public static function delete_data_for_users(approved_userlist $userlist): void {
        $scaffoldid = self::scaffoldid_for_context($userlist->get_context());
        $userids = array_map('intval', $userlist->get_userids());
        if ($scaffoldid === null || $userids === []) {
            return;
        }

        (new grade_publication_repository())->delete_for_users_in_activity($scaffoldid, $userids);
        (new assessment_state_repository())->delete_for_users_in_activity($scaffoldid, $userids);
        (new learner_activity_repository())->delete_for_users_in_activity($scaffoldid, $userids);
    }

    private static function scaffoldid_for_context(\context $context): ?int {
        if (!$context instanceof \context_module) {
            return null;
        }
        $coursemodule = get_coursemodule_from_id('scaffold', $context->instanceid);
        return $coursemodule ? (int) $coursemodule->instance : null;
    }

    private static function datetime_or_null(?int $timestamp): ?string {
        return $timestamp === null ? null : transform::datetime($timestamp);
    }
}

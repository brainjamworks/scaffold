<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

defined('MOODLE_INTERNAL') || die();

use mod_scaffold\local\restore_identity_service;

global $CFG;
require_once($CFG->dirroot . '/backup/util/includes/backup_includes.php');
require_once($CFG->dirroot . '/backup/util/includes/restore_includes.php');

/**
 * @covers \mod_scaffold\local\restore_identity_service
 */
final class restore_scaffold_test extends advanced_testcase {
    /**
     * @dataProvider userinfo_provider
     */
    public function test_moodle_backup_restore_rebuilds_destination_state(bool $userinfo): void {
        global $DB;

        $this->resetAfterTest();
        $this->setAdminUser();
        [$course, $activity, $cm, $learner] = $this->create_portable_activity();
        $this->insert_portable_state($activity, $cm, $learner);
        $this->create_owned_files($activity, $cm);

        $restoredcourseid = $this->backup_and_restore($course, $userinfo, backup::MODE_GENERAL);
        $restored = $DB->get_record('scaffold', ['course' => $restoredcourseid], '*', MUST_EXIST);
        $restoredcm = get_coursemodule_from_instance('scaffold', (int) $restored->id, $restoredcourseid, false, MUST_EXIST);
        $artifactid = 'moodle-cm-' . $restoredcm->id;
        $artifact = json_decode($restored->artifactjson, false, 512, JSON_THROW_ON_ERROR);

        $this->assertNotSame((int) $cm->id, (int) $restoredcm->id);
        $this->assertSame($artifactid, $artifact->id);
        $this->assertSame('stable-block-id', $artifact->content->content[0]->content[0]->attrs->id);
        $this->assertSame(1, (int) $restored->assessmentdefinitionversion);
        $this->assertSame(1, (int) $restored->gradeitemversion);
        $this->assertSame('published', $restored->gradeitemstatus);

        $restoredcontext = context_module::instance((int) $restoredcm->id);
        $fs = get_file_storage();
        $this->assertNotFalse($fs->get_file(
            $restoredcontext->id,
            'mod_scaffold',
            'intro',
            0,
            '/',
            'intro.txt',
        ));
        $this->assertNotFalse($fs->get_file(
            $restoredcontext->id,
            'mod_scaffold',
            'media',
            (int) $restored->id,
            '/',
            'media.txt',
        ));

        if (!$userinfo) {
            $this->assertSame(0, $DB->count_records('scaffold_assessment_state', [
                'scaffoldid' => $restored->id,
            ]));
            $this->assertSame(0, $DB->count_records('scaffold_learner_activity', [
                'scaffoldid' => $restored->id,
            ]));
            $this->assertSame(0, $DB->count_records('scaffold_grade_publications', [
                'scaffoldid' => $restored->id,
            ]));
            return;
        }

        $assessment = $DB->get_record('scaffold_assessment_state', [
            'scaffoldid' => $restored->id,
            'userid' => $learner->id,
        ], '*', MUST_EXIST);
        $snapshot = json_decode($assessment->snapshotjson, false, 512, JSON_THROW_ON_ERROR);
        $this->assertSame($artifactid, $snapshot->artifactId);
        $this->assertSame('expired', $snapshot->quizzes->{'stable-group-id'}->status);
        $this->assertNull($assessment->nextquizexpiry);
        $this->assertSame(2, (int) $assessment->staterevision);
        $learneractivity = json_decode((string) $DB->get_field(
            'scaffold_learner_activity',
            'snapshotjson',
            ['scaffoldid' => $restored->id, 'userid' => $learner->id],
            MUST_EXIST,
        ), false, 512, JSON_THROW_ON_ERROR);
        $this->assertSame($artifactid, $learneractivity->artifactId);
        $this->assertSame(['stable-block-id'], array_keys(get_object_vars($learneractivity->activities)));
        $this->assertSame(1, $DB->count_records('scaffold_grade_publications', [
            'scaffoldid' => $restored->id,
            'userid' => $learner->id,
        ]));
        $completion = $DB->get_record('course_modules_completion', [
            'coursemoduleid' => $restoredcm->id,
            'userid' => $learner->id,
        ], '*', MUST_EXIST);
        $this->assertSame(COMPLETION_COMPLETE, (int) $completion->completionstate);
    }

    public static function userinfo_provider(): array {
        return [
            'definition only' => [false],
            'definition and learner source state' => [true],
        ];
    }

    public function test_repairs_only_activity_artifact_identity_and_preserves_authored_ids(): void {
        $sourceartifactid = 'moodle-cm-41';
        $destinationartifactid = 'moodle-cm-92';
        $source = (object) [
            'artifactjson' => json_encode((object) [
                'id' => $sourceartifactid,
                'title' => 'Restored Scaffold activity',
                'mode' => 'page',
                'content' => (object) [
                    'type' => 'doc',
                    'content' => [(object) [
                        'type' => 'courseDocument',
                        'attrs' => (object) ['mode' => 'page'],
                        'content' => [(object) [
                            'type' => 'paragraph',
                            'attrs' => (object) [
                                'id' => 'stable-block-id',
                                'literal' => $sourceartifactid,
                            ],
                        ]],
                    ]],
                ],
            ], JSON_THROW_ON_ERROR),
            'learnercontentjson' => json_encode((object) [
                'type' => 'doc',
                'content' => [(object) [
                    'type' => 'courseDocument',
                    'attrs' => (object) ['mode' => 'page'],
                    'content' => [],
                ]],
            ], JSON_THROW_ON_ERROR),
            'assessmenttargetsjson' => '[]',
            'assessmentgroupsjson' => '[]',
        ];

        $repaired = restore_identity_service::repair($destinationartifactid, $source);
        $artifact = json_decode($repaired->artifactjson, false, 512, JSON_THROW_ON_ERROR);

        $this->assertSame($destinationartifactid, $artifact->id);
        $this->assertSame('stable-block-id', $artifact->content->content[0]->content[0]->attrs->id);
        $this->assertSame($sourceartifactid, $artifact->content->content[0]->content[0]->attrs->literal);
        $this->assertSame('[]', $repaired->assessmenttargetsjson);
        $this->assertSame('[]', $repaired->assessmentgroupsjson);
    }

    public function test_repairs_assessment_snapshot_artifact_identity_without_changing_stable_map_keys(): void {
        $source = (object) [
            'snapshotVersion' => 1,
            'artifactId' => 'moodle-cm-41',
            'problems' => (object) [
                'stable-target-id' => (object) [
                    'response' => null,
                    'attemptNumber' => 0,
                    'hintsShown' => 0,
                    'checkResult' => null,
                    'submitted' => false,
                    'submissionResult' => null,
                ],
            ],
            'quizzes' => (object) [],
        ];

        $repaired = restore_identity_service::repair('moodle-cm-92', $source);

        $this->assertSame('moodle-cm-92', $repaired->artifactId);
        $this->assertSame(['stable-target-id'], array_keys(get_object_vars($repaired->problems)));
    }

    public function test_repairs_learner_activity_artifact_identity_without_changing_block_records(): void {
        $source = (object) [
            'snapshotVersion' => 1,
            'artifactId' => 'moodle-cm-41',
            'activities' => (object) [
                'stable-block-id' => (object) [
                    'activityKind' => 'checklist',
                    'data' => (object) ['sourceLiteral' => 'moodle-cm-41'],
                    'completed' => true,
                    'updatedAt' => '2026-07-18T12:00:00.000000Z',
                ],
            ],
        ];

        $repaired = restore_identity_service::repair('moodle-cm-92', $source);

        $this->assertSame('moodle-cm-92', $repaired->artifactId);
        $this->assertSame(['stable-block-id'], array_keys(get_object_vars($repaired->activities)));
        $this->assertSame('moodle-cm-41', $repaired->activities->{'stable-block-id'}->data->sourceLiteral);
    }

    public function test_rejects_invalid_canonical_restore_source(): void {
        $this->expectException(invalid_parameter_exception::class);
        restore_identity_service::repair('moodle-cm-92', (object) [
            'snapshotVersion' => 1,
            'artifactId' => 'moodle-cm-41',
            'problems' => [],
            'quizzes' => (object) [],
        ]);
    }

    public function test_course_import_and_activity_duplication_use_native_backup_contract(): void {
        global $CFG, $DB;

        $this->resetAfterTest();
        $this->setAdminUser();
        require_once($CFG->dirroot . '/course/lib.php');
        [$course, $activity, $cm] = $this->create_portable_activity();
        $destination = $this->getDataGenerator()->create_course(['enablecompletion' => 1]);

        $importedcourseid = $this->backup_and_restore(
            $course,
            false,
            backup::MODE_IMPORT,
            (int) $destination->id,
            backup::TARGET_CURRENT_ADDING,
        );
        $this->assertSame((int) $destination->id, $importedcourseid);
        $this->assertSame(1, $DB->count_records('scaffold', ['course' => $destination->id]));

        $duplicatedcm = duplicate_module($course, get_fast_modinfo($course)->get_cm((int) $cm->id));
        $this->assertNotNull($duplicatedcm);
        $duplicated = $DB->get_record('scaffold', ['id' => $duplicatedcm->instance], '*', MUST_EXIST);
        $this->assertSame(
            'moodle-cm-' . $duplicatedcm->id,
            json_decode($duplicated->artifactjson, false, 512, JSON_THROW_ON_ERROR)->id,
        );
        $this->assertNotSame((int) $activity->id, (int) $duplicated->id);
    }

    public function test_post_restore_projection_recovery_is_bounded(): void {
        global $DB;

        $this->resetAfterTest();
        $this->setAdminUser();
        [, $activity, $cm] = $this->create_portable_activity();
        $now = time();
        $artifactid = 'moodle-cm-' . $cm->id;
        $snapshotjson = json_encode((object) [
            'snapshotVersion' => 1,
            'artifactId' => $artifactid,
            'problems' => (object) [],
            'quizzes' => (object) [],
        ], JSON_THROW_ON_ERROR);

        for ($index = 0; $index <= 100; $index++) {
            $learner = $this->getDataGenerator()->create_user();
            $DB->insert_record('scaffold_assessment_state', (object) [
                'scaffoldid' => $activity->id,
                'userid' => $learner->id,
                'snapshotjson' => $snapshotjson,
                'staterevision' => 1,
                'nextquizexpiry' => null,
                'timecreated' => $now,
                'timemodified' => $now,
            ]);
        }

        restore_identity_service::rebuild_host_projections((int) $activity->id, (int) $cm->id);

        $this->assertSame(101, $DB->count_records('scaffold_assessment_state', [
            'scaffoldid' => $activity->id,
        ]));
        $this->assertSame(100, $DB->count_records('scaffold_grade_publications', [
            'scaffoldid' => $activity->id,
        ]));
    }

    private function create_portable_activity(): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');
        $course = $this->getDataGenerator()->create_course(['enablecompletion' => 1]);
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Portable Scaffold activity',
            'intro' => '<p>Portable introduction</p>',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
            'completionactivitystatus' => 1,
        ]);
        $moduleid = $DB->get_field('modules', 'id', ['name' => 'scaffold'], MUST_EXIST);
        $cmid = add_course_module((object) [
            'course' => $course->id,
            'module' => $moduleid,
            'instance' => $activityid,
            'section' => 0,
            'idnumber' => '',
            'added' => time(),
            'score' => 0,
            'indent' => 0,
            'visible' => 1,
            'visibleold' => 1,
            'groupmode' => 0,
            'groupingid' => 0,
            'completion' => COMPLETION_TRACKING_AUTOMATIC,
            'completiongradeitemnumber' => null,
            'completionview' => 0,
            'completionexpected' => 0,
            'completionpassgrade' => 0,
            'showdescription' => 0,
        ]);
        course_add_cm_to_section($course, $cmid, 0);
        $cm = get_fast_modinfo($course)->get_cm($cmid);
        $artifactid = 'moodle-cm-' . $cmid;
        $artifact = (object) [
            'id' => $artifactid,
            'title' => 'Portable Scaffold activity',
            'mode' => 'page',
            'content' => (object) [
                'type' => 'doc',
                'content' => [(object) [
                    'type' => 'courseDocument',
                    'attrs' => (object) ['mode' => 'page'],
                    'content' => [(object) [
                        'type' => 'paragraph',
                        'attrs' => (object) ['id' => 'stable-block-id'],
                    ]],
                ]],
            ],
        ];
        $target = self::target();
        $group = self::group();
        $DB->set_field('scaffold', 'artifactjson', json_encode($artifact, JSON_THROW_ON_ERROR), ['id' => $activityid]);
        $DB->set_field('scaffold', 'learnercontentjson', json_encode($artifact->content, JSON_THROW_ON_ERROR), [
            'id' => $activityid,
        ]);
        $DB->set_field('scaffold', 'assessmenttargetsjson', json_encode([$target], JSON_THROW_ON_ERROR), [
            'id' => $activityid,
        ]);
        $DB->set_field('scaffold', 'assessmentgroupsjson', json_encode([$group], JSON_THROW_ON_ERROR), [
            'id' => $activityid,
        ]);
        $activity = $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST);
        $learner = $this->getDataGenerator()->create_user();
        $roleid = $DB->get_field('role', 'id', ['shortname' => 'student'], MUST_EXIST);
        $this->getDataGenerator()->enrol_user($learner->id, $course->id, $roleid);
        return [$course, $activity, $cm, $learner];
    }

    private function insert_portable_state(stdClass $activity, cm_info $cm, stdClass $learner): void {
        global $DB;

        $now = time();
        $artifactid = 'moodle-cm-' . $cm->id;
        $snapshot = (object) [
            'snapshotVersion' => 1,
            'artifactId' => $artifactid,
            'problems' => (object) [],
            'quizzes' => (object) [
                'stable-group-id' => (object) [
                    'attemptId' => 'stable-attempt-id',
                    'status' => 'in_progress',
                    'currentTargetId' => 'stable-target-id',
                    'submittedTargetIds' => [],
                    'startedAt' => gmdate('Y-m-d\\TH:i:s', $now - 120) . '.000000Z',
                    'finishedAt' => null,
                    'expiresAt' => gmdate('Y-m-d\\TH:i:s', $now - 60) . '.000000Z',
                    'score' => null,
                    'maxScore' => null,
                    'resultsByTargetId' => (object) [],
                    'answerReviewAuthorized' => false,
                ],
            ],
        ];
        $DB->insert_record('scaffold_assessment_state', (object) [
            'scaffoldid' => $activity->id,
            'userid' => $learner->id,
            'snapshotjson' => json_encode($snapshot, JSON_THROW_ON_ERROR),
            'staterevision' => 9,
            'nextquizexpiry' => $now - 60,
            'timecreated' => $now - 120,
            'timemodified' => $now - 120,
        ]);
        $DB->insert_record('scaffold_learner_activity', (object) [
            'scaffoldid' => $activity->id,
            'userid' => $learner->id,
            'snapshotjson' => json_encode((object) [
                'snapshotVersion' => 1,
                'artifactId' => $artifactid,
                'activities' => (object) [
                    'stable-block-id' => (object) [
                        'activityKind' => 'checklist',
                        'data' => (object) ['position' => 1],
                        'completed' => true,
                        'updatedAt' => '2026-07-18T12:00:00.000000Z',
                    ],
                ],
            ], JSON_THROW_ON_ERROR),
            'timecreated' => $now - 120,
            'timemodified' => $now - 120,
        ]);
        $DB->insert_record('scaffold_grade_publications', (object) [
            'scaffoldid' => $activity->id,
            'userid' => $learner->id,
            'staterevision' => 9,
            'definitionversion' => 8,
            'status' => 'failed',
            'failurecode' => 'source-site-status',
            'retrycount' => 5,
            'retryafter' => $now + 300,
            'timecreated' => $now - 120,
            'timemodified' => $now - 120,
        ]);
    }

    private function create_owned_files(stdClass $activity, cm_info $cm): void {
        $fs = get_file_storage();
        $context = context_module::instance((int) $cm->id);
        $common = [
            'contextid' => $context->id,
            'component' => 'mod_scaffold',
            'filepath' => '/',
        ];
        $fs->create_file_from_string($common + [
            'filearea' => 'intro',
            'itemid' => 0,
            'filename' => 'intro.txt',
        ], 'portable intro');
        $fs->create_file_from_string($common + [
            'filearea' => 'media',
            'itemid' => $activity->id,
            'filename' => 'media.txt',
        ], 'portable media');
    }

    private function backup_and_restore(
        stdClass $sourcecourse,
        bool $userinfo,
        int $mode,
        ?int $destinationcourseid = null,
        int $target = backup::TARGET_NEW_COURSE,
    ): int {
        global $CFG, $USER;

        $CFG->backup_file_logger_level = backup::LOG_NONE;
        $controller = new backup_controller(
            backup::TYPE_1COURSE,
            $sourcecourse->id,
            backup::FORMAT_MOODLE,
            backup::INTERACTIVE_NO,
            backup::MODE_IMPORT,
            $USER->id,
        );
        $controller->get_plan()->get_setting('users')->set_status(backup_setting::NOT_LOCKED);
        $controller->get_plan()->get_setting('users')->set_value($userinfo);
        $backupid = $controller->get_backupid();
        $controller->execute_plan();
        $controller->destroy();

        $destinationcourseid ??= restore_dbops::create_new_course(
            'Restored Scaffold course',
            'restored-' . $backupid,
            $sourcecourse->category,
        );
        $restore = new restore_controller(
            $backupid,
            $destinationcourseid,
            backup::INTERACTIVE_NO,
            $mode,
            $USER->id,
            $target,
        );
        $restore->get_plan()->get_setting('users')->set_status(backup_setting::NOT_LOCKED);
        $restore->get_plan()->get_setting('users')->set_value($userinfo);
        $this->assertTrue($restore->execute_precheck());
        $restore->execute_plan();
        $restore->destroy();
        return $destinationcourseid;
    }

    private static function target(): array {
        return [
            'schemaVersion' => 1,
            'targetId' => 'stable-target-id',
            'blockId' => 'stable-block-id',
            'blockType' => 'mcq',
            'interaction' => [
                'kind' => 'single-select',
                'options' => [['id' => 'option-a'], ['id' => 'option-b']],
            ],
            'assessment' => [
                'kind' => 'single-select',
                'correctOptionId' => 'option-b',
                'feedbackByOptionId' => (object) [],
            ],
            'settings' => [
                'feedbackMode' => 'on_submit',
                'isGraded' => true,
                'showAnswer' => true,
                'points' => 1,
                'maxAttempts' => 1,
            ],
        ];
    }

    private static function group(): array {
        return [
            'schemaVersion' => 1,
            'kind' => 'quiz',
            'groupId' => 'stable-group-id',
            'targetIds' => ['stable-target-id'],
            'settings' => [
                'allowBacktracking' => false,
                'reviewTiming' => 'after_each_answer',
                'reviewDetail' => 'full_review',
                'attemptsPerQuestion' => 1,
                'isGraded' => true,
                'timer' => ['enabled' => true, 'durationSeconds' => 60],
            ],
        ];
    }
}

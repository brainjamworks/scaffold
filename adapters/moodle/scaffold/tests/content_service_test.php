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

namespace mod_scaffold;

use mod_scaffold\local\activity_access;
use mod_scaffold\local\content_service;


/**
 * Tests content projection and persistence against Moodle DML.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 *
 * @covers \mod_scaffold\local\content_service
 */
final class content_service_test extends \advanced_testcase {
    public function test_payload_returns_authoring_projection_for_edit_scope(): void {
        $this->resetAfterTest();

        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');

        $payload = (new content_service())->payload($scope, 'authoring');
        $artifact = json_decode($payload['artifactJson'], false, 512, JSON_THROW_ON_ERROR);
        $access = json_decode($payload['artifactAccessJson'], false, 512, JSON_THROW_ON_ERROR);

        $this->assertSame('supported', $access->status);
        $this->assertSame('author-only', $artifact->content->content[0]->attrs->audience);
        $this->assertSame('null', $payload['assessmentSnapshotJson']);
        $status = json_decode($payload['publicationStatusJson'], false, 512, JSON_THROW_ON_ERROR);
        $this->assertNotSame('', $status->currentArtifactRevision);
        $this->assertSame('published-revision', $status->publishedArtifactRevision);
        $this->assertArrayNotHasKey('learnerActivitySnapshotJson', $payload);
    }

    public function test_payload_returns_learner_projection_for_view_scope(): void {
        $this->resetAfterTest();

        [$course, $activity] = $this->create_activity_with_content();
        $learner = $this->getDataGenerator()->create_user();
        $this->enrol_as($learner, $course, 'student');
        $this->setUser($learner);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:view');

        $payload = (new content_service())->payload($scope, 'learner');
        $artifact = json_decode($payload['artifactJson'], false, 512, JSON_THROW_ON_ERROR);
        $access = json_decode($payload['artifactAccessJson'], false, 512, JSON_THROW_ON_ERROR);
        $publication = json_decode(
            $payload['learnerPublicationJson'],
            false,
            512,
            JSON_THROW_ON_ERROR,
        );

        $this->assertSame('supported', $access->status);
        $this->assertNull($artifact);
        $this->assertStringNotContainsString('author-only', $payload['artifactJson']);
        $this->assertSame('supported', $publication->status);
        $this->assertSame(
            'learner-safe',
            $publication->learnerContent->content[0]->attrs->audience,
        );
        $this->assertStringNotContainsString('author-only', $payload['learnerPublicationJson']);
        $this->assertNotSame('null', $payload['assessmentSnapshotJson']);
        $this->assertArrayHasKey('learnerActivitySnapshotJson', $payload);
        $this->assertArrayNotHasKey('learnerStateJson', $payload);
        $this->assertSame(
            [
                'success',
                'artifactAccessJson',
                'artifactJson',
                'assessmentSnapshotJson',
                'learnerPublicationJson',
                'learnerActivitySnapshotJson',
            ],
            array_keys($payload),
        );
    }

    /**
     * Learner bootstrap reports never-published without consulting canonical content.
     */
    public function test_payload_returns_distinct_not_published_state_without_reading_draft(): void {
        global $DB;

        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity_with_content();
        $DB->set_field('scaffold', 'learnercontentjson', 'null', ['id' => $activity->id]);
        $learner = $this->getDataGenerator()->create_user();
        $this->enrol_as($learner, $course, 'student');
        $this->setUser($learner);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:view');

        $payload = (new content_service())->payload($scope, 'learner');
        $access = json_decode($payload['artifactAccessJson'], false, 512, JSON_THROW_ON_ERROR);
        $publication = json_decode(
            $payload['learnerPublicationJson'],
            false,
            512,
            JSON_THROW_ON_ERROR,
        );

        $this->assertSame('not-published', $access->status);
        $this->assertSame('not-published', $publication->status);
        $this->assertSame('null', $payload['artifactJson']);
        $this->assertSame('null', $payload['assessmentSnapshotJson']);
        $this->assertArrayNotHasKey('learnerActivitySnapshotJson', $payload);
        $this->assertStringNotContainsString('author-only', json_encode($payload, JSON_THROW_ON_ERROR));
    }

    public function test_payload_withholds_plus_required_authoring_content(): void {
        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');
        $this->set_course_requirement($activity, 4, true);

        $payload = (new content_service())->payload($scope, 'authoring');
        $access = json_decode($payload['artifactAccessJson'], false, 512, JSON_THROW_ON_ERROR);

        $this->assertSame('requires-scaffold-plus', $access->status);
        $this->assertSame('moodle-cm-' . $activity->cmid, $access->artifact->id);
        $this->assertSame('Scaffold test activity', $access->artifact->title);
        $this->assertSame('page', $access->artifact->mode);
        $this->assertSame('null', $payload['artifactJson']);
        $this->assertSame('null', $payload['assessmentSnapshotJson']);
        $this->assertArrayNotHasKey('learnerPublicationJson', $payload);
        $this->assertArrayNotHasKey('learnerActivitySnapshotJson', $payload);
        $this->assertStringNotContainsString('author-only', json_encode($payload, JSON_THROW_ON_ERROR));
    }

    public function test_saved_plus_required_draft_does_not_change_active_learner_publication(): void {
        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity_with_content();
        $learner = $this->getDataGenerator()->create_user();
        $this->enrol_as($learner, $course, 'student');
        $this->setUser($learner);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:view');
        $this->set_course_requirement($activity, 4, true);

        $payload = (new content_service())->payload($scope, 'learner');
        $access = json_decode($payload['artifactAccessJson'], false, 512, JSON_THROW_ON_ERROR);
        $publication = json_decode(
            $payload['learnerPublicationJson'],
            false,
            512,
            JSON_THROW_ON_ERROR,
        );

        $this->assertSame('supported', $access->status);
        $this->assertSame('supported', $publication->status);
        $this->assertSame('null', $payload['artifactJson']);
        $this->assertNotSame('null', $payload['assessmentSnapshotJson']);
        $this->assertArrayHasKey('learnerActivitySnapshotJson', $payload);
        $encoded = json_encode($payload, JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('author-only', $encoded);
        $this->assertStringContainsString('learner-safe', $encoded);
    }

    public function test_payload_preserves_format_precedence_before_product_access(): void {
        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');

        $this->set_course_requirement($activity, 5, true);
        $future = json_decode(
            (new content_service())->payload($scope, 'authoring')['artifactAccessJson'],
            false,
            512,
            JSON_THROW_ON_ERROR,
        );
        $this->assertSame('unsupported-core-format', $future->status);
        $this->assertSame(5, $future->documentVersion);
        $this->assertSame(4, $future->supportedVersion);

        $this->set_course_requirement($activity, 4, null);
        $invalid = json_decode(
            (new content_service())->payload($scope, 'authoring')['artifactAccessJson'],
            false,
            512,
            JSON_THROW_ON_ERROR,
        );
        $this->assertSame('invalid', $invalid->status);

        $this->set_course_requirement($activity, 3, null);
        $migratable = json_decode(
            (new content_service())->payload($scope, 'authoring')['artifactAccessJson'],
            false,
            512,
            JSON_THROW_ON_ERROR,
        );
        $this->assertSame('supported', $migratable->status);
    }

    public function test_payload_rejects_purpose_not_proved_by_scope(): void {
        $this->resetAfterTest();

        [$course, $activity] = $this->create_activity_with_content();
        $learner = $this->getDataGenerator()->create_user();
        $this->enrol_as($learner, $course, 'student');
        $this->setUser($learner);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:view');

        $this->expectException(\invalid_parameter_exception::class);
        (new content_service())->payload($scope, 'authoring');
    }

    public function test_payload_preserves_empty_json_objects(): void {
        $this->resetAfterTest();

        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');

        $payload = (new content_service())->payload($scope, 'authoring');
        $artifact = json_decode($payload['artifactJson'], false, 512, JSON_THROW_ON_ERROR);

        $this->assertInstanceOf(\stdClass::class, $artifact->content->content[0]->attrs->settings);
        $this->assertSame([], get_object_vars($artifact->content->content[0]->attrs->settings));
    }

    public function test_project_artifact_uses_canonical_metadata_and_nullable_content(): void {
        $service = new content_service();
        $initialized = (object) [
            'name' => 'Projected activity',
            'artifactjson' => json_encode([
                'id' => 'stale-id',
                'title' => 'Stale title',
                'mode' => 'page',
                'content' => [
                    'type' => 'doc',
                    'content' => [[
                        'type' => 'surface',
                        'attrs' => [
                            'id' => 'surface-1',
                            'variant' => 'page-default',
                            'settings' => (object) [],
                        ],
                        'content' => [],
                    ]],
                ],
            ], JSON_THROW_ON_ERROR),
            'learnercontentjson' => json_encode([
                'type' => 'doc',
                'content' => [['type' => 'paragraph']],
            ], JSON_THROW_ON_ERROR),
        ];

        $authoring = $service->project_artifact($initialized, 42, true);
        $learner = $service->project_artifact($initialized, 42, false);
        $this->assertSame('moodle-cm-42', $authoring['id']);
        $this->assertSame('Stale title', $authoring['title']);
        $this->assertInstanceOf(
            \stdClass::class,
            $authoring['content']['content'][0]['attrs']['settings'],
        );
        $this->assertNull($learner['content']);

        $uninitialized = (object) [
            'name' => 'Uninitialized activity',
            'artifactjson' => json_encode([
                'id' => '',
                'title' => 'Scaffold',
                'mode' => 'slideshow',
                'content' => null,
            ], JSON_THROW_ON_ERROR),
            'learnercontentjson' => 'null',
        ];
        $projection = $service->project_artifact($uninitialized, 73, true);
        $this->assertSame('moodle-cm-73', $projection['id']);
        $this->assertSame('Uninitialized activity', $projection['title']);
        $this->assertNull($projection['content']);
    }

    public function test_save_rolls_back_coherent_bundle_when_content_dml_fails(): void {
        global $DB;

        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');
        $artifactjson = $this->save_bundle($activity->cmid, str_repeat('x', 300));

        try {
            (new content_service())->save($scope, $artifactjson);
            $this->fail('Expected the oversized database value to fail');
        } catch (\dml_exception) {
            $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);
            $this->assertSame('Scaffold test activity', $stored->name);
            $this->assertStringContainsString('author-only', $stored->artifactjson);
            $this->assertSame('[]', $stored->assessmenttargetsjson);
            $this->assertSame('[]', $stored->assessmentgroupsjson);
        }
    }

    public function test_save_changes_only_the_private_canonical_draft(): void {
        global $DB;

        $this->preventResetByRollback();
        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');
        $artifactjson = $this->save_bundle($activity->cmid, 'Committed title');
        $callbackran = false;
        $service = new content_service(
            static function (\stdClass $saved) use (&$callbackran): void {
                $callbackran = true;
            },
        );

        $result = $service->save($scope, $artifactjson);

        $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);
        $this->assertFalse($callbackran);
        $this->assertNotSame('', $result['artifactRevision']);
        $this->assertSame('Scaffold test activity', $stored->name);
        $this->assertSame('Committed title', json_decode($stored->artifactjson)->title);
        $this->assertSame($activity->learnercontentjson, $stored->learnercontentjson);
        $this->assertSame($activity->assessmenttargetsjson, $stored->assessmenttargetsjson);
        $this->assertSame($activity->assessmentgroupsjson, $stored->assessmentgroupsjson);
    }

    /**
     * Publish activates matching safe and private projections together.
     */
    public function test_publish_atomically_activates_the_saved_revision(): void {
        global $DB;

        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');
        $service = new content_service(static fn(\stdClass $saved): int => 0);
        $saved = $service->save($scope, $this->save_bundle($activity->cmid, 'Published title'));
        $learnercontent = $this->learner_content('new-learner-safe');

        $result = $service->publish(
            $scope,
            $saved['artifactRevision'],
            json_encode([
                'id' => 'moodle-cm-' . $activity->cmid,
                'title' => 'Published title',
                'mode' => 'page',
                'requiresScaffoldPlus' => false,
            ], JSON_THROW_ON_ERROR),
            json_encode($learnercontent, JSON_THROW_ON_ERROR),
            '[]',
            '[]',
        );

        $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);
        $envelope = json_decode($stored->learnercontentjson, false, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('Published title', $stored->name);
        $this->assertSame(1, $envelope->publicationVersion);
        $this->assertSame($saved['artifactRevision'], $envelope->sourceArtifactRevision);
        $this->assertSame('Published title', $envelope->artifact->title);
        $this->assertSame('new-learner-safe', $envelope->learnerContent->content[0]->attrs->audience);
        $this->assertSame('[]', $stored->assessmenttargetsjson);
        $this->assertSame('[]', $stored->assessmentgroupsjson);
        $this->assertSame($saved['artifactRevision'], $result['status']['publishedArtifactRevision']);
    }

    /**
     * Publish never persists canonical fields carried by its stale row snapshot.
     */
    public function test_publish_does_not_overwrite_a_newer_canonical_draft_from_stale_read(): void {
        global $DB;

        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');
        $service = new content_service();
        $sourceartifactrevision = json_decode(
            $service->payload($scope, 'authoring')['publicationStatusJson'],
            false,
            512,
            JSON_THROW_ON_ERROR,
        )->currentArtifactRevision;
        $stalerecord = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);
        $newerartifact = json_decode($stalerecord->artifactjson, true, 512, JSON_THROW_ON_ERROR);
        $newerartifact['title'] = 'Newer canonical draft';
        $DB->set_field(
            'scaffold',
            'artifactjson',
            json_encode($newerartifact, JSON_THROW_ON_ERROR),
            ['id' => $activity->id],
        );

        $moodledb = $DB;
        $databaseproxy = new class($moodledb, $stalerecord) {
            /** @var \stdClass|null Last update supplied by Publish. */
            public ?\stdClass $updatedrecord = null;
            /** @var \moodle_database Real Moodle database. */
            private readonly \moodle_database $database;
            /** @var \stdClass Stale Publish snapshot. */
            private readonly \stdClass $stalerecord;

            /**
             * Creates a stale-read database proxy.
             *
             * @param \moodle_database $database Real Moodle database.
             * @param \stdClass $stalerecord Stale Publish snapshot.
             */
            public function __construct(
                \moodle_database $database,
                \stdClass $stalerecord,
            ) {
                $this->database = $database;
                $this->stalerecord = $stalerecord;
            }

            /**
             * Returns the stale Publish snapshot.
             *
             * @param string $table Table name.
             * @param array $conditions Record conditions.
             * @param string $fields Selected fields.
             * @param int $strictness Missing-record behavior.
             * @return \stdClass
             */
            public function get_record(
                string $table,
                array $conditions,
                string $fields = '*',
                int $strictness = IGNORE_MISSING,
            ): \stdClass {
                return clone $this->stalerecord;
            }

            /**
             * Starts a real delegated transaction.
             *
             * @return mixed
             */
            public function start_delegated_transaction(): mixed {
                return $this->database->start_delegated_transaction();
            }

            /**
             * Captures and applies the supplied update.
             *
             * @param string $table Table name.
             * @param \stdClass $record Update record.
             */
            public function update_record(string $table, \stdClass $record): void {
                $this->updatedrecord = clone $record;
                $this->database->update_record($table, $record);
            }
        };
        $DB = $databaseproxy;

        try {
            $result = $service->publish(
                $scope,
                $sourceartifactrevision,
                json_encode([
                    'id' => 'moodle-cm-' . $activity->cmid,
                    'title' => 'Scaffold test activity',
                    'mode' => 'page',
                    'requiresScaffoldPlus' => false,
                ], JSON_THROW_ON_ERROR),
                json_encode($this->learner_content('published-from-stale-read'), JSON_THROW_ON_ERROR),
                '[]',
                '[]',
            );
        } finally {
            $DB = $moodledb;
        }

        $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);
        $this->assertSame('Newer canonical draft', json_decode($stored->artifactjson)->title);
        $this->assertSame($sourceartifactrevision, $result['status']['publishedArtifactRevision']);
        $this->assertInstanceOf(\stdClass::class, $databaseproxy->updatedrecord);
        $this->assertSame([
            'id',
            'name',
            'learnercontentjson',
            'assessmenttargetsjson',
            'assessmentgroupsjson',
            'timemodified',
        ], array_keys(get_object_vars($databaseproxy->updatedrecord)));
        $this->assertFalse(property_exists($databaseproxy->updatedrecord, 'artifactjson'));
    }

    /**
     * Save never persists publication fields carried by its stale activity scope.
     */
    public function test_save_does_not_overwrite_a_newer_active_publication_from_stale_scope(): void {
        global $DB;

        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');

        $newerpublication = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);
        $newerpublication->name = 'Newer published title';
        $newerpublication->learnercontentjson = json_encode([
            'publicationVersion' => 1,
            'sourceArtifactRevision' => 'newer-published-revision',
            'publishedAt' => '2026-08-11T09:00:00Z',
            'artifact' => [
                'id' => 'moodle-cm-' . $activity->cmid,
                'title' => 'Newer published title',
                'mode' => 'page',
                'requiresScaffoldPlus' => false,
            ],
            'learnerContent' => $this->learner_content('newer-learner-safe'),
        ], JSON_THROW_ON_ERROR);
        $newerpublication->assessmenttargetsjson = '[{"id":"newer-target"}]';
        $newerpublication->assessmentgroupsjson = '[{"id":"newer-group"}]';
        $newerpublication->grade = 75;
        $newerpublication->assessmentdefinitionversion = 17;
        $newerpublication->gradeitemversion = 12;
        $newerpublication->gradeitemstatus = 'failed';
        $newerpublication->gradeitemfailurecode = 'newer-grade-state';
        $newerpublication->gradeitemretrycount = 4;
        $newerpublication->gradeitemretryafter = 1786442400;
        $newerpublication->gradeitemtimemodified = 1786438800;
        $DB->update_record('scaffold', $newerpublication);
        $before = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);

        $moodledb = $DB;
        $databaseproxy = new class($moodledb) {
            /** @var \stdClass|null Last update supplied by Save. */
            public ?\stdClass $updatedrecord = null;
            /** @var \moodle_database Real Moodle database. */
            private readonly \moodle_database $database;

            /**
             * Creates an update-capturing database proxy.
             *
             * @param \moodle_database $database Real Moodle database.
             */
            public function __construct(\moodle_database $database) {
                $this->database = $database;
            }

            /**
             * Starts a real delegated transaction.
             *
             * @return mixed
             */
            public function start_delegated_transaction(): mixed {
                return $this->database->start_delegated_transaction();
            }

            /**
             * Captures and applies the supplied update.
             *
             * @param string $table Table name.
             * @param \stdClass $record Update record.
             */
            public function update_record(string $table, \stdClass $record): void {
                $this->updatedrecord = clone $record;
                $this->database->update_record($table, $record);
            }
        };
        $DB = $databaseproxy;

        try {
            $result = (new content_service())->save(
                $scope,
                $this->save_bundle($activity->cmid, 'New canonical draft'),
            );
        } finally {
            $DB = $moodledb;
        }

        $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);
        $this->assertSame('New canonical draft', json_decode($stored->artifactjson)->title);
        $this->assertNotSame('', $result['artifactRevision']);
        foreach ([
            'name',
            'learnercontentjson',
            'assessmenttargetsjson',
            'assessmentgroupsjson',
            'grade',
            'assessmentdefinitionversion',
            'gradeitemversion',
            'gradeitemstatus',
            'gradeitemfailurecode',
            'gradeitemretrycount',
            'gradeitemretryafter',
            'gradeitemtimemodified',
        ] as $field) {
            $this->assertSame($before->{$field}, $stored->{$field}, $field);
        }
        $this->assertInstanceOf(\stdClass::class, $databaseproxy->updatedrecord);
        $this->assertSame(
            ['id', 'artifactjson', 'timemodified'],
            array_keys(get_object_vars($databaseproxy->updatedrecord)),
        );
    }

    /**
     * A stale Publish leaves every active publication field unchanged.
     */
    public function test_stale_publish_retains_the_previous_active_publication(): void {
        global $DB;

        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');
        $service = new content_service();
        $oldrevision = json_decode(
            $service->payload($scope, 'authoring')['publicationStatusJson'],
            false,
            512,
            JSON_THROW_ON_ERROR,
        )->currentArtifactRevision;
        $service->save($scope, $this->save_bundle($activity->cmid, 'Newer draft'));
        $before = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);

        try {
            $service->publish(
                $scope,
                $oldrevision,
                json_encode([
                    'id' => 'moodle-cm-' . $activity->cmid,
                    'title' => 'Scaffold test activity',
                    'mode' => 'page',
                    'requiresScaffoldPlus' => false,
                ], JSON_THROW_ON_ERROR),
                json_encode($this->learner_content('must-not-publish'), JSON_THROW_ON_ERROR),
                '[]',
                '[]',
            );
            $this->fail('Expected stale publication to be refused');
        } catch (\invalid_parameter_exception $exception) {
            $this->assertStringContainsString('stale-artifact-revision', $exception->getMessage());
        }

        $after = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);
        $this->assertSame($before->learnercontentjson, $after->learnercontentjson);
        $this->assertSame($before->assessmenttargetsjson, $after->assessmenttargetsjson);
        $this->assertSame($before->assessmentgroupsjson, $after->assessmentgroupsjson);
    }

    public function test_save_rejects_plus_required_artifact_in_free_moodle(): void {
        global $DB;

        $this->resetAfterTest();
        [$course, $activity] = $this->create_activity_with_content();
        $author = $this->getDataGenerator()->create_user();
        $this->enrol_as($author, $course, 'editingteacher');
        $this->setUser($author);
        $scope = activity_access::require($activity->cmid, 'mod/scaffold:editcontent');
        $artifact = json_decode(
            $this->save_bundle($activity->cmid, 'Must not save'),
            true,
            512,
            JSON_THROW_ON_ERROR,
        );
        $artifact['content']['content'][0]['attrs']['requiresScaffoldPlus'] = true;

        try {
            (new content_service())->save($scope, json_encode($artifact, JSON_THROW_ON_ERROR));
            $this->fail('Expected a Plus-required artifact to be rejected');
        } catch (\invalid_parameter_exception $exception) {
            $this->assertStringContainsString('requires Scaffold Plus', $exception->getMessage());
        }

        $stored = $DB->get_record('scaffold', ['id' => $activity->id], '*', MUST_EXIST);
        $this->assertSame('Scaffold test activity', $stored->name);
        $this->assertStringContainsString('author-only', $stored->artifactjson);
    }

    /**
     * Creates activity with content.
     *
     * @return array
     */
    private function create_activity_with_content(): array {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/course/lib.php');
        require_once($CFG->dirroot . '/mod/scaffold/lib.php');

        $course = $this->getDataGenerator()->create_course();
        $activityid = scaffold_add_instance((object) [
            'course' => $course->id,
            'name' => 'Scaffold test activity',
            'intro' => '',
            'introformat' => FORMAT_HTML,
            'grade' => 100,
        ]);
        $moduleid = $DB->get_field('modules', 'id', ['name' => 'scaffold'], MUST_EXIST);
        $cmid = $DB->insert_record('course_modules', (object) [
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
            'completion' => 0,
            'completiongradeitemnumber' => null,
            'completionview' => 0,
            'completionexpected' => 0,
            'completionpassgrade' => 0,
            'showdescription' => 0,
        ]);
        course_add_cm_to_section($course, $cmid, 0);
        \context_module::instance($cmid);

        $artifact = [
            'id' => 'moodle-cm-' . $cmid,
            'title' => 'Scaffold test activity',
            'mode' => 'page',
            'content' => [
                'type' => 'doc',
                'content' => [[
                    'type' => 'courseDocument',
                    'attrs' => [
                        'mode' => 'page',
                        'schemaVersion' => 4,
                        'requiresScaffoldPlus' => false,
                        'audience' => 'author-only',
                        'settings' => (object) [],
                    ],
                    'content' => [],
                ]],
            ],
        ];
        $learnercontent = $this->learner_content('learner-safe');
        $publication = [
            'publicationVersion' => 1,
            'sourceArtifactRevision' => 'published-revision',
            'publishedAt' => '2026-08-09T10:00:00Z',
            'artifact' => [
                'id' => 'moodle-cm-' . $cmid,
                'title' => 'Scaffold test activity',
                'mode' => 'page',
                'requiresScaffoldPlus' => false,
            ],
            'learnerContent' => $learnercontent,
        ];
        $DB->set_field('scaffold', 'artifactjson', json_encode($artifact, JSON_THROW_ON_ERROR), ['id' => $activityid]);
        $DB->set_field(
            'scaffold',
            'learnercontentjson',
            json_encode($publication, JSON_THROW_ON_ERROR),
            ['id' => $activityid],
        );

        $activity = $DB->get_record('scaffold', ['id' => $activityid], '*', MUST_EXIST);
        $activity->cmid = $cmid;
        return [$course, $activity];
    }

    /**
     * Returns supported learner content.
     *
     * @param string $audience Test marker.
     * @return array
     */
    private function learner_content(string $audience): array {
        return [
            'type' => 'doc',
            'content' => [[
                'type' => 'courseDocument',
                'attrs' => [
                    'mode' => 'page',
                    'schemaVersion' => 4,
                    'requiresScaffoldPlus' => false,
                    'audience' => $audience,
                ],
                'content' => [],
            ]],
        ];
    }

    /**
     * Saves bundle.
     *
     * @param int $cmid Course module ID.
     * @param string $title Title.
     * @return string
     */
    private function save_bundle(int $cmid, string $title): string {
        $artifact = [
            'id' => 'moodle-cm-' . $cmid,
            'title' => $title,
            'mode' => 'page',
            'content' => [
                'type' => 'doc',
                'content' => [[
                    'type' => 'courseDocument',
                    'attrs' => [
                        'mode' => 'page',
                        'schemaVersion' => 4,
                        'requiresScaffoldPlus' => false,
                    ],
                    'content' => [],
                ]],
            ],
        ];
        return json_encode($artifact, JSON_THROW_ON_ERROR);
    }

    /**
     * Sets the stored canonical document format and product requirement.
     *
     * @param \stdClass $activity Activity.
     * @param int $schemaVersion Schema version.
     * @param bool|null $requiresScaffoldPlus Requirement, or null to omit it.
     */
    private function set_course_requirement(
        \stdClass $activity,
        int $schemaVersion,
        ?bool $requiresScaffoldPlus,
    ): void {
        global $DB;

        $artifact = json_decode($activity->artifactjson, true, 512, JSON_THROW_ON_ERROR);
        $attrs = &$artifact['content']['content'][0]['attrs'];
        $attrs['schemaVersion'] = $schemaVersion;
        if ($requiresScaffoldPlus === null) {
            unset($attrs['requiresScaffoldPlus']);
        } else {
            $attrs['requiresScaffoldPlus'] = $requiresScaffoldPlus;
        }
        $encoded = json_encode($artifact, JSON_THROW_ON_ERROR);
        $DB->set_field('scaffold', 'artifactjson', $encoded, ['id' => $activity->id]);
        $activity->artifactjson = $encoded;
    }

    /**
     * Returns enrol as.
     *
     * @param \stdClass $user User.
     * @param \stdClass $course Moodle course record.
     * @param string $roleshortname Roleshortname.
     */
    private function enrol_as(\stdClass $user, \stdClass $course, string $roleshortname): void {
        global $DB;

        $roleid = $DB->get_field('role', 'id', ['shortname' => $roleshortname], MUST_EXIST);
        $this->getDataGenerator()->enrol_user($user->id, $course->id, $roleid);
    }
}

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

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

require_once(__DIR__ . '/artifact_identity.php');
require_once(__DIR__ . '/assessment_projection.php');
require_once(__DIR__ . '/assessment_public_projection.php');

/**
 * Manages authored content for Scaffold activities.
 *
 * Validates, reads, and writes the canonical activity payload.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class content_service {
    /**
     * GRADE ITEM PUBLICATION PUBLISHED.
     */
    public const GRADE_ITEM_PUBLICATION_PUBLISHED = 'published';
    /**
     * GRADE ITEM PUBLICATION FAILED.
     */
    public const GRADE_ITEM_PUBLICATION_FAILED = 'failed';

    /**
     * SCAFFOLD MODES.
     */
    private const SCAFFOLD_MODES = ['page', 'slideshow', 'branching'];
    /**
     * CURRENT SCAFFOLD DOCUMENT FORMAT VERSION.
     */
    private const SCAFFOLD_DOCUMENT_FORMAT_VERSION = 4;
    /**
     * SAVE PAYLOAD MAX BYTES.
     */
    private const SAVE_PAYLOAD_MAX_BYTES = [
        'artifactjson' => 2097152,
        'artifactmetadatajson' => 65536,
        'learnercontentjson' => 2097152,
        'assessmenttargetsjson' => 1048576,
        'assessmentgroupsjson' => 1048576,
    ];
    /** Active learner publication envelope version. */
    private const PUBLICATION_VERSION = 1;

    /** @var \Closure Grade item refresh callback. */
    private readonly \Closure $gradeitemrefresher;
    /** @var \Closure Diagnostic reporting callback. */
    private readonly \Closure $diagnosticreporter;
    /** @var ?quiz_expiry_reconciler Quiz expiry reconciler. */
    private readonly ?quiz_expiry_reconciler $quizexpiryreconciler;

    /**
     * Creates a new content service instance.
     *
     * @param callable|null $gradeitemrefresher Grade item refresh callback.
     * @param callable|null $diagnosticreporter Diagnostic reporting callback.
     * @param quiz_expiry_reconciler|null $quizexpiryreconciler Quiz expiry reconciler.
     */
    public function __construct(
        ?callable $gradeitemrefresher = null,
        ?callable $diagnosticreporter = null,
        ?quiz_expiry_reconciler $quizexpiryreconciler = null,
    ) {
        $this->gradeitemrefresher = $gradeitemrefresher === null
            ? static function (\stdClass $scaffold): int {
                global $CFG;
                require_once($CFG->dirroot . '/mod/scaffold/lib.php');
                return scaffold_grade_item_update($scaffold);
            }
            : \Closure::fromCallable($gradeitemrefresher);
        $this->diagnosticreporter = $diagnosticreporter === null
            ? static function (\Throwable $exception, \stdClass $scaffold): void {
                debugging(sprintf(
                    'Scaffold grade-item refresh failed after publication commit for activity %d: %s',
                    (int) ($scaffold->id ?? 0),
                    (string) $exception,
                ), DEBUG_DEVELOPER);
            }
            : \Closure::fromCallable($diagnosticreporter);
        $this->quizexpiryreconciler = $quizexpiryreconciler;
    }

    /**
     * Returns payload.
     *
     * @param activity_scope $scope Scope.
     * @param string $purpose Purpose.
     * @return array
     */
    public function payload(activity_scope $scope, string $purpose): array {
        $authoring = match ($purpose) {
            'authoring' => true,
            'learner' => false,
            default => throw new \invalid_parameter_exception('Unknown payload purpose'),
        };
        $requiredcapability = $authoring ? 'mod/scaffold:editcontent' : 'mod/scaffold:view';
        if ($scope->capability !== $requiredcapability) {
            throw new \invalid_parameter_exception('Payload purpose is not authorized by activity scope');
        }

        if (!$authoring) {
            return $this->learner_payload($scope);
        }

        $artifact = $this->project_artifact($scope->instance, (int) $scope->cm->id, true);
        $artifactaccess = self::classify_artifact_access($artifact);
        $payload = [
            'success' => true,
            'artifactAccessJson' => self::encode_json($artifactaccess, 'artifact access'),
            'artifactJson' => self::encode_json(
                $artifactaccess['status'] === 'supported' ? $artifact : null,
                'artifact',
            ),
            'assessmentSnapshotJson' => 'null',
            'publicationStatusJson' => self::encode_json(
                $this->publication_status($scope->instance, (int) $scope->cm->id),
                'publication status',
            ),
        ];
        if ($artifactaccess['status'] !== 'supported') {
            return $payload;
        }

        return $payload;
    }

    /**
     * Returns the learner payload from the active publication only.
     *
     * @param activity_scope $scope Scope.
     * @return array
     */
    private function learner_payload(activity_scope $scope): array {
        $cmid = (int) $scope->cm->id;
        $artifactid = artifact_identity::for_course_module($cmid);
        $envelope = self::read_publication_envelope(
            (string) ($scope->instance->learnercontentjson ?? 'null'),
        );
        if ($envelope === null) {
            $access = [
                'status' => 'not-published',
                'artifact' => [
                    'id' => $artifactid,
                    'title' => 'Scaffold',
                    'mode' => 'page',
                ],
            ];
            return [
                'success' => true,
                'artifactAccessJson' => self::encode_json($access, 'artifact access'),
                'artifactJson' => 'null',
                'assessmentSnapshotJson' => 'null',
                'learnerPublicationJson' => self::encode_json(
                    ['status' => 'not-published'],
                    'learner publication',
                ),
            ];
        }

        $publishedartifact = $envelope['artifact'];
        $artifactaccess = self::classify_artifact_access([
            'id' => $publishedartifact['id'],
            'title' => $publishedartifact['title'],
            'mode' => $publishedartifact['mode'],
            'content' => $envelope['learnerContent'],
        ]);
        $payload = [
            'success' => true,
            'artifactAccessJson' => self::encode_json($artifactaccess, 'artifact access'),
            'artifactJson' => 'null',
            'assessmentSnapshotJson' => 'null',
        ];
        if ($artifactaccess['status'] !== 'supported') {
            $payload['learnerPublicationJson'] = self::encode_json(
                self::artifact_access_refusal_publication($artifactaccess),
                'learner publication',
            );
            return $payload;
        }

        $quizexpiryreconciler = $this->quiz_expiry_reconciler();
        if ($quizexpiryreconciler !== null) {
            $quizexpiryreconciler->reconcile_user_and_apply_effects(
                $scope->instance,
                $scope->cm,
                $scope->actorid,
                $artifactid,
            );
        }
        $storedsnapshot = (new assessment_state_repository())->get_or_create(
            (int) $scope->instance->id,
            $scope->actorid,
            $artifactid,
        );
        $payload['assessmentSnapshotJson'] = self::encode_json(
            assessment_public_projection::snapshot(
                $storedsnapshot,
                assessment_projection::for_activity($scope->instance),
            ),
            'assessment snapshot',
        );
        $payload['learnerPublicationJson'] = self::encode_json([
            'status' => 'supported',
            'learnerContent' => $envelope['learnerContent'],
        ], 'learner publication');
        $payload['learnerActivitySnapshotJson'] = self::encode_json(
            (new learner_activity_service())->load($scope),
            'learner activity snapshot',
        );
        return $payload;
    }

    /**
     * Returns quiz expiry reconciler.
     *
     * @return quiz_expiry_reconciler|null
     */
    private function quiz_expiry_reconciler(): ?quiz_expiry_reconciler {
        if ($this->quizexpiryreconciler !== null) {
            return $this->quizexpiryreconciler;
        }
        if (!class_exists(quiz_expiry_reconciler::class)) {
            return null;
        }

        return new quiz_expiry_reconciler();
    }

    /**
     * Validates and saves the supplied state.
     *
     * @param activity_scope $scope Scope.
     * @param string $artifactjson Artifactjson.
     * @return array{content: \stdClass, artifactRevision: string}
     */
    public function save(
        activity_scope $scope,
        string $artifactjson,
    ): array {
        if ($scope->capability !== 'mod/scaffold:editcontent') {
            throw new \invalid_parameter_exception('Content save is not authorized by activity scope');
        }

        return $this->save_instance(
            $scope->instance,
            (int) $scope->cm->id,
            $artifactjson,
        );
    }

    /**
     * Validates and activates one saved canonical revision.
     *
     * @param activity_scope $scope Scope.
     * @param string $sourceartifactrevision Source artifact revision.
     * @param string $artifactmetadatajson Published safe artifact metadata JSON.
     * @param string $learnercontentjson Learner content JSON.
     * @param string $assessmenttargetsjson Private assessment targets JSON.
     * @param string $assessmentgroupsjson Private assessment groups JSON.
     * @return array{content: \stdClass, status: array, gradeItemPublication: string}
     */
    public function publish(
        activity_scope $scope,
        string $sourceartifactrevision,
        string $artifactmetadatajson,
        string $learnercontentjson,
        string $assessmenttargetsjson,
        string $assessmentgroupsjson,
    ): array {
        global $DB;

        if ($scope->capability !== 'mod/scaffold:editcontent') {
            throw new \invalid_parameter_exception('Content publication is not authorized by activity scope');
        }
        foreach ([
            'artifactmetadatajson' => $artifactmetadatajson,
            'learnercontentjson' => $learnercontentjson,
            'assessmenttargetsjson' => $assessmenttargetsjson,
            'assessmentgroupsjson' => $assessmentgroupsjson,
        ] as $name => $raw) {
            self::validate_save_payload_size($name, $raw);
        }
        if ($sourceartifactrevision === '') {
            throw new \invalid_parameter_exception('sourceartifactrevision is required');
        }

        $cmid = (int) $scope->cm->id;
        $expectedid = artifact_identity::for_course_module($cmid);
        $preflightrecord = $DB->get_record('scaffold', ['id' => $scope->instance->id], '*', MUST_EXIST);
        $canonical = $this->project_artifact($preflightrecord, $cmid, true);
        $currentrevision = self::artifact_revision($canonical);
        if (!hash_equals($currentrevision, $sourceartifactrevision)) {
            throw new \moodle_exception('publicationstaleartifactrevision', 'scaffold');
        }

        $artifactmetadata = self::decode_required_object($artifactmetadatajson, 'artifactmetadatajson');
        $learnercontent = self::decode_required_object($learnercontentjson, 'learnercontentjson');
        self::validate_publication_metadata($artifactmetadata, $canonical, $expectedid);
        $learneraccess = self::classify_artifact_access([
            'id' => $artifactmetadata['id'],
            'title' => $artifactmetadata['title'],
            'mode' => $artifactmetadata['mode'],
            'content' => $learnercontent,
        ]);
        if ($learneraccess['status'] === 'requires-scaffold-plus') {
            throw new \invalid_parameter_exception('Published content requires Scaffold Plus');
        }
        if ($learneraccess['status'] !== 'supported') {
            throw new \invalid_parameter_exception('Published learner content is not supported');
        }
        if (self::course_document_requires_plus($learnercontent) !== $artifactmetadata['requiresScaffoldPlus']) {
            throw new \invalid_parameter_exception('Published product requirement does not match learner content');
        }

        $projection = assessment_projection::from_json(
            $assessmenttargetsjson,
            $assessmentgroupsjson,
            'assessmenttargetsjson',
            'assessmentgroupsjson',
        );
        $normalizedtargetsjson = self::encode_json($projection['targets'], 'assessmenttargetsjson');
        $normalizedgroupsjson = self::encode_json($projection['groups'], 'assessmentgroupsjson');
        $publishedat = gmdate('Y-m-d\TH:i:s\Z');
        $envelope = [
            'publicationVersion' => self::PUBLICATION_VERSION,
            'sourceArtifactRevision' => $sourceartifactrevision,
            'publishedAt' => $publishedat,
            'artifact' => $artifactmetadata,
            'learnerContent' => $learnercontent,
        ];

        $transaction = $DB->start_delegated_transaction();
        try {
            $current = $DB->get_record('scaffold', ['id' => $scope->instance->id], '*', MUST_EXIST);
            $currentcanonical = $this->project_artifact($current, $cmid, true);
            if (!hash_equals(self::artifact_revision($currentcanonical), $sourceartifactrevision)) {
                throw new \moodle_exception('publicationstaleartifactrevision', 'scaffold');
            }

            $currentprojection = assessment_projection::for_activity($current);
            $currentfingerprint = assessment_definition::fingerprint(
                $currentprojection['targets'],
                $currentprojection['groups'],
                (float) $current->grade,
            );
            $nextfingerprint = assessment_definition::fingerprint(
                $projection['targets'],
                $projection['groups'],
                (float) $current->grade,
            );
            $definitionchanged = !hash_equals($currentfingerprint, $nextfingerprint);
            $metadatachanged = (string) $current->name !== (string) $artifactmetadata['title'];

            $published = clone $current;
            $published->name = $artifactmetadata['title'];
            $published->learnercontentjson = self::encode_json($envelope, 'learner publication');
            $published->assessmenttargetsjson = $normalizedtargetsjson;
            $published->assessmentgroupsjson = $normalizedgroupsjson;
            $published->timemodified = time();
            if ($definitionchanged) {
                $published->assessmentdefinitionversion = (int) $current->assessmentdefinitionversion + 1;
            }
            if ($definitionchanged || $metadatachanged) {
                self::mark_grade_item_pending($published);
            }

            $publicationupdate = (object) [
                'id' => $published->id,
                'name' => $published->name,
                'learnercontentjson' => $published->learnercontentjson,
                'assessmenttargetsjson' => $published->assessmenttargetsjson,
                'assessmentgroupsjson' => $published->assessmentgroupsjson,
                'timemodified' => $published->timemodified,
            ];
            if ($definitionchanged) {
                $publicationupdate->assessmentdefinitionversion = $published->assessmentdefinitionversion;
            }
            if ($definitionchanged || $metadatachanged) {
                $publicationupdate->gradeitemstatus = $published->gradeitemstatus;
                $publicationupdate->gradeitemfailurecode = $published->gradeitemfailurecode;
                $publicationupdate->gradeitemretrycount = $published->gradeitemretrycount;
                $publicationupdate->gradeitemretryafter = $published->gradeitemretryafter;
                $publicationupdate->gradeitemtimemodified = $published->gradeitemtimemodified;
            }
            $DB->update_record('scaffold', $publicationupdate);
            $transaction->allow_commit();
        } catch (\Throwable $exception) {
            $transaction->rollback($exception);
        }

        $gradeitempublication = self::GRADE_ITEM_PUBLICATION_PUBLISHED;
        if ($definitionchanged || $metadatachanged) {
            try {
                $itemoutcome = ($this->gradeitemrefresher)($published);
                if ($itemoutcome instanceof \stdClass && ($itemoutcome->status ?? null) !== 'published') {
                    $gradeitempublication = self::GRADE_ITEM_PUBLICATION_FAILED;
                } else if (is_int($itemoutcome) && $itemoutcome !== 0) {
                    $gradeitempublication = self::GRADE_ITEM_PUBLICATION_FAILED;
                }
            } catch (\Throwable $exception) {
                $gradeitempublication = self::GRADE_ITEM_PUBLICATION_FAILED;
                ($this->diagnosticreporter)($exception, $published);
            }
        }

        return [
            'content' => $published,
            'status' => [
                'currentArtifactRevision' => $sourceartifactrevision,
                'publishedArtifactRevision' => $sourceartifactrevision,
                'publishedAt' => $publishedat,
            ],
            'gradeItemPublication' => $gradeitempublication,
        ];
    }

    /**
     * Projects artifact.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param int $cmid Course module ID.
     * @param bool $authoring Authoring.
     * @return array
     */
    public function project_artifact(\stdClass $scaffold, int $cmid, bool $authoring): array {
        $artifact = self::read_json_object($scaffold->artifactjson ?? '', []);
        $artifact['id'] = artifact_identity::for_course_module($cmid);
        if (!isset($artifact['title']) || !is_string($artifact['title'])) {
            throw new \moodle_exception('artifacttitleinvalid', 'scaffold');
        }

        if (!isset($artifact['mode']) || !in_array($artifact['mode'], self::SCAFFOLD_MODES, true)) {
            throw new \moodle_exception('artifactmodeinvalid', 'scaffold');
        }

        if (!$authoring) {
            $artifact['content'] = null;
        } else if (!array_key_exists('content', $artifact)) {
            $artifact['content'] = null;
        }

        return $artifact;
    }

    /**
     * Reads json object.
     *
     * @param string $raw Raw.
     * @param array $fallback Fallback.
     * @return array
     */
    public static function read_json_object(string $raw, array $fallback): array {
        $value = self::decode_json_object($raw);
        return $value ?? $fallback;
    }

    /**
     * Reads json nullable object.
     *
     * @param string $raw Raw.
     * @return array|null
     */
    public static function read_json_nullable_object(string $raw): ?array {
        try {
            $value = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \invalid_parameter_exception('Stored learner content is invalid JSON');
        }
        if ($value === null) {
            return null;
        }
        if (!($value instanceof \stdClass)) {
            throw new \invalid_parameter_exception('Stored learner content must be a JSON object or null');
        }

        return self::json_object_to_array($value);
    }

    /**
     * Reads and validates the active learner publication envelope.
     *
     * @param string $raw Raw JSON.
     * @return array|null
     */
    public static function read_publication_envelope(string $raw): ?array {
        $envelope = self::read_json_nullable_object($raw);
        if ($envelope === null) {
            return null;
        }
        $artifact = $envelope['artifact'] ?? null;
        $learnercontent = $envelope['learnerContent'] ?? null;
        if (
            ($envelope['publicationVersion'] ?? null) !== self::PUBLICATION_VERSION
            || !is_string($envelope['sourceArtifactRevision'] ?? null)
            || $envelope['sourceArtifactRevision'] === ''
            || !is_string($envelope['publishedAt'] ?? null)
            || $envelope['publishedAt'] === ''
            || !is_array($artifact)
            || array_is_list($artifact)
            || !is_string($artifact['id'] ?? null)
            || !is_string($artifact['title'] ?? null)
            || !in_array($artifact['mode'] ?? null, self::SCAFFOLD_MODES, true)
            || !is_bool($artifact['requiresScaffoldPlus'] ?? null)
            || !is_array($learnercontent)
            || array_is_list($learnercontent)
        ) {
            throw new \invalid_parameter_exception('Stored learner publication envelope is invalid');
        }
        return $envelope;
    }

    /**
     * Returns active published learner content, or null before first publication.
     *
     * @param string $raw Raw publication JSON.
     * @return array|null
     */
    public static function read_published_learner_content(string $raw): ?array {
        $envelope = self::read_publication_envelope($raw);
        return $envelope === null ? null : $envelope['learnerContent'];
    }

    /**
     * Returns authoritative draft/publication status.
     *
     * @param \stdClass $scaffold Scaffold record.
     * @param int $cmid Course module ID.
     * @return array
     */
    private function publication_status(\stdClass $scaffold, int $cmid): array {
        $artifact = $this->project_artifact($scaffold, $cmid, true);
        $envelope = self::read_publication_envelope(
            (string) ($scaffold->learnercontentjson ?? 'null'),
        );
        return [
            'currentArtifactRevision' => self::artifact_revision($artifact),
            'publishedArtifactRevision' => $envelope['sourceArtifactRevision'] ?? null,
            'publishedAt' => $envelope['publishedAt'] ?? null,
        ];
    }

    /**
     * Creates an opaque server-owned revision for a canonical artifact.
     *
     * @param array $artifact Artifact.
     * @return string
     */
    private static function artifact_revision(array $artifact): string {
        return hash('sha256', self::encode_json($artifact, 'artifact revision'));
    }

    /**
     * Validates published metadata against the saved canonical artifact.
     *
     * @param array $metadata Metadata.
     * @param array $canonical Canonical artifact.
     * @param string $expectedid Expected artifact ID.
     */
    private static function validate_publication_metadata(
        array $metadata,
        array $canonical,
        string $expectedid,
    ): void {
        if (
            ($metadata['id'] ?? null) !== $expectedid
            || ($metadata['id'] ?? null) !== ($canonical['id'] ?? null)
            || !is_string($metadata['title'] ?? null)
            || trim($metadata['title']) === ''
            || $metadata['title'] !== ($canonical['title'] ?? null)
            || !in_array($metadata['mode'] ?? null, self::SCAFFOLD_MODES, true)
            || $metadata['mode'] !== ($canonical['mode'] ?? null)
            || !is_bool($metadata['requiresScaffoldPlus'] ?? null)
        ) {
            throw new \invalid_parameter_exception('Published artifact metadata does not match the saved canonical artifact');
        }
        $canonicalcontent = $canonical['content'] ?? null;
        if (
            !is_array($canonicalcontent)
            || self::course_document_requires_plus($canonicalcontent) !== $metadata['requiresScaffoldPlus']
        ) {
            throw new \invalid_parameter_exception('Published product requirement does not match the saved canonical artifact');
        }
    }

    /**
     * Reads the required product flag from a course document.
     *
     * @param array $content Content.
     * @return bool|null
     */
    private static function course_document_requires_plus(array $content): ?bool {
        $coursedocument = $content['content'][0] ?? null;
        $attrs = is_array($coursedocument) ? ($coursedocument['attrs'] ?? null) : null;
        $requirement = is_array($attrs) ? ($attrs['requiresScaffoldPlus'] ?? null) : null;
        return is_bool($requirement) ? $requirement : null;
    }

    /**
     * Saves instance.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param int $cmid Course module ID.
     * @param string $artifactjson Artifactjson.
     * @return array{content: \stdClass, artifactRevision: string}
     */
    private function save_instance(
        \stdClass $scaffold,
        int $cmid,
        string $artifactjson,
    ): array {
        global $DB;

        self::validate_save_payload_size('artifactjson', $artifactjson);

        $artifact = self::decode_required_object($artifactjson, 'artifactjson');
        self::validate_artifact($artifact, artifact_identity::for_course_module($cmid));
        $artifactaccess = self::classify_artifact_access($artifact);
        if ($artifactaccess['status'] === 'requires-scaffold-plus') {
            throw new \invalid_parameter_exception('artifact.content requires Scaffold Plus');
        }
        if ($artifactaccess['status'] !== 'supported') {
            throw new \invalid_parameter_exception('artifact.content format is not supported');
        }

        $saved = clone $scaffold;
        $saved->artifactjson = self::encode_json($artifact, 'artifactjson');
        $saved->timemodified = time();
        $saveupdate = (object) [
            'id' => $saved->id,
            'artifactjson' => $saved->artifactjson,
            'timemodified' => $saved->timemodified,
        ];

        $transaction = $DB->start_delegated_transaction();
        try {
            $DB->update_record('scaffold', $saveupdate);
            $transaction->allow_commit();
        } catch (\Throwable $exception) {
            $transaction->rollback($exception);
        }

        return [
            'content' => $saved,
            'artifactRevision' => self::artifact_revision($artifact),
        ];
    }

    /**
     * Validates artifact.
     *
     * @param array $artifact Artifact.
     * @param string $expectedid Expectedid.
     */
    private static function validate_artifact(array $artifact, string $expectedid): void {
        if (($artifact['id'] ?? null) !== $expectedid) {
            throw new \invalid_parameter_exception('artifact.id does not match activity');
        }
        if (!isset($artifact['title']) || trim((string) $artifact['title']) === '') {
            throw new \invalid_parameter_exception('artifact.title is required');
        }

        $mode = $artifact['mode'] ?? null;
        if (!is_string($mode) || !in_array($mode, self::SCAFFOLD_MODES, true)) {
            throw new \invalid_parameter_exception('artifact.mode is invalid');
        }

        $content = $artifact['content'] ?? null;
        if (!is_array($content) || array_is_list($content)) {
            throw new \invalid_parameter_exception('artifact.content must be a JSON object');
        }
        if (self::course_document_mode($content) !== $mode) {
            throw new \invalid_parameter_exception('artifact.mode must match artifact.content courseDocument mode');
        }
    }

    /**
     * Returns course document mode.
     *
     * @param array $content Content.
     * @return string|null
     */
    private static function course_document_mode(array $content): ?string {
        if (($content['type'] ?? null) !== 'doc') {
            return null;
        }
        $children = $content['content'] ?? null;
        if (!is_array($children) || count($children) === 0) {
            return null;
        }
        $coursedocument = $children[0];
        if (
            !is_array($coursedocument) || array_is_list($coursedocument)
            || ($coursedocument['type'] ?? null) !== 'courseDocument'
        ) {
            return null;
        }
        $attrs = $coursedocument['attrs'] ?? null;
        if (!is_array($attrs) || array_is_list($attrs)) {
            return null;
        }

        return is_string($attrs['mode'] ?? null) ? $attrs['mode'] : null;
    }

    /**
     * Classifies the stored canonical root before entitlement-dependent work.
     *
     * This deliberately reads only the format version, the required product
     * flag, and safe artifact metadata. Core remains the full document
     * validator after this server-side withholding boundary.
     *
     * @param array $artifact Artifact.
     * @return array
     */
    private static function classify_artifact_access(array $artifact): array {
        $metadata = [
            'id' => (string) ($artifact['id'] ?? ''),
            'title' => (string) ($artifact['title'] ?? ''),
            'mode' => (string) ($artifact['mode'] ?? ''),
        ];
        $content = $artifact['content'] ?? null;
        if ($content === null) {
            return ['status' => 'supported', 'artifact' => $metadata];
        }
        if (!is_array($content) || array_is_list($content) || ($content['type'] ?? null) !== 'doc') {
            return ['status' => 'invalid', 'artifact' => $metadata];
        }
        $children = $content['content'] ?? null;
        if (!is_array($children) || count($children) !== 1) {
            return ['status' => 'invalid', 'artifact' => $metadata];
        }
        $coursedocument = $children[0] ?? null;
        if (
            !is_array($coursedocument) || array_is_list($coursedocument)
            || ($coursedocument['type'] ?? null) !== 'courseDocument'
        ) {
            return ['status' => 'invalid', 'artifact' => $metadata];
        }
        $attrs = $coursedocument['attrs'] ?? null;
        if (!is_array($attrs) || array_is_list($attrs)) {
            return ['status' => 'invalid', 'artifact' => $metadata];
        }
        $version = $attrs['schemaVersion'] ?? null;
        if (!is_int($version) || $version < 1) {
            return ['status' => 'invalid', 'artifact' => $metadata];
        }
        if ($version > self::SCAFFOLD_DOCUMENT_FORMAT_VERSION) {
            return [
                'status' => 'unsupported-core-format',
                'artifact' => $metadata,
                'documentVersion' => $version,
                'supportedVersion' => self::SCAFFOLD_DOCUMENT_FORMAT_VERSION,
            ];
        }
        if ($version < self::SCAFFOLD_DOCUMENT_FORMAT_VERSION) {
            return ['status' => 'supported', 'artifact' => $metadata];
        }
        if (!array_key_exists('requiresScaffoldPlus', $attrs) || !is_bool($attrs['requiresScaffoldPlus'])) {
            return ['status' => 'invalid', 'artifact' => $metadata];
        }
        if (($attrs['mode'] ?? null) !== ($artifact['mode'] ?? null)) {
            return ['status' => 'invalid', 'artifact' => $metadata];
        }

        return [
            'status' => $attrs['requiresScaffoldPlus'] ? 'requires-scaffold-plus' : 'supported',
            'artifact' => $metadata,
        ];
    }

    /**
     * Converts an artifact refusal into the typed learner publication family.
     *
     * @param array $artifactaccess Artifact access result.
     * @return array
     */
    private static function artifact_access_refusal_publication(array $artifactaccess): array {
        if ($artifactaccess['status'] === 'requires-scaffold-plus') {
            return ['status' => 'requires-scaffold-plus'];
        }
        if ($artifactaccess['status'] === 'unsupported-core-format') {
            return [
                'status' => 'unsupported-core-format',
                'documentVersion' => $artifactaccess['documentVersion'],
                'supportedVersion' => $artifactaccess['supportedVersion'],
                'message' => 'This course was created by a newer version of Scaffold.',
            ];
        }

        return [
            'status' => 'invalid',
            'issues' => [[
                'code' => 'invalid_document',
                'message' => 'The Scaffold document is invalid.',
                'path' => [],
            ]],
        ];
    }

    /**
     * Decodes required object.
     *
     * @param string $raw Raw.
     * @param string $name Name.
     * @return array
     */
    private static function decode_required_object(string $raw, string $name): array {
        $value = self::decode_json_object($raw);
        if ($value === null) {
            throw new \invalid_parameter_exception($name . ' must be a JSON object');
        }
        return $value;
    }

    /**
     * Decodes json object.
     *
     * @param string $raw Raw.
     * @return array|null
     */
    private static function decode_json_object(string $raw): ?array {
        try {
            $value = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
        if (!($value instanceof \stdClass)) {
            return null;
        }
        return self::json_object_to_array($value);
    }

    /**
     * Converts json object to array.
     *
     * @param \stdClass $value Value.
     * @return array
     */
    private static function json_object_to_array(\stdClass $value): array {
        $result = [];
        foreach (get_object_vars($value) as $key => $child) {
            $result[$key] = self::json_value_to_php($child);
        }
        return $result;
    }

    /**
     * Converts json value to php.
     *
     * @param mixed $value Value.
     * @return mixed
     */
    private static function json_value_to_php(mixed $value): mixed {
        if ($value instanceof \stdClass) {
            return get_object_vars($value) === [] ? $value : self::json_object_to_array($value);
        }
        if (is_array($value)) {
            return array_map([self::class, 'json_value_to_php'], $value);
        }
        return $value;
    }

    /**
     * Encodes json.
     *
     * @param mixed $value Value.
     * @param string $name Name.
     * @return string
     */
    private static function encode_json(mixed $value, string $name): string {
        try {
            return json_encode($value, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \invalid_parameter_exception($name . ' cannot be encoded as JSON');
        }
    }

    /**
     * Validates save payload size.
     *
     * @param string $name Name.
     * @param string $raw Raw.
     */
    private static function validate_save_payload_size(string $name, string $raw): void {
        $limit = self::SAVE_PAYLOAD_MAX_BYTES[$name] ?? 0;
        if ($limit <= 0 || strlen($raw) > $limit) {
            throw new \invalid_parameter_exception($name . ' is too large to save');
        }
    }

    /**
     * Marks grade item pending.
     *
     * @param \stdClass $scaffold Scaffold.
     */
    public static function mark_grade_item_pending(\stdClass $scaffold): void {
        $scaffold->gradeitemstatus = 'pending';
        $scaffold->gradeitemfailurecode = null;
        $scaffold->gradeitemretrycount = 0;
        $scaffold->gradeitemretryafter = null;
        $scaffold->gradeitemtimemodified = time();
    }
}

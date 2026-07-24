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
     * SAVE PAYLOAD MAX BYTES.
     */
    private const SAVE_PAYLOAD_MAX_BYTES = [
        'artifactjson' => 2097152,
        'learnercontentjson' => 2097152,
        'assessmenttargetsjson' => 1048576,
        'assessmentgroupsjson' => 524288,
    ];

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
            ? static function(\stdClass $scaffold): int {
                global $CFG;
                require_once($CFG->dirroot . '/mod/scaffold/lib.php');
                return scaffold_grade_item_update($scaffold);
            }
            : \Closure::fromCallable($gradeitemrefresher);
        $this->diagnosticreporter = $diagnosticreporter === null
            ? static function(\Throwable $exception, \stdClass $scaffold): void {
                error_log(sprintf(
                    'Scaffold grade-item refresh failed after content commit for activity %d: %s',
                    (int) ($scaffold->id ?? 0),
                    (string) $exception,
                ));
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
            $quizexpiryreconciler = $this->quiz_expiry_reconciler();
            if ($quizexpiryreconciler !== null) {
                $quizexpiryreconciler->reconcile_user_and_apply_effects(
                    $scope->instance,
                    $scope->cm,
                    $scope->actorid,
                    artifact_identity::for_course_module((int) $scope->cm->id),
                );
            }
        }

        $artifact = $this->project_artifact($scope->instance, (int) $scope->cm->id, $authoring);
        $assessmentsnapshot = null;
        if (!$authoring) {
            $storedsnapshot = (new assessment_state_repository())->get_or_create(
                (int) $scope->instance->id,
                $scope->actorid,
                artifact_identity::for_course_module((int) $scope->cm->id),
            );
            $assessmentsnapshot = assessment_public_projection::snapshot(
                $storedsnapshot,
                assessment_projection::for_activity($scope->instance),
            );
        }

        $payload = [
            'success' => true,
            'artifactJson' => self::encode_json($artifact, 'artifact'),
            'assessmentSnapshotJson' => self::encode_json($assessmentsnapshot, 'assessment snapshot'),
        ];
        if (!$authoring) {
            $payload['learnerActivitySnapshotJson'] = self::encode_json(
                (new learner_activity_service())->load($scope),
                'learner activity snapshot',
            );
        }

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
     * @param string $learnercontentjson Learnercontentjson.
     * @param string $assessmenttargetsjson Assessmenttargetsjson.
     * @param string $assessmentgroupsjson Assessmentgroupsjson.
     * @return array{content: \stdClass, gradeItemPublication: string}
     */
    public function save(
        activity_scope $scope,
        string $artifactjson,
        string $learnercontentjson,
        string $assessmenttargetsjson,
        string $assessmentgroupsjson,
    ): array {
        if ($scope->capability !== 'mod/scaffold:editcontent') {
            throw new \invalid_parameter_exception('Content save is not authorized by activity scope');
        }

        return $this->save_instance(
            $scope->instance,
            (int) $scope->cm->id,
            $artifactjson,
            $learnercontentjson,
            $assessmenttargetsjson,
            $assessmentgroupsjson,
        );
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
        $artifact['title'] = (string) $scaffold->name;

        if (!isset($artifact['mode']) || !in_array($artifact['mode'], self::SCAFFOLD_MODES, true)) {
            throw new \moodle_exception('artifactmodeinvalid', 'scaffold');
        }

        if (!$authoring) {
            $artifact['content'] = self::read_json_nullable_object($scaffold->learnercontentjson ?? 'null');
        } elseif (!array_key_exists('content', $artifact)) {
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
     * Saves instance.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param int $cmid Course module ID.
     * @param string $artifactjson Artifactjson.
     * @param string $learnercontentjson Learnercontentjson.
     * @param string $assessmenttargetsjson Assessmenttargetsjson.
     * @param string $assessmentgroupsjson Assessmentgroupsjson.
     * @return array{content: \stdClass, gradeItemPublication: string}
     */
    private function save_instance(
        \stdClass $scaffold,
        int $cmid,
        string $artifactjson,
        string $learnercontentjson,
        string $assessmenttargetsjson,
        string $assessmentgroupsjson,
    ): array {
        global $DB;

        self::validate_save_payload_size('artifactjson', $artifactjson);
        self::validate_save_payload_size('learnercontentjson', $learnercontentjson);
        self::validate_save_payload_size('assessmenttargetsjson', $assessmenttargetsjson);
        self::validate_save_payload_size('assessmentgroupsjson', $assessmentgroupsjson);

        $artifact = self::decode_required_object($artifactjson, 'artifactjson');
        self::validate_artifact($artifact, artifact_identity::for_course_module($cmid));
        $learnercontent = self::decode_required_object($learnercontentjson, 'learnercontentjson');
        $currentprojection = assessment_projection::for_activity($scaffold);
        $projection = assessment_projection::from_json(
            $assessmenttargetsjson,
            $assessmentgroupsjson,
            'assessmenttargetsjson',
            'assessmentgroupsjson',
        );

        $saved = clone $scaffold;
        $saved->name = trim((string) $artifact['title']);
        $saved->artifactjson = self::encode_json($artifact, 'artifactjson');
        $saved->learnercontentjson = self::encode_json($learnercontent, 'learnercontentjson');
        $saved->assessmenttargetsjson = self::encode_json($projection['targets'], 'assessmenttargetsjson');
        $saved->assessmentgroupsjson = self::encode_json($projection['groups'], 'assessmentgroupsjson');
        $saved->timemodified = time();

        $currentdefinition = assessment_definition::fingerprint(
            $currentprojection['targets'],
            $currentprojection['groups'],
            (float) ($scaffold->grade ?? 100),
        );
        $nextdefinition = assessment_definition::fingerprint(
            $projection['targets'],
            $projection['groups'],
            (float) ($saved->grade ?? 100),
        );
        $definitionchanged = !hash_equals($currentdefinition, $nextdefinition);
        $itemmetadatachanged = $definitionchanged || $saved->name !== (string) $scaffold->name;
        if ($definitionchanged) {
            $saved->assessmentdefinitionversion = (int) ($scaffold->assessmentdefinitionversion ?? 1) + 1;
        }
        if ($itemmetadatachanged) {
            self::mark_grade_item_pending($saved);
        }

        $transaction = $DB->start_delegated_transaction();
        try {
            $DB->update_record('scaffold', $saved);
            $transaction->allow_commit();
        } catch (\Throwable $exception) {
            $transaction->rollback($exception);
        }

        $gradeitempublication = self::GRADE_ITEM_PUBLICATION_PUBLISHED;
        if ($itemmetadatachanged) {
            try {
                $itemoutcome = ($this->gradeitemrefresher)($saved);
                if ($itemoutcome instanceof \stdClass && ($itemoutcome->status ?? null) !== 'published') {
                    $gradeitempublication = self::GRADE_ITEM_PUBLICATION_FAILED;
                } else if (is_int($itemoutcome) && $itemoutcome !== 0) {
                    $gradeitempublication = self::GRADE_ITEM_PUBLICATION_FAILED;
                }
            } catch (\Throwable $exception) {
                $gradeitempublication = self::GRADE_ITEM_PUBLICATION_FAILED;
                ($this->diagnosticreporter)($exception, $saved);
            }
        }

        return [
            'content' => $saved,
            'gradeItemPublication' => $gradeitempublication,
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
        if (!is_array($coursedocument) || array_is_list($coursedocument)
            || ($coursedocument['type'] ?? null) !== 'courseDocument') {
            return null;
        }
        $attrs = $coursedocument['attrs'] ?? null;
        if (!is_array($attrs) || array_is_list($attrs)) {
            return null;
        }

        return is_string($attrs['mode'] ?? null) ? $attrs['mode'] : null;
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

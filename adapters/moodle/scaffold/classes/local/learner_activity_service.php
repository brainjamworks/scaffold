<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

require_once(__DIR__ . '/artifact_identity.php');

final class learner_activity_service {
    private const RECORD_MAX_BYTES = 262144;

    private learner_activity_repository $repository;

    public function __construct(?learner_activity_repository $repository = null) {
        $this->repository = $repository ?? new learner_activity_repository();
    }

    public function load(activity_scope $scope): array {
        $this->require_view_scope($scope);
        $artifactid = artifact_identity::for_course_module((int) $scope->cm->id);
        return $this->repository->load_active(
            (int) $scope->instance->id,
            $scope->actorid,
            $artifactid,
            self::activity_map($scope->instance),
        );
    }

    public function save(
        activity_scope $scope,
        string $artifactid,
        string $blockid,
        string $recordjson,
    ): array {
        $this->require_view_scope($scope);
        $this->require_artifact_id((int) $scope->cm->id, $artifactid);
        return $this->save_record(
            $scope->instance,
            $scope->actorid,
            $artifactid,
            $blockid,
            $recordjson,
        );
    }

    public function require_artifact(activity_scope $scope, string $artifactid): void {
        $this->require_view_scope($scope);
        $this->require_artifact_id((int) $scope->cm->id, $artifactid);
    }

    public static function activity_map(\stdClass $scaffold): array {
        try {
            $content = json_decode(
                (string) ($scaffold->learnercontentjson ?? 'null'),
                false,
                512,
                JSON_THROW_ON_ERROR,
            );
        } catch (\JsonException) {
            throw new \invalid_parameter_exception('Stored learner content is invalid JSON');
        }
        if ($content === null) {
            return [];
        }
        if (!($content instanceof \stdClass)) {
            throw new \invalid_parameter_exception('Stored learner content must be a JSON object or null');
        }

        $activities = [];
        self::collect_activity_map($content, $activities);
        return $activities;
    }

    private function save_record(
        \stdClass $scaffold,
        int $userid,
        string $artifactid,
        string $blockid,
        string $recordjson,
    ): array {
        if (trim($blockid) === '') {
            throw new \invalid_parameter_exception('Learner activity blockId must be non-blank');
        }
        if (strlen($recordjson) > self::RECORD_MAX_BYTES) {
            throw new \invalid_parameter_exception('recordjson is too large to save');
        }

        $record = self::decode_save_record($recordjson);
        learner_activity_validator::validate_definition(
            'LearnerActivityRecord',
            $record + ['updatedAt' => null],
            'learnerActivityRecord',
        );
        $authorizedactivities = self::activity_map($scaffold);
        if (!array_key_exists($blockid, $authorizedactivities)) {
            throw new \invalid_parameter_exception('Learner activity blockId is not authorized for this activity');
        }
        if ($record['activityKind'] !== $authorizedactivities[$blockid]) {
            throw new \invalid_parameter_exception('Learner activity kind does not match the authorized activity');
        }

        return $this->repository->save_record(
            (int) $scaffold->id,
            $userid,
            $artifactid,
            $blockid,
            $record,
            $authorizedactivities,
        );
    }

    private function require_view_scope(activity_scope $scope): void {
        if ($scope->capability !== 'mod/scaffold:view') {
            throw new \invalid_parameter_exception('Learner activity requires a view-authorized activity scope');
        }
    }

    private function require_artifact_id(int $cmid, string $artifactid): void {
        if ($artifactid !== artifact_identity::for_course_module($cmid)) {
            throw new \invalid_parameter_exception('artifactId does not match activity');
        }
    }

    private static function decode_save_record(string $raw): array {
        try {
            $value = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new \invalid_parameter_exception('recordjson must contain valid JSON');
        }
        if (!($value instanceof \stdClass)) {
            throw new \invalid_parameter_exception('recordjson must be a JSON object');
        }
        if (count(get_object_vars($value)) !== 3
            || !property_exists($value, 'activityKind')
            || !property_exists($value, 'data')
            || !property_exists($value, 'completed')) {
            throw new \invalid_parameter_exception('Learner activity save record has an invalid shape');
        }

        return [
            'activityKind' => $value->activityKind,
            'data' => $value->data,
            'completed' => $value->completed,
        ];
    }

    private static function collect_activity_map(mixed $value, array &$activities): void {
        if (is_array($value)) {
            foreach ($value as $child) {
                self::collect_activity_map($child, $activities);
            }
            return;
        }
        if (!($value instanceof \stdClass)) {
            return;
        }

        $node = get_object_vars($value);
        $type = $node['type'] ?? null;
        if ($type === 'checklist' || $type === 'flashcard') {
            $attrs = $node['attrs'] ?? null;
            $blockid = $attrs instanceof \stdClass ? ($attrs->id ?? null) : null;
            if (!is_string($blockid) || trim($blockid) === '') {
                throw new \invalid_parameter_exception('Stored learner activity blockId must be non-blank');
            }
            if (isset($activities[$blockid]) && $activities[$blockid] !== $type) {
                throw new \invalid_parameter_exception('Stored learner activity blockId has conflicting activity kinds');
            }
            $activities[$blockid] = $type;
        }

        if (array_key_exists('content', $node)) {
            self::collect_activity_map($node['content'], $activities);
        }
    }
}

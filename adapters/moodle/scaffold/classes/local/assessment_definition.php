<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

final class assessment_definition {
    public static function fingerprint(array $targets, array $groups, float $maximum): string {
        $canonicaltargets = [];
        foreach ($targets as $target) {
            $settings = is_array($target['settings'] ?? null) ? $target['settings'] : [];
            $canonicaltargets[] = [
                'targetId' => (string) $target['targetId'],
                'points' => (float) ($settings['points'] ?? 1),
                'isGraded' => ($settings['isGraded'] ?? true) === true,
            ];
        }
        usort(
            $canonicaltargets,
            static fn(array $left, array $right): int => $left['targetId'] <=> $right['targetId'],
        );

        $canonicalgroups = [];
        foreach ($groups as $group) {
            $settings = is_array($group['settings'] ?? null) ? $group['settings'] : [];
            $targetids = array_map('strval', $group['targetIds'] ?? []);
            sort($targetids, SORT_STRING);
            $canonicalgroups[] = [
                'groupId' => (string) $group['groupId'],
                'kind' => (string) $group['kind'],
                'targetIds' => $targetids,
                'isGraded' => ($settings['isGraded'] ?? true) === true,
            ];
        }
        usort(
            $canonicalgroups,
            static fn(array $left, array $right): int => $left['groupId'] <=> $right['groupId'],
        );

        try {
            $canonical = json_encode([
                'targets' => $canonicaltargets,
                'groups' => $canonicalgroups,
                'maximum' => $maximum,
            ], JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION);
        } catch (\JsonException $exception) {
            throw new \invalid_parameter_exception('Assessment grade definition cannot be encoded');
        }

        return hash('sha256', $canonical);
    }
}

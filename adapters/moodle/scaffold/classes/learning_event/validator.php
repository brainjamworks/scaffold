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

namespace mod_scaffold\learning_event;

/**
 * Strict validator for the actorless Learning Event crossing into Moodle.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class validator {
    /** Maximum accepted JSON payload in bytes. */
    public const MAX_JSON_BYTES = 65536;
    /** Maximum nested array/object containers in one extension JSON value. */
    public const MAX_JSON_DEPTH = 32;
    /** Moodle-owned context extension. */
    public const CMID_EXTENSION = 'https://scaffold.ac/xapi/extensions/moodle-course-module-id';
    /** BCP 47 grandfathered language tags accepted by Core. */
    private const GRANDFATHERED_LANGUAGE_TAGS = [
        'art-lojban', 'cel-gaulish', 'en-gb-oed', 'i-ami', 'i-bnn', 'i-default',
        'i-enochian', 'i-hak', 'i-klingon', 'i-lux', 'i-mingo', 'i-navajo',
        'i-pwn', 'i-tao', 'i-tay', 'i-tsu', 'no-bok', 'no-nyn', 'sgn-be-fr', 'sgn-be-nl',
        'sgn-ch-de', 'zh-guoyu', 'zh-hakka', 'zh-min', 'zh-min-nan', 'zh-xiang',
    ];

    /**
     * Validates one canonical actorless Learning Event JSON payload.
     *
     * @param string $json Untrusted event JSON.
     * @return \stdClass Validated event.
     */
    public static function validate_json(string $json): \stdClass {
        if (strlen($json) > self::MAX_JSON_BYTES) {
            self::reject('Learning Event exceeds the maximum accepted size');
        }
        try {
            $event = json_decode($json, false, 512, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING);
        } catch (\JsonException $exception) {
            self::reject('Learning Event JSON is invalid');
        }
        if (!$event instanceof \stdClass) {
            self::reject('Learning Event must be a JSON object');
        }
        self::keys($event, ['id', 'timestamp', 'verb', 'object', 'result', 'context']);
        self::uuid($event->id ?? null);
        self::timestamp($event->timestamp ?? null);
        self::verb($event->verb ?? null);
        self::activity($event->object ?? null);
        if (property_exists($event, 'result')) {
            self::result($event->result);
        }
        if (property_exists($event, 'context')) {
            self::context($event->context);
        }
        return $event;
    }

    /**
     * Rejects fields outside a strict object allowlist.
     * @param \stdClass $value Object.
     * @param array $allowed Allowed fields.
     */
    private static function keys(\stdClass $value, array $allowed): void {
        foreach (get_object_vars($value) as $key => $_unused) {
            if (!in_array($key, $allowed, true)) {
                self::reject('Learning Event contains an unsupported field');
            }
        }
    }

    /**
     * Validates a Learning Event Verb.
     * @param mixed $value Value.
     */
    private static function verb(mixed $value): void {
        if (!$value instanceof \stdClass) self::reject('Learning Event verb is invalid');
        self::keys($value, ['id', 'display']);
        self::iri($value->id ?? null);
        self::language_map($value->display ?? null);
    }

    /**
     * Validates an Activity object.
     * @param mixed $value Value.
     */
    private static function activity(mixed $value): void {
        if (!$value instanceof \stdClass) self::reject('Learning Event object is invalid');
        self::keys($value, ['objectType', 'id', 'definition']);
        if (($value->objectType ?? null) !== 'Activity') self::reject('Learning Event object type is invalid');
        self::iri($value->id ?? null);
        if (property_exists($value, 'definition')) self::definition($value->definition);
    }

    /**
     * Validates an Activity definition.
     * @param mixed $value Value.
     */
    private static function definition(mixed $value): void {
        if (!$value instanceof \stdClass) self::reject('Learning Event definition is invalid');
        self::non_empty($value, 'Learning Event definition is invalid');
        self::keys($value, ['name', 'description', 'type', 'interactionType', 'choices', 'source', 'target', 'extensions']);
        foreach (['name', 'description'] as $field) {
            if (property_exists($value, $field)) self::language_map($value->{$field});
        }
        if (property_exists($value, 'type')) self::iri($value->type);
        if (property_exists($value, 'interactionType') && !in_array($value->interactionType, [
            'true-false', 'choice', 'fill-in', 'long-fill-in', 'matching', 'performance',
            'sequencing', 'likert', 'numeric', 'other',
        ], true)) self::reject('Learning Event interaction type is invalid');
        foreach (['choices', 'source', 'target'] as $field) {
            if (property_exists($value, $field)) self::components($value->{$field});
        }
        if (property_exists($value, 'extensions')) self::extensions($value->extensions);
    }

    /**
     * Validates interaction components.
     * @param mixed $value Value.
     */
    private static function components(mixed $value): void {
        if (!is_array($value)) self::reject('Learning Event components are invalid');
        foreach ($value as $component) {
            if (!$component instanceof \stdClass) self::reject('Learning Event component is invalid');
            self::keys($component, ['id', 'description']);
            if (!is_string($component->id ?? null) || trim($component->id) === '') {
                self::reject('Learning Event component id is invalid');
            }
            if (property_exists($component, 'description')) self::language_map($component->description);
        }
    }

    /**
     * Validates an optional Result.
     * @param mixed $value Value.
     */
    private static function result(mixed $value): void {
        if (!$value instanceof \stdClass) self::reject('Learning Event result is invalid');
        self::non_empty($value, 'Learning Event result is invalid');
        self::keys($value, ['score', 'success', 'completion', 'response', 'duration', 'extensions']);
        if (property_exists($value, 'score')) self::score($value->score);
        foreach (['success', 'completion'] as $field) {
            if (property_exists($value, $field) && !is_bool($value->{$field})) self::reject('Learning Event boolean is invalid');
        }
        if (property_exists($value, 'response') && !is_string($value->response)) self::reject('Learning Event response is invalid');
        if (property_exists($value, 'duration') && (!is_string($value->duration) || !self::duration($value->duration))) {
            self::reject('Learning Event duration is invalid');
        }
        if (property_exists($value, 'extensions')) self::extensions($value->extensions);
    }

    /**
     * Validates an optional Score.
     * @param mixed $value Value.
     */
    private static function score(mixed $value): void {
        if (!$value instanceof \stdClass) self::reject('Learning Event score is invalid');
        self::non_empty($value, 'Learning Event score is invalid');
        self::keys($value, ['scaled', 'raw', 'min', 'max']);
        foreach (['scaled', 'raw', 'min', 'max'] as $field) {
            if (property_exists($value, $field) && ((!is_int($value->{$field}) && !is_float($value->{$field})) || !is_finite((float) $value->{$field}))) {
                self::reject('Learning Event score is invalid');
            }
        }
        if (property_exists($value, 'scaled') && ($value->scaled < -1 || $value->scaled > 1)) self::reject('Learning Event scaled score is invalid');
        if (property_exists($value, 'min') && property_exists($value, 'max') && $value->min >= $value->max) {
            self::reject('Learning Event score range is invalid');
        }
        if (property_exists($value, 'raw') && property_exists($value, 'min') && $value->raw < $value->min) {
            self::reject('Learning Event raw score is invalid');
        }
        if (property_exists($value, 'raw') && property_exists($value, 'max') && $value->raw > $value->max) {
            self::reject('Learning Event raw score is invalid');
        }
    }

    /**
     * Validates Core context and rejects Moodle context collisions.
     * @param mixed $value Value.
     */
    private static function context(mixed $value): void {
        if (!$value instanceof \stdClass) self::reject('Learning Event context is invalid');
        self::non_empty($value, 'Learning Event context is invalid');
        self::keys($value, ['contextActivities', 'extensions']);
        if (property_exists($value, 'contextActivities')) {
            if (!$value->contextActivities instanceof \stdClass) self::reject('Learning Event context activities are invalid');
            self::non_empty($value->contextActivities, 'Learning Event context activities are invalid');
            self::keys($value->contextActivities, ['parent', 'grouping', 'category', 'other']);
            foreach (['parent', 'grouping', 'category', 'other'] as $field) {
                if (property_exists($value->contextActivities, $field)) {
                    if (!is_array($value->contextActivities->{$field}) || $value->contextActivities->{$field} === []) self::reject('Learning Event context activities are invalid');
                    foreach ($value->contextActivities->{$field} as $activity) self::activity($activity);
                }
            }
        }
        if (property_exists($value, 'extensions')) {
            self::extensions($value->extensions);
            if (property_exists($value->extensions, self::CMID_EXTENSION)) self::reject('Learning Event Moodle context is supplied by Moodle');
        }
    }

    /**
     * Validates a non-empty language map.
     * @param mixed $value Value.
     */
    private static function language_map(mixed $value): void {
        if (!$value instanceof \stdClass || get_object_vars($value) === []) self::reject('Learning Event language map is invalid');
        foreach (get_object_vars($value) as $language => $text) {
            if (!self::language_tag($language) || !is_string($text) || trim($text) === '') {
                self::reject('Learning Event language map is invalid');
            }
        }
    }

    /**
     * Validates one BCP 47 language tag and its uniqueness constraints.
     * @param string $value Language tag.
     */
    private static function language_tag(string $value): bool {
        if ($value !== trim($value) || $value === '') return false;
        $lower = strtolower($value);
        if (in_array($lower, self::GRANDFATHERED_LANGUAGE_TAGS, true)
                || preg_match('/^x(?:-[A-Za-z\d]{1,8})+$/i', $value)) {
            return true;
        }
        if (!preg_match(
            '/^(?:(?:[A-Za-z]{2,3}(?:-[A-Za-z]{3}){0,1}|[A-Za-z]{5,8})'
                . '(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?'
                . '(?:-(?:[A-Za-z\d]{5,8}|\d[A-Za-z\d]{3}))*'
                . '(?:-[0-9A-WY-Za-wy-z](?:-[A-Za-z\d]{2,8})+)*'
                . '(?:-x(?:-[A-Za-z\d]{1,8})+)?)$/',
            $value,
        )) {
            return false;
        }

        $variants = [];
        $singletons = [];
        $inextensions = false;
        foreach (array_slice(explode('-', $lower), 1) as $subtag) {
            if ($subtag === 'x') break;
            if (strlen($subtag) === 1) {
                if (isset($singletons[$subtag])) return false;
                $singletons[$subtag] = true;
                $inextensions = true;
            } elseif (!$inextensions && ((strlen($subtag) === 4 && ctype_digit($subtag[0]))
                    || (strlen($subtag) >= 5 && strlen($subtag) <= 8))) {
                if (isset($variants[$subtag])) return false;
                $variants[$subtag] = true;
            }
        }
        return true;
    }

    /**
     * Validates the unsigned xAPI ISO 8601 duration grammar.
     * @param string $value Duration.
     */
    private static function duration(string $value): bool {
        if (!preg_match(
            '/^P(?:(\d+(?:[.,]\d+)?)W|(?:(\d+(?:[.,]\d+)?)Y)?'
                . '(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)D)?'
                . '(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?'
                . '(?:(\d+(?:[.,]\d+)?)S)?)?)$/',
            $value,
            $parts,
            PREG_UNMATCHED_AS_NULL,
        )) {
            return false;
        }
        if ($parts[1] !== null) return true;
        $components = array_slice($parts, 2);
        $present = array_values(array_filter($components, fn($component) => $component !== null));
        if ($present === [] || (str_contains($value, 'T')
                && !array_filter(array_slice($components, 3), fn($component) => $component !== null))) {
            return false;
        }
        foreach (array_slice($present, 0, -1) as $component) {
            if (str_contains($component, '.') || str_contains($component, ',')) return false;
        }
        return true;
    }

    /**
     * Validates IRI-keyed extension values.
     * @param mixed $value Value.
     */
    private static function extensions(mixed $value): void {
        if (!$value instanceof \stdClass || get_object_vars($value) === []) self::reject('Learning Event extensions are invalid');
        foreach (get_object_vars($value) as $key => $extension) {
            self::iri($key);
            self::json_value($extension);
        }
    }

    /**
     * Validates a finite JSON-safe tree.
     * @param mixed $value Value.
     */
    private static function json_value(mixed $value, int $depth = 0): void {
        if ($value === null || is_bool($value) || is_string($value)) return;
        if (is_int($value) || is_float($value)) {
            if (!is_finite((float) $value)) self::reject('Learning Event JSON value is invalid');
            return;
        }
        if ($value instanceof \stdClass || is_array($value)) {
            if ($depth >= self::MAX_JSON_DEPTH) {
                self::reject('Learning Event JSON value exceeds the maximum depth');
            }
            if ($value instanceof \stdClass && get_object_vars($value) === []) {
                self::reject('Learning Event JSON value is invalid');
            }
            foreach ((array) $value as $child) self::json_value($child, $depth + 1);
            return;
        }
        self::reject('Learning Event JSON value is invalid');
    }

    /**
     * Validates an absolute IRI.
     * @param mixed $value Value.
     */
    private static function iri(mixed $value): void {
        if (!is_string($value) || $value !== trim($value) || preg_match('/\s/', $value) || str_contains($value, '\\') ||
                preg_match('/%(?![0-9A-Fa-f]{2})/', $value)
                || !preg_match('/^([A-Za-z][A-Za-z\d+.-]*:)(.+)$/', $value, $match)) {
            self::reject('Learning Event IRI is invalid');
        }
        $parts = parse_url($value);
        if ($parts === false) self::reject('Learning Event IRI is invalid');
        if (in_array(strtolower(rtrim($match[1], ':')), ['http', 'https'], true)
                && (!str_starts_with($match[2], '//') || empty($parts['host']))) {
            self::reject('Learning Event IRI is invalid');
        }
    }

    /**
     * Validates an assigned-version RFC UUID using the IETF variant.
     * @param mixed $value Value.
     */
    private static function uuid(mixed $value): void {
        if (!is_string($value) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value)) self::reject('Learning Event id is invalid');
    }

    /**
     * Validates a UTC RFC 3339 timestamp.
     * @param mixed $value Value.
     */
    private static function timestamp(mixed $value): void {
        if (!is_string($value) || !preg_match(
            '/^(?!0000)(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d{3,}Z$/',
            $value,
            $parts,
        )) self::reject('Learning Event timestamp is invalid');
        if (!checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1])
                || (int) $parts[4] > 23 || (int) $parts[5] > 59 || (int) $parts[6] > 59) {
            self::reject('Learning Event timestamp is invalid');
        }
    }

    /**
     * Rejects an empty structured object.
     * @param \stdClass $value Object.
     * @param string $message Error message.
     */
    private static function non_empty(\stdClass $value, string $message): void {
        if (get_object_vars($value) === []) self::reject($message);
    }

    /**
     * Throws a safe external-input error.
     * @param string $message Error message.
     * @return never Never returns.
     */
    private static function reject(string $message): never {
        throw new \invalid_parameter_exception($message);
    }
}

<?php

namespace mod_scaffold\learning_event;

/** Strict validator for the actorless Learning Event crossing into Moodle. */
final class validator {
    public const MAX_JSON_BYTES = 65536;
    public const CMID_EXTENSION = 'https://scaffold.ac/xapi/extensions/moodle-course-module-id';

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

    private static function keys(\stdClass $value, array $allowed): void {
        foreach (get_object_vars($value) as $key => $_unused) {
            if (!in_array($key, $allowed, true)) {
                self::reject('Learning Event contains an unsupported field');
            }
        }
    }

    private static function verb(mixed $value): void {
        if (!$value instanceof \stdClass) self::reject('Learning Event verb is invalid');
        self::keys($value, ['id', 'display']);
        self::iri($value->id ?? null);
        self::language_map($value->display ?? null);
    }

    private static function activity(mixed $value): void {
        if (!$value instanceof \stdClass) self::reject('Learning Event object is invalid');
        self::keys($value, ['objectType', 'id', 'definition']);
        if (($value->objectType ?? null) !== 'Activity') self::reject('Learning Event object type is invalid');
        self::iri($value->id ?? null);
        if (property_exists($value, 'definition')) self::definition($value->definition);
    }

    private static function definition(mixed $value): void {
        if (!$value instanceof \stdClass) self::reject('Learning Event definition is invalid');
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

    private static function components(mixed $value): void {
        if (!is_array($value) || $value === []) self::reject('Learning Event components are invalid');
        foreach ($value as $component) {
            if (!$component instanceof \stdClass) self::reject('Learning Event component is invalid');
            self::keys($component, ['id', 'description']);
            if (!is_string($component->id ?? null) || trim($component->id) === '') {
                self::reject('Learning Event component id is invalid');
            }
            if (property_exists($component, 'description')) self::language_map($component->description);
        }
    }

    private static function result(mixed $value): void {
        if (!$value instanceof \stdClass) self::reject('Learning Event result is invalid');
        self::keys($value, ['score', 'success', 'completion', 'response', 'duration', 'extensions']);
        if (property_exists($value, 'score')) self::score($value->score);
        foreach (['success', 'completion'] as $field) {
            if (property_exists($value, $field) && !is_bool($value->{$field})) self::reject('Learning Event boolean is invalid');
        }
        if (property_exists($value, 'response') && !is_string($value->response)) self::reject('Learning Event response is invalid');
        if (property_exists($value, 'duration') && (!is_string($value->duration) || !preg_match('/^P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/', $value->duration))) {
            self::reject('Learning Event duration is invalid');
        }
        if (property_exists($value, 'extensions')) self::extensions($value->extensions);
    }

    private static function score(mixed $value): void {
        if (!$value instanceof \stdClass) self::reject('Learning Event score is invalid');
        self::keys($value, ['scaled', 'raw', 'min', 'max']);
        foreach (['scaled', 'raw', 'min', 'max'] as $field) {
            if (property_exists($value, $field) && ((!is_int($value->{$field}) && !is_float($value->{$field})) || !is_finite((float) $value->{$field}))) {
                self::reject('Learning Event score is invalid');
            }
        }
        if (property_exists($value, 'scaled') && ($value->scaled < -1 || $value->scaled > 1)) self::reject('Learning Event scaled score is invalid');
    }

    private static function context(mixed $value): void {
        if (!$value instanceof \stdClass) self::reject('Learning Event context is invalid');
        self::keys($value, ['contextActivities', 'extensions']);
        if (property_exists($value, 'contextActivities')) {
            if (!$value->contextActivities instanceof \stdClass) self::reject('Learning Event context activities are invalid');
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

    private static function language_map(mixed $value): void {
        if (!$value instanceof \stdClass || get_object_vars($value) === []) self::reject('Learning Event language map is invalid');
        foreach (get_object_vars($value) as $language => $text) {
            if (!preg_match('/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/', $language) || !is_string($text) || trim($text) === '') self::reject('Learning Event language map is invalid');
        }
    }

    private static function extensions(mixed $value): void {
        if (!$value instanceof \stdClass || get_object_vars($value) === []) self::reject('Learning Event extensions are invalid');
        foreach (get_object_vars($value) as $key => $extension) {
            self::iri($key);
            self::json_value($extension);
        }
    }

    private static function json_value(mixed $value): void {
        if ($value === null || is_bool($value) || is_string($value)) return;
        if (is_int($value) || is_float($value)) {
            if (!is_finite((float) $value)) self::reject('Learning Event JSON value is invalid');
            return;
        }
        if ($value instanceof \stdClass || is_array($value)) {
            foreach ((array) $value as $child) self::json_value($child);
            return;
        }
        self::reject('Learning Event JSON value is invalid');
    }

    private static function iri(mixed $value): void {
        if (!is_string($value) || $value !== trim($value) || preg_match('/\s/', $value) ||
                !preg_match('/^[A-Za-z][A-Za-z\d+.-]*:/', $value) || parse_url($value, PHP_URL_SCHEME) === false) self::reject('Learning Event IRI is invalid');
    }

    private static function uuid(mixed $value): void {
        if (!is_string($value) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $value)) self::reject('Learning Event id is invalid');
    }

    private static function timestamp(mixed $value): void {
        if (!is_string($value) || !preg_match('/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,}Z$/', $value)) self::reject('Learning Event timestamp is invalid');
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d\\TH:i:s.u\\Z', $value);
        if (!$date) self::reject('Learning Event timestamp is invalid');
    }

    private static function reject(string $message): never {
        throw new \invalid_parameter_exception($message);
    }
}

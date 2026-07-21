<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace mod_scaffold\local;

defined('MOODLE_INTERNAL') || die();

class json_schema_validator {
    private const SUPPORTED_KEYWORDS = [
        '$comment',
        '$id',
        '$ref',
        '$schema',
        'additionalProperties',
        'allOf',
        'anyOf',
        'const',
        'default',
        'definitions',
        'enum',
        'exclusiveMinimum',
        'format',
        'items',
        'maximum',
        'minItems',
        'minimum',
        'pattern',
        'properties',
        'propertyNames',
        'required',
        'title',
        'type',
        'uniqueItems',
    ];

    private static ?self $pluginvalidator = null;

    private \stdClass $schema;

    public function __construct(?string $schemafilepath = null) {
        $schemafilepath ??= dirname(__DIR__, 2) . '/schemas/assessment.schema.json';
        $raw = @file_get_contents($schemafilepath);
        if ($raw === false) {
            throw new \invalid_parameter_exception('JSON schema resource is missing');
        }

        try {
            $schema = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $exception) {
            throw new \invalid_parameter_exception('JSON schema resource is invalid JSON');
        }

        if (!($schema instanceof \stdClass)) {
            throw new \invalid_parameter_exception('JSON schema resource must be a JSON object');
        }

        $this->schema = $schema;
        $this->audit_schema($schema, '#');
    }

    public static function validate_plugin_definition(
        string $definition,
        mixed $value,
        string $path = '$',
    ): void {
        self::$pluginvalidator ??= new self();
        self::$pluginvalidator->validate_definition($definition, $value, $path);
    }

    public function validate_definition(string $definition, mixed $value, string $path = '$'): void {
        $definitions = $this->schema->definitions ?? null;
        if (!($definitions instanceof \stdClass) || !property_exists($definitions, $definition)) {
            throw new \invalid_parameter_exception('Unknown JSON schema definition: ' . $definition);
        }

        $schema = $definitions->{$definition};
        if (!($schema instanceof \stdClass)) {
            throw new \invalid_parameter_exception('JSON schema definition is invalid: ' . $definition);
        }

        $this->validate_value($value, $schema, $path, 0);
    }

    private function audit_schema(\stdClass $schema, string $path): void {
        foreach (get_object_vars($schema) as $keyword => $constraint) {
            if (!in_array($keyword, self::SUPPORTED_KEYWORDS, true)) {
                throw new \invalid_parameter_exception(
                    'Unsupported JSON schema keyword at ' . $path . ': ' . $keyword,
                );
            }

            if ($keyword === '$ref') {
                if (!is_string($constraint)) {
                    throw new \invalid_parameter_exception($path . '.$ref must be a string');
                }
                $this->resolve_reference($constraint);
                continue;
            }

            if ($keyword === 'definitions' || $keyword === 'properties') {
                if (!($constraint instanceof \stdClass)) {
                    throw new \invalid_parameter_exception($path . '.' . $keyword . ' must be an object');
                }
                foreach (get_object_vars($constraint) as $name => $childschema) {
                    if (!($childschema instanceof \stdClass)) {
                        throw new \invalid_parameter_exception($path . '.' . $keyword . '.' . $name . ' must be a schema');
                    }
                    $this->audit_schema($childschema, $path . '/' . $keyword . '/' . $name);
                }
                continue;
            }

            if ($keyword === 'anyOf' || $keyword === 'allOf') {
                if (!is_array($constraint) || !array_is_list($constraint) || $constraint === []) {
                    throw new \invalid_parameter_exception($path . '.' . $keyword . ' must be a non-empty array');
                }
                foreach ($constraint as $index => $childschema) {
                    if (!($childschema instanceof \stdClass)) {
                        throw new \invalid_parameter_exception($path . '.' . $keyword . '[' . $index . '] must be a schema');
                    }
                    $this->audit_schema($childschema, $path . '/' . $keyword . '/' . $index);
                }
                continue;
            }

            if ($keyword === 'items' || $keyword === 'propertyNames') {
                if (!($constraint instanceof \stdClass)) {
                    throw new \invalid_parameter_exception($path . '.' . $keyword . ' must be a schema');
                }
                $this->audit_schema($constraint, $path . '/' . $keyword);
                continue;
            }

            if ($keyword === 'additionalProperties' && $constraint instanceof \stdClass) {
                $this->audit_schema($constraint, $path . '/additionalProperties');
                continue;
            }

            $this->audit_constraint($keyword, $constraint, $path);
        }
    }

    private function audit_constraint(string $keyword, mixed $constraint, string $path): void {
        if (in_array($keyword, ['$comment', '$id', '$schema', 'title'], true) && !is_string($constraint)) {
            throw new \invalid_parameter_exception($path . '.' . $keyword . ' must be a string');
        }
        if ($keyword === 'additionalProperties' && !is_bool($constraint)) {
            throw new \invalid_parameter_exception($path . '.additionalProperties must be boolean or a schema');
        }
        if ($keyword === 'type') {
            $types = is_array($constraint) ? $constraint : [$constraint];
            $supportedtypes = ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string'];
            if ($types === [] || !array_is_list($types)) {
                throw new \invalid_parameter_exception($path . '.type must name supported JSON types');
            }
            foreach ($types as $type) {
                if (!is_string($type) || !in_array($type, $supportedtypes, true)) {
                    throw new \invalid_parameter_exception($path . '.type contains an unsupported JSON type');
                }
            }
        }
        if (($keyword === 'enum' || $keyword === 'required') && (!is_array($constraint) || !array_is_list($constraint))) {
            throw new \invalid_parameter_exception($path . '.' . $keyword . ' must be an array');
        }
        if ($keyword === 'required') {
            foreach ($constraint as $name) {
                if (!is_string($name)) {
                    throw new \invalid_parameter_exception($path . '.required entries must be strings');
                }
            }
        }
        if (in_array($keyword, ['minimum', 'maximum', 'exclusiveMinimum'], true) && !$this->is_json_number($constraint)) {
            throw new \invalid_parameter_exception($path . '.' . $keyword . ' must be a finite number');
        }
        if ($keyword === 'minItems' && (!is_int($constraint) || $constraint < 0)) {
            throw new \invalid_parameter_exception($path . '.minItems must be a non-negative integer');
        }
        if ($keyword === 'uniqueItems' && !is_bool($constraint)) {
            throw new \invalid_parameter_exception($path . '.uniqueItems must be a boolean');
        }
        if ($keyword === 'pattern') {
            if (!is_string($constraint) || @preg_match($this->pattern_expression($constraint), '') === false) {
                throw new \invalid_parameter_exception($path . '.pattern must be a valid regular expression');
            }
        }
        if ($keyword === 'format' && $constraint !== 'date-time') {
            throw new \invalid_parameter_exception($path . '.format is not supported');
        }
    }

    private function validate_value(mixed $value, \stdClass $schema, string $path, int $depth): void {
        if ($depth > 512) {
            throw new \invalid_parameter_exception($path . ' exceeds schema validation depth');
        }

        if (property_exists($schema, '$ref')) {
            $this->validate_value($value, $this->resolve_reference($schema->{'$ref'}), $path, $depth + 1);
            return;
        }

        if (property_exists($schema, 'allOf')) {
            foreach ($schema->allOf as $childschema) {
                $this->validate_value($value, $childschema, $path, $depth + 1);
            }
        }

        if (property_exists($schema, 'anyOf')) {
            $matched = false;
            foreach ($schema->anyOf as $childschema) {
                try {
                    $this->validate_value($value, $childschema, $path, $depth + 1);
                    $matched = true;
                    break;
                } catch (\invalid_parameter_exception) {
                }
            }
            if (!$matched) {
                throw new \invalid_parameter_exception($path . ' does not match any allowed schema');
            }
        }

        if (property_exists($schema, 'type')) {
            $types = is_array($schema->type) ? $schema->type : [$schema->type];
            $matched = false;
            foreach ($types as $type) {
                if ($this->matches_type($value, $type)) {
                    $matched = true;
                    break;
                }
            }
            if (!$matched) {
                throw new \invalid_parameter_exception($path . ' has the wrong JSON type');
            }
        }

        if (property_exists($schema, 'const') && !$this->json_values_equal($value, $schema->const)) {
            throw new \invalid_parameter_exception($path . ' does not match the required constant');
        }

        if (property_exists($schema, 'enum')) {
            $matched = false;
            foreach ($schema->enum as $allowed) {
                if ($this->json_values_equal($value, $allowed)) {
                    $matched = true;
                    break;
                }
            }
            if (!$matched) {
                throw new \invalid_parameter_exception($path . ' is not an allowed value');
            }
        }

        $properties = $this->object_properties($value);
        if ($properties !== null) {
            $this->validate_object($properties, $schema, $path, $depth);
        }
        if (is_array($value) && array_is_list($value)) {
            $this->validate_array($value, $schema, $path, $depth);
        }
        if ($this->is_json_number($value)) {
            $this->validate_number($value, $schema, $path);
        }
        if (is_string($value)) {
            $this->validate_string($value, $schema, $path);
        }
    }

    private function validate_object(array $properties, \stdClass $schema, string $path, int $depth): void {
        $defined = property_exists($schema, 'properties') ? get_object_vars($schema->properties) : [];
        if (property_exists($schema, 'required')) {
            foreach ($schema->required as $name) {
                if (!array_key_exists($name, $properties)) {
                    throw new \invalid_parameter_exception($path . '.' . $name . ' is required');
                }
            }
        }

        foreach ($properties as $name => $child) {
            $name = (string) $name;
            if (property_exists($schema, 'propertyNames')) {
                $this->validate_value($name, $schema->propertyNames, $path . '.' . $name, $depth + 1);
            }
            if (array_key_exists($name, $defined)) {
                $this->validate_value($child, $defined[$name], $path . '.' . $name, $depth + 1);
                continue;
            }
            if (!property_exists($schema, 'additionalProperties') || $schema->additionalProperties === true) {
                continue;
            }
            if ($schema->additionalProperties === false) {
                throw new \invalid_parameter_exception($path . '.' . $name . ' is not allowed');
            }
            $this->validate_value($child, $schema->additionalProperties, $path . '.' . $name, $depth + 1);
        }
    }

    private function validate_array(array $value, \stdClass $schema, string $path, int $depth): void {
        if (property_exists($schema, 'minItems') && count($value) < $schema->minItems) {
            throw new \invalid_parameter_exception($path . ' has too few items');
        }
        if (($schema->uniqueItems ?? false) === true) {
            foreach ($value as $leftindex => $left) {
                for ($rightindex = $leftindex + 1; $rightindex < count($value); $rightindex++) {
                    if ($this->json_values_equal($left, $value[$rightindex])) {
                        throw new \invalid_parameter_exception($path . ' contains duplicate items');
                    }
                }
            }
        }
        if (property_exists($schema, 'items')) {
            foreach ($value as $index => $child) {
                $this->validate_value($child, $schema->items, $path . '[' . $index . ']', $depth + 1);
            }
        }
    }

    private function validate_number(int|float $value, \stdClass $schema, string $path): void {
        if (property_exists($schema, 'minimum') && $value < $schema->minimum) {
            throw new \invalid_parameter_exception($path . ' is below the minimum');
        }
        if (property_exists($schema, 'maximum') && $value > $schema->maximum) {
            throw new \invalid_parameter_exception($path . ' is above the maximum');
        }
        if (property_exists($schema, 'exclusiveMinimum') && $value <= $schema->exclusiveMinimum) {
            throw new \invalid_parameter_exception($path . ' must be greater than the exclusive minimum');
        }
    }

    private function validate_string(string $value, \stdClass $schema, string $path): void {
        if (property_exists($schema, 'pattern') && preg_match($this->pattern_expression($schema->pattern), $value) !== 1) {
            throw new \invalid_parameter_exception($path . ' does not match the required pattern');
        }
        if (property_exists($schema, 'format') && !$this->is_rfc3339_datetime($value)) {
            throw new \invalid_parameter_exception($path . ' is not a valid date-time');
        }
    }

    private function resolve_reference(string $reference): \stdClass {
        if (!str_starts_with($reference, '#/')) {
            throw new \invalid_parameter_exception('Only local JSON schema references are supported');
        }

        $current = $this->schema;
        foreach (explode('/', substr($reference, 2)) as $token) {
            $token = str_replace(['~1', '~0'], ['/', '~'], $token);
            if ($current instanceof \stdClass && property_exists($current, $token)) {
                $current = $current->{$token};
                continue;
            }
            if (is_array($current) && ctype_digit($token) && array_key_exists((int) $token, $current)) {
                $current = $current[(int) $token];
                continue;
            }
            throw new \invalid_parameter_exception('JSON schema reference does not resolve: ' . $reference);
        }

        if (!($current instanceof \stdClass)) {
            throw new \invalid_parameter_exception('JSON schema reference is not a schema: ' . $reference);
        }
        return $current;
    }

    private function matches_type(mixed $value, string $type): bool {
        return match ($type) {
            'array' => is_array($value) && array_is_list($value),
            'boolean' => is_bool($value),
            'integer' => is_int($value) || (is_float($value) && is_finite($value) && floor($value) === $value),
            'null' => $value === null,
            'number' => $this->is_json_number($value),
            'object' => $this->object_properties($value) !== null,
            'string' => is_string($value),
            default => false,
        };
    }

    private function object_properties(mixed $value): ?array {
        if ($value instanceof \stdClass) {
            return get_object_vars($value);
        }
        if (is_array($value) && !array_is_list($value)) {
            return $value;
        }
        return null;
    }

    private function is_json_number(mixed $value): bool {
        return (is_int($value) || is_float($value)) && is_finite((float) $value);
    }

    private function json_values_equal(mixed $left, mixed $right): bool {
        if ($this->is_json_number($left) && $this->is_json_number($right)) {
            return (float) $left === (float) $right;
        }

        $leftobject = $this->object_properties($left);
        $rightobject = $this->object_properties($right);
        if ($leftobject !== null || $rightobject !== null) {
            if ($leftobject === null || $rightobject === null || count($leftobject) !== count($rightobject)) {
                return false;
            }
            foreach ($leftobject as $key => $value) {
                if (!array_key_exists($key, $rightobject) || !$this->json_values_equal($value, $rightobject[$key])) {
                    return false;
                }
            }
            return true;
        }

        if (is_array($left) || is_array($right)) {
            if (!is_array($left) || !is_array($right) || count($left) !== count($right)) {
                return false;
            }
            foreach ($left as $index => $value) {
                if (!$this->json_values_equal($value, $right[$index])) {
                    return false;
                }
            }
            return true;
        }

        return $left === $right;
    }

    private function pattern_expression(string $pattern): string {
        return '~' . str_replace('~', '\\~', $pattern) . '~u';
    }

    private function is_rfc3339_datetime(string $value): bool {
        $matched = preg_match(
            '/^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:(?:[0-5]\d|60)(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/',
            $value,
            $parts,
        );
        return $matched === 1 && checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1]);
    }
}

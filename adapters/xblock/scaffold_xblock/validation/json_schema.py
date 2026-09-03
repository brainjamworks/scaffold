import json
import math
import re
from datetime import datetime
from importlib.resources import files


class JsonSchemaValidationError(ValueError):
    pass


class UnsupportedJsonSchemaKeywordError(JsonSchemaValidationError):
    pass


SEMANTIC_MANIFEST_KEYWORD = "x-scaffold-semantics"
SCORE_SEMANTIC_KEYWORD = "x-scaffold-semantic"
SCORE_SEMANTIC_VERSION = "score-v1"
SPATIAL_PLACEMENT_SEMANTIC_VERSION = "spatial-placement-v1"
SUPPORTED_SEMANTICS = {
    SCORE_SEMANTIC_VERSION,
    SPATIAL_PLACEMENT_SEMANTIC_VERSION,
}
MIN_SAFE_INTEGER = -9007199254740991
MAX_SAFE_INTEGER = 9007199254740991


SUPPORTED_SCHEMA_KEYWORDS = {
    "$comment",
    "$id",
    "$ref",
    "$schema",
    "additionalProperties",
    "allOf",
    "anyOf",
    "const",
    "default",
    "definitions",
    "enum",
    "exclusiveMaximum",
    "exclusiveMinimum",
    "format",
    "items",
    "maximum",
    "minItems",
    "minLength",
    "minimum",
    "oneOf",
    "pattern",
    "properties",
    "propertyNames",
    "required",
    "title",
    "type",
    "uniqueItems",
    SEMANTIC_MANIFEST_KEYWORD,
    SCORE_SEMANTIC_KEYWORD,
}


def load_schema_bundle(schema_filename):
    schema_resource = files(__package__).joinpath("schemas", schema_filename)
    return json.loads(schema_resource.read_text(encoding="utf-8"))


def load_assessment_schema():
    return load_schema_bundle("assessment.schema.json")


def validate_assessment_definition(definition_name, value, path="$"):
    bundle = load_assessment_schema()
    return validate_schema_definition(
        bundle,
        definition_name,
        value,
        path,
        definition_kind="assessment",
    )


def validate_schema_definition(
    bundle,
    definition_name,
    value,
    path="$",
    definition_kind="JSON",
):
    declared_semantics = _semantic_manifest(bundle)
    observed_semantics = set()
    _assert_supported_schema(
        bundle,
        declared_semantics=declared_semantics,
        observed_semantics=observed_semantics,
    )
    missing_semantics = declared_semantics - observed_semantics
    if missing_semantics:
        raise JsonSchemaValidationError(
            "Required JSON schema semantic marker is missing: %s"
            % sorted(missing_semantics)[0]
        )
    definitions = bundle.get("definitions", {})
    try:
        schema = definitions[definition_name]
    except KeyError as exc:
        raise JsonSchemaValidationError(
            "Unknown %s schema definition: %s"
            % (definition_kind, definition_name),
        ) from exc

    _validate(value, schema, bundle, path)
    return value


def _assert_supported_schema(
    schema,
    schema_path="",
    declared_semantics=None,
    observed_semantics=None,
):
    declared_semantics = set() if declared_semantics is None else declared_semantics
    observed_semantics = set() if observed_semantics is None else observed_semantics
    for keyword in schema:
        if keyword not in SUPPORTED_SCHEMA_KEYWORDS:
            path = ".".join(part for part in (schema_path, keyword) if part)
            raise UnsupportedJsonSchemaKeywordError(
                "Unsupported JSON Schema keyword at %s" % path,
            )
        if keyword == SEMANTIC_MANIFEST_KEYWORD and schema_path:
            raise UnsupportedJsonSchemaKeywordError(
                "JSON schema semantic manifest must be declared at the bundle root"
            )
        if keyword == SCORE_SEMANTIC_KEYWORD:
            if not schema_path:
                raise UnsupportedJsonSchemaKeywordError(
                    "JSON schema semantic markers must be declared on an applicable child schema"
                )
            semantic = schema[keyword]
            if not isinstance(semantic, str) or semantic not in SUPPORTED_SEMANTICS:
                raise UnsupportedJsonSchemaKeywordError(
                    "Unsupported JSON schema semantic at %s" % schema_path,
                )
            if semantic not in declared_semantics:
                raise UnsupportedJsonSchemaKeywordError(
                    "Undeclared JSON schema semantic at %s" % schema_path,
                )
            observed_semantics.add(semantic)
        if keyword == "minLength" and (
            not isinstance(schema[keyword], int)
            or isinstance(schema[keyword], bool)
            or schema[keyword] < 0
        ):
            raise JsonSchemaValidationError(
                "%s.minLength must be a non-negative integer" % schema_path
            )

    for collection_keyword in ("definitions", "properties"):
        for name, child_schema in schema.get(collection_keyword, {}).items():
            child_path = ".".join(
                part for part in (schema_path, collection_keyword, name) if part
            )
            _assert_supported_schema(
                child_schema,
                child_path,
                declared_semantics,
                observed_semantics,
            )

    for collection_keyword in ("allOf", "anyOf", "oneOf"):
        for index, child_schema in enumerate(schema.get(collection_keyword, [])):
            child_path = "%s%s[%d]" % (
                schema_path + "." if schema_path else "",
                collection_keyword,
                index,
            )
            _assert_supported_schema(
                child_schema,
                child_path,
                declared_semantics,
                observed_semantics,
            )

    for child_keyword in ("items", "propertyNames"):
        child_schema = schema.get(child_keyword)
        if isinstance(child_schema, dict):
            child_path = ".".join(
                part for part in (schema_path, child_keyword) if part
            )
            _assert_supported_schema(
                child_schema,
                child_path,
                declared_semantics,
                observed_semantics,
            )

    additional = schema.get("additionalProperties")
    if isinstance(additional, dict):
        child_path = ".".join(
            part for part in (schema_path, "additionalProperties") if part
        )
        _assert_supported_schema(
            additional,
            child_path,
            declared_semantics,
            observed_semantics,
        )


def _validate(value, schema, root_schema, path):
    if "$ref" in schema:
        _validate(value, _resolve_ref(root_schema, schema["$ref"]), root_schema, path)

    if "allOf" in schema:
        for child_schema in schema["allOf"]:
            _validate(value, child_schema, root_schema, path)
    if "anyOf" in schema:
        errors = []
        for child_schema in schema["anyOf"]:
            try:
                _validate(value, child_schema, root_schema, path)
                break
            except JsonSchemaValidationError as exc:
                errors.append(
                    (_schema_match_score(value, child_schema, root_schema), exc),
                )
        else:
            discriminant_error = _union_discriminant_error(
                value,
                schema["anyOf"],
                root_schema,
                path,
            )
            if discriminant_error is not None:
                raise discriminant_error
            raise max(errors, key=lambda item: item[0])[1]
    if "oneOf" in schema:
        matches = 0
        for child_schema in schema["oneOf"]:
            try:
                _validate(value, child_schema, root_schema, path)
                matches += 1
            except JsonSchemaValidationError:
                continue
        if matches != 1:
            raise JsonSchemaValidationError(
                "%s must match exactly one allowed schema" % path
            )

    expected_type = schema.get("type")
    if expected_type is not None and not _matches_type(value, expected_type):
        raise JsonSchemaValidationError(
            "%s must be %s" % (path, _type_description(expected_type)),
        )

    if "const" in schema and value != schema["const"]:
        raise JsonSchemaValidationError("%s is not supported" % path)
    if "enum" in schema and value not in schema["enum"]:
        raise JsonSchemaValidationError("%s is not supported" % path)

    if isinstance(value, dict):
        properties = schema.get("properties", {})
        for property_name in schema.get("required", []):
            if property_name not in value:
                raise JsonSchemaValidationError(
                    "%s.%s is required" % (path, property_name),
                )

        for property_name, property_value in value.items():
            property_path = "%s.%s" % (path, property_name)
            if "propertyNames" in schema:
                _validate(
                    property_name,
                    schema["propertyNames"],
                    root_schema,
                    property_path,
                )
            if property_name in properties:
                _validate(
                    property_value,
                    properties[property_name],
                    root_schema,
                    property_path,
                )
                continue

            additional = schema.get("additionalProperties", True)
            if additional is False:
                raise JsonSchemaValidationError(
                    "%s is not allowed" % property_path,
                )
            if isinstance(additional, dict):
                _validate(property_value, additional, root_schema, property_path)

    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            raise JsonSchemaValidationError("%s must not be empty" % path)
        if schema.get("uniqueItems") and not _items_are_unique(value):
            duplicate_index = _first_duplicate_index(value)
            raise JsonSchemaValidationError(
                "%s[%d] must be unique" % (path, duplicate_index),
            )
        if "items" in schema:
            for index, item in enumerate(value):
                _validate(item, schema["items"], root_schema, "%s[%d]" % (path, index))

    if _is_number(value):
        if "minimum" in schema and value < schema["minimum"]:
            if schema.get("type") == "integer" and schema["minimum"] == 0:
                raise JsonSchemaValidationError(
                    "%s must be a non-negative integer" % path,
                )
            raise JsonSchemaValidationError(
                "%s must be at least %s" % (path, schema["minimum"]),
            )
        if "maximum" in schema and value > schema["maximum"]:
            raise JsonSchemaValidationError(
                "%s must be at most %s" % (path, schema["maximum"]),
            )
        if "exclusiveMinimum" in schema and value <= schema["exclusiveMinimum"]:
            raise JsonSchemaValidationError(
                "%s must be greater than %s" % (path, schema["exclusiveMinimum"]),
            )
        if "exclusiveMaximum" in schema and value >= schema["exclusiveMaximum"]:
            raise JsonSchemaValidationError(
                "%s must be less than %s" % (path, schema["exclusiveMaximum"]),
            )

    if isinstance(value, str) and "minLength" in schema:
        minimum_length = schema["minLength"]
        if len(value) < minimum_length:
            unit = "character" if minimum_length == 1 else "characters"
            raise JsonSchemaValidationError(
                "%s must contain at least %d %s" % (path, minimum_length, unit)
            )
    if isinstance(value, str) and "pattern" in schema:
        if re.search(schema["pattern"], value) is None:
            raise JsonSchemaValidationError("%s has an invalid format" % path)
    if isinstance(value, str) and "format" in schema:
        _validate_format(value, schema["format"], path)
    if SCORE_SEMANTIC_KEYWORD in schema:
        _validate_semantic(schema[SCORE_SEMANTIC_KEYWORD], value, path)


def _validate_semantic(semantic, value, path):
    if semantic == SCORE_SEMANTIC_VERSION:
        _validate_score_contract(value, path)
        return
    if semantic == SPATIAL_PLACEMENT_SEMANTIC_VERSION:
        _validate_spatial_placement_contract(value, path)
        return
    raise JsonSchemaValidationError("Unsupported JSON schema semantic: %s" % semantic)


def _validate_score_contract(value, path):
    if not isinstance(value, dict):
        raise JsonSchemaValidationError("%s must be a canonical Score" % path)
    if set(value) == {"scaled"}:
        return
    if set(value) != {"scaled", "raw", "min", "max"} or any(
        not _is_safe_integer(value[field]) for field in ("raw", "min", "max")
    ):
        raise JsonSchemaValidationError("%s must be a canonical Score" % path)
    if value["min"] >= value["max"]:
        raise JsonSchemaValidationError("%s.min must be less than max" % path)
    if not value["min"] <= value["raw"] <= value["max"]:
        raise JsonSchemaValidationError("%s.raw must be within min and max" % path)


def _validate_spatial_placement_contract(value, path):
    if not isinstance(value, dict):
        raise JsonSchemaValidationError(
            "%s must be a spatial-placement contract" % path
        )

    if "interaction" in value:
        marker_ids = [marker["id"] for marker in value["interaction"]["markers"]]
        answer = value["assessment"]
        answer_ids = [
            placement["markerId"] for placement in answer["correctPlacements"]
        ]
        if len(marker_ids) != len(set(marker_ids)):
            raise JsonSchemaValidationError(
                "%s.interaction.markers must use unique marker ids" % path
            )
        if len(answer_ids) != len(set(answer_ids)):
            raise JsonSchemaValidationError(
                "%s.assessment.correctPlacements must use unique marker ids" % path
            )
        if set(marker_ids) != set(answer_ids):
            raise JsonSchemaValidationError(
                "%s assessment must cover every current marker exactly once" % path
            )
        if marker_ids and answer["imageAspectRatio"] is None:
            raise JsonSchemaValidationError(
                "%s.assessment.imageAspectRatio is required for current markers" % path
            )
        unknown_feedback = set(answer.get("feedbackByMarkerId", {})) - set(marker_ids)
        if unknown_feedback:
            raise JsonSchemaValidationError(
                "%s.assessment.feedbackByMarkerId references an unknown marker" % path
            )
        return

    if "correctPlacements" in value:
        marker_ids = [placement["markerId"] for placement in value["correctPlacements"]]
        if len(marker_ids) != len(set(marker_ids)):
            raise JsonSchemaValidationError(
                "%s.correctPlacements must use unique marker ids" % path
            )
        if marker_ids and value["imageAspectRatio"] is None:
            raise JsonSchemaValidationError(
                "%s.imageAspectRatio is required for correct placements" % path
            )
        return

    if "placements" in value:
        marker_ids = [placement["markerId"] for placement in value["placements"]]
        if len(marker_ids) != len(set(marker_ids)):
            raise JsonSchemaValidationError(
                "%s.placements must use unique marker ids" % path
            )
        return

    raise JsonSchemaValidationError("%s must be a spatial-placement contract" % path)


def _semantic_manifest(bundle):
    if SEMANTIC_MANIFEST_KEYWORD not in bundle:
        return set()
    manifest = bundle[SEMANTIC_MANIFEST_KEYWORD]
    if not isinstance(manifest, list) or not manifest:
        raise JsonSchemaValidationError(
            "JSON schema semantic manifest must be a non-empty array"
        )

    declared = set()
    for semantic in manifest:
        if (
            not isinstance(semantic, str)
            or semantic not in SUPPORTED_SEMANTICS
            or semantic in declared
        ):
            raise JsonSchemaValidationError(
                "JSON schema semantic manifest is malformed or unsupported"
            )
        declared.add(semantic)
    return declared


def _resolve_ref(root_schema, reference):
    if not reference.startswith("#/"):
        raise JsonSchemaValidationError("Unsupported schema reference: %s" % reference)

    current = root_schema
    for raw_part in reference[2:].split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        try:
            current = current[int(part)] if isinstance(current, list) else current[part]
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise JsonSchemaValidationError(
                "Unresolvable schema reference: %s" % reference,
            ) from exc
    return current


def _schema_match_score(value, schema, root_schema):
    score = 0
    if "$ref" in schema:
        score += _schema_match_score(
            value,
            _resolve_ref(root_schema, schema["$ref"]),
            root_schema,
        )
    if "const" in schema:
        score += 4 if value == schema["const"] else -4
    if "enum" in schema:
        score += 2 if value in schema["enum"] else -2
    if "type" in schema:
        score += 1 if _matches_type(value, schema["type"]) else -1
    if isinstance(value, dict):
        for property_name, property_schema in schema.get("properties", {}).items():
            if property_name in value:
                score += _schema_match_score(
                    value[property_name],
                    property_schema,
                    root_schema,
                )
    if "anyOf" in schema:
        score += max(
            (
                _schema_match_score(value, child_schema, root_schema)
                for child_schema in schema["anyOf"]
            ),
            default=0,
        )
    if "oneOf" in schema:
        score += max(
            (
                _schema_match_score(value, child_schema, root_schema)
                for child_schema in schema["oneOf"]
            ),
            default=0,
        )
    if "allOf" in schema:
        score += sum(
            _schema_match_score(value, child_schema, root_schema)
            for child_schema in schema["allOf"]
        )
    return score


def _union_discriminant_error(value, branches, root_schema, path):
    if not isinstance(value, dict):
        return None

    constraints_by_branch = [
        _collect_const_constraints(branch, root_schema) for branch in branches
    ]
    candidate_paths = []
    _collect_value_paths(value, (), candidate_paths)
    active_branches = list(range(len(branches)))
    anchor_path = None

    for candidate_path in candidate_paths:
        expected_by_branch = [
            constraints.get(candidate_path) for constraints in constraints_by_branch
        ]
        expected_values = {
            expected for expected in expected_by_branch if expected is not _MISSING
        }
        if len(expected_values) <= 1:
            continue

        actual = _value_at_path(value, candidate_path)
        candidate_label = ".".join(candidate_path)
        full_path = "%s.%s" % (path, candidate_label)
        if actual not in expected_values:
            return JsonSchemaValidationError("%s is not supported" % full_path)

        matching_branches = [
            branch_index
            for branch_index in active_branches
            if expected_by_branch[branch_index] is _MISSING
            or expected_by_branch[branch_index] == actual
        ]
        if not matching_branches:
            return JsonSchemaValidationError(
                "%s must match %s" % (full_path, ".".join(anchor_path)),
            )
        if len(matching_branches) < len(active_branches) and anchor_path is None:
            anchor_path = candidate_path
        active_branches = matching_branches

    return None


_MISSING = object()


def _collect_const_constraints(schema, root_schema, prefix=(), seen_refs=None):
    constraints = {}
    seen_refs = set() if seen_refs is None else seen_refs
    reference = schema.get("$ref")
    if reference is not None and reference not in seen_refs:
        constraints.update(
            _collect_const_constraints(
                _resolve_ref(root_schema, reference),
                root_schema,
                prefix,
                seen_refs | {reference},
            ),
        )
    if "const" in schema:
        constraints[prefix] = schema["const"]
    for property_name, property_schema in schema.get("properties", {}).items():
        constraints.update(
            _collect_const_constraints(
                property_schema,
                root_schema,
                prefix + (property_name,),
                seen_refs,
            ),
        )
    return constraints


def _collect_value_paths(value, prefix, paths):
    if not isinstance(value, dict):
        paths.append(prefix)
        return
    for property_name, property_value in value.items():
        _collect_value_paths(property_value, prefix + (property_name,), paths)


def _value_at_path(value, property_path):
    current = value
    for property_name in property_path:
        current = current[property_name]
    return current


def _validate_format(value, format_name, path):
    if format_name != "date-time":
        raise JsonSchemaValidationError(
            "Unsupported JSON Schema format: %s" % format_name,
        )

    date_time_pattern = re.compile(
        r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}"
        r"(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$",
    )
    try:
        if date_time_pattern.fullmatch(value) is None:
            raise ValueError
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise JsonSchemaValidationError("%s has an invalid format" % path) from exc


def _matches_type(value, expected_type):
    if isinstance(expected_type, list):
        return any(_matches_type(value, item) for item in expected_type)
    if expected_type == "null":
        return value is None
    if expected_type == "boolean":
        return isinstance(value, bool)
    if expected_type == "object":
        return isinstance(value, dict)
    if expected_type == "array":
        return isinstance(value, list)
    if expected_type == "string":
        return isinstance(value, str)
    if expected_type == "integer":
        return _is_integer(value)
    if expected_type == "number":
        return _is_number(value)
    return False


def _type_description(expected_type):
    if isinstance(expected_type, list):
        return " or ".join(_type_description(item) for item in expected_type)
    return {
        "array": "a JSON array",
        "boolean": "a boolean",
        "integer": "an integer",
        "null": "null",
        "number": "a number",
        "object": "a JSON object",
        "string": "a string",
    }.get(expected_type, expected_type)


def _is_number(value):
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    return isinstance(value, float) and math.isfinite(value)


def _is_integer(value):
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        or isinstance(value, float)
        and math.isfinite(value)
        and value.is_integer()
    )


def _is_safe_integer(value):
    return _is_integer(value) and MIN_SAFE_INTEGER <= value <= MAX_SAFE_INTEGER


def _items_are_unique(items):
    return _first_duplicate_index(items) == -1


def _first_duplicate_index(items):
    for index, item in enumerate(items):
        if item in items[:index]:
            return index
    return -1

import json
import math
import re
from datetime import datetime
from urllib.parse import urlsplit


MAX_LEARNING_EVENT_BYTES = 65536

_EVENT_FIELDS = {"id", "timestamp", "verb", "object", "result", "context"}
_INTERACTION_TYPES = {
    "true-false",
    "choice",
    "fill-in",
    "long-fill-in",
    "matching",
    "performance",
    "sequencing",
    "likert",
    "numeric",
    "other",
}
_GRANDFATHERED_LANGUAGE_TAGS = {
    "art-lojban",
    "cel-gaulish",
    "en-gb-oed",
    "i-ami",
    "i-bnn",
    "i-default",
    "i-enochian",
    "i-hak",
    "i-klingon",
    "i-lux",
    "i-mingo",
    "i-navajo",
    "i-pwn",
    "i-tao",
    "i-tsu",
    "no-bok",
    "no-nyn",
    "sgn-be-fr",
    "sgn-be-nl",
    "sgn-ch-de",
    "zh-guoyu",
    "zh-hakka",
    "zh-min",
    "zh-min-nan",
    "zh-xiang",
}

_IRI_SCHEME = re.compile(r"^[A-Za-z][A-Za-z\d+.-]*:")
_UUID_V4 = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_UTC_TIMESTAMP = re.compile(
    r"^(?!0000)(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d{3,}Z$"
)
_DURATION = re.compile(
    r"^P(?=\d|T\d)(?:\d+Y)?(?:\d+M)?(?:\d+D)?"
    r"(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$"
)
_PRIVATE_USE_LANGUAGE_TAG = re.compile(
    r"^x(?:-[A-Za-z\d]{1,8})+$",
    re.IGNORECASE,
)
_LANGUAGE_TAG = re.compile(
    r"^(?:"
    r"(?:[A-Za-z]{2,3}(?:-[A-Za-z]{3}){0,3}|[A-Za-z]{4}|[A-Za-z]{5,8})"
    r"(?:-[A-Za-z]{4})?"
    r"(?:-(?:[A-Za-z]{2}|\d{3}))?"
    r"(?:-(?:[A-Za-z\d]{5,8}|\d[A-Za-z\d]{3}))*"
    r"(?:-[0-9A-WY-Za-wy-z](?:-[A-Za-z\d]{2,8})+)*"
    r"(?:-x(?:-[A-Za-z\d]{1,8})+)?"
    r")$"
)


class LearningEventValidationError(ValueError):
    """Safe rejection for an untrusted Learning Event."""


def validate_learning_event_request(request):
    """Validates the transport request and returns its canonical event."""
    if type(request) is not dict or set(request) != {"event"}:
        _reject("Learning Event request is invalid")
    return validate_learning_event(request["event"])


def validate_learning_event(event):
    """Validates and returns an owned canonical actorless Learning Event."""
    _require_object(event, _EVENT_FIELDS, {"id", "timestamp", "verb", "object"})

    try:
        encoded = json.dumps(
            event,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
    except (TypeError, ValueError, RecursionError) as exc:
        raise LearningEventValidationError(
            "Learning Event must contain JSON values"
        ) from exc
    if len(encoded) > MAX_LEARNING_EVENT_BYTES:
        _reject("Learning Event exceeds the maximum accepted size")

    owned_event = json.loads(encoded.decode("utf-8"))
    _validate_uuid(owned_event["id"])
    _validate_timestamp(owned_event["timestamp"])
    _validate_verb(owned_event["verb"])
    _validate_activity(owned_event["object"])
    if "result" in owned_event:
        _validate_result(owned_event["result"])
    if "context" in owned_event:
        _validate_context(owned_event["context"])
    return owned_event


def _validate_verb(value):
    _require_object(value, {"id", "display"}, {"id", "display"})
    _validate_iri(value["id"])
    _validate_language_map(value["display"])


def _validate_activity(value):
    _require_object(
        value,
        {"objectType", "id", "definition"},
        {"objectType", "id"},
    )
    if value["objectType"] != "Activity":
        _reject("Learning Event Activity is invalid")
    _validate_iri(value["id"])
    if "definition" in value:
        _validate_definition(value["definition"])


def _validate_definition(value):
    _require_non_empty_object(
        value,
        {
            "name",
            "description",
            "type",
            "interactionType",
            "choices",
            "source",
            "target",
            "extensions",
        },
    )
    for field in ("name", "description"):
        if field in value:
            _validate_language_map(value[field])
    if "type" in value:
        _validate_iri(value["type"])
    if (
        "interactionType" in value
        and value["interactionType"] not in _INTERACTION_TYPES
    ):
        _reject("Learning Event interaction type is invalid")
    for field in ("choices", "source", "target"):
        if field in value:
            _validate_components(value[field])
    if "extensions" in value:
        _validate_extensions(value["extensions"])


def _validate_components(value):
    if type(value) is not list:
        _reject("Learning Event interaction components are invalid")
    for component in value:
        _require_object(component, {"id", "description"}, {"id"})
        if type(component["id"]) is not str:
            _reject("Learning Event interaction component is invalid")
        if "description" in component:
            _validate_language_map(component["description"])


def _validate_result(value):
    _require_non_empty_object(
        value,
        {"score", "success", "completion", "response", "duration", "extensions"},
    )
    if "score" in value:
        _validate_score(value["score"])
    for field in ("success", "completion"):
        if field in value and type(value[field]) is not bool:
            _reject("Learning Event result is invalid")
    if "response" in value and type(value["response"]) is not str:
        _reject("Learning Event result is invalid")
    if "duration" in value:
        if type(value["duration"]) is not str or not _DURATION.fullmatch(
            value["duration"]
        ):
            _reject("Learning Event duration is invalid")
    if "extensions" in value:
        _validate_extensions(value["extensions"])


def _validate_score(value):
    _require_non_empty_object(value, {"scaled", "raw", "min", "max"})
    for field in ("scaled", "raw", "min", "max"):
        if field in value and not _is_finite_number(value[field]):
            _reject("Learning Event score is invalid")
    if "scaled" in value and not -1 <= value["scaled"] <= 1:
        _reject("Learning Event scaled score is invalid")
    if "min" in value and "max" in value and value["min"] >= value["max"]:
        _reject("Learning Event score range is invalid")
    if "raw" in value and "min" in value and value["raw"] < value["min"]:
        _reject("Learning Event raw score is invalid")
    if "raw" in value and "max" in value and value["raw"] > value["max"]:
        _reject("Learning Event raw score is invalid")


def _validate_context(value):
    _require_non_empty_object(value, {"contextActivities", "extensions"})
    if "contextActivities" in value:
        activities = value["contextActivities"]
        _require_non_empty_object(
            activities,
            {"parent", "grouping", "category", "other"},
        )
        for field in ("parent", "grouping", "category", "other"):
            if field not in activities:
                continue
            if type(activities[field]) is not list or not activities[field]:
                _reject("Learning Event context Activities are invalid")
            for activity in activities[field]:
                _validate_activity(activity)
    if "extensions" in value:
        _validate_extensions(value["extensions"])


def _validate_language_map(value):
    if type(value) is not dict or not value:
        _reject("Learning Event language map is invalid")
    for language, text in value.items():
        if (
            type(language) is not str
            or not _is_language_tag(language)
            or type(text) is not str
            or not text.strip()
        ):
            _reject("Learning Event language map is invalid")


def _is_language_tag(value):
    if not value or value != value.strip():
        return False
    return (
        value.lower() in _GRANDFATHERED_LANGUAGE_TAGS
        or _PRIVATE_USE_LANGUAGE_TAG.fullmatch(value) is not None
        or _LANGUAGE_TAG.fullmatch(value) is not None
    )


def _validate_extensions(value):
    if type(value) is not dict or not value:
        _reject("Learning Event extensions are invalid")
    for key, extension_value in value.items():
        _validate_iri(key)
        _validate_json_value(extension_value)


def _validate_json_value(value):
    if value is None or type(value) in (bool, str):
        return
    if _is_finite_number(value):
        return
    if type(value) is list:
        for child in value:
            _validate_json_value(child)
        return
    if type(value) is dict and value:
        for key, child in value.items():
            if type(key) is not str:
                _reject("Learning Event JSON value is invalid")
            _validate_json_value(child)
        return
    _reject("Learning Event JSON value is invalid")


def _validate_iri(value):
    if (
        type(value) is not str
        or value != value.strip()
        or any(character.isspace() for character in value)
        or _IRI_SCHEME.match(value) is None
    ):
        _reject("Learning Event IRI is invalid")
    try:
        parsed = urlsplit(value)
    except ValueError:
        _reject("Learning Event IRI is invalid")
    if not parsed.scheme or len(value) <= len(parsed.scheme) + 1:
        _reject("Learning Event IRI is invalid")
    if parsed.scheme.lower() in {"http", "https"} and not parsed.netloc:
        _reject("Learning Event IRI is invalid")


def _validate_uuid(value):
    if type(value) is not str or _UUID_V4.fullmatch(value) is None:
        _reject("Learning Event id is invalid")


def _validate_timestamp(value):
    if type(value) is not str:
        _reject("Learning Event timestamp is invalid")
    match = _UTC_TIMESTAMP.fullmatch(value)
    if match is None:
        _reject("Learning Event timestamp is invalid")
    year, month, day, hour, minute, second = map(int, match.groups())
    try:
        datetime(year, month, day, hour, minute, second)
    except ValueError:
        _reject("Learning Event timestamp is invalid")


def _is_finite_number(value):
    return type(value) in (int, float) and math.isfinite(value)


def _require_object(value, allowed_fields, required_fields):
    if type(value) is not dict:
        _reject("Learning Event contains an invalid object")
    keys = set(value)
    if not keys.issubset(allowed_fields) or not required_fields.issubset(keys):
        _reject("Learning Event contains unsupported or missing fields")


def _require_non_empty_object(value, allowed_fields):
    _require_object(value, allowed_fields, set())
    if not value:
        _reject("Learning Event contains an empty object")


def _reject(message):
    raise LearningEventValidationError(message)

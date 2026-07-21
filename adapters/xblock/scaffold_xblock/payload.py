import json


SAVE_PAYLOAD_MAX_BYTES = {
    "artifact": 2 * 1024 * 1024,
    "learnerContent": 2 * 1024 * 1024,
    "assessmentTargets": 1 * 1024 * 1024,
    "assessmentGroups": 512 * 1024,
}


def json_payload_byte_length(value):
    return len(json.dumps(value, separators=(",", ":")).encode("utf-8"))


def validate_save_payload_size(name, value):
    limit = SAVE_PAYLOAD_MAX_BYTES[name]
    size = json_payload_byte_length(value)
    if size > limit:
        raise ValueError("%s is too large to save" % name)

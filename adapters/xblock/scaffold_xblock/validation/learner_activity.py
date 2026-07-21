from .json_schema import load_schema_bundle, validate_schema_definition


def load_learner_activity_schema():
    return load_schema_bundle("learner-activity.schema.json")


def validate_learner_activity_definition(definition_name, value, path="$"):
    return validate_schema_definition(
        load_learner_activity_schema(),
        definition_name,
        value,
        path,
        definition_kind="learner activity",
    )

SCAFFOLD_DOCUMENT_FORMAT_VERSION = 4


def classify_artifact_access(artifact):
    metadata = {
        "id": artifact.get("id", "") if isinstance(artifact.get("id"), str) else "",
        "title": (
            artifact.get("title", "")
            if isinstance(artifact.get("title"), str)
            else ""
        ),
        "mode": artifact.get("mode", "") if isinstance(artifact.get("mode"), str) else "",
    }
    content = artifact.get("content")
    if content is None:
        return {"status": "supported", "artifact": metadata}
    if not isinstance(content, dict) or content.get("type") != "doc":
        return {"status": "invalid", "artifact": metadata}

    children = content.get("content")
    if not isinstance(children, list) or len(children) != 1:
        return {"status": "invalid", "artifact": metadata}
    course_document = children[0]
    if not isinstance(course_document, dict):
        return {"status": "invalid", "artifact": metadata}
    if course_document.get("type") != "courseDocument":
        return {"status": "invalid", "artifact": metadata}
    attrs = course_document.get("attrs")
    if not isinstance(attrs, dict):
        return {"status": "invalid", "artifact": metadata}

    version = attrs.get("schemaVersion")
    if type(version) is not int or version < 1:  # bool is an int subclass.
        return {"status": "invalid", "artifact": metadata}
    if version > SCAFFOLD_DOCUMENT_FORMAT_VERSION:
        return {
            "status": "unsupported-core-format",
            "artifact": metadata,
            "documentVersion": version,
            "supportedVersion": SCAFFOLD_DOCUMENT_FORMAT_VERSION,
        }
    if version < SCAFFOLD_DOCUMENT_FORMAT_VERSION:
        return {"status": "supported", "artifact": metadata}

    requirement = attrs.get("requiresScaffoldPlus")
    if not isinstance(requirement, bool):
        return {"status": "invalid", "artifact": metadata}
    if attrs.get("mode") != artifact.get("mode"):
        return {"status": "invalid", "artifact": metadata}
    return {
        "status": (
            "requires-scaffold-plus" if requirement else "supported"
        ),
        "artifact": metadata,
    }


def learner_publication_for_artifact_refusal(access):
    status = access.get("status")
    if status == "requires-scaffold-plus":
        return {"status": status}
    if status == "unsupported-core-format":
        return {
            "status": status,
            "documentVersion": access["documentVersion"],
            "supportedVersion": access["supportedVersion"],
            "message": "This course was created by a newer version of Scaffold.",
        }
    return {
        "status": "invalid",
        "issues": [
            {
                "code": "invalid_document",
                "message": "The Scaffold document is invalid.",
                "path": [],
            },
        ],
    }

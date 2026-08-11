from importlib.resources import files
from pathlib import PurePosixPath

from .media_store import resolved_media_urls_for_content
from .state import PublicationStorageValidationError
from .validation.course_requirement import (
    classify_artifact_access,
    learner_publication_for_artifact_refusal,
)


SCAFFOLD_XBLOCK_PROTOCOL_VERSION = 1
SCAFFOLD_MEDIA_CONTEXTS = {"authoring", "preview", "runtime"}


def resource_string(path):
    return files(__package__).joinpath(*PurePosixPath(path).parts).read_text(encoding="utf8")


def media_context(view_name, context=None):
    if isinstance(context, dict):
        requested = context.get("mediaContext")
        if requested in SCAFFOLD_MEDIA_CONTEXTS:
            return requested

    if view_name == "studio":
        return "authoring"

    if isinstance(context, dict) and context.get("preview") is True:
        return "preview"

    return "runtime"


def add_scaffold_view_resources(block, fragment, view_name, context=None):
    outer_url = block.runtime.local_resource_url(
        block,
        "public/%s-ui.js" % view_name,
    )
    inner_url = block.runtime.local_resource_url(
        block,
        "public/%s-inner.html" % view_name,
    )
    bootstrap_js = resource_string("static/%s.js" % view_name)
    initializer = (
        "ScaffoldStudioView" if view_name == "studio" else "ScaffoldStudentView"
    )
    if view_name == "studio":
        fragment.add_css(resource_string("static/studio-host.css"))
        return _add_studio_resources(
            block,
            fragment,
            bootstrap_js,
            initializer,
            outer_url,
            inner_url,
            context,
        )

    return _add_student_resources(
        block,
        fragment,
        bootstrap_js,
        initializer,
        outer_url,
        inner_url,
        context,
    )


def _base_payload(outer_url, inner_url, view_name, artifact_access, context):
    return {
        "outerUrl": outer_url,
        "innerUrl": inner_url,
        "view": view_name,
        "protocolVersion": SCAFFOLD_XBLOCK_PROTOCOL_VERSION,
        "artifactAccess": artifact_access,
        "mediaContext": media_context(view_name, context),
    }


def _add_studio_resources(
    block,
    fragment,
    bootstrap_js,
    initializer,
    outer_url,
    inner_url,
    context,
):
    artifact = block._artifact()
    artifact_access = classify_artifact_access(artifact)
    supported = artifact_access["status"] == "supported"
    payload = {
        **_base_payload(
            outer_url,
            inner_url,
            "studio",
            artifact_access,
            context,
        ),
        "artifact": artifact if supported else None,
        "resolvedMedia": (
            resolved_media_urls_for_content(
                artifact.get("content"),
                block._course_key,
            )
            if supported
            else {}
        ),
        "publicationStatus": block._publication_status(),
    }
    return _initialize_fragment(fragment, bootstrap_js, initializer, payload)


def _add_student_resources(
    block,
    fragment,
    bootstrap_js,
    initializer,
    outer_url,
    inner_url,
    context,
):
    try:
        publication = block._learner_publication()
    except PublicationStorageValidationError:
        publication = None
        artifact_access = _neutral_artifact_access(block, "invalid")
        learner_publication = learner_publication_for_artifact_refusal(
            artifact_access,
        )
    else:
        if publication is None:
            artifact_access = _neutral_artifact_access(block, "not-published")
            learner_publication = {"status": "not-published"}
        else:
            published_artifact = {
                "id": publication["artifact"]["id"],
                "title": publication["artifact"]["title"],
                "mode": publication["artifact"]["mode"],
                "content": publication["learnerContent"],
            }
            artifact_access = classify_artifact_access(published_artifact)
            if (
                publication["artifact"]["requiresScaffoldPlus"]
                and artifact_access["status"] == "supported"
            ):
                artifact_access = {
                    "status": "requires-scaffold-plus",
                    "artifact": artifact_access["artifact"],
                }
            learner_publication = (
                {
                    "status": "supported",
                    "learnerContent": publication["learnerContent"],
                }
                if artifact_access["status"] == "supported"
                else learner_publication_for_artifact_refusal(artifact_access)
            )

    supported = learner_publication["status"] == "supported"
    learner_content = (
        publication["learnerContent"] if supported and publication is not None else None
    )
    browser_artifact = (
        {
            "id": publication["artifact"]["id"],
            "title": publication["artifact"]["title"],
            "mode": publication["artifact"]["mode"],
            "content": None,
        }
        if supported and publication is not None
        else None
    )

    payload = {
        **_base_payload(
            outer_url,
            inner_url,
            "student",
            artifact_access,
            context,
        ),
        "artifact": browser_artifact,
        "learnerPublication": learner_publication,
        "resolvedMedia": (
            resolved_media_urls_for_content(
                learner_content,
                block._course_key,
            )
            if supported
            else {}
        ),
    }
    if supported:
        payload.update(
            {
                "assessmentSnapshot": block._public_assessment_snapshot(),
                "learnerActivitySnapshot": block._learner_activity_snapshot(),
            },
        )
    return _initialize_fragment(fragment, bootstrap_js, initializer, payload)


def _neutral_artifact_access(block, status):
    return {
        "status": status,
        "artifact": {
            "id": block._artifact_id(),
            "title": "Scaffold",
            "mode": "page",
        },
    }


def _initialize_fragment(fragment, bootstrap_js, initializer, payload):
    fragment.add_javascript(bootstrap_js)
    fragment.initialize_js(initializer, payload)
    return fragment

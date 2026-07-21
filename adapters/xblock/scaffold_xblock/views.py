import pkg_resources

from .media_store import resolved_media_urls_for_content


SCAFFOLD_XBLOCK_PROTOCOL_VERSION = 1
SCAFFOLD_MEDIA_CONTEXTS = {"authoring", "preview", "runtime"}


def resource_string(path):
    data = pkg_resources.resource_string(__package__, path)
    return data.decode("utf8")


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
    artifact = block._artifact()
    artifact["content"] = (
        artifact.get("content")
        if view_name == "studio"
        else block._learner_content()
    )

    if view_name == "studio":
        fragment.add_css(resource_string("static/studio-host.css"))

    payload = {
        "outerUrl": outer_url,
        "innerUrl": inner_url,
        "view": view_name,
        "protocolVersion": SCAFFOLD_XBLOCK_PROTOCOL_VERSION,
        "artifact": artifact,
        "mediaContext": media_context(view_name, context),
        "resolvedMedia": resolved_media_urls_for_content(
            artifact.get("content"),
            block._course_key,
        ),
    }
    if view_name == "student":
        payload.update(
            {
                "assessmentSnapshot": block._public_assessment_snapshot(),
                "learnerActivitySnapshot": block._learner_activity_snapshot(),
            },
        )

    fragment.add_javascript(bootstrap_js)
    fragment.initialize_js(initializer, payload)

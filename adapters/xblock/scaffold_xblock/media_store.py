import logging

from .errors import error_response, unexpected_error_response
from .media import (
    KIND_TO_TYPES,
    MEDIA_UPLOAD_TYPES,
    decode_data_url,
    infer_media_upload_type,
    media_content_type,
    safe_filename,
    validate_media_upload,
)

try:
    from openedx.core.djangoapps.contentserver.caching import del_cached_content
    from xmodule.contentstore.content import StaticContent
    from xmodule.contentstore.django import contentstore

    HAS_STATIC_CONTENT = True
except ImportError:
    HAS_STATIC_CONTENT = False

    def del_cached_content(location):
        return None

    StaticContent = None
    contentstore = None


log = logging.getLogger(__name__)


def static_content_available():
    return HAS_STATIC_CONTENT


def course_key(runtime, location, scope_ids):
    course_id = getattr(runtime, "course_id", None)
    if course_id is not None:
        return course_id

    course_key_value = getattr(location, "course_key", None)
    if course_key_value is not None:
        return course_key_value

    usage_id = getattr(scope_ids, "usage_id", None)
    course_key_value = getattr(usage_id, "course_key", None)
    if course_key_value is not None:
        return course_key_value

    raise ValueError("course key is unavailable")


def asset_url(course_key_value, asset_key):
    portable_url = StaticContent.get_static_path_from_location(asset_key)
    return StaticContent.get_canonicalized_asset_path(
        course_key_value,
        portable_url,
        "",
        [],
    )


def asset_key_from_media_id(course_key_value, media_id):
    return StaticContent.get_asset_key_from_path(course_key_value, media_id)


def media_ids_from_content(value):
    media_ids = set()

    def walk(node):
        if isinstance(node, dict):
            media_id = node.get("mediaId")
            if isinstance(media_id, str) and media_id:
                media_ids.add(media_id)

            for child in node.values():
                walk(child)
            return

        if isinstance(node, list):
            for child in node:
                walk(child)

    walk(value)
    return sorted(media_ids)


def resolved_media_urls_for_content(content, course_key_resolver):
    media_ids = media_ids_from_content(content)
    if not media_ids or not HAS_STATIC_CONTENT:
        return {}

    return resolved_media_urls(media_ids, course_key_resolver())


def resolved_media_urls(media_ids, course_key_value):
    if not HAS_STATIC_CONTENT:
        return {}

    urls = {}
    for media_id in media_ids:
        try:
            asset_key = asset_key_from_media_id(course_key_value, media_id)
            contentstore().find(asset_key)
            url = asset_url(course_key_value, asset_key)
            urls[media_id] = url
            urls[str(asset_key)] = url
        except Exception as exc:  # pylint: disable=broad-except
            log.warning(
                "could not pre-resolve Scaffold media %s: %s",
                media_id,
                exc,
            )

    return urls


def resolve_media(data, course_key_value):
    if not HAS_STATIC_CONTENT:
        return error_response("Open edX contentstore is unavailable")

    media_id = data.get("mediaId") if isinstance(data, dict) else None
    if not isinstance(media_id, str) or not media_id:
        return error_response("mediaId is required")

    try:
        asset_key = asset_key_from_media_id(course_key_value, media_id)
        contentstore().find(asset_key)
        return {
            "success": True,
            "mediaId": str(asset_key),
            "url": asset_url(course_key_value, asset_key),
        }
    except Exception:  # pylint: disable=broad-except
        return unexpected_error_response(
            log,
            "resolve_media",
            "media could not be resolved",
        )


def upload_media(data, course_key_value):
    if not HAS_STATIC_CONTENT:
        return error_response("Open edX contentstore is unavailable")

    if not isinstance(data, dict):
        return error_response("request body must be an object")

    media_type = data.get("mediaType")
    if media_type not in MEDIA_UPLOAD_TYPES:
        return error_response("mediaType is not supported")

    filename = safe_filename(data.get("filename"))
    content_type = media_content_type(filename, data.get("contentType"))

    try:
        payload = decode_data_url(data.get("dataUrl"))
        validate_media_upload(media_type, filename, content_type, payload)
    except ValueError as exc:
        return error_response(str(exc))

    try:
        content_location = StaticContent.compute_location(course_key_value, filename)
        content = StaticContent(
            content_location,
            filename,
            content_type,
            payload,
            length=str(len(payload)),
        )

        try:
            thumbnail_content, thumbnail_location = contentstore().generate_thumbnail(
                content,
            )
            if thumbnail_content is not None:
                content.thumbnail_location = thumbnail_location
        except Exception:  # pylint: disable=broad-except
            log.exception("thumbnail generation failed for %s", filename)

        contentstore().save(content)
        del_cached_content(content.location)

        return {
            "success": True,
            "mediaId": str(content.location),
            "url": asset_url(course_key_value, content.location),
        }
    except Exception:  # pylint: disable=broad-except
        return unexpected_error_response(
            log,
            "upload_media",
            "media upload failed",
        )


def list_media(data, course_key_value):
    if not HAS_STATIC_CONTENT:
        return error_response("Open edX contentstore is unavailable")

    if not isinstance(data, dict):
        data = {}

    kind = data.get("kind")
    kind_filter = KIND_TO_TYPES.get(kind) if isinstance(kind, str) else None
    media_type_filter = data.get("mediaType")
    if media_type_filter is not None and media_type_filter not in MEDIA_UPLOAD_TYPES:
        return error_response("mediaType is not supported")

    try:
        assets, _count = contentstore().get_all_content_for_course(course_key_value)
    except Exception:  # pylint: disable=broad-except
        return unexpected_error_response(
            log,
            "list_media",
            "media could not be listed",
        )

    items = []
    for asset in assets:
        item = _media_item_from_asset(
            asset,
            course_key_value,
            media_type_filter,
            kind_filter,
        )
        if item is not None:
            items.append(item)

    items.sort(key=lambda entry: entry.get("createdAt") or "", reverse=True)
    return {"success": True, "items": items}


def _media_item_from_asset(asset, course_key_value, media_type_filter, kind_filter):
    filename = asset.get("displayname") or asset.get("filename") or ""
    content_type = asset.get("contentType") or ""
    inferred = infer_media_upload_type(filename, content_type)

    if media_type_filter is not None and inferred != media_type_filter:
        return None
    if kind_filter is not None and inferred not in kind_filter:
        return None

    asset_id = asset.get("asset_key") or asset.get("_id")
    if asset_id is None:
        return None
    asset_id_str = str(asset_id)

    try:
        resolved_asset_key = (
            asset_id
            if not isinstance(asset_id, str)
            else StaticContent.get_asset_key_from_path(course_key_value, asset_id_str)
        )
        resolved_asset_url = asset_url(course_key_value, resolved_asset_key)
    except Exception:  # pylint: disable=broad-except
        return None

    uploaded_at = asset.get("uploadDate")
    uploaded_at_iso = (
        uploaded_at.isoformat()
        if uploaded_at is not None and hasattr(uploaded_at, "isoformat")
        else None
    )

    item = {
        "id": asset_id_str,
        "url": resolved_asset_url,
        "mediaType": inferred,
        "fileName": filename,
        "mimeType": content_type,
        "size": int(asset.get("length") or asset.get("size") or 0),
    }
    if uploaded_at_iso is not None:
        item["createdAt"] = uploaded_at_iso

    thumbnail_location = asset.get("thumbnail_location")
    if thumbnail_location:
        try:
            item["thumbnailUrl"] = asset_url(course_key_value, thumbnail_location)
        except Exception:  # pylint: disable=broad-except
            pass

    return item

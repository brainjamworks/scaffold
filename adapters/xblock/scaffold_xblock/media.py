import base64
import mimetypes
import os
import uuid


MEDIA_UPLOAD_TYPES = {
    "image",
    "audio",
    "video",
    "pdf",
    "document",
    "spreadsheet",
    "presentation",
    "archive",
    "text",
    "other",
}

MEDIA_UPLOAD_MAX_BYTES = {
    "image": 10 * 1024 * 1024,
    "audio": 50 * 1024 * 1024,
    "video": 250 * 1024 * 1024,
    "pdf": 25 * 1024 * 1024,
    "document": 25 * 1024 * 1024,
    "spreadsheet": 25 * 1024 * 1024,
    "presentation": 25 * 1024 * 1024,
    "archive": 50 * 1024 * 1024,
    "text": 2 * 1024 * 1024,
    "other": 10 * 1024 * 1024,
}

WORD_MIME_TYPES = {
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.oasis.opendocument.text",
    "application/rtf",
}
SPREADSHEET_MIME_TYPES = {
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.oasis.opendocument.spreadsheet",
    "text/csv",
}
PRESENTATION_MIME_TYPES = {
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.oasis.opendocument.presentation",
}
ARCHIVE_MIME_TYPES = {
    "application/zip",
    "application/x-zip-compressed",
    "application/x-7z-compressed",
    "application/x-rar-compressed",
    "application/gzip",
    "application/x-tar",
}
WORD_EXTENSIONS = {"doc", "docx", "odt", "rtf"}
SPREADSHEET_EXTENSIONS = {"csv", "ods", "xls", "xlsx"}
PRESENTATION_EXTENSIONS = {"odp", "ppt", "pptx"}
ARCHIVE_EXTENSIONS = {"7z", "gz", "rar", "tar", "tgz", "zip"}
TEXT_EXTENSIONS = {"md", "txt"}

IMAGE_MIME_TYPES = {
    "image/avif",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/webp",
}
AUDIO_MIME_TYPES = {
    "audio/aac",
    "audio/flac",
    "audio/m4a",
    "audio/mp3",
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/x-m4a",
    "audio/x-wav",
}
VIDEO_MIME_TYPES = {
    "video/mp4",
    "video/ogg",
    "video/quicktime",
    "video/webm",
}
MEDIA_MIME_TYPES = {
    "image": IMAGE_MIME_TYPES,
    "audio": AUDIO_MIME_TYPES,
    "video": VIDEO_MIME_TYPES,
    "pdf": {"application/pdf"},
    "document": WORD_MIME_TYPES,
    "spreadsheet": SPREADSHEET_MIME_TYPES,
    "presentation": PRESENTATION_MIME_TYPES,
    "archive": ARCHIVE_MIME_TYPES,
    "text": {"text/markdown", "text/plain"},
    "other": set(),
}
MEDIA_EXTENSIONS = {
    "image": {"avif", "gif", "jpeg", "jpg", "png", "webp"},
    "audio": {"aac", "flac", "m4a", "mp3", "ogg", "wav", "weba"},
    "video": {"mov", "mp4", "ogv", "webm"},
    "pdf": {"pdf"},
    "document": WORD_EXTENSIONS,
    "spreadsheet": SPREADSHEET_EXTENSIONS,
    "presentation": PRESENTATION_EXTENSIONS,
    "archive": ARCHIVE_EXTENSIONS,
    "text": TEXT_EXTENSIONS,
    "other": set(),
}

KIND_TO_TYPES = {
    "media": {"image", "audio", "video"},
    "documents": {
        "pdf",
        "document",
        "spreadsheet",
        "presentation",
        "archive",
        "text",
        "other",
    },
}


def decode_data_url(data_url):
    if not isinstance(data_url, str):
        raise ValueError("dataUrl must be a string")

    if "," not in data_url:
        raise ValueError("dataUrl must be a data URL")

    header, encoded = data_url.split(",", 1)
    if ";base64" not in header:
        raise ValueError("dataUrl must be base64 encoded")

    try:
        return base64.b64decode(encoded, validate=True)
    except (TypeError, ValueError) as exc:
        raise ValueError("dataUrl is not valid base64") from exc


def safe_filename(filename):
    if not isinstance(filename, str) or not filename.strip():
        filename = "scaffold-media"

    basename = os.path.basename(filename.strip()).replace("\\", "_")
    if not basename:
        basename = "scaffold-media"

    return "scaffold-%s-%s" % (uuid.uuid4().hex, basename)


def media_content_type(filename, content_type):
    if isinstance(content_type, str) and content_type:
        return content_type

    guessed, _encoding = mimetypes.guess_type(filename)
    return guessed or "application/octet-stream"


def extension_for_filename(filename):
    if not isinstance(filename, str):
        return ""
    dot = filename.rfind(".")
    if dot < 0 or dot >= len(filename) - 1:
        return ""
    return filename[dot + 1:].lower()


def infer_media_upload_type(filename, content_type):
    """Mirror the TS inferMediaUploadType so listing classifies consistently."""
    mime = (content_type or "").lower()
    extension = extension_for_filename(filename)

    if mime.startswith("image/"):
        return "image"
    if mime.startswith("audio/"):
        return "audio"
    if mime.startswith("video/"):
        return "video"
    if mime == "application/pdf" or extension == "pdf":
        return "pdf"
    if mime in WORD_MIME_TYPES or extension in WORD_EXTENSIONS:
        return "document"
    if mime in SPREADSHEET_MIME_TYPES or extension in SPREADSHEET_EXTENSIONS:
        return "spreadsheet"
    if mime in PRESENTATION_MIME_TYPES or extension in PRESENTATION_EXTENSIONS:
        return "presentation"
    if mime in ARCHIVE_MIME_TYPES or extension in ARCHIVE_EXTENSIONS:
        return "archive"
    if mime.startswith("text/") or extension in TEXT_EXTENSIONS:
        return "text"
    return "other"


def validate_media_upload(media_type, filename, content_type, payload):
    if media_type not in MEDIA_UPLOAD_TYPES or media_type == "other":
        raise ValueError("mediaType is not supported")

    size_limit = MEDIA_UPLOAD_MAX_BYTES[media_type]
    if len(payload) > size_limit:
        raise ValueError(
            "%s upload exceeds the %d MB limit"
            % (media_type, size_limit // 1024 // 1024),
        )

    mime = (content_type or "").lower()
    extension = extension_for_filename(filename)
    plain_text_csv = (
        media_type == "spreadsheet" and extension == "csv" and mime == "text/plain"
    )
    mime_allowed = bool(mime) and (
        mime in MEDIA_MIME_TYPES[media_type] or plain_text_csv
    )
    extension_allowed = bool(extension) and extension in MEDIA_EXTENSIONS[media_type]
    generic_mime = mime == "application/octet-stream"
    inferred = infer_media_upload_type(filename, mime)

    if inferred != media_type:
        raise ValueError("file does not match the requested mediaType")
    if extension and not extension_allowed:
        raise ValueError("file is not an allowed %s upload" % media_type)
    if mime and not generic_mime and not mime_allowed:
        raise ValueError("file is not an allowed %s upload" % media_type)
    if not mime_allowed and not extension_allowed:
        raise ValueError("file is not an allowed %s upload" % media_type)

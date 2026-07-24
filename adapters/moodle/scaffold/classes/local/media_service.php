<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Scaffold is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

namespace mod_scaffold\local;


/**
 * Manages media owned by Scaffold activities.
 *
 * Stores, lists, and resolves files through the Moodle File API.
 *
 * @package    mod_scaffold
 * @copyright  2026 Rizvan Ali
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class media_service {
    /**
     * MEDIA UPLOAD TYPES.
     */
    private const MEDIA_UPLOAD_TYPES = [
        'image',
        'audio',
        'video',
        'pdf',
        'document',
        'spreadsheet',
        'presentation',
        'archive',
        'text',
        'other',
    ];
    /**
     * MEDIA UPLOAD MAX BYTES.
     */
    private const MEDIA_UPLOAD_MAX_BYTES = [
        'image' => 10485760,
        'audio' => 52428800,
        'video' => 262144000,
        'pdf' => 26214400,
        'document' => 26214400,
        'spreadsheet' => 26214400,
        'presentation' => 26214400,
        'archive' => 52428800,
        'text' => 2097152,
        'other' => 10485760,
    ];
    /**
     * MEDIA KIND GROUPS.
     */
    private const MEDIA_KIND_GROUPS = [
        'media' => ['image', 'audio', 'video'],
        'documents' => [
            'pdf',
            'document',
            'spreadsheet',
            'presentation',
            'archive',
            'text',
            'other',
        ],
    ];
    /**
     * WORD MIME TYPES.
     */
    private const WORD_MIME_TYPES = [
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.oasis.opendocument.text',
        'application/rtf',
    ];
    /**
     * SPREADSHEET MIME TYPES.
     */
    private const SPREADSHEET_MIME_TYPES = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.oasis.opendocument.spreadsheet',
        'text/csv',
    ];
    /**
     * PRESENTATION MIME TYPES.
     */
    private const PRESENTATION_MIME_TYPES = [
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.oasis.opendocument.presentation',
    ];
    /**
     * ARCHIVE MIME TYPES.
     */
    private const ARCHIVE_MIME_TYPES = [
        'application/zip',
        'application/x-zip-compressed',
        'application/x-7z-compressed',
        'application/x-rar-compressed',
        'application/gzip',
        'application/x-tar',
    ];
    /**
     * WORD EXTENSIONS.
     */
    private const WORD_EXTENSIONS = ['doc', 'docx', 'odt', 'rtf'];
    /**
     * SPREADSHEET EXTENSIONS.
     */
    private const SPREADSHEET_EXTENSIONS = ['csv', 'ods', 'xls', 'xlsx'];
    /**
     * PRESENTATION EXTENSIONS.
     */
    private const PRESENTATION_EXTENSIONS = ['odp', 'ppt', 'pptx'];
    /**
     * ARCHIVE EXTENSIONS.
     */
    private const ARCHIVE_EXTENSIONS = ['7z', 'gz', 'rar', 'tar', 'tgz', 'zip'];
    /**
     * TEXT EXTENSIONS.
     */
    private const TEXT_EXTENSIONS = ['md', 'txt'];
    /**
     * IMAGE MIME TYPES.
     */
    private const IMAGE_MIME_TYPES = [
        'image/avif',
        'image/gif',
        'image/jpeg',
        'image/png',
        'image/webp',
    ];
    /**
     * AUDIO MIME TYPES.
     */
    private const AUDIO_MIME_TYPES = [
        'audio/aac',
        'audio/flac',
        'audio/m4a',
        'audio/mp3',
        'audio/mp4',
        'audio/mpeg',
        'audio/ogg',
        'audio/wav',
        'audio/webm',
        'audio/x-m4a',
        'audio/x-wav',
    ];
    /**
     * VIDEO MIME TYPES.
     */
    private const VIDEO_MIME_TYPES = [
        'video/mp4',
        'video/ogg',
        'video/quicktime',
        'video/webm',
    ];

    /**
     * Uploads media.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param \cm_info|\core_course\cm_info $cm Moodle course module.
     * @param \context_module $context Moodle module context.
     * @param string $mediatype Mediatype.
     * @param string $filename Filename.
     * @param string $contenttype Contenttype.
     * @param string $dataurl Dataurl.
     * @return array
     */
    public static function upload_media(
        \stdClass $scaffold,
        \cm_info|\core_course\cm_info $cm,
        \context_module $context,
        string $mediatype,
        string $filename,
        string $contenttype,
        string $dataurl,
    ): array {
        self::validate_requested_media_type($mediatype);

        $safe = self::safe_filename($filename);

        [$dataurltype, $encoded] = self::parse_data_url($dataurl);
        $payload = self::decode_data_url($mediatype, $encoded);
        $detectedtype = self::validate_media_upload(
            $mediatype,
            $safe,
            $contenttype,
            $dataurltype,
            $payload,
        );
        $fs = get_file_storage();
        $existing = $fs->get_file($context->id, 'mod_scaffold', 'media', $scaffold->id, '/', $safe);
        if ($existing) {
            $existing->delete();
        }

        $file = $fs->create_file_from_string([
            'contextid' => $context->id,
            'component' => 'mod_scaffold',
            'filearea' => 'media',
            'itemid' => $scaffold->id,
            'filepath' => '/',
            'filename' => $safe,
            'userid' => 0,
            'mimetype' => $detectedtype,
        ], $payload);

        return [
            'mediaId' => $file->get_filename(),
            'url' => self::media_url($context, $scaffold, $file->get_filename()),
        ];
    }

    /**
     * Lists media.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param \context_module $context Moodle module context.
     * @param string|null $kind Kind.
     * @param string|null $mediatype Mediatype.
     * @return array
     */
    public static function list_media(
        \stdClass $scaffold,
        \context_module $context,
        ?string $kind,
        ?string $mediatype,
    ): array {
        if ($mediatype !== null && $mediatype !== '' && !in_array($mediatype, self::MEDIA_UPLOAD_TYPES, true)) {
            throw new \invalid_parameter_exception('mediatype is not supported');
        }
        $kindfilter = null;
        if ($kind !== null && $kind !== '' && isset(self::MEDIA_KIND_GROUPS[$kind])) {
            $kindfilter = self::MEDIA_KIND_GROUPS[$kind];
        }

        $fs = get_file_storage();
        $files = $fs->get_area_files(
            $context->id,
            'mod_scaffold',
            'media',
            $scaffold->id,
            'timecreated DESC, id DESC',
            false,
        );

        $items = [];
        foreach ($files as $file) {
            $filename = $file->get_filename();
            $contenttype = $file->get_mimetype() ?: '';
            $inferred = self::infer_media_upload_type($filename, $contenttype);

            if ($mediatype !== null && $mediatype !== '' && $inferred !== $mediatype) {
                continue;
            }
            if ($kindfilter !== null && !in_array($inferred, $kindfilter, true)) {
                continue;
            }

            $createdat = $file->get_timecreated();

            $items[] = [
                'id' => $filename,
                'url' => self::media_url($context, $scaffold, $filename),
                'mediaType' => $inferred,
                'fileName' => $filename,
                'mimeType' => $contenttype,
                'size' => (int) $file->get_filesize(),
                'createdAt' => $createdat ? gmdate('c', (int) $createdat) : null,
            ];
        }

        return $items;
    }

    /**
     * Resolves media.
     *
     * @param \stdClass $scaffold Scaffold.
     * @param \context_module $context Moodle module context.
     * @param string $mediaid Mediaid.
     * @return array
     */
    public static function resolve_media(\stdClass $scaffold, \context_module $context, string $mediaid): array {
        $filename = trim($mediaid);
        if ($filename === '') {
            throw new \invalid_parameter_exception('mediaid is required');
        }

        $fs = get_file_storage();
        $file = $fs->get_file($context->id, 'mod_scaffold', 'media', $scaffold->id, '/', $filename);
        if (!$file) {
            throw new \moodle_exception('media not found', 'scaffold');
        }

        return [
            'mediaId' => $filename,
            'url' => self::media_url($context, $scaffold, $filename),
        ];
    }

    /**
     * Returns allowed mime types for media.
     *
     * @param string $mediatype Mediatype.
     * @return array
     */
    private static function allowed_mime_types_for_media(string $mediatype): array {
        return match ($mediatype) {
            'image' => self::IMAGE_MIME_TYPES,
            'audio' => self::AUDIO_MIME_TYPES,
            'video' => self::VIDEO_MIME_TYPES,
            'pdf' => ['application/pdf'],
            'document' => self::WORD_MIME_TYPES,
            'spreadsheet' => self::SPREADSHEET_MIME_TYPES,
            'presentation' => self::PRESENTATION_MIME_TYPES,
            'archive' => self::ARCHIVE_MIME_TYPES,
            'text' => ['text/markdown', 'text/plain'],
            default => [],
        };
    }

    /**
     * Returns allowed extensions for media.
     *
     * @param string $mediatype Mediatype.
     * @return array
     */
    private static function allowed_extensions_for_media(string $mediatype): array {
        return match ($mediatype) {
            'image' => ['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp'],
            'audio' => ['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav', 'weba'],
            'video' => ['mov', 'mp4', 'ogv', 'webm'],
            'pdf' => ['pdf'],
            'document' => self::WORD_EXTENSIONS,
            'spreadsheet' => self::SPREADSHEET_EXTENSIONS,
            'presentation' => self::PRESENTATION_EXTENSIONS,
            'archive' => self::ARCHIVE_EXTENSIONS,
            'text' => self::TEXT_EXTENSIONS,
            default => [],
        };
    }

    /**
     * Validates requested media type.
     *
     * @param string $mediatype Mediatype.
     */
    private static function validate_requested_media_type(string $mediatype): void {
        if (!in_array($mediatype, self::MEDIA_UPLOAD_TYPES, true) || $mediatype === 'other') {
            throw new \invalid_parameter_exception('mediatype is not supported');
        }
    }

    /**
     * Validates media upload.
     *
     * @param string $mediatype Mediatype.
     * @param string $filename Filename.
     * @param string $clientmimetype Clientmimetype.
     * @param string $dataurlmimetype Dataurlmimetype.
     * @param string $payload Payload.
     * @return string
     */
    private static function validate_media_upload(
        string $mediatype,
        string $filename,
        string $clientmimetype,
        string $dataurlmimetype,
        string $payload,
    ): string {
        $limit = self::MEDIA_UPLOAD_MAX_BYTES[$mediatype] ?? 0;
        if ($limit <= 0 || strlen($payload) > $limit) {
            throw new \invalid_parameter_exception($mediatype . ' upload exceeds the size limit');
        }

        $extension = self::extension_for_filename($filename);
        $extensionallowed = $extension !== '' && in_array($extension, self::allowed_extensions_for_media($mediatype), true);
        if (!$extensionallowed) {
            throw new \invalid_parameter_exception('file is not an allowed ' . $mediatype . ' upload');
        }

        $allowedmimetypes = self::allowed_mime_types_for_media($mediatype);
        $isplaintextcsv = $mediatype === 'spreadsheet' && $extension === 'csv';
        $detectedmimetype = self::detect_mime_type($payload);
        if ($isplaintextcsv && $detectedmimetype === 'text/plain') {
            $detectedmimetype = 'text/csv';
        }
        if (!in_array($detectedmimetype, $allowedmimetypes, true)) {
            throw new \invalid_parameter_exception('file does not match mediatype');
        }

        foreach ([$clientmimetype, $dataurlmimetype] as $mimetypehint) {
            $normalizedhint = self::normalize_mime_type($mimetypehint);
            if ($normalizedhint === '' || $normalizedhint === 'application/octet-stream') {
                continue;
            }
            if ($isplaintextcsv && $normalizedhint === 'text/plain') {
                $normalizedhint = 'text/csv';
            }
            if (!in_array($normalizedhint, $allowedmimetypes, true)) {
                throw new \invalid_parameter_exception('file does not match mediatype');
            }
        }

        return $detectedmimetype;
    }

    /**
     * Detects mime type.
     *
     * @param string $payload Payload.
     * @return string
     */
    private static function detect_mime_type(string $payload): string {
        if (!class_exists(\finfo::class)) {
            throw new \invalid_parameter_exception('file type could not be verified');
        }

        try {
            $fileinfo = new \finfo(FILEINFO_MIME_TYPE);
            $detected = $fileinfo->buffer($payload);
        } catch (\Throwable) {
            throw new \invalid_parameter_exception('file type could not be verified');
        }

        if (!is_string($detected) || trim($detected) === '') {
            throw new \invalid_parameter_exception('file type could not be verified');
        }

        return self::normalize_mime_type($detected);
    }

    /**
     * Normalises mime type.
     *
     * @param string $mimetype Mimetype.
     * @return string
     */
    private static function normalize_mime_type(string $mimetype): string {
        $normalized = strtolower(trim(explode(';', $mimetype, 2)[0]));

        return match ($normalized) {
            'application/x-zip-compressed' => 'application/zip',
            'audio/m4a', 'audio/x-m4a' => 'audio/mp4',
            'audio/mp3' => 'audio/mpeg',
            'audio/x-wav' => 'audio/wav',
            'image/jpg' => 'image/jpeg',
            'text/x-markdown' => 'text/markdown',
            default => $normalized,
        };
    }

    /**
     * Returns extension for filename.
     *
     * @param string $filename Filename.
     * @return string
     */
    private static function extension_for_filename(string $filename): string {
        $dot = strrpos($filename, '.');
        return ($dot !== false && $dot < strlen($filename) - 1)
            ? strtolower(substr($filename, $dot + 1))
            : '';
    }

    /**
     * Infers media upload type.
     *
     * @param string $filename Filename.
     * @param string $mimetype Mimetype.
     * @return string
     */
    private static function infer_media_upload_type(string $filename, string $mimetype): string {
        $mime = strtolower($mimetype);
        $extension = self::extension_for_filename($filename);

        if (str_starts_with($mime, 'image/')) {
            return 'image';
        }
        if (str_starts_with($mime, 'audio/')) {
            return 'audio';
        }
        if (str_starts_with($mime, 'video/')) {
            return 'video';
        }
        if ($mime === 'application/pdf' || $extension === 'pdf') {
            return 'pdf';
        }
        if (in_array($mime, self::WORD_MIME_TYPES, true) || in_array($extension, self::WORD_EXTENSIONS, true)) {
            return 'document';
        }
        if (in_array($mime, self::SPREADSHEET_MIME_TYPES, true) || in_array($extension, self::SPREADSHEET_EXTENSIONS, true)) {
            return 'spreadsheet';
        }
        if (in_array($mime, self::PRESENTATION_MIME_TYPES, true) || in_array($extension, self::PRESENTATION_EXTENSIONS, true)) {
            return 'presentation';
        }
        if (in_array($mime, self::ARCHIVE_MIME_TYPES, true) || in_array($extension, self::ARCHIVE_EXTENSIONS, true)) {
            return 'archive';
        }
        if (str_starts_with($mime, 'text/') || in_array($extension, self::TEXT_EXTENSIONS, true)) {
            return 'text';
        }
        return 'other';
    }

    /**
     * Parses data url.
     *
     * @param string $dataurl Dataurl.
     * @return array
     */
    private static function parse_data_url(string $dataurl): array {
        if (!str_contains($dataurl, ',')) {
            throw new \invalid_parameter_exception('dataurl must be a data URL');
        }

        [$header, $encoded] = explode(',', $dataurl, 2);
        $normalizedheader = strtolower($header);
        if (!str_starts_with($normalizedheader, 'data:')) {
            throw new \invalid_parameter_exception('dataurl must be a data URL');
        }
        if (!str_ends_with($normalizedheader, ';base64')) {
            throw new \invalid_parameter_exception('dataurl must be base64 encoded');
        }

        $metadata = substr($header, 5, -7);
        $mimetype = explode(';', $metadata, 2)[0];

        return [$mimetype, $encoded];
    }

    /**
     * Decodes data url.
     *
     * @param string $mediatype Mediatype.
     * @param string $encoded Encoded.
     * @return string
     */
    private static function decode_data_url(string $mediatype, string $encoded): string {
        $limit = self::MEDIA_UPLOAD_MAX_BYTES[$mediatype] ?? 0;
        $maxencodedbytes = 4 * intdiv($limit + 2, 3);
        if ($limit <= 0 || strlen($encoded) > $maxencodedbytes) {
            throw new \invalid_parameter_exception($mediatype . ' upload exceeds the size limit');
        }

        $decoded = base64_decode($encoded, true);
        if ($decoded === false) {
            throw new \invalid_parameter_exception('dataurl is not valid base64');
        }

        return $decoded;
    }

    /**
     * Returns media url.
     *
     * @param \context_module $context Moodle module context.
     * @param \stdClass $scaffold Scaffold.
     * @param string $filename Filename.
     * @return string
     */
    private static function media_url(\context_module $context, \stdClass $scaffold, string $filename): string {
        return \moodle_url::make_pluginfile_url(
            $context->id,
            'mod_scaffold',
            'media',
            $scaffold->id,
            '/',
            $filename,
            false,
        )->out(false);
    }

    /**
     * Builds a safe filename.
     *
     * @param string $filename Filename.
     * @return string
     */
    private static function safe_filename(string $filename): string {
        $basename = basename(trim($filename));
        if ($basename === '' || $basename === '.' || $basename === DIRECTORY_SEPARATOR) {
            $basename = 'scaffold-media';
        }

        $basename = preg_replace('/[^A-Za-z0-9._-]+/', '-', $basename) ?: 'scaffold-media';
        return 'scaffold-' . bin2hex(random_bytes(8)) . '-' . $basename;
    }
}

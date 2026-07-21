<?php
// This file is part of Scaffold - https://scaffold.ac/
//
// Scaffold is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, version 3 of the License.

namespace core_course {
    class cm_info {
        public int $id = 5;
    }
}

namespace {
    define('MOODLE_INTERNAL', true);

    class context_module {
        public int $id = 7;
    }

    class invalid_parameter_exception extends \Exception {
    }

    class moodle_url {
        public function __construct(private string $filename) {
        }

        public static function make_pluginfile_url(
            int $contextid,
            string $component,
            string $filearea,
            int $itemid,
            string $filepath,
            string $filename,
            bool $forcedownload,
        ): self {
            return new self($filename);
        }

        public function out(bool $escaped): string {
            return '/pluginfile.php/' . $this->filename;
        }
    }

    class media_service_test_stored_file {
        public function __construct(public array $record, public string $content) {
        }

        public function get_filename(): string {
            return $this->record['filename'];
        }
    }

    class media_service_test_file_storage {
        public array $created = [];

        public function get_file(
            int $contextid,
            string $component,
            string $filearea,
            int $itemid,
            string $filepath,
            string $filename,
        ): false {
            return false;
        }

        public function create_file_from_string(array $record, string $content): media_service_test_stored_file {
            $file = new media_service_test_stored_file($record, $content);
            $this->created[] = $file;
            return $file;
        }

        public function reset(): void {
            $this->created = [];
        }
    }

    function get_file_storage(): media_service_test_file_storage {
        return $GLOBALS['media_service_test_file_storage'];
    }

    function mimeinfo(string $element, string $filename): string {
        return 'application/octet-stream';
    }

    require_once(__DIR__ . '/../scaffold/classes/local/media_service.php');

    use mod_scaffold\local\media_service;

    function fail_media_service_test(string $message): never {
        fwrite(STDERR, $message . PHP_EOL);
        exit(1);
    }

    function assert_media_service_test(bool $condition, string $message): void {
        if (!$condition) {
            fail_media_service_test($message);
        }
    }

    function assert_media_service_test_same(mixed $expected, mixed $actual, string $message): void {
        if ($expected !== $actual) {
            fail_media_service_test(
                $message . PHP_EOL
                . 'Expected: ' . var_export($expected, true) . PHP_EOL
                . 'Actual:   ' . var_export($actual, true),
            );
        }
    }

    function expect_media_upload_rejected(callable $operation, string $expectedmessage, string $message): void {
        try {
            $operation();
            fail_media_service_test($message);
        } catch (invalid_parameter_exception $exception) {
            if ($exception->getMessage() !== $expectedmessage) {
                fail_media_service_test(
                    $message . PHP_EOL
                    . 'Expected error: ' . $expectedmessage . PHP_EOL
                    . 'Actual error:   ' . $exception->getMessage(),
                );
            }
        }
    }

    function upload_media_fixture(
        string $mediatype,
        string $filename,
        string $contenttype,
        string $dataurl,
    ): array {
        return media_service::upload_media(
            (object) ['id' => 3],
            new \core_course\cm_info(),
            new context_module(),
            $mediatype,
            $filename,
            $contenttype,
            $dataurl,
        );
    }

    function media_data_url(string $mimetype, string $payload): string {
        return 'data:' . $mimetype . ';base64,' . base64_encode($payload);
    }

    function valid_png_fixture(): string {
        $decoded = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            true,
        );
        if ($decoded === false) {
            fail_media_service_test('PNG fixture must be valid base64');
        }
        return $decoded;
    }

    function valid_wav_fixture(): string {
        return 'RIFF'
            . pack('V', 37)
            . 'WAVEfmt '
            . pack('VvvVVvv', 16, 1, 1, 8000, 8000, 1, 8)
            . 'data'
            . pack('V', 1)
            . "\x80";
    }

    function assert_stored_upload(string $expectedmimetype, string $expectedpayload, string $filenamepattern): void {
        $storage = get_file_storage();
        assert_media_service_test_same(1, count($storage->created), 'valid upload must create exactly one stored file');
        $stored = $storage->created[0];
        assert_media_service_test_same(
            $expectedmimetype,
            $stored->record['mimetype'] ?? null,
            'stored upload must use the normalized server-detected MIME type',
        );
        assert_media_service_test_same($expectedpayload, $stored->content, 'stored upload must preserve decoded bytes');
        assert_media_service_test(
            preg_match($filenamepattern, $stored->get_filename()) === 1,
            'stored upload must preserve randomized sanitized filename behavior',
        );
        $storage->reset();
    }

    $GLOBALS['media_service_test_file_storage'] = new media_service_test_file_storage();

    $oversizedencoded = str_repeat('%', 13981017);
    expect_media_upload_rejected(
        static fn() => upload_media_fixture(
            'image',
            'oversized.png',
            'image/png',
            'data:image/png;base64,' . $oversizedencoded,
        ),
        'image upload exceeds the size limit',
        'encoded payloads over the image limit must be rejected before strict base64 decode',
    );
    unset($oversizedencoded);

    expect_media_upload_rejected(
        static fn() => upload_media_fixture(
            'image',
            'invalid.png',
            'image/png',
            'data:image/png;base64,%%%%',
        ),
        'dataurl is not valid base64',
        'strict base64 decoding must reject malformed payloads',
    );

    $oversizeddecoded = str_repeat('a', 10485761);
    expect_media_upload_rejected(
        static fn() => upload_media_fixture(
            'image',
            'oversized.png',
            'image/png',
            media_data_url('image/png', $oversizeddecoded),
        ),
        'image upload exceeds the size limit',
        'decoded payloads over the image limit must be rejected after base64 decode',
    );
    unset($oversizeddecoded);

    expect_media_upload_rejected(
        static fn() => upload_media_fixture(
            'image',
            'disguised.png',
            'image/png',
            media_data_url('image/png', '<!doctype html><script>alert(1)</script>'),
        ),
        'file does not match mediatype',
        'claimed image MIME and extension must not override server-detected text bytes',
    );

    expect_media_upload_rejected(
        static fn() => upload_media_fixture(
            'image',
            'disguised.png',
            'application/octet-stream',
            media_data_url('application/octet-stream', "%PDF-1.4\n%%EOF\n"),
        ),
        'file does not match mediatype',
        'a PNG extension must not admit server-detected PDF bytes',
    );

    expect_media_upload_rejected(
        static fn() => upload_media_fixture(
            'pdf',
            'disguised.pdf',
            'application/pdf',
            media_data_url('application/pdf', valid_png_fixture()),
        ),
        'file does not match mediatype',
        'requested PDF media type must reject server-detected image bytes',
    );

    expect_media_upload_rejected(
        static fn() => upload_media_fixture(
            'image',
            'wrong-extension.pdf',
            'image/png',
            media_data_url('image/png', valid_png_fixture()),
        ),
        'file is not an allowed image upload',
        'valid image bytes must still use an allowed image extension',
    );

    expect_media_upload_rejected(
        static fn() => upload_media_fixture(
            'image',
            'wrong-client-hint.png',
            'application/pdf',
            media_data_url('image/png', valid_png_fixture()),
        ),
        'file does not match mediatype',
        'non-generic client MIME hints must agree with the requested media type',
    );

    expect_media_upload_rejected(
        static fn() => upload_media_fixture(
            'image',
            'wrong-data-url-hint.png',
            'image/png',
            media_data_url('application/pdf', valid_png_fixture()),
        ),
        'file does not match mediatype',
        'non-generic data URL MIME hints must agree with the requested media type',
    );

    expect_media_upload_rejected(
        static fn() => upload_media_fixture(
            'image',
            'not-a-data-url.png',
            'image/png',
            'not-data:image/png;base64,' . base64_encode(valid_png_fixture()),
        ),
        'dataurl must be a data URL',
        'upload payloads must use a data URL header',
    );

    $png = valid_png_fixture();
    upload_media_fixture('image', '../cover image.PNG', 'image/jpeg', media_data_url('image/png', $png));
    assert_stored_upload('image/png', $png, '/^scaffold-[a-f0-9]{16}-cover-image\.PNG$/');

    $pdf = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n";
    upload_media_fixture('pdf', 'guide.pdf', 'application/pdf', media_data_url('application/pdf', $pdf));
    assert_stored_upload('application/pdf', $pdf, '/^scaffold-[a-f0-9]{16}-guide\.pdf$/');

    $markdown = "# Scaffold\n\nManaged media.\n";
    upload_media_fixture('text', 'notes.md', 'text/markdown', media_data_url('text/markdown', $markdown));
    assert_stored_upload('text/plain', $markdown, '/^scaffold-[a-f0-9]{16}-notes\.md$/');

    $csv = "name,score\nAda,100\n";
    upload_media_fixture('spreadsheet', 'marks.csv', 'text/plain', media_data_url('text/plain', $csv));
    assert_stored_upload('text/csv', $csv, '/^scaffold-[a-f0-9]{16}-marks\.csv$/');

    foreach (['xlsx', 'ods'] as $extension) {
        expect_media_upload_rejected(
            static fn() => upload_media_fixture(
                'spreadsheet',
                'disguised.' . $extension,
                'text/plain',
                media_data_url('text/plain', $csv),
            ),
            'file does not match mediatype',
            'plain-text bytes must not be accepted for .' . $extension . ' spreadsheet uploads',
        );
    }

    $wav = valid_wav_fixture();
    upload_media_fixture('audio', 'sample.wav', 'audio/x-wav', media_data_url('audio/wav', $wav));
    assert_stored_upload('audio/wav', $wav, '/^scaffold-[a-f0-9]{16}-sample\.wav$/');

    upload_media_fixture(
        'image',
        'generic.png',
        'application/octet-stream',
        media_data_url('application/octet-stream', $png),
    );
    assert_stored_upload('image/png', $png, '/^scaffold-[a-f0-9]{16}-generic\.png$/');

    echo "media service tests passed\n";
}

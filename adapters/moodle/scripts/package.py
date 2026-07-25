#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path, PurePosixPath


SEMVER_PATTERN = re.compile(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)")
EXCLUDED_PARTS = {".git", "node_modules"}
REQUIRED_FILES = ("README.md", "CHANGES.md", "LICENSE", "version.php")
REQUIRED_RUNTIME_DIRECTORIES = ("public", "amd/build")


def parse_arguments():
    parser = argparse.ArgumentParser(description="Build the installable Scaffold Moodle ZIP.")
    parser.add_argument(
        "--repository-root",
        type=Path,
        default=Path(__file__).resolve().parents[3],
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate release metadata without creating an archive.",
    )
    return parser.parse_args()


def read_product_version(repository_root):
    manifest = json.loads((repository_root / "package.json").read_text(encoding="utf8"))
    version = manifest.get("version")
    if not isinstance(version, str) or SEMVER_PATTERN.fullmatch(version) is None:
        raise ValueError("Root package.json version must use MAJOR.MINOR.PATCH.")
    return version


def read_moodle_metadata(plugin_root):
    version_php = (plugin_root / "version.php").read_text(encoding="utf8")

    def value(pattern, label):
        match = re.search(pattern, version_php)
        if match is None:
            raise ValueError(f"version.php must declare {label}.")
        return match.group(1)

    component = value(r"\$plugin->component\s*=\s*['\"]([^'\"]+)['\"]\s*;", "component")
    release = value(r"\$plugin->release\s*=\s*['\"]([^'\"]+)['\"]\s*;", "release")
    build = value(r"\$plugin->version\s*=\s*(\d+)\s*;", "version")
    return component, release, build


def validate_metadata(plugin_root, product_version):
    component, release, build = read_moodle_metadata(plugin_root)
    if component != "mod_scaffold":
        raise ValueError(f"Moodle component must be mod_scaffold, found {component}.")
    if release != product_version:
        raise ValueError(
            f"Moodle release {release} does not match root product version {product_version}.",
        )
    if len(build) != 10:
        raise ValueError("Moodle version must use the ten-digit YYYYMMDDXX format.")
    try:
        datetime.strptime(build[:8], "%Y%m%d")
    except ValueError as error:
        raise ValueError("Moodle version must begin with a valid YYYYMMDD date.") from error

    changelog = (plugin_root / "CHANGES.md").read_text(encoding="utf8")
    release_heading = re.compile(
        rf"^## {re.escape(product_version)} - \d{{4}}-\d{{2}}-\d{{2}}$",
        re.MULTILINE,
    )
    if release_heading.search(changelog) is None:
        raise ValueError(f"CHANGES.md must contain a dated {product_version} release heading.")

    guide = (plugin_root / "README.md").read_text(encoding="utf8")
    required_guide_text = (
        f"releases/download/v{product_version}/mod_scaffold-{product_version}.zip",
        "Plugins overview",
        f"releases/tag/v{product_version}",
        "Moodle 4.5",
    )
    if any(text not in guide for text in required_guide_text):
        raise ValueError("Moodle README.md is missing the administrator installation guide.")


def source_files(plugin_root):
    for required_file in REQUIRED_FILES:
        if not (plugin_root / required_file).is_file():
            raise ValueError(f"Moodle package is missing {required_file}.")
    for required_directory in REQUIRED_RUNTIME_DIRECTORIES:
        directory = plugin_root / required_directory
        if not directory.is_dir() or not any(path.is_file() for path in directory.rglob("*")):
            raise ValueError(f"Moodle package is missing built files in {required_directory}/.")

    files = []
    for path in sorted(plugin_root.rglob("*")):
        relative_path = path.relative_to(plugin_root)
        if path.is_symlink():
            raise ValueError(f"Moodle package cannot contain symlinks: {relative_path}.")
        if EXCLUDED_PARTS.intersection(relative_path.parts):
            raise ValueError(f"Moodle package contains an excluded path: {relative_path}.")
        if path.is_file():
            is_moodle_amd_map = (
                relative_path.parts[:2] == ("amd", "build")
                and path.name.endswith(".js.map")
            )
            if (path.suffix == ".map" and not is_moodle_amd_map) or path.name == ".DS_Store":
                raise ValueError(f"Moodle package contains an excluded file: {relative_path}.")
            files.append(path)
    return files


def release_payload(repository_root, plugin_root, files):
    payload = [
        (path.relative_to(plugin_root).as_posix(), path)
        for path in files
    ]
    for filename in ("THIRD_PARTY_NOTICES.md",):
        source_path = repository_root / filename
        if not source_path.is_file():
            raise ValueError(f"Moodle package is missing repository {filename}.")
        payload.append((filename, source_path))
    return sorted(payload, key=lambda entry: entry[0])


def write_archive(payload, archive_path):
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_archive = archive_path.with_suffix(".zip.tmp")
    temporary_archive.unlink(missing_ok=True)

    with zipfile.ZipFile(
        temporary_archive,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as archive:
        for relative_path, source_path in payload:
            archive_pathname = f"scaffold/{relative_path}"
            entry = zipfile.ZipInfo(archive_pathname, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, source_path.read_bytes(), compresslevel=9)

    os.replace(temporary_archive, archive_path)


def verify_archive(payload, archive_path):
    expected_names = [f"scaffold/{relative_path}" for relative_path, _ in payload]
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        if names != expected_names:
            raise ValueError("Moodle ZIP contents differ from the staged plugin payload.")
        for name in names:
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts or path.parts[0] != "scaffold":
                raise ValueError(f"Moodle ZIP contains an unsafe path: {name}.")
        if archive.testzip() is not None:
            raise ValueError("Moodle ZIP failed its integrity check.")

        with tempfile.TemporaryDirectory(prefix="scaffold-moodle-package-") as temporary_directory:
            extraction_root = Path(temporary_directory)
            archive.extractall(extraction_root)
            extracted_plugin = extraction_root / "scaffold"
            for relative_path, source_path in payload:
                if (extracted_plugin / relative_path).read_bytes() != source_path.read_bytes():
                    raise ValueError(f"Extracted Moodle file differs: {relative_path}.")


def write_checksum(archive_path):
    digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    checksum_path = archive_path.with_suffix(".zip.sha256")
    checksum_path.write_text(f"{digest}  {archive_path.name}\n", encoding="utf8")
    return checksum_path


def main():
    arguments = parse_arguments()
    repository_root = arguments.repository_root.resolve()
    plugin_root = repository_root / "adapters" / "moodle" / "scaffold"
    product_version = read_product_version(repository_root)
    validate_metadata(plugin_root, product_version)
    if arguments.check:
        print(f"Moodle package metadata is ready for {product_version}.")
        return
    files = source_files(plugin_root)
    payload = release_payload(repository_root, plugin_root, files)

    archive_path = (
        repository_root
        / "dist"
        / "release"
        / product_version
        / f"mod_scaffold-{product_version}.zip"
    )
    write_archive(payload, archive_path)
    verify_archive(payload, archive_path)
    checksum_path = write_checksum(archive_path)
    print(f"Created {archive_path}")
    print(f"Created {checksum_path}")


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1) from None

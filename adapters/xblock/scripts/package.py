#!/usr/bin/env python3

import argparse
import gzip
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import tomllib
import zipfile
from email.parser import BytesParser
from pathlib import Path
from pathlib import PurePosixPath


SEMVER_PATTERN = re.compile(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)")
REQUIRED_WHEEL_FILES = {
    "scaffold_xblock/__init__.py",
    "scaffold_xblock/static/student.js",
    "scaffold_xblock/static/studio.js",
    "scaffold_xblock/static/studio-host.css",
    "scaffold_xblock/public/student-inner.html",
    "scaffold_xblock/public/student-ui.js",
    "scaffold_xblock/public/studio-inner.html",
    "scaffold_xblock/public/studio-ui.js",
}
REQUIRED_WHEEL_PREFIXES = (
    "scaffold_xblock/public/assets/",
    "scaffold_xblock/validation/fixtures/",
    "scaffold_xblock/validation/schemas/",
)
REQUIRED_SDIST_FILES = {
    "pyproject.toml",
    "README.md",
    "CHANGES.md",
    "MANIFEST.in",
    *REQUIRED_WHEEL_FILES,
}
PACKAGE_TOOL_REQUIREMENTS = ("build==1.5.0", "twine==6.2.0")
SOURCE_DATE_EPOCH = 315532800


def read_product_version(repository_root):
    manifest = json.loads((repository_root / "package.json").read_text(encoding="utf8"))
    version = manifest.get("version")
    if not isinstance(version, str) or SEMVER_PATTERN.fullmatch(version) is None:
        raise ValueError("Root package.json version must use MAJOR.MINOR.PATCH.")
    return version


def validate_metadata(repository_root, adapter_root):
    product_version = read_product_version(repository_root)
    pyproject = tomllib.loads((adapter_root / "pyproject.toml").read_text(encoding="utf8"))
    project = pyproject.get("project", {})
    distribution_name = project.get("name")
    xblock_version = project.get("version")
    entry_point = project.get("entry-points", {}).get("xblock.v1", {}).get("scaffold")

    if distribution_name != "scaffold-xblock":
        raise ValueError(
            f"XBlock distribution name must be scaffold-xblock, found {distribution_name}.",
        )
    if xblock_version != product_version:
        raise ValueError(
            f"XBlock version {xblock_version} does not match root product version "
            f"{product_version}.",
        )
    if entry_point != "scaffold_xblock:ScaffoldXBlock":
        raise ValueError("XBlock entry point must load scaffold_xblock:ScaffoldXBlock.")

    changelog = (adapter_root / "CHANGES.md").read_text(encoding="utf8")
    release_heading = re.compile(
        rf"^## {re.escape(product_version)} - \d{{4}}-\d{{2}}-\d{{2}}$",
        re.MULTILINE,
    )
    if release_heading.search(changelog) is None:
        raise ValueError(f"CHANGES.md must contain a dated {product_version} release heading.")
    return product_version


def validate_wheel(wheel_path, product_version):
    expected_name = f"scaffold_xblock-{product_version}-py3-none-any.whl"
    if wheel_path.name != expected_name:
        raise ValueError(f"Expected wheel {expected_name}, found {wheel_path.name}.")

    dist_info = f"scaffold_xblock-{product_version}.dist-info"
    metadata_path = f"{dist_info}/METADATA"
    entry_points_path = f"{dist_info}/entry_points.txt"
    with zipfile.ZipFile(wheel_path) as wheel:
        names = wheel.namelist()
        if wheel.testzip() is not None:
            raise ValueError("XBlock wheel failed its integrity check.")
        for name in names:
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts:
                raise ValueError(f"XBlock wheel contains an unsafe path: {name}.")
            if not (name.startswith("scaffold_xblock/") or name.startswith(f"{dist_info}/")):
                raise ValueError(f"XBlock wheel contains an unexpected path: {name}.")

        missing = sorted(REQUIRED_WHEEL_FILES.difference(names))
        if missing:
            raise ValueError(f"XBlock wheel is missing required files: {', '.join(missing)}.")
        for prefix in REQUIRED_WHEEL_PREFIXES:
            if not any(name.startswith(prefix) and not name.endswith("/") for name in names):
                raise ValueError(f"XBlock wheel is missing runtime files under {prefix}.")
        if metadata_path not in names or entry_points_path not in names:
            raise ValueError("XBlock wheel is missing distribution metadata.")

        metadata = BytesParser().parsebytes(wheel.read(metadata_path))
        if metadata["Name"] != "scaffold-xblock" or metadata["Version"] != product_version:
            raise ValueError("XBlock wheel name or version metadata does not match the release.")
        entry_points = wheel.read(entry_points_path).decode("utf8")
        if re.search(
            r"(?ms)^\[xblock\.v1\]\s*$.*^scaffold\s*=\s*"
            r"scaffold_xblock:ScaffoldXBlock\s*$",
            entry_points,
        ) is None:
            raise ValueError("XBlock wheel is missing the scaffold xblock.v1 entry point.")


def validate_sdist(source_distribution, product_version):
    expected_name = f"scaffold_xblock-{product_version}.tar.gz"
    if source_distribution.name != expected_name:
        raise ValueError(
            f"Expected source distribution {expected_name}, found {source_distribution.name}.",
        )

    root = f"scaffold_xblock-{product_version}"
    with tarfile.open(source_distribution, "r:gz") as archive:
        members = archive.getmembers()
        relative_files = set()
        for member in members:
            path = PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts or not path.parts:
                raise ValueError(f"XBlock source distribution contains an unsafe path: {member.name}.")
            if path.parts[0] != root:
                raise ValueError(
                    f"XBlock source distribution contains an unexpected root: {member.name}.",
                )
            if member.issym() or member.islnk():
                raise ValueError(
                    f"XBlock source distribution contains a link: {member.name}.",
                )
            if member.isfile():
                relative_files.add(PurePosixPath(*path.parts[1:]).as_posix())

    missing = sorted(REQUIRED_SDIST_FILES.difference(relative_files))
    if missing:
        raise ValueError(
            f"XBlock source distribution is missing required files: {', '.join(missing)}.",
        )
    for prefix in REQUIRED_WHEEL_PREFIXES:
        if not any(path.startswith(prefix) for path in relative_files):
            raise ValueError(
                f"XBlock source distribution is missing runtime files under {prefix}.",
            )
    excluded_parts = {"frontend", "node_modules", "tests"}
    for path in relative_files:
        if excluded_parts.intersection(PurePosixPath(path).parts):
            raise ValueError(
                f"XBlock source distribution contains a development path: {path}.",
            )


def normalize_sdist(source_distribution):
    with tarfile.open(source_distribution, "r:gz") as archive:
        entries = []
        for member in archive.getmembers():
            if member.issym() or member.islnk():
                raise ValueError(
                    f"XBlock source distribution contains a link: {member.name}.",
                )
            contents = archive.extractfile(member).read() if member.isfile() else None
            entries.append((member.name, member.isdir(), contents))

    temporary_path = Path(f"{source_distribution}.tmp")
    temporary_path.unlink(missing_ok=True)
    with temporary_path.open("wb") as destination:
        with gzip.GzipFile(
            fileobj=destination,
            mode="wb",
            filename="",
            mtime=SOURCE_DATE_EPOCH,
            compresslevel=9,
        ) as compressed:
            with tarfile.open(
                fileobj=compressed,
                mode="w",
                format=tarfile.PAX_FORMAT,
            ) as archive:
                for name, is_directory, contents in sorted(entries):
                    member = tarfile.TarInfo(name)
                    member.mtime = SOURCE_DATE_EPOCH
                    member.mode = 0o755 if is_directory else 0o644
                    member.type = tarfile.DIRTYPE if is_directory else tarfile.REGTYPE
                    member.size = 0 if contents is None else len(contents)
                    archive.addfile(
                        member,
                        None if contents is None else io.BytesIO(contents),
                    )
    os.replace(temporary_path, source_distribution)


def run_checked(command, *, cwd=None, environment=None):
    subprocess.run(
        [str(part) for part in command],
        check=True,
        cwd=cwd,
        env=environment,
    )


def ensure_package_tools(repository_root):
    tool_key = "-".join(requirement.replace("==", "-") for requirement in PACKAGE_TOOL_REQUIREMENTS)
    environment_root = repository_root / ".tmp" / f"xblock-package-tools-{tool_key}"
    python_path = (
        environment_root / "Scripts" / "python.exe"
        if os.name == "nt"
        else environment_root / "bin" / "python"
    )
    if not python_path.is_file():
        environment_root.parent.mkdir(parents=True, exist_ok=True)
        run_checked([sys.executable, "-m", "venv", environment_root])
        run_checked(
            [
                python_path,
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                *PACKAGE_TOOL_REQUIREMENTS,
            ],
        )
    return python_path


def smoke_install_wheel(wheel_path, product_version):
    with tempfile.TemporaryDirectory(prefix="scaffold-xblock-install-") as temporary_directory:
        environment_root = Path(temporary_directory) / "venv"
        run_checked([sys.executable, "-m", "venv", environment_root])
        python_path = (
            environment_root / "Scripts" / "python.exe"
            if os.name == "nt"
            else environment_root / "bin" / "python"
        )
        run_checked(
            [
                python_path,
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                wheel_path,
            ],
        )
        probe = "\n".join(
            [
                "from importlib.metadata import entry_points, version",
                "assert version('scaffold-xblock') == %r" % product_version,
                "matches = [point for point in entry_points(group='xblock.v1') "
                "if point.name == 'scaffold']",
                "assert len(matches) == 1",
                "assert matches[0].load().__name__ == 'ScaffoldXBlock'",
            ],
        )
        run_checked([python_path, "-c", probe])


def rebuild_sdist(tool_python, source_distribution, product_version, environment):
    with tempfile.TemporaryDirectory(prefix="scaffold-xblock-sdist-") as temporary_directory:
        temporary_root = Path(temporary_directory)
        with tarfile.open(source_distribution, "r:gz") as archive:
            archive.extractall(temporary_root, filter="data")
        source_root = temporary_root / f"scaffold_xblock-{product_version}"
        output_directory = temporary_root / "dist"
        run_checked(
            [tool_python, "-m", "build", "--wheel", "--outdir", output_directory, source_root],
            environment=environment,
        )
        rebuilt_wheel = output_directory / (
            f"scaffold_xblock-{product_version}-py3-none-any.whl"
        )
        validate_wheel(rebuilt_wheel, product_version)


def write_checksum(artifact_path):
    digest = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    checksum_path = Path(f"{artifact_path}.sha256")
    checksum_path.write_text(f"{digest}  {artifact_path.name}\n", encoding="utf8")


def package_distributions(repository_root, adapter_root, product_version):
    tool_python = ensure_package_tools(repository_root)
    scratch_root = repository_root / ".tmp"
    scratch_root.mkdir(parents=True, exist_ok=True)
    environment = {
        **os.environ,
        "PYTHONHASHSEED": "0",
        "SOURCE_DATE_EPOCH": str(SOURCE_DATE_EPOCH),
    }

    with tempfile.TemporaryDirectory(
        prefix="scaffold-xblock-build-",
        dir=scratch_root,
    ) as temporary_directory:
        build_directory = Path(temporary_directory) / "dist"
        run_checked(
            [tool_python, "-m", "build", "--outdir", build_directory, adapter_root],
            environment=environment,
        )
        wheel = build_directory / f"scaffold_xblock-{product_version}-py3-none-any.whl"
        source_distribution = build_directory / f"scaffold_xblock-{product_version}.tar.gz"
        if not wheel.is_file() or not source_distribution.is_file():
            raise ValueError("Python build did not produce the expected wheel and source distribution.")

        normalize_sdist(source_distribution)
        run_checked(
            [tool_python, "-m", "twine", "check", wheel, source_distribution],
            environment=environment,
        )
        validate_wheel(wheel, product_version)
        validate_sdist(source_distribution, product_version)
        smoke_install_wheel(wheel, product_version)
        rebuild_sdist(tool_python, source_distribution, product_version, environment)

        output_directory = repository_root / "dist" / "release" / product_version
        output_directory.mkdir(parents=True, exist_ok=True)
        artifacts = []
        for source_path in (wheel, source_distribution):
            output_path = output_directory / source_path.name
            shutil.copyfile(source_path, output_path)
            write_checksum(output_path)
            artifacts.append(output_path)
        return artifacts


def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Build and verify the Scaffold XBlock distributions.",
    )
    parser.add_argument(
        "--repository-root",
        type=Path,
        default=Path(__file__).resolve().parents[3],
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate release metadata without building distributions.",
    )
    return parser.parse_args()


def main():
    arguments = parse_arguments()
    repository_root = arguments.repository_root.resolve()
    adapter_root = repository_root / "adapters" / "xblock"
    product_version = validate_metadata(repository_root, adapter_root)
    if arguments.check:
        print(f"XBlock package metadata is ready for {product_version}.")
        return
    for artifact in package_distributions(repository_root, adapter_root, product_version):
        print(f"Created {artifact}")
        print(f"Created {artifact}.sha256")


if __name__ == "__main__":
    try:
        main()
    except (
        FileNotFoundError,
        ValueError,
        json.JSONDecodeError,
        tomllib.TOMLDecodeError,
    ) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1) from None

import gzip
import importlib.util
import io
import json
import subprocess
import sys
import tarfile
import tempfile
import tomllib
import unittest
import zipfile
from pathlib import Path
from unittest import mock


PACKAGE_SCRIPT = Path(__file__).parents[1] / "scripts" / "package.py"
REPOSITORY_ROOT = Path(__file__).parents[3]


def load_package_module():
    specification = importlib.util.spec_from_file_location(
        "scaffold_xblock_package",
        PACKAGE_SCRIPT,
    )
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


class XBlockPackageMetadataTest(unittest.TestCase):
    def test_repository_uses_aligned_modern_distribution_metadata(self):
        root_manifest = json.loads(
            (REPOSITORY_ROOT / "package.json").read_text(encoding="utf8"),
        )
        adapter_root = REPOSITORY_ROOT / "adapters" / "xblock"
        pyproject = tomllib.loads(
            (adapter_root / "pyproject.toml").read_text(encoding="utf8"),
        )

        self.assertEqual(pyproject["project"]["name"], "scaffold-xblock")
        self.assertEqual(pyproject["project"]["version"], root_manifest["version"])
        self.assertEqual(
            pyproject["project"]["entry-points"]["xblock.v1"]["scaffold"],
            "scaffold_xblock:ScaffoldXBlock",
        )
        self.assertFalse((adapter_root / "setup.py").exists())
        self.assertTrue((adapter_root / "CHANGES.md").is_file())

    def test_accepts_aligned_pep_621_distribution_metadata(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            repository_root = Path(temporary_directory)
            adapter_root = repository_root / "adapters" / "xblock"
            adapter_root.mkdir(parents=True)
            (repository_root / "package.json").write_text(
                json.dumps({"version": "1.2.3"}),
                encoding="utf8",
            )
            (adapter_root / "pyproject.toml").write_text(
                "\n".join(
                    [
                        "[project]",
                        'name = "scaffold-xblock"',
                        'version = "1.2.3"',
                        "",
                        "[project.entry-points.\"xblock.v1\"]",
                        'scaffold = "scaffold_xblock:ScaffoldXBlock"',
                    ],
                ),
                encoding="utf8",
            )
            (adapter_root / "CHANGES.md").write_text(
                "## 1.2.3 - 2026-07-24\n",
                encoding="utf8",
            )

            package_module = load_package_module()

            self.assertEqual(
                package_module.validate_metadata(repository_root, adapter_root),
                "1.2.3",
            )

    def test_rejects_an_xblock_version_that_differs_from_the_product_version(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            repository_root = Path(temporary_directory)
            adapter_root = repository_root / "adapters" / "xblock"
            adapter_root.mkdir(parents=True)
            (repository_root / "package.json").write_text(
                json.dumps({"version": "1.2.3"}),
                encoding="utf8",
            )
            (adapter_root / "pyproject.toml").write_text(
                "\n".join(
                    [
                        "[project]",
                        'name = "scaffold-xblock"',
                        'version = "1.2.2"',
                        "",
                        "[project.entry-points.\"xblock.v1\"]",
                        'scaffold = "scaffold_xblock:ScaffoldXBlock"',
                    ],
                ),
                encoding="utf8",
            )
            (adapter_root / "CHANGES.md").write_text(
                "## 1.2.2 - 2026-07-24\n",
                encoding="utf8",
            )

            package_module = load_package_module()

            with self.assertRaisesRegex(
                ValueError,
                "XBlock version 1.2.2 does not match root product version 1.2.3",
            ):
                package_module.validate_metadata(repository_root, adapter_root)

            result = subprocess.run(
                [
                    sys.executable,
                    str(PACKAGE_SCRIPT),
                    "--repository-root",
                    str(repository_root),
                    "--check",
                ],
                capture_output=True,
                check=False,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(
                "XBlock version 1.2.2 does not match root product version 1.2.3",
                result.stderr,
            )
            self.assertNotIn("Traceback", result.stderr)


class XBlockWheelTest(unittest.TestCase):
    def test_validates_runtime_files_metadata_and_entry_point(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            wheel_path = Path(temporary_directory) / (
                "scaffold_xblock-1.2.3-py3-none-any.whl"
            )
            dist_info = "scaffold_xblock-1.2.3.dist-info"
            entries = {
                "scaffold_xblock/__init__.py": b"",
                "scaffold_xblock/static/student.js": b"",
                "scaffold_xblock/static/studio.js": b"",
                "scaffold_xblock/static/studio-host.css": b"",
                "scaffold_xblock/public/student-inner.html": b"",
                "scaffold_xblock/public/student-ui.js": b"",
                "scaffold_xblock/public/studio-inner.html": b"",
                "scaffold_xblock/public/studio-ui.js": b"",
                "scaffold_xblock/public/assets/runtime.js": b"",
                "scaffold_xblock/validation/fixtures/assessment.json": b"{}",
                "scaffold_xblock/validation/schemas/assessment.json": b"{}",
                f"{dist_info}/METADATA": (
                    b"Metadata-Version: 2.4\n"
                    b"Name: scaffold-xblock\n"
                    b"Version: 1.2.3\n"
                ),
                f"{dist_info}/entry_points.txt": (
                    b"[xblock.v1]\n"
                    b"scaffold = scaffold_xblock:ScaffoldXBlock\n"
                ),
                f"{dist_info}/RECORD": b"",
            }
            with zipfile.ZipFile(wheel_path, "w") as wheel:
                for name, contents in entries.items():
                    wheel.writestr(name, contents)

            package_module = load_package_module()

            package_module.validate_wheel(wheel_path, "1.2.3")


class XBlockSourceDistributionTest(unittest.TestCase):
    def test_normalizes_tar_and_gzip_metadata_reproducibly(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            first = Path(temporary_directory) / "first.tar.gz"
            second = Path(temporary_directory) / "second.tar.gz"
            self.write_timestamped_sdist(first, 1_700_000_000)
            self.write_timestamped_sdist(second, 1_800_000_000)
            package_module = load_package_module()

            package_module.normalize_sdist(first)
            package_module.normalize_sdist(second)

            self.assertEqual(first.read_bytes(), second.read_bytes())

    def test_validates_an_isolated_runtime_source_distribution(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            source_distribution = (
                Path(temporary_directory) / "scaffold_xblock-1.2.3.tar.gz"
            )
            self.write_sdist(source_distribution, include_changelog=True)

            package_module = load_package_module()

            package_module.validate_sdist(source_distribution, "1.2.3")

    def test_rejects_a_source_distribution_without_its_changelog(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            source_distribution = (
                Path(temporary_directory) / "scaffold_xblock-1.2.3.tar.gz"
            )
            self.write_sdist(source_distribution, include_changelog=False)

            package_module = load_package_module()

            with self.assertRaisesRegex(ValueError, "CHANGES.md"):
                package_module.validate_sdist(source_distribution, "1.2.3")

    def write_sdist(self, source_distribution, include_changelog):
        root = "scaffold_xblock-1.2.3"
        relative_entries = [
            "pyproject.toml",
            "README.md",
            "MANIFEST.in",
            "scaffold_xblock/__init__.py",
            "scaffold_xblock/static/student.js",
            "scaffold_xblock/static/studio.js",
            "scaffold_xblock/static/studio-host.css",
            "scaffold_xblock/public/student-inner.html",
            "scaffold_xblock/public/student-ui.js",
            "scaffold_xblock/public/studio-inner.html",
            "scaffold_xblock/public/studio-ui.js",
            "scaffold_xblock/public/assets/runtime.js",
            "scaffold_xblock/validation/fixtures/assessment.json",
            "scaffold_xblock/validation/schemas/assessment.json",
        ]
        if include_changelog:
            relative_entries.append("CHANGES.md")
        with tarfile.open(source_distribution, "w:gz") as archive:
            for relative_name in relative_entries:
                member = tarfile.TarInfo(f"{root}/{relative_name}")
                member.size = 0
                archive.addfile(member, io.BytesIO())

    def write_timestamped_sdist(self, source_distribution, timestamp):
        with source_distribution.open("wb") as destination:
            with gzip.GzipFile(
                fileobj=destination,
                mode="wb",
                filename="",
                mtime=timestamp,
            ) as compressed:
                with tarfile.open(fileobj=compressed, mode="w") as archive:
                    contents = b"runtime"
                    member = tarfile.TarInfo("scaffold_xblock-1.2.3/runtime.txt")
                    member.mtime = timestamp
                    member.size = len(contents)
                    archive.addfile(member, io.BytesIO(contents))


class XBlockPackageCommandTest(unittest.TestCase):
    def test_builds_validates_and_copies_both_exact_distributions(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            repository_root = Path(temporary_directory)
            adapter_root = repository_root / "adapters" / "xblock"
            adapter_root.mkdir(parents=True)
            package_module = load_package_module()

            def fake_run(command, **_kwargs):
                if command[1:3] == ["-m", "build"]:
                    output_directory = Path(command[command.index("--outdir") + 1])
                    output_directory.mkdir(parents=True, exist_ok=True)
                    (output_directory / "scaffold_xblock-1.2.3-py3-none-any.whl").write_bytes(
                        b"wheel",
                    )
                    (output_directory / "scaffold_xblock-1.2.3.tar.gz").write_bytes(b"sdist")

            with (
                mock.patch.object(
                    package_module,
                    "ensure_package_tools",
                    return_value=Path("/tools/python"),
                ),
                mock.patch.object(package_module, "run_checked", side_effect=fake_run),
                mock.patch.object(package_module, "validate_wheel") as validate_wheel,
                mock.patch.object(package_module, "validate_sdist") as validate_sdist,
                mock.patch.object(package_module, "normalize_sdist"),
                mock.patch.object(package_module, "smoke_install_wheel") as smoke_install,
                mock.patch.object(package_module, "rebuild_sdist") as rebuild_sdist,
            ):
                artifacts = package_module.package_distributions(
                    repository_root,
                    adapter_root,
                    "1.2.3",
                )

            output_directory = repository_root / "dist" / "release" / "1.2.3"
            wheel = output_directory / "scaffold_xblock-1.2.3-py3-none-any.whl"
            sdist = output_directory / "scaffold_xblock-1.2.3.tar.gz"
            self.assertEqual(artifacts, [wheel, sdist])
            self.assertEqual(wheel.read_bytes(), b"wheel")
            self.assertEqual(sdist.read_bytes(), b"sdist")
            self.assertTrue(Path(f"{wheel}.sha256").is_file())
            self.assertTrue(Path(f"{sdist}.sha256").is_file())
            validate_wheel.assert_called_once()
            validate_sdist.assert_called_once()
            smoke_install.assert_called_once()
            rebuild_sdist.assert_called_once()


if __name__ == "__main__":
    unittest.main()

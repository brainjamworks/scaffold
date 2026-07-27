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
ADMIN_GUIDE = "\n".join(
    [
        "Install scaffold-xblock==1.2.3.",
        "Set OPENEDX_EXTRA_PIP_REQUIREMENTS.",
        "Run tutor images build openedx and tutor local reboot -d.",
        "Verify with pip show scaffold-xblock.",
        'Enable "scaffold".',
        "See https://example.test/releases/tag/v1.2.3.",
    ],
)


def load_package_module():
    specification = importlib.util.spec_from_file_location(
        "scaffold_xblock_package",
        PACKAGE_SCRIPT,
    )
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


def write_wheel_fixture(
    wheel_path,
    *,
    description=ADMIN_GUIDE,
    extra_entries=None,
    mode_overrides=None,
):
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
            "Metadata-Version: 2.4\n"
            "Name: scaffold-xblock\n"
            "Version: 1.2.3\n"
            "Description-Content-Type: text/markdown\n"
            "\n"
            f"{description}\n"
        ).encode(),
        f"{dist_info}/entry_points.txt": (
            b"[xblock.v1]\n"
            b"scaffold = scaffold_xblock:ScaffoldXBlock\n"
        ),
        f"{dist_info}/licenses/LICENSE": b"AGPL licence\n",
        f"{dist_info}/licenses/THIRD_PARTY_NOTICES.md": b"# Third-Party Notices\n",
        f"{dist_info}/RECORD": b"",
        **(extra_entries or {}),
    }
    with zipfile.ZipFile(wheel_path, "w") as wheel:
        for name, contents in entries.items():
            entry = zipfile.ZipInfo(name)
            entry.create_system = 3
            entry.external_attr = (mode_overrides or {}).get(name, 0o100644) << 16
            wheel.writestr(entry, contents)


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
        self.assertEqual(pyproject["project"]["requires-python"], ">=3.11")
        self.assertEqual(
            pyproject["project"]["dependencies"],
            ["XBlock>=5.2,<7"],
        )
        self.assertFalse((adapter_root / "setup.py").exists())
        self.assertTrue((adapter_root / "CHANGES.md").is_file())
        guide = (adapter_root / "README.md").read_text(encoding="utf8")
        version = root_manifest["version"]
        self.assertIn(f"scaffold-xblock=={version}", guide)
        self.assertIn("OPENEDX_EXTRA_PIP_REQUIREMENTS", guide)
        self.assertIn("tutor images build openedx", guide)
        self.assertIn("tutor local reboot -d", guide)
        self.assertIn("pip show scaffold-xblock", guide)
        self.assertIn('"scaffold"', guide)
        self.assertIn(f"releases/tag/v{version}", guide)
        self.assertIn("Python 3.11 or later", guide)
        self.assertIn(
            "Python 3.12 or later is required to build and package",
            guide,
        )

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
            write_wheel_fixture(wheel_path)

            package_module = load_package_module()

            package_module.validate_wheel(wheel_path, "1.2.3")

    def test_rejects_wheel_without_admin_installation_guide(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            wheel_path = Path(temporary_directory) / (
                "scaffold_xblock-1.2.3-py3-none-any.whl"
            )
            write_wheel_fixture(wheel_path, description="Developer build notes only.")
            package_module = load_package_module()

            with self.assertRaisesRegex(ValueError, "administrator installation guide"):
                package_module.validate_wheel(wheel_path, "1.2.3")

    def test_rejects_development_files_and_invalid_modes(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            wheel_path = Path(temporary_directory) / (
                "scaffold_xblock-1.2.3-py3-none-any.whl"
            )
            write_wheel_fixture(
                wheel_path,
                extra_entries={"scaffold_xblock/public/app.js.map": b"{}"},
            )

            package_module = load_package_module()

            with self.assertRaisesRegex(ValueError, "excluded file"):
                package_module.validate_wheel(wheel_path, "1.2.3")

            write_wheel_fixture(
                wheel_path,
                mode_overrides={"scaffold_xblock/__init__.py": 0o100755},
            )
            with self.assertRaisesRegex(ValueError, "invalid file mode"):
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

    def test_rejects_a_source_distribution_without_licence_notices(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            source_distribution = (
                Path(temporary_directory) / "scaffold_xblock-1.2.3.tar.gz"
            )
            self.write_sdist(
                source_distribution,
                include_changelog=True,
                include_licences=False,
            )

            package_module = load_package_module()

            with self.assertRaisesRegex(ValueError, "LICENSE"):
                package_module.validate_sdist(source_distribution, "1.2.3")

    def test_rejects_a_source_distribution_with_an_invalid_file_mode(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            source_distribution = (
                Path(temporary_directory) / "scaffold_xblock-1.2.3.tar.gz"
            )
            self.write_sdist(
                source_distribution,
                include_changelog=True,
                mode_overrides={"README.md": 0o755},
            )

            package_module = load_package_module()

            with self.assertRaisesRegex(ValueError, "invalid mode"):
                package_module.validate_sdist(source_distribution, "1.2.3")

    def write_sdist(
        self,
        source_distribution,
        include_changelog,
        include_licences=True,
        mode_overrides=None,
    ):
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
        if include_licences:
            relative_entries.extend(["LICENSE", "THIRD_PARTY_NOTICES.md"])
        with tarfile.open(source_distribution, "w:gz") as archive:
            for relative_name in relative_entries:
                member = tarfile.TarInfo(f"{root}/{relative_name}")
                member.size = 0
                member.mode = (mode_overrides or {}).get(relative_name, 0o644)
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
            (adapter_root / "scaffold_xblock").mkdir()
            (adapter_root / "scaffold_xblock" / "__init__.py").write_bytes(b"")
            for filename in ("pyproject.toml", "MANIFEST.in", "README.md", "CHANGES.md"):
                (adapter_root / filename).write_text("", encoding="utf8")
            (repository_root / "LICENSE").write_text("AGPL licence\n", encoding="utf8")
            (repository_root / "THIRD_PARTY_NOTICES.md").write_text(
                "# Third-Party Notices\n",
                encoding="utf8",
            )
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

    def test_rebuilt_sdist_wheel_is_installed_and_compared(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source_distribution = root / "scaffold_xblock-1.2.3.tar.gz"
            with tarfile.open(source_distribution, "w:gz") as archive:
                member = tarfile.TarInfo("scaffold_xblock-1.2.3/pyproject.toml")
                member.size = 0
                archive.addfile(member, io.BytesIO())
            expected_wheel = root / "expected.whl"
            expected_wheel.write_bytes(b"expected")
            package_module = load_package_module()

            def fake_run(command, **_kwargs):
                output_directory = Path(command[command.index("--outdir") + 1])
                output_directory.mkdir(parents=True, exist_ok=True)
                (
                    output_directory / "scaffold_xblock-1.2.3-py3-none-any.whl"
                ).write_bytes(b"rebuilt")

            with (
                mock.patch.object(package_module, "run_checked", side_effect=fake_run),
                mock.patch.object(package_module, "validate_wheel") as validate_wheel,
                mock.patch.object(package_module, "smoke_install_wheel") as smoke_install,
                mock.patch.object(package_module, "compare_wheel_payloads") as compare_payloads,
            ):
                package_module.rebuild_sdist(
                    Path("/tools/python"),
                    source_distribution,
                    "1.2.3",
                    {},
                    expected_wheel,
                )

            validate_wheel.assert_called_once()
            smoke_install.assert_called_once()
            compare_payloads.assert_called_once_with(
                expected_wheel,
                mock.ANY,
                "1.2.3",
            )

    def test_reuses_package_tools_only_after_version_probe(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            repository_root = Path(temporary_directory)
            package_module = load_package_module()
            python_path = (
                repository_root
                / ".tmp"
                / f"xblock-package-tools-{package_module.PACKAGE_TOOL_KEY}"
                / "bin"
                / "python"
            )
            python_path.parent.mkdir(parents=True)
            python_path.write_bytes(b"")

            with mock.patch.object(package_module, "run_checked") as run_checked:
                result = package_module.ensure_package_tools(repository_root)

            self.assertEqual(result, python_path)
            run_checked.assert_called_once()
            self.assertIn("importlib.metadata", run_checked.call_args.args[0][-1])


if __name__ == "__main__":
    unittest.main()

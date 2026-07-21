import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path


ADAPTER_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = ADAPTER_ROOT.parents[1]


@contextmanager
def copied_artifact_workspace():
    with tempfile.TemporaryDirectory() as temporary_directory:
        repository = Path(temporary_directory)
        adapter = repository / "adapters" / "xblock"
        shutil.copytree(ADAPTER_ROOT / "scripts", adapter / "scripts")
        shutil.copytree(
            ADAPTER_ROOT / "scaffold_xblock" / "validation",
            adapter / "scaffold_xblock" / "validation",
        )
        contract_schema = repository / "packages" / "contracts" / "generated"
        grading_fixtures = repository / "packages" / "grading" / "fixtures"
        contract_schema.mkdir(parents=True)
        grading_fixtures.mkdir(parents=True)
        shutil.copy2(
            REPOSITORY_ROOT / "packages/contracts/generated/assessment.schema.json",
            contract_schema,
        )
        shutil.copy2(
            REPOSITORY_ROOT / "packages/grading/fixtures/assessment-grading.json",
            grading_fixtures,
        )
        yield adapter


@contextmanager
def copied_distribution_source():
    with tempfile.TemporaryDirectory() as temporary_directory:
        source = Path(temporary_directory) / "xblock"
        source.mkdir()
        shutil.copy2(ADAPTER_ROOT / "setup.py", source)
        shutil.copy2(ADAPTER_ROOT / "MANIFEST.in", source)
        shutil.copytree(
            ADAPTER_ROOT / "scaffold_xblock",
            source / "scaffold_xblock",
        )
        yield source


def packaging_python():
    candidates = [
        sys.executable,
        shutil.which("python3"),
        Path("/usr/bin/python3"),
    ]
    for candidate in candidates:
        if not candidate or not Path(candidate).is_file():
            continue
        result = subprocess.run(
            [str(candidate), "-c", "import setuptools, wheel"],
            capture_output=True,
            check=False,
            text=True,
        )
        if result.returncode == 0:
            return str(candidate)
    raise unittest.SkipTest("distribution test requires setuptools and wheel")

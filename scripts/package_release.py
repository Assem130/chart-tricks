"""Package only reviewed project files; never copy the entire working directory."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parent.parent
RELEASE = ROOT / "release"
VERSION = json.loads((ROOT / "package.json").read_text())["version"]
if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?", VERSION):
    raise ValueError("Package version must be a safe semantic version.")
SOURCE_FILES = (
    "index.html", "package.json", "package-lock.json", "tsconfig.json",
    "vite.config.js", "README.md", "docs/verification.md", ".gitignore", ".gitattributes", ".node-version",
    "src/main.ts", "src/model.ts", "src/chart.ts", "src/export.ts", "src/theme.ts", "src/discovery.ts", "src/style.css",
    "public/favicon.svg", "tests/comparison.test.ts", "tests/theme.test.ts",
    "scripts/package_release.py", ".github/workflows/pages.yml", "docs/media/desktop-light.png", "docs/media/desktop-dark.png",
)
SENSITIVE_PATTERNS = (
    rb"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----",
    rb"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})",
    rb"(?:AKIA|ASIA)[A-Z0-9]{16}",
    rb"sk-[A-Za-z0-9_-]{32,}",
    rb"(?:/home/|/Users/|[A-Za-z]:\\Users\\)[A-Za-z0-9_.-]+[/\\][^\s\"'<>]+",
    rb"[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
)


def checked_bytes(path):
    for item in [path, *path.parents]:
        if item == ROOT:
            break
        if item.is_symlink():
            raise ValueError(f"Refusing symbolic link: {path.relative_to(ROOT)}")
    content = path.read_bytes()
    if path.suffix != ".png":
        for pattern in SENSITIVE_PATTERNS:
            if re.search(pattern, content):
                raise ValueError(f"Sensitive-text check failed: {path.relative_to(ROOT)}")
    return content


def source_files():
    return sorted(ROOT / name for name in SOURCE_FILES)


def write_archive(path, files, prefix=""):
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, content in files:
            entry = zipfile.ZipInfo(prefix + name, date_time=(2026, 10, 8, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, content)
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None:
            raise ValueError(f"Archive integrity check failed: {path.name}")


def main():
    source = [(str(path.relative_to(ROOT)), checked_bytes(path)) for path in source_files()]
    dist = ROOT / "dist"
    if not (dist / "index.html").is_file():
        raise ValueError("Production build missing. Run npm run build first.")
    static = []
    for path in sorted(dist.rglob("*")):
        if path.is_symlink():
            raise ValueError("Refusing a symbolic link in dist.")
        if path.is_file():
            if path.suffix not in {".html", ".js", ".css", ".svg"}:
                raise ValueError(f"Unexpected build file: {path.relative_to(ROOT)}")
            static.append((str(path.relative_to(dist)), checked_bytes(path)))
    RELEASE.mkdir(exist_ok=True)
    clean = RELEASE / "source"
    if RELEASE.is_symlink() or clean.is_symlink():
        raise ValueError("Refusing a symbolic link in the release destination.")
    source_zip = RELEASE / f"chart-tricks-{VERSION}-source.zip"
    static_zip = RELEASE / f"chart-tricks-{VERSION}-static.zip"
    for output in [source_zip, static_zip, RELEASE / "SHA256SUMS", RELEASE / "manifest.json"]:
        if output.is_symlink():
            raise ValueError("Refusing a symbolic link at a package output path.")
    if clean.exists():
        existing = {str(p.relative_to(clean)) for p in clean.rglob("*")
                    if (p.is_file() or p.is_symlink()) and ".git" not in p.relative_to(clean).parts}
        extra = existing - {name for name, _ in source}
        if extra:
            raise ValueError("Clean checkout contains unexpected files. Review before packaging.")
    for name, content in source:
        target = clean / name
        for item in [target, *target.parents]:
            if item == RELEASE:
                break
            if item.is_symlink():
                raise ValueError("Refusing a symbolic link in the clean checkout.")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    write_archive(source_zip, source, f"chart-tricks-{VERSION}/")
    write_archive(static_zip, static)
    checksums = "".join(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n"
                        for path in [source_zip, static_zip])
    (RELEASE / "SHA256SUMS").write_text(checksums)
    (RELEASE / "manifest.json").write_text(json.dumps({"version": VERSION,
        "source": [name for name, _ in source], "static": [name for name, _ in static]}, indent=2) + "\n")
    print(f"Packaged {len(source)} reviewed source files and {len(static)} static files.")
    print("Archives passed credential, personal-path and ZIP integrity checks.")


if __name__ == "__main__":
    main()

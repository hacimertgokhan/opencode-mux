# opencode-mux Release Guide

## Overview

opencode-mux supports two release modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| **Local** | Fully autonomous local build/release | Quick releases, testing |
| **CI** | GitHub Actions-based pipeline | Production releases with signing, npm, Docker, AUR, Homebrew |

## Local Release (Autonomous)

Builds all 12 platform targets, generates SHA256 checksums, creates a draft GitHub release, and uploads artifacts — all from your local machine.

```bash
# Prerequisites:
# - bun installed
# - gh CLI installed and authenticated
# - Clean git working tree

# Patch bump (default)
bun run release
# or
./script/release patch
# or Windows:
script\release.bat patch

# Minor bump
bun run release minor

# Major bump
bun run release major

# Explicit version
bun run release 1.4.0
```

### What it does:
1. ✅ Typecheck (bun turbo typecheck)
2. 🔨 Build all 12 targets (linux/darwin/windows × arm64/x64 × glibc/musl/baseline)
3. ✓ Smoke test (runs `--version` on current platform binary)
4. 🔐 Generate SHA256 checksums for all artifacts
5. 📦 Create draft GitHub release with checksums in notes
6. ⬆️ Upload all artifacts to the release

### What it doesn't do:
- ❌ NPM package publishing
- ❌ Docker image build/push
- ❌ AUR package update
- ❌ Homebrew tap update
- ❌ Windows binary code signing (requires Azure Trusted Signing via CI)
- ❌ Tauri/Electron desktop builds

## CI Release (Full Pipeline)

Triggers the `publish.yml` GitHub workflow which handles everything including npm, Docker, AUR, Homebrew, and desktop app builds.

```bash
# Patch bump (default)
bun run release:ci
# or
./script/release --ci patch

# Minor/major bump
./script/release --ci minor
./script/release --ci major
```

### Full pipeline:
1. Version resolution + changelog generation
2. CLI binary build (12 targets)
3. Windows binary signing (Azure Trusted Signing)
4. Tauri desktop app build (6 platforms, macOS code-signed)
5. Electron desktop app build (beta only)
6. NPM package publish (12 platform packages + meta package)
7. SDK package publish
8. Plugin SDK publish
9. Docker image build + push to GHCR
10. AUR package update (with SHA256 checksums)
11. Homebrew tap update (with SHA256 checksums)
12. GitHub release publish (draft → final)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GH_REPO` | GitHub repository | `hacimertgokhan/opencode-mux` |
| `OPENCODE_CHANNEL` | Release channel | Git branch name |
| `OPENCODE_BUMP` | Bump type (major/minor/patch) | None |
| `OPENCODE_VERSION` | Explicit version override | Auto-detected |

## Build Targets

| OS | Arch | ABI | AVX2 | Artifact |
|----|------|-----|------|----------|
| Linux | arm64 | glibc | ✅ | `opencode-mux-linux-arm64.tar.gz` |
| Linux | x64 | glibc | ✅ | `opencode-mux-linux-x64.tar.gz` |
| Linux | x64 | glibc | ❌ | `opencode-mux-linux-x64-baseline.tar.gz` |
| Linux | arm64 | musl | ✅ | `opencode-mux-linux-arm64-musl.tar.gz` |
| Linux | x64 | musl | ✅ | `opencode-mux-linux-x64-musl.tar.gz` |
| Linux | x64 | musl | ❌ | `opencode-mux-linux-x64-baseline-musl.tar.gz` |
| Darwin | arm64 | - | ✅ | `opencode-mux-darwin-arm64.zip` |
| Darwin | x64 | - | ✅ | `opencode-mux-darwin-x64.zip` |
| Darwin | x64 | - | ❌ | `opencode-mux-darwin-x64-baseline.zip` |
| Windows | arm64 | - | ✅ | `opencode-mux-windows-arm64.zip` |
| Windows | x64 | - | ✅ | `opencode-mux-windows-x64.zip` |
| Windows | x64 | - | ❌ | `opencode-mux-windows-x64-baseline.zip` |

## Preview vs Release

- **Preview**: Channel is not `main` (e.g., `dev`, `beta`). Version format: `0.0.0-{channel}-{timestamp}`. Artifacts are built but not uploaded to npm/registries.
- **Release**: Channel is `main`. Full version bump (e.g., `1.3.14`). All artifacts published to npm, Docker, AUR, Homebrew.

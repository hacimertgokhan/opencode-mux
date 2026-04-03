#!/usr/bin/env bun
/**
 * Autonomous local release script for opencode-mux.
 * Builds current-platform binary, creates GitHub release, uploads artifacts.
 *
 * Usage:
 *   bun script/release-local.ts              # auto-detect version (preview)
 *   bun script/release-local.ts patch        # bump patch
 *   bun script/release-local.ts minor        # bump minor
 *   bun script/release-local.ts major        # bump major
 *   bun script/release-local.ts 1.4.0        # explicit version
 *
 * Env:
 *   GH_REPO          - GitHub repo (default: hacimertgokhan/opencode-mux)
 *   OPENCODE_CHANNEL - Release channel (default: git branch name)
 */

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const root = path.resolve(__dirname, "..")
process.chdir(root)

// ── Config ──────────────────────────────────────────────────────────────────

const GH_REPO = process.env.GH_REPO ?? "hacimertgokhan/opencode-mux"
const bumpInput = process.argv[2]
const validBumps = new Set(["major", "minor", "patch"])
const isExplicitVersion = bumpInput && !validBumps.has(bumpInput) && /^\d+\.\d+\.\d+/.test(bumpInput)
const bumpType = validBumps.has(bumpInput) ? bumpInput : null

// ── Helpers ─────────────────────────────────────────────────────────────────

function log(step: string, msg?: string) {
  const prefix = msg ? `${step}: ${msg}` : step
  console.log(`\n▸ ${prefix}`)
}

function exit(err: string) {
  console.error(`\n✗ ${err}`)
  process.exit(1)
}

async function sha256(file: string): Promise<string> {
  if (process.platform === "win32") {
    const out = await $`certutil -hashfile ${file} SHA256`.text()
    const lines = out.trim().split("\n")
    return lines[1]?.trim().toLowerCase() ?? ""
  }
  const out = await $`sha256sum ${file}`.text()
  return out.split(" ")[0].trim()
}

// Map platform name to OS string used by build targets
function buildOs(): string {
  if (process.platform === "win32") return "windows"
  if (process.platform === "darwin") return "darwin"
  return "linux"
}

// ── Version Resolution ──────────────────────────────────────────────────────

async function resolveVersion(): Promise<{ version: string; channel: string; preview: boolean }> {
  const pkgPath = path.join(root, "packages/opencode/package.json")
  const pkg = await Bun.file(pkgPath).json()
  const currentVersion: string = pkg.version

  if (isExplicitVersion) {
    const channel = process.env.OPENCODE_CHANNEL ?? (await $`git branch --show-current`.text()).trim()
    return { version: bumpInput!, channel, preview: channel !== "main" }
  }

  // Get latest published version from npm (fallback to local)
  let latestVersion: string
  try {
    const npmRes = await fetch("https://registry.npmjs.org/opencode-mux-ai/latest").then((r) => r.json())
    latestVersion = npmRes.version
  } catch {
    latestVersion = currentVersion
  }

  const [major, minor, patch] = latestVersion.split(".").map(Number)
  let newVersion: string
  if (bumpType === "major") newVersion = `${major + 1}.0.0`
  else if (bumpType === "minor") newVersion = `${major}.${minor + 1}.0`
  else newVersion = `${major}.${minor}.${patch + 1}`

  const channel = process.env.OPENCODE_CHANNEL ?? (await $`git branch --show-current`.text()).trim()
  const preview = channel !== "main" && channel !== "master"
  if (preview) {
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)
    return { version: `0.0.0-${channel}-${ts}`, channel, preview: true }
  }

  return { version: newVersion, channel, preview: false }
}

// ── Pre-flight Checks ───────────────────────────────────────────────────────

async function preflight() {
  log("Checking prerequisites")

  const status = await $`git status --porcelain`.text()
  if (status.trim()) {
    exit(`Working tree is dirty. Commit or stash changes first.\n${status}`)
  }

  try {
    const authCheck = await $`gh auth status`.nothrow()
    if (authCheck.exitCode !== 0) {
      exit("gh CLI not authenticated. Run `gh auth login` first.")
    }
  } catch {
    exit("gh CLI not found. Install it from https://cli.github.com/")
  }

  const bunVer = await $`bun --version`.text().catch(() => "")
  if (!bunVer.trim()) exit("bun is required")

  log("Prerequisites OK")
}

// ── Discover artifact name for current platform ─────────────────────────────

function findLocalArtifact(distDir: string): { name: string; file: string; dirName: string } | null {
  const os = buildOs()
  const arch = process.arch

  // Try all possible variants for current platform
  const variants = [
    `opencode-mux-${os}-${arch}`,
    `opencode-mux-${os}-${arch}-baseline`,
    `opencode-mux-${os}-${arch}-musl`,
    `opencode-mux-${os}-${arch}-baseline-musl`,
  ]

  for (const variant of variants) {
    const dirPath = path.join(distDir, variant)
    if (!fs.existsSync(dirPath)) continue

    // Check for archive or binary
    const ext = os === "linux" ? "tar.gz" : "zip"
    const archiveName = `${variant}.${ext}`
    const archivePath = path.join(distDir, archiveName)

    if (fs.existsSync(archivePath)) {
      return { name: archiveName, file: archivePath, dirName: variant }
    }

    // Check for binary
    const binName = os === "windows" ? "opencode-mux.exe" : "opencode-mux"
    const binPath = path.join(dirPath, "bin", binName)
    if (fs.existsSync(binPath)) {
      return { name: `${variant}-${ext}`, file: binPath, dirName: variant }
    }
  }

  return null
}

// ── Main Pipeline ───────────────────────────────────────────────────────────

async function main() {
  await preflight()

  const { version, channel, preview } = await resolveVersion()
  log("Release plan", `v${version} channel=${channel} preview=${preview}`)

  // ── Step 1: Typecheck ────────────────────────────────────────────────────
  log("Step 1/5", "Typecheck")
  try {
    await $`bun turbo typecheck`
  } catch {
    exit("Typecheck failed")
  }

  // ── Step 2: Build current platform ───────────────────────────────────────
  log("Step 2/5", `Build ${buildOs()}-${process.arch} (v${version})`)
  try {
    await $`./packages/opencode/script/build.ts --single`
      .env({
        ...process.env,
        OPENCODE_VERSION: version,
        OPENCODE_RELEASE: preview ? "" : "1",
        GH_REPO,
      })
  } catch {
    exit("Build failed")
  }

  // ── Step 3: Verify artifact & smoke test ─────────────────────────────────
  log("Step 3/5", "Verify artifact")
  const distDir = path.join(root, "packages/opencode/dist")
  const artifact = findLocalArtifact(distDir)

  if (!artifact) {
    exit(`No build artifact found for ${buildOs()}-${process.arch} in ${distDir}`)
  }

  log("Found artifact", `${artifact.name}`)

  const binOs = buildOs()
  const arch = process.arch
  const binName = binOs === "windows" ? "opencode-mux.exe" : "opencode-mux"
  const binPath = path.join(distDir, artifact.dirName, "bin", binName)

  if (fs.existsSync(binPath)) {
    const verOut = await $`${binPath} --version`.text()
    log("Smoke test passed", verOut.trim())
  } else {
    exit(`Binary not found at ${binPath}`)
  }

  // ── Step 4: Create GitHub Release ────────────────────────────────────────
  log("Step 4/5", `Create GitHub release v${version}`)

  const tag = `v${version}`
  const notesFile = path.join(root, "tmp-release-notes.md")

  let notes = `## opencode-mux v${version}\n\n`
  if (!preview) {
    notes += `Release channel: **${channel}**\n\n`
    const sha = await sha256(artifact.file)
    notes += `### Checksum (SHA256)\n\n\`\`\`\n${sha}  ${artifact.name}\n\`\`\`\n`
  } else {
    notes += `Preview build for \`${channel}\` branch.\n`
    notes += `Platform: ${buildOs()}-${process.arch}\n`
  }

  await Bun.file(notesFile).write(notes)

  const tagExists = await $`git ls-remote --tags origin ${tag}`
    .text()
    .then((o) => o.trim().length > 0)
    .catch(() => false)

  if (!tagExists) {
    try {
      await $`gh release create ${tag} --draft --title "v${version}" --notes-file ${notesFile} --repo ${GH_REPO}`
      log("Created draft release", tag)
    } catch (e: any) {
      const msg = e.message?.toString() ?? ""
      if (!msg.includes("already exists")) {
        console.warn(`  Note: ${msg.trim()}`)
      } else {
        log("Release exists", `Using existing release ${tag}`)
      }
    }
  } else {
    log("Tag exists", `Using existing release ${tag}`)
  }

  // ── Step 5: Upload artifact ──────────────────────────────────────────────
  log("Step 5/5", "Upload artifact")

  try {
    await $`gh release upload ${tag} ${artifact.file} --clobber --repo ${GH_REPO}`
    log("Uploaded", `${artifact.name} to ${tag}`)
  } catch (e: any) {
    console.warn(`  Upload warning: ${e.message?.trim() ?? "unknown error"}`)
  }

  // Cleanup
  try {
    await $`rm -f ${notesFile}`
  } catch {}

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    Release Summary                        ║
╠═══════════════════════════════════════════════════════════╣
║  Repo:      ${GH_REPO.padEnd(48)}║
║  Tag:       ${tag.padEnd(48)}║
║  Channel:   ${channel.padEnd(48)}║
║  Preview:   ${String(preview).padEnd(48)}║
║  Platform:  ${(buildOs() + "-" + process.arch).padEnd(48)}║
╠═══════════════════════════════════════════════════════════╣
║  View: https://github.com/${GH_REPO}/releases/tag/${tag}
║${" ".repeat(54)}║
╚═══════════════════════════════════════════════════════════╝
  `)

  // ── Git tag ──────────────────────────────────────────────────────────────
  if (!preview) {
    log("Git operations")
    try {
      await $`git tag ${tag}`.nothrow()
      await $`git push origin ${tag} --no-verify`.nothrow()
      log("Tag pushed", tag)
    } catch {
      console.log("  (tag push skipped, may already exist)")
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

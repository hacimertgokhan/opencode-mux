#!/usr/bin/env bun
/**
 * Autonomous local release script for opencode-mux.
 * Builds all targets, generates checksums, creates GitHub release, and uploads artifacts.
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

// ── Version Resolution ──────────────────────────────────────────────────────

async function resolveVersion(): Promise<{ version: string; channel: string; preview: boolean }> {
  const pkgPath = path.join(root, "packages/opencode/package.json")
  const pkg = await Bun.file(pkgPath).json()
  const currentVersion: string = pkg.version

  if (isExplicitVersion) {
    const channel = process.env.OPENCODE_CHANNEL ?? (await $`git branch --show-current`.text()).trim()
    return { version: bumpInput!, channel, preview: channel !== "main" }
  }

  // Get latest published version from npm
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

  // Check git status
  const status = await $`git status --porcelain`.text()
  if (status.trim()) {
    exit(`Working tree is dirty. Commit or stash changes first.\n${status}`)
  }

  // Check gh auth
  try {
    const authCheck = await $`gh auth status`.nothrow()
    if (authCheck.exitCode !== 0) {
      exit("gh CLI not authenticated. Run `gh auth login` first.")
    }
  } catch {
    exit("gh CLI not found. Install it from https://cli.github.com/")
  }

  // Check bun
  const bunVer = await $`bun --version`.text().catch(() => "")
  if (!bunVer.trim()) exit("bun is required")

  log("Prerequisites OK")
}

// ── Main Pipeline ───────────────────────────────────────────────────────────

async function main() {
  await preflight()

  const { version, channel, preview } = await resolveVersion()
  log("Release plan", `v${version} channel=${channel} preview=${preview}`)

  // ── Step 1: Typecheck ────────────────────────────────────────────────────
  log("Step 1/6", "Typecheck")
  try {
    await $`bun turbo typecheck`
  } catch {
    exit("Typecheck failed")
  }

  // ── Step 2: Build all targets ────────────────────────────────────────────
  log("Step 2/6", `Build all targets (v${version})`)
  try {
    await $`./packages/opencode/script/build.ts`
      .env({
        ...process.env,
        OPENCODE_VERSION: version,
        OPENCODE_RELEASE: preview ? "" : "1",
        GH_REPO,
      })
  } catch {
    exit("Build failed")
  }

  // ── Step 3: Verify artifacts exist ───────────────────────────────────────
  log("Step 3/6", "Verify artifacts")
  const distDir = path.join(root, "packages/opencode/dist")
  const artifacts: { name: string; file: string }[] = []

  const expectedFiles = [
    "opencode-mux-linux-arm64.tar.gz",
    "opencode-mux-linux-x64.tar.gz",
    "opencode-mux-linux-x64-baseline.tar.gz",
    "opencode-mux-linux-arm64-musl.tar.gz",
    "opencode-mux-linux-x64-musl.tar.gz",
    "opencode-mux-linux-x64-baseline-musl.tar.gz",
    "opencode-mux-darwin-arm64.zip",
    "opencode-mux-darwin-x64.zip",
    "opencode-mux-darwin-x64-baseline.zip",
    "opencode-mux-windows-arm64.zip",
    "opencode-mux-windows-x64.zip",
    "opencode-mux-windows-x64-baseline.zip",
  ]

  for (const f of expectedFiles) {
    const fp = path.join(distDir, f)
    if (!fs.existsSync(fp)) {
      console.warn(`  ⚠ Missing: ${f}`)
      continue
    }
    const stat = fs.statSync(fp)
    const sha = await sha256(fp)
    artifacts.push({ name: f, file: fp })
    console.log(`  ✓ ${f} (${(stat.size / 1024).toFixed(1)} KB, sha256:${sha.slice(0, 16)}...)`)
  }

  if (artifacts.length === 0) {
    exit("No artifacts found")
  }

  // ── Step 4: Smoke test current-platform binary ───────────────────────────
  log("Step 4/6", "Smoke test")
  const platform = process.platform
  const arch = process.arch
  const ext = platform === "win32" ? ".exe" : ""
  const binaryName = `opencode-mux${ext}`
  const binaryPath = path.join(distDir, `opencode-mux-${platform === "win32" ? "windows" : platform}-${arch}`, "bin", binaryName)

  if (fs.existsSync(binaryPath)) {
    const verOut = await $`${binaryPath} --version`.text()
    log("Smoke test passed", verOut.trim())
  } else {
    console.warn(`  ⚠ Binary not found at ${binaryPath}, skipping smoke test`)
  }

  // ── Step 5: Create GitHub Release ────────────────────────────────────────
  log("Step 5/6", `Create GitHub release v${version}`)

  const tag = `v${version}`

  // Check if tag exists
  const tagExists = await $`git ls-remote --tags origin ${tag}`.text().then((o) => o.trim().length > 0).catch(() => false)

  if (!tagExists) {
    // Create changelog body
    let notes = `## opencode-mux v${version}\n\n`
    if (!preview) {
      notes += `Release channel: **${channel}**\n\n`
      notes += `### Checksums (SHA256)\n\n\`\`\`\n`
      for (const a of artifacts) {
        const sha = await sha256(a.file)
        notes += `${sha}  ${a.name}\n`
      }
      notes += `\`\`\`\n`
    } else {
      notes += `Preview build for \`${channel}\` branch.\n`
    }

    const notesFile = path.join(root, "dist", "release-notes.md")
    await $`mkdir -p dist`
    await Bun.file(notesFile).write(notes)

    try {
      await $`gh release create ${tag} --draft --title "v${version}" --notes-file ${notesFile} --repo ${GH_REPO}`
      log("Created draft release", tag)
    } catch (e: any) {
      const msg = e.message?.toString() ?? ""
      if (msg.includes("already exists")) {
        log("Release exists", `Using existing release ${tag}`)
      } else {
        console.warn(`  Note: ${msg.trim()}`)
      }
    }
  } else {
    log("Tag exists", `Using existing release ${tag}`)
  }

  // ── Step 6: Upload artifacts ─────────────────────────────────────────────
  log("Step 6/6", "Upload artifacts")

  const artifactFiles = artifacts.map((a) => a.file)
  if (artifactFiles.length > 0) {
    try {
      await $`gh release upload ${tag} ${artifactFiles} --clobber --repo ${GH_REPO}`
      log("Uploaded", `${artifactFiles.length} artifacts to ${tag}`)
    } catch (e: any) {
      console.warn(`  Upload warning: ${e.message?.trim() ?? "unknown error"}`)
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    Release Summary                        ║
╠═══════════════════════════════════════════════════════════╣
║  Repo:      ${GH_REPO.padEnd(48)}║
║  Tag:       ${tag.padEnd(48)}║
║  Channel:   ${channel.padEnd(48)}║
║  Preview:   ${String(preview).padEnd(48)}║
║  Artifacts: ${String(artifacts.length).padEnd(48)}║
╠═══════════════════════════════════════════════════════════╣
║  View: https://github.com/${GH_REPO}/releases/tag/${tag}
║${" ".repeat(54)}║
╚═══════════════════════════════════════════════════════════╝
  `)

  // ── Optional: Git tag and commit ─────────────────────────────────────────
  if (!preview && !isExplicitVersion && bumpType) {
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

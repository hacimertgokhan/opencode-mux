import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"
import { Process } from "@/util/process"
import fs from "fs/promises"
import os from "os"
import open, { openApp } from "open"
import path from "path"

export namespace Ready {
  export type Step = { type: "app"; app: string } | { type: "project"; app?: string; path: string }
  export type Fail = { step: Step; error: string }
  export type Run = {
    text: string
    steps: Step[]
    done: Step[]
    fail: Fail[]
  }
  export type State = {
    enabled: boolean
    startup: boolean
    prompt: string
  }
  export type Boot = {
    ok: boolean
    message: string
    state: State
  }

  const file = path.join(Global.Path.state, "ready.json")
  const label = "ai.opencode.mux.ready"
  const launch = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`)

  const apps = [
    ["jetbrains webstorm", "WebStorm"],
    ["webstorm", "WebStorm"],
    ["visual studio code", "Visual Studio Code"],
    ["vs code", "Visual Studio Code"],
    ["vscode", "Visual Studio Code"],
    ["cursor", "Cursor"],
    ["intellij", "IntelliJ IDEA"],
    ["spotify", "Spotify"],
    ["discord", "Discord"],
    ["slack", "Slack"],
    ["notion", "Notion"],
    ["terminal", "Terminal"],
    ["finder", "Finder"],
    ["chrome", "Google Chrome"],
    ["safari", "Safari"],
  ] as const

  const verbs = /\b(aç|ac|open|başlat|baslat|çalıştır|calistir|launch|start)\b/i
  const hint = /\b(project|proje|path|klasör|folder)\b/i

  function base(input?: Partial<State>): State {
    return {
      enabled: input?.enabled ?? false,
      startup: input?.startup ?? false,
      prompt: input?.prompt?.trim() ?? "",
    }
  }

  function esc(input: string) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  function split(input: string) {
    return input
      .split(/\r?\n/)
      .flatMap((line) =>
        line.split(/\s*(?:,|;|\band then\b|\bthen\b|\bdaha sonra\b|\bsonra\b|\bve ardından\b|\bve\b)\s*/i),
      )
      .map((line) => line.trim())
      .filter(Boolean)
  }

  function app(input: string) {
    const text = input.toLocaleLowerCase("tr")
    for (const [alias, name] of apps) {
      const exp = new RegExp(`(?:^|\\b)${esc(alias)}(?:\\b|$)`, "i")
      if (exp.test(text)) return name
    }
    return
  }

  function clean(input: string) {
    return input.replace(/[),.;]+$/, "")
  }

  function absolute(input: string, cwd: string) {
    if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2))
    if (path.isAbsolute(input)) return input
    if (/^[A-Za-z]:[\\/]/.test(input)) return input
    return path.resolve(cwd, input)
  }

  function token(input: string) {
    const quoted = input.match(/["']([^"']*[\\/][^"']*)["']/)
    if (quoted?.[1]) return clean(quoted[1])
    const match = input.match(/(~\/[^\s,;]+|\/[^\s,;]+|[A-Za-z]:[\\/][^\s,;]+|(?:\.\.?\/)[^\s,;]+|[^\s,;]*\/[^\s,;]+)/)
    if (!match?.[1]) return
    return clean(match[1])
  }

  function parse(input: string, cwd: string) {
    const name = app(input)
    const file = token(input)
    const open = verbs.test(input)
    if (file && (open || name || hint.test(input))) {
      return {
        type: "project" as const,
        path: absolute(file, cwd),
        app: name,
      }
    }
    if (!name) return
    if (open || input.trim().split(/\s+/).length <= 3) {
      return {
        type: "app" as const,
        app: name,
      }
    }
  }

  async function step(input: Step) {
    if (input.type === "app") {
      await openApp(input.app, {
        wait: false,
        newInstance: false,
      })
      return
    }
    if (!(await Filesystem.exists(input.path))) {
      throw new Error(`Path not found: ${input.path}`)
    }
    if (!input.app) {
      await open(input.path, {
        wait: false,
      })
      return
    }
    await open(input.path, {
      wait: false,
      app: {
        name: input.app,
      },
    })
  }

  function plist(bin: string) {
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
      `<plist version="1.0">`,
      `<dict>`,
      `  <key>Label</key>`,
      `  <string>${label}</string>`,
      `  <key>ProgramArguments</key>`,
      `  <array>`,
      `    <string>${bin}</string>`,
      `    <string>--ready</string>`,
      `    <string>--startup-run</string>`,
      `  </array>`,
      `  <key>RunAtLoad</key>`,
      `  <true/>`,
      `  <key>KeepAlive</key>`,
      `  <false/>`,
      `  <key>StandardOutPath</key>`,
      `  <string>${path.join(Global.Path.log, "ready.log")}</string>`,
      `  <key>StandardErrorPath</key>`,
      `  <string>${path.join(Global.Path.log, "ready.err.log")}</string>`,
      `</dict>`,
      `</plist>`,
      "",
    ].join("\n")
  }

  async function load() {
    const data = await Filesystem.readJson<Partial<State>>(file).catch(() => undefined)
    return base(data)
  }

  async function save(input: Partial<State>) {
    const curr = await load()
    const next = base({
      ...curr,
      ...input,
    })
    await Filesystem.writeJson(file, next)
    return next
  }

  async function boot(value: boolean) {
    if (process.platform !== "darwin") {
      return {
        ok: false,
        message: "Startup trigger is currently supported on macOS only.",
      }
    }
    if (!value) {
      await Process.run(["launchctl", "unload", launch], { nothrow: true })
      await fs.rm(launch, { force: true }).catch(() => {})
      return {
        ok: true,
        message: "Startup trigger disabled.",
      }
    }
    await Filesystem.write(launch, plist(process.execPath))
    await Process.run(["launchctl", "unload", launch], { nothrow: true })
    const out = await Process.run(["launchctl", "load", launch], { nothrow: true })
    if (out.code === 0) {
      return {
        ok: true,
        message: "Startup trigger enabled.",
      }
    }
    const err = out.stderr.toString().trim()
    return {
      ok: false,
      message: err || "Failed to register startup trigger.",
    }
  }

  export function steps(text: string, cwd = process.cwd()) {
    const list = split(text).map((line) => parse(line, cwd))
    return list.filter((line): line is Exclude<typeof line, undefined> => line !== undefined)
  }

  export async function run(input: { text: string; cwd?: string }): Promise<Run> {
    const cwd = input.cwd ?? process.cwd()
    const list = steps(input.text, cwd)
    const done: Step[] = []
    const fail: Fail[] = []

    for (const item of list) {
      await step(item)
        .then(() => done.push(item))
        .catch((err) =>
          fail.push({
            step: item,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
    }

    return {
      text: input.text,
      steps: list,
      done,
      fail,
    }
  }

  export async function state() {
    return load()
  }

  export async function prompt(text: string) {
    return save({
      prompt: text,
    })
  }

  export async function personalize(value: boolean): Promise<Boot> {
    const state = await save({
      enabled: value,
      startup: value,
    })
    const out = await boot(value)
    return {
      ...out,
      state,
    }
  }
}

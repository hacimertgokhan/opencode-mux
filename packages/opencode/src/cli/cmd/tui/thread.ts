import { cmd } from "@/cli/cmd/cmd"
import { tui } from "./app"
import { Rpc } from "@/util/rpc"
import { type rpc } from "./worker"
import path from "path"
import { fileURLToPath } from "url"
import { UI } from "@/cli/ui"
import { Log } from "@/util/log"
import { errorMessage } from "@/util/error"
import { withTimeout } from "@/util/timeout"
import { withNetworkOptions, resolveNetworkOptions } from "@/cli/network"
import { Filesystem } from "@/util/filesystem"
import type { Event } from "@opencode-ai/sdk/v2"
import type { EventSource } from "./context/sdk"
import { win32DisableProcessedInput, win32InstallCtrlCGuard } from "./win32"
import { TuiConfig } from "@/config/tui"
import { Instance } from "@/project/instance"
import { writeHeapSnapshot } from "v8"
import { Ready } from "@/ready"
import os from "os"

declare global {
  const OPENCODE_WORKER_PATH: string
}

type RpcClient = ReturnType<typeof Rpc.client<typeof rpc>>

function createWorkerFetch(client: RpcClient): typeof fetch {
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const body = request.body ? await request.text() : undefined
    const result = await client.call("fetch", {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
    })
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    })
  }
  return fn as typeof fetch
}

function createEventSource(client: RpcClient): EventSource {
  return {
    on: (handler) => client.on<Event>("event", handler),
    setWorkspace: (workspaceID) => {
      void client.call("setWorkspace", { workspaceID })
    },
  }
}

async function target() {
  if (typeof OPENCODE_WORKER_PATH !== "undefined") return OPENCODE_WORKER_PATH
  const dist = new URL("./cli/cmd/tui/worker.js", import.meta.url)
  if (await Filesystem.exists(fileURLToPath(dist))) return dist
  return new URL("./worker.ts", import.meta.url)
}

async function input(value?: string) {
  const piped = process.stdin.isTTY ? undefined : await Bun.stdin.text()
  if (!value) return piped
  if (!piped) return value
  return piped + "\n" + value
}

export const TuiThreadCommand = cmd({
  command: "$0 [project]",
  describe: "start opencode tui",
  builder: (yargs) =>
    withNetworkOptions(yargs)
      .positional("project", {
        type: "string",
        describe: "path to start opencode in",
      })
      .option("model", {
        type: "string",
        alias: ["m"],
        describe: "model to use in the format of provider/model",
      })
      .option("continue", {
        alias: ["c"],
        describe: "continue the last session",
        type: "boolean",
      })
      .option("session", {
        alias: ["s"],
        type: "string",
        describe: "session id to continue",
      })
      .option("fork", {
        type: "boolean",
        describe: "fork the session when continuing (use with --continue or --session)",
      })
      .option("prompt", {
        type: "string",
        describe: "prompt to use",
      })
      .option("ready", {
        type: "boolean",
        describe: "run local ready actions from text (open app/project shortcuts)",
      })
      .option("startupRun", {
        type: "boolean",
        alias: ["startup-run"],
        hidden: true,
      })
      .option("readyPrompt", {
        type: "string",
        alias: ["ready-prompt"],
        describe: "default ready text used by startup trigger and plain --ready runs",
      })
      .option("personalize", {
        type: "boolean",
        describe: "toggle personalize mode (also toggles startup trigger); use --no-personalize to disable",
      })
      .option("agent", {
        type: "string",
        describe: "agent to use",
      }),
  handler: async (args) => {
    // Keep ENABLE_PROCESSED_INPUT cleared even if other code flips it.
    // (Important when running under `bun run` wrappers on Windows.)
    const unguard = win32InstallCtrlCGuard()
    try {
      // Must be the very first thing — disables CTRL_C_EVENT before any Worker
      // spawn or async work so the OS cannot kill the process group.
      win32DisableProcessedInput()

      if (args.fork && !args.continue && !args.session) {
        UI.error("--fork requires --continue or --session")
        process.exitCode = 1
        return
      }
      const prompt = await input(args.prompt)

      if (args.readyPrompt?.trim()) {
        await Ready.prompt(args.readyPrompt.trim())
        UI.println(UI.Style.TEXT_INFO_BOLD + "~  " + UI.Style.TEXT_NORMAL + "Saved ready prompt")
      }

      if (args.personalize !== undefined) {
        const out = await Ready.personalize(args.personalize)
        const mark = out.state.enabled ? "✓" : "~"
        const text = out.state.enabled ? "enabled" : "disabled"
        UI.println(UI.Style.TEXT_INFO_BOLD + `${mark}  ` + UI.Style.TEXT_NORMAL + `Personalize mode ${text}`)
        UI.println(UI.Style.TEXT_DIM + out.message + UI.Style.TEXT_NORMAL)
      }

      if (args.ready) {
        const cfg = await Ready.state()
        const text = (() => {
          const line = prompt?.trim()
          if (line) return line

          const seed = typeof args.project === "string" ? args.project.trim() : ""
          if (seed) return seed

          if (args.startupRun && cfg.prompt) return cfg.prompt
          if (cfg.prompt) return cfg.prompt
          return
        })()

        if (!text) {
          UI.error("No ready text found. Use --prompt, pipe stdin, or set --ready-prompt first.")
          process.exitCode = 1
          return
        }

        const out = await Ready.run({
          text,
          cwd: args.startupRun ? process.env.HOME ?? os.homedir() : process.cwd(),
        })

        if (out.steps.length === 0) {
          UI.error("No local action found in ready text.")
          process.exitCode = 1
          return
        }

        await Ready.prompt(text)

        for (const item of out.done) {
          const info =
            item.type === "app" ? `Opened app: ${item.app}` : `Opened: ${item.path}${item.app ? ` (${item.app})` : ""}`
          UI.println(UI.Style.TEXT_SUCCESS + "✓  " + UI.Style.TEXT_NORMAL + info)
        }

        for (const item of out.fail) {
          const info =
            item.step.type === "app"
              ? `Failed app: ${item.step.app}`
              : `Failed path: ${item.step.path}${item.step.app ? ` (${item.step.app})` : ""}`
          UI.println(UI.Style.TEXT_DANGER_BOLD + "✗  " + UI.Style.TEXT_NORMAL + `${info} · ${item.error}`)
        }

        if (out.fail.length > 0 && out.done.length === 0) {
          process.exitCode = 1
        }
        return
      }

      if (args.personalize !== undefined || args.readyPrompt?.trim()) return

      // Resolve relative --project paths from PWD, then use the real cwd after
      // chdir so the thread and worker share the same directory key.
      const root = Filesystem.resolve(process.env.PWD ?? process.cwd())
      const next = args.project
        ? Filesystem.resolve(path.isAbsolute(args.project) ? args.project : path.join(root, args.project))
        : Filesystem.resolve(process.cwd())
      const file = await target()
      try {
        process.chdir(next)
      } catch {
        UI.error("Failed to change directory to " + next)
        return
      }
      const cwd = Filesystem.resolve(process.cwd())

      const worker = new Worker(file, {
        env: Object.fromEntries(
          Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
        ),
      })
      worker.onerror = (e) => {
        Log.Default.error(e)
      }

      const client = Rpc.client<typeof rpc>(worker)
      const error = (e: unknown) => {
        Log.Default.error(e)
      }
      const reload = () => {
        client.call("reload", undefined).catch((err) => {
          Log.Default.warn("worker reload failed", {
            error: errorMessage(err),
          })
        })
      }
      process.on("uncaughtException", error)
      process.on("unhandledRejection", error)
      process.on("SIGUSR2", reload)

      let stopped = false
      const stop = async () => {
        if (stopped) return
        stopped = true
        process.off("uncaughtException", error)
        process.off("unhandledRejection", error)
        process.off("SIGUSR2", reload)
        await withTimeout(client.call("shutdown", undefined), 5000).catch((error) => {
          Log.Default.warn("worker shutdown failed", {
            error: errorMessage(error),
          })
        })
        worker.terminate()
      }

      const config = await Instance.provide({
        directory: cwd,
        fn: () => TuiConfig.get(),
      })

      const network = await resolveNetworkOptions(args)
      const external =
        process.argv.includes("--port") ||
        process.argv.includes("--hostname") ||
        process.argv.includes("--mdns") ||
        network.mdns ||
        network.port !== 0 ||
        network.hostname !== "127.0.0.1"

      const transport = external
        ? {
            url: (await client.call("server", network)).url,
            fetch: undefined,
            events: undefined,
          }
        : {
            url: "http://opencode.internal",
            fetch: createWorkerFetch(client),
            events: createEventSource(client),
          }

      setTimeout(() => {
        client.call("checkUpgrade", { directory: cwd }).catch(() => {})
      }, 1000).unref?.()

      try {
        await tui({
          url: transport.url,
          async onSnapshot() {
            const tui = writeHeapSnapshot("tui.heapsnapshot")
            const server = await client.call("snapshot", undefined)
            return [tui, server]
          },
          config,
          directory: cwd,
          fetch: transport.fetch,
          events: transport.events,
          args: {
            continue: args.continue,
            sessionID: args.session,
            agent: args.agent,
            model: args.model,
            prompt,
            fork: args.fork,
          },
        })
      } finally {
        await stop()
      }
    } finally {
      unguard?.()
    }
    process.exit(0)
  },
})

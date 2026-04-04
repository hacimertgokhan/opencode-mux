import { render, TimeToFirstDraw, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { Clipboard } from "@tui/util/clipboard"
import { Selection } from "@tui/util/selection"
import { createCliRenderer, MouseButton, type CliRendererConfig } from "@opentui/core"
import { RouteProvider, useRoute } from "@tui/context/route"
import {
  Switch,
  Match,
  createEffect,
  createMemo,
  ErrorBoundary,
  createSignal,
  onMount,
  batch,
  Show,
  on,
  onCleanup,
} from "solid-js"
import { win32DisableProcessedInput, win32InstallCtrlCGuard } from "./win32"
import { Flag } from "@/flag/flag"
import semver from "semver"
import { DialogProvider, useDialog } from "@tui/ui/dialog"
import { DialogProvider as DialogProviderList } from "@tui/component/dialog-provider"
import { ErrorComponent } from "@tui/component/error-component"
import { PluginRouteMissing } from "@tui/component/plugin-route-missing"
import { SDKProvider, useSDK } from "@tui/context/sdk"
import { StartupLoading } from "@tui/component/startup-loading"
import { SyncProvider, useSync } from "@tui/context/sync"
import { LocalProvider, useLocal } from "@tui/context/local"
import { DialogModel, useConnected } from "@tui/component/dialog-model"
import { DialogMcp } from "@tui/component/dialog-mcp"
import { DialogSkillInstaller } from "@tui/component/dialog-skill-installer"
import { DialogMcpInstaller } from "@tui/component/dialog-mcp-installer"
import { DialogStatus } from "@tui/component/dialog-status"
import { DialogThemeList } from "@tui/component/dialog-theme-list"
import { DialogHelp } from "./ui/dialog-help"
import { CommandProvider, useCommandDialog } from "@tui/component/dialog-command"
import { DialogAgent } from "@tui/component/dialog-agent"
import { DialogSessionList } from "@tui/component/dialog-session-list"
import { DialogWorkspaceList } from "@tui/component/dialog-workspace-list"
import { KeybindProvider, useKeybind } from "@tui/context/keybind"
import { ThemeProvider, useTheme } from "@tui/context/theme"
import { Home } from "@tui/routes/home"
import { Session } from "@tui/routes/session"
import { PromptHistoryProvider } from "./component/prompt/history"
import { FrecencyProvider } from "./component/prompt/frecency"
import { PromptStashProvider } from "./component/prompt/stash"
import { DialogAlert } from "./ui/dialog-alert"
import { DialogConfirm } from "./ui/dialog-confirm"
import { ToastProvider, useToast } from "./ui/toast"
import { ExitProvider, useExit } from "./context/exit"
import { Session as SessionApi } from "@/session"
import { TuiEvent } from "./event"
import { KVProvider, useKV } from "./context/kv"
import { Provider } from "@/provider/provider"
import { ArgsProvider, useArgs, type Args } from "./context/args"
import open from "open"
import { writeHeapSnapshot } from "v8"
import { PromptRefProvider, usePromptRef } from "./context/prompt"
import { TuiConfigProvider, useTuiConfig } from "./context/tui-config"
import { TuiConfig } from "@/config/tui"
import { createTuiApi, TuiPluginRuntime, type RouteMap } from "./plugin"
import { FormatError, FormatUnknownError } from "@/cli/error"
import { LayoutMap, LayoutPreset as Layouts, layout, type LayoutPreset } from "@/config/tui-layout"
import { Ready } from "@/ready"
import { Global } from "@/global"
import path from "path"
import { mkdir } from "fs/promises"

async function getTerminalBackgroundColor(): Promise<"dark" | "light"> {
  // can't set raw mode if not a TTY
  if (!process.stdin.isTTY) return "dark"

  return new Promise((resolve) => {
    let timeout: NodeJS.Timeout

    const cleanup = () => {
      process.stdin.setRawMode(false)
      process.stdin.removeListener("data", handler)
      clearTimeout(timeout)
    }

    const handler = (data: Buffer) => {
      const str = data.toString()
      const match = str.match(/\x1b]11;([^\x07\x1b]+)/)
      if (match) {
        cleanup()
        const color = match[1]
        // Parse RGB values from color string
        // Formats: rgb:RR/GG/BB or #RRGGBB or rgb(R,G,B)
        let r = 0,
          g = 0,
          b = 0

        if (color.startsWith("rgb:")) {
          const parts = color.substring(4).split("/")
          r = parseInt(parts[0], 16) >> 8 // Convert 16-bit to 8-bit
          g = parseInt(parts[1], 16) >> 8 // Convert 16-bit to 8-bit
          b = parseInt(parts[2], 16) >> 8 // Convert 16-bit to 8-bit
        } else if (color.startsWith("#")) {
          r = parseInt(color.substring(1, 3), 16)
          g = parseInt(color.substring(3, 5), 16)
          b = parseInt(color.substring(5, 7), 16)
        } else if (color.startsWith("rgb(")) {
          const parts = color.substring(4, color.length - 1).split(",")
          r = parseInt(parts[0])
          g = parseInt(parts[1])
          b = parseInt(parts[2])
        }

        // Calculate luminance using relative luminance formula
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

        // Determine if dark or light based on luminance threshold
        resolve(luminance > 0.5 ? "light" : "dark")
      }
    }

    process.stdin.setRawMode(true)
    process.stdin.on("data", handler)
    process.stdout.write("\x1b]11;?\x07")

    timeout = setTimeout(() => {
      cleanup()
      resolve("dark")
    }, 1000)
  })
}

import type { EventSource } from "./context/sdk"
import { DialogVariant } from "./component/dialog-variant"
import { DialogMuxModels, DialogRouterManager, DialogRouterManagerKeys } from "./component/dialog-router-manager"

function rendererConfig(_config: TuiConfig.Info): CliRendererConfig {
  return {
    externalOutputMode: "passthrough",
    targetFps: 60,
    gatherStats: false,
    exitOnCtrlC: false,
    useKittyKeyboard: { events: process.platform === "win32" },
    autoFocus: false,
    openConsoleOnError: false,
    consoleOptions: {
      keyBindings: [{ name: "y", ctrl: true, action: "copy-selection" }],
      onCopySelection: (text) => {
        Clipboard.copy(text).catch((error) => {
          console.error(`Failed to copy console selection to clipboard: ${error}`)
        })
      },
    },
  }
}

function errorMessage(error: unknown) {
  const formatted = FormatError(error)
  if (formatted !== undefined) return formatted
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "message" in error.data &&
    typeof error.data.message === "string"
  ) {
    return error.data.message
  }
  return FormatUnknownError(error)
}

export function tui(input: {
  url: string
  args: Args
  config: TuiConfig.Info
  onSnapshot?: () => Promise<string[]>
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  events?: EventSource
}) {
  // promise to prevent immediate exit
  return new Promise<void>(async (resolve) => {
    const unguard = win32InstallCtrlCGuard()
    win32DisableProcessedInput()

    const mode = await getTerminalBackgroundColor()

    // Re-clear after getTerminalBackgroundColor() — setRawMode(false) restores
    // the original console mode which re-enables ENABLE_PROCESSED_INPUT.
    win32DisableProcessedInput()

    const onExit = async () => {
      unguard?.()
      resolve()
    }

    const onBeforeExit = async () => {
      await TuiPluginRuntime.dispose()
    }

    const renderer = await createCliRenderer(rendererConfig(input.config))

    await render(() => {
      return (
        <ErrorBoundary
          fallback={(error, reset) => (
            <ErrorComponent error={error} reset={reset} onBeforeExit={onBeforeExit} onExit={onExit} mode={mode} />
          )}
        >
          <ArgsProvider {...input.args}>
            <ExitProvider onBeforeExit={onBeforeExit} onExit={onExit}>
              <KVProvider>
                <ToastProvider>
                  <RouteProvider>
                    <TuiConfigProvider config={input.config}>
                      <SDKProvider
                        url={input.url}
                        directory={input.directory}
                        fetch={input.fetch}
                        headers={input.headers}
                        events={input.events}
                      >
                        <SyncProvider>
                          <ThemeProvider mode={mode}>
                            <LocalProvider>
                              <KeybindProvider>
                                <PromptStashProvider>
                                  <DialogProvider>
                                    <CommandProvider>
                                      <FrecencyProvider>
                                        <PromptHistoryProvider>
                                          <PromptRefProvider>
                                            <App onSnapshot={input.onSnapshot} />
                                          </PromptRefProvider>
                                        </PromptHistoryProvider>
                                      </FrecencyProvider>
                                    </CommandProvider>
                                  </DialogProvider>
                                </PromptStashProvider>
                              </KeybindProvider>
                            </LocalProvider>
                          </ThemeProvider>
                        </SyncProvider>
                      </SDKProvider>
                    </TuiConfigProvider>
                  </RouteProvider>
                </ToastProvider>
              </KVProvider>
            </ExitProvider>
          </ArgsProvider>
        </ErrorBoundary>
      )
    }, renderer)
  })
}

function App(props: { onSnapshot?: () => Promise<string[]> }) {
  const tuiConfig = useTuiConfig()
  const route = useRoute()
  const dimensions = useTerminalDimensions()
  const renderer = useRenderer()
  const dialog = useDialog()
  const local = useLocal()
  const kv = useKV()
  const command = useCommandDialog()
  const keybind = useKeybind()
  const sdk = useSDK()
  const toast = useToast()
  const themeState = useTheme()
  const { theme, mode, setMode, locked, lock, unlock } = themeState
  const sync = useSync()
  const exit = useExit()
  const promptRef = usePromptRef()
  const routes: RouteMap = new Map()
  const [routeRev, setRouteRev] = createSignal(0)
  const routeView = (name: string) => {
    routeRev()
    return routes.get(name)?.at(-1)?.render
  }

  const api = createTuiApi({
    command,
    tuiConfig,
    dialog,
    keybind,
    kv,
    route,
    routes,
    bump: () => setRouteRev((x) => x + 1),
    sdk,
    sync,
    theme: themeState,
    toast,
    renderer,
  })
  onCleanup(() => {
    api.dispose()
  })
  const [ready, setReady] = createSignal(false)
  TuiPluginRuntime.init(api)
    .catch((error) => {
      console.error("Failed to load TUI plugins", error)
    })
    .finally(() => {
      setReady(true)
    })

  useKeyboard((evt) => {
    if (!Flag.OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return
    const sel = renderer.getSelection()
    if (!sel) return

    // Windows Terminal-like behavior:
    // - Ctrl+C copies and dismisses selection
    // - Esc dismisses selection
    // - Most other key input dismisses selection and is passed through
    if (evt.ctrl && evt.name === "c") {
      if (!Selection.copy(renderer, toast)) {
        renderer.clearSelection()
        return
      }

      evt.preventDefault()
      evt.stopPropagation()
      return
    }

    if (evt.name === "escape") {
      renderer.clearSelection()
      evt.preventDefault()
      evt.stopPropagation()
      return
    }

    const focus = renderer.currentFocusedRenderable
    if (focus?.hasSelection() && sel.selectedRenderables.includes(focus)) {
      return
    }

    renderer.clearSelection()
  })

  // Wire up console copy-to-clipboard via opentui's onCopySelection callback
  renderer.console.onCopySelection = async (text: string) => {
    if (!text || text.length === 0) return

    await Clipboard.copy(text)
      .then(() => toast.show({ message: "Copied to clipboard", variant: "info" }))
      .catch(toast.error)

    renderer.clearSelection()
  }
  const [terminalTitleEnabled, setTerminalTitleEnabled] = createSignal(kv.get("terminal_title_enabled", true))
  const [persona, setPersona] = kv.signal("personalize_enabled", false)
  const [lay, setLay] = kv.signal<LayoutPreset>("layout_preset", layout(tuiConfig.layout_preset))
  const lid = createMemo(() => layout(lay()))

  const apply = (id: LayoutPreset) => {
    const cfg = LayoutMap[id]
    setLay(() => id)
    kv.set("sidebar_position", cfg.sidebar_position)
    kv.set("home_prompt_position", cfg.home_prompt_position)
    kv.set("session_prompt_position", cfg.session_prompt_position)
    kv.set("focus_mode", cfg.focus_mode)
    kv.set("sidebar", cfg.sidebar)
    kv.set("sidebar_width", cfg.sidebar_width)
    kv.set("sidebar_breakpoint", cfg.sidebar_breakpoint)
    kv.set("home_prompt_width", cfg.home_prompt_width)
    kv.set("thinking_visibility", cfg.thinking_visibility)
    kv.set("tool_details_visibility", cfg.tool_details_visibility)
    kv.set("assistant_metadata_visibility", cfg.assistant_metadata_visibility)
    kv.set("scrollbar_visible", cfg.scrollbar_visible)
    kv.set("animations_enabled", cfg.animations_enabled)
  }

  const cycle = () => {
    const idx = Layouts.indexOf(lid())
    const next = idx === -1 ? Layouts[0] : Layouts[(idx + 1) % Layouts.length]
    apply(next)
  }

  const mcpList = createMemo(() => Object.values(sync.data.mcp))
  const mcpStats = createMemo(() => ({
    total: mcpList().length,
    connected: mcpList().filter((x) => x.status === "connected").length,
    failed: mcpList().filter((x) => x.status === "failed").length,
    disabled: mcpList().filter((x) => x.status === "disabled").length,
    auth: mcpList().filter((x) => x.status === "needs_auth" || x.status === "needs_client_registration").length,
  }))

  const skillStats = async () => {
    const list = (await sdk.client.app.skills()).data ?? []
    const active = sync.data.command.filter((x) => x.source === "skill").length
    return {
      total: list.length,
      active,
    }
  }

  const openDir = async (dir: string) => {
    await mkdir(dir, { recursive: true }).catch(() => {})
    await open(dir, { wait: false }).catch(() => {})
  }

  const showSkillStatus = async () => {
    const stat = await skillStats()
    await DialogAlert.show(
      dialog,
      "Skills / Status",
      [
        `Total skills: ${stat.total}`,
        `Active skill commands: ${stat.active}`,
        `Inactive: ${Math.max(0, stat.total - stat.active)}`,
      ].join("\n"),
    )
  }

  const showMcpStatus = async () => {
    const stat = mcpStats()
    await DialogAlert.show(
      dialog,
      "MCP / Status",
      [
        `Total MCP: ${stat.total}`,
        `Connected: ${stat.connected}`,
        `Failed: ${stat.failed}`,
        `Needs auth/setup: ${stat.auth}`,
        `Disabled: ${stat.disabled}`,
      ].join("\n"),
    )
  }

  const slashSeg = () => {
    const line = promptRef.current?.current.input.split("\n")[0]?.trim() ?? ""
    if (!line.startsWith("/")) return []
    return line
      .slice(1)
      .split(/\s+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  }

  const slashArg = (name: string, aliases: string[] = []) => {
    const seg = slashSeg()
    if (!seg.length) return [] as string[]
    const all = [name, ...aliases].map((x) => x.toLowerCase())
    const hit = all.find((x) => seg[0].startsWith(`${x}-`))
    if (hit) return [seg[0].slice(hit.length + 1), ...seg.slice(1)]
    return seg.slice(1)
  }

  const runLayout = (dlg: ReturnType<typeof useDialog>) => {
    const seg = slashArg("layout")
    if (!seg.length || seg[0] === "cycle" || seg[0] === "next") {
      cycle()
      dlg.clear()
      return
    }
    const key = seg
      .filter((x) => x !== "set" && x !== "preset")
      .join("-")
      .replace(/^layout-/, "")
    const map = {
      standard: () => apply("standard"),
      workspace: () => apply("workspace"),
      focus: () => apply("focus"),
      modern: () => apply("modern"),
      soft: () => apply("soft"),
      minimalist: () => apply("minimalist"),
      "sidebar-left": () => kv.set("sidebar_position", "left"),
      "sidebar-right": () => kv.set("sidebar_position", "right"),
      "sidebar-auto": () => kv.set("sidebar", "auto"),
      "sidebar-hide": () => kv.set("sidebar", "hide"),
      "sidebar-width-narrow": () => kv.set("sidebar_width", 32),
      "sidebar-width-wide": () => kv.set("sidebar_width", 52),
      "session-top": () => kv.set("session_prompt_position", "top"),
      "session-bottom": () => kv.set("session_prompt_position", "bottom"),
      "session-input-top": () => kv.set("session_prompt_position", "top"),
      "session-input-bottom": () => kv.set("session_prompt_position", "bottom"),
      "home-center": () => kv.set("home_prompt_position", "center"),
      "home-bottom": () => kv.set("home_prompt_position", "bottom"),
      "home-input-center": () => kv.set("home_prompt_position", "center"),
      "home-input-bottom": () => kv.set("home_prompt_position", "bottom"),
      "home-width-narrow": () => kv.set("home_prompt_width", 62),
      "home-width-wide": () => kv.set("home_prompt_width", 104),
    } as const
    const fn = map[key as keyof typeof map]
    if (!fn) {
      toast.show({
        variant: "warning",
        message: "Unknown layout subarg. Example: /layout workspace or /layout sidebar left",
      })
      return
    }
    fn()
    dlg.clear()
  }

  const runSkills = (dlg: ReturnType<typeof useDialog>) => {
    const key = slashSeg()[0] === "install-skills" ? "install" : slashArg("skills", ["skill"]).join("-")
    if (!key || key === "install" || key === "create" || key === "add") {
      dlg.replace(() => <DialogSkillInstaller />)
      return
    }
    if (key === "status" || key === "stats") {
      void showSkillStatus()
      return
    }
    if (key === "folder" || key === "dir" || key === "open") {
      void openDir(path.join(Global.Path.cache, "skills")).then(() => dlg.clear())
      return
    }
    toast.show({
      variant: "warning",
      message: "Unknown skills subarg. Use: /skills install|status|folder",
    })
  }

  const runMcps = (dlg: ReturnType<typeof useDialog>) => {
    const key = slashSeg()[0] === "install-mcp" ? "install" : slashArg("mcps", ["mcp"]).join("-")
    if (!key || key === "list" || key === "toggle") {
      dlg.replace(() => <DialogMcp />)
      return
    }
    if (key === "install" || key === "create" || key === "add") {
      dlg.replace(() => <DialogMcpInstaller />)
      return
    }
    if (key === "status" || key === "stats") {
      void showMcpStatus()
      return
    }
    if (key === "folder" || key === "dir" || key === "open") {
      void openDir(sync.data.path.config || Global.Path.config).then(() => dlg.clear())
      return
    }
    toast.show({
      variant: "warning",
      message: "Unknown mcps subarg. Use: /mcps install|status|folder",
    })
  }

  const runMux = (dlg: ReturnType<typeof useDialog>) => {
    const key = slashArg("mux", ["mu"]).join("-")
    if (!key || key === "menu" || key === "layout" || key === "status" || key === "switch" || key === "about") {
      dlg.replace(() => <DialogRouterManager />)
      return
    }
    if (key === "keys" || key === "key") {
      dlg.replace(() => <DialogRouterManagerKeys />)
      return
    }
    if (key === "models" || key === "model") {
      dlg.replace(() => <DialogMuxModels />)
      return
    }
    toast.show({
      variant: "warning",
      message: "Unknown mux subarg. Use: /mux status|keys|models|switch",
    })
  }

  const runPersonalize = async (dlg: ReturnType<typeof useDialog>) => {
    const key = slashArg("personalize").join("-")
    if (!key) {
      const out = await Ready.personalize(!persona()).catch((err) => ({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        state: {
          enabled: persona(),
          startup: persona(),
          prompt: "",
        },
      }))
      setPersona(() => out.state.enabled)
      kv.set("personalize_enabled", out.state.enabled)
      toast.show({
        variant: out.ok ? "info" : "warning",
        message: out.message,
      })
      dlg.clear()
      return
    }
    if (key === "save") {
      const text = promptRef.current?.current.input.trim()
      if (!text) {
        toast.show({
          variant: "warning",
          message: "Write a command first, then run /personalize save",
        })
        dlg.clear()
        return
      }
      await Ready.prompt(text)
      toast.show({
        variant: "info",
        message: "Saved as default personalize startup command",
      })
      dlg.clear()
      return
    }
    toast.show({
      variant: "warning",
      message: "Unknown personalize subarg. Use: /personalize or /personalize save",
    })
  }

  // Update terminal window title based on current route and session
  createEffect(() => {
    if (!terminalTitleEnabled() || Flag.OPENCODE_DISABLE_TERMINAL_TITLE) return

    if (route.data.type === "home") {
      renderer.setTerminalTitle("OpenCode")
      return
    }

    if (route.data.type === "session") {
      const session = sync.session.get(route.data.sessionID)
      if (!session || SessionApi.isDefaultTitle(session.title)) {
        renderer.setTerminalTitle("OpenCode")
        return
      }

      const title = session.title.length > 40 ? session.title.slice(0, 37) + "..." : session.title
      renderer.setTerminalTitle(`OC | ${title}`)
      return
    }

    if (route.data.type === "plugin") {
      renderer.setTerminalTitle(`OC | ${route.data.id}`)
    }
  })

  const args = useArgs()
  onMount(() => {
    Ready.state()
      .then((cfg) => {
        if (cfg.enabled === persona()) return
        setPersona(() => cfg.enabled)
        kv.set("personalize_enabled", cfg.enabled)
      })
      .catch(() => {})

    batch(() => {
      if (args.agent) local.agent.set(args.agent)
      if (args.model) {
        const { providerID, modelID } = Provider.parseModel(args.model)
        if (!providerID || !modelID)
          return toast.show({
            variant: "warning",
            message: `Invalid model format: ${args.model}`,
            duration: 3000,
          })
        local.model.set({ providerID, modelID }, { recent: true })
      }
      // Handle --session without --fork immediately (fork is handled in createEffect below)
      if (args.sessionID && !args.fork) {
        route.navigate({
          type: "session",
          sessionID: args.sessionID,
        })
      }
    })
  })

  let continued = false
  createEffect(() => {
    // When using -c, session list is loaded in blocking phase, so we can navigate at "partial"
    if (continued || sync.status === "loading" || !args.continue) return
    const match = sync.data.session
      .toSorted((a, b) => b.time.updated - a.time.updated)
      .find((x) => x.parentID === undefined)?.id
    if (match) {
      continued = true
      if (args.fork) {
        sdk.client.session.fork({ sessionID: match }).then((result) => {
          if (result.data?.id) {
            route.navigate({ type: "session", sessionID: result.data.id })
          } else {
            toast.show({ message: "Failed to fork session", variant: "error" })
          }
        })
      } else {
        route.navigate({ type: "session", sessionID: match })
      }
    }
  })

  // Handle --session with --fork: wait for sync to be fully complete before forking
  // (session list loads in non-blocking phase for --session, so we must wait for "complete"
  // to avoid a race where reconcile overwrites the newly forked session)
  let forked = false
  createEffect(() => {
    if (forked || sync.status !== "complete" || !args.sessionID || !args.fork) return
    forked = true
    sdk.client.session.fork({ sessionID: args.sessionID }).then((result) => {
      if (result.data?.id) {
        route.navigate({ type: "session", sessionID: result.data.id })
      } else {
        toast.show({ message: "Failed to fork session", variant: "error" })
      }
    })
  })

  createEffect(
    on(
      () => sync.status === "complete" && sync.data.provider.length === 0,
      (isEmpty, wasEmpty) => {
        // only trigger when we transition into an empty-provider state
        if (!isEmpty || wasEmpty) return
        dialog.replace(() => <DialogProviderList />)
      },
    ),
  )

  const connected = useConnected()
  command.register(() => [
    {
      title: "Switch session",
      value: "session.list",
      keybind: "session_list",
      category: "Session",
      suggested: sync.data.session.length > 0,
      slash: {
        name: "sessions",
        aliases: ["resume", "continue"],
      },
      onSelect: () => {
        dialog.replace(() => <DialogSessionList />)
      },
    },
    ...(Flag.OPENCODE_EXPERIMENTAL_WORKSPACES
      ? [
          {
            title: "Manage workspaces",
            value: "workspace.list",
            category: "Workspace",
            suggested: true,
            slash: {
              name: "workspaces",
            },
            onSelect: () => {
              dialog.replace(() => <DialogWorkspaceList />)
            },
          },
        ]
      : []),
    {
      title: "New session",
      suggested: route.data.type === "session",
      value: "session.new",
      keybind: "session_new",
      category: "Session",
      slash: {
        name: "new",
        aliases: ["clear"],
      },
      onSelect: () => {
        const current = promptRef.current
        // Don't require focus - if there's any text, preserve it
        const currentPrompt = current?.current?.input ? current.current : undefined
        const workspaceID =
          route.data.type === "session" ? sync.session.get(route.data.sessionID)?.workspaceID : undefined
        route.navigate({
          type: "home",
          initialPrompt: currentPrompt,
          workspaceID,
        })
        dialog.clear()
      },
    },
    {
      title: "Switch model",
      value: "model.list",
      keybind: "model_list",
      suggested: true,
      category: "Agent",
      slash: {
        name: "models",
      },
      onSelect: () => {
        dialog.replace(() => <DialogModel />)
      },
    },
    {
      title: "Model cycle",
      value: "model.cycle_recent",
      keybind: "model_cycle_recent",
      category: "Agent",
      hidden: true,
      onSelect: () => {
        local.model.cycle(1)
      },
    },
    {
      title: "Model cycle reverse",
      value: "model.cycle_recent_reverse",
      keybind: "model_cycle_recent_reverse",
      category: "Agent",
      hidden: true,
      onSelect: () => {
        local.model.cycle(-1)
      },
    },
    {
      title: "Favorite cycle",
      value: "model.cycle_favorite",
      keybind: "model_cycle_favorite",
      category: "Agent",
      hidden: true,
      onSelect: () => {
        local.model.cycleFavorite(1)
      },
    },
    {
      title: "Favorite cycle reverse",
      value: "model.cycle_favorite_reverse",
      keybind: "model_cycle_favorite_reverse",
      category: "Agent",
      hidden: true,
      onSelect: () => {
        local.model.cycleFavorite(-1)
      },
    },
    {
      title: "Switch agent",
      value: "agent.list",
      keybind: "agent_list",
      category: "Agent",
      slash: {
        name: "agents",
      },
      onSelect: () => {
        dialog.replace(() => <DialogAgent />)
      },
    },
    {
      title: "Toggle MCPs",
      value: "mcp.list",
      category: "Agent",
      slash: {
        name: "mcps",
        aliases: ["mcp", "install-mcp", "mcp-status", "mcps-status", "mcp-folder", "mcps-folder"],
      },
      onSelect: (dialog) => {
        runMcps(dialog)
      },
    },
    {
      title: "Install MCP Servers",
      value: "mcp.install",
      category: "Agent",
      onSelect: () => {
        dialog.replace(() => <DialogMcpInstaller />)
      },
    },
    {
      title: "Skills",
      value: "skill.install",
      category: "Agent",
      slash: {
        name: "skills",
        aliases: ["skill", "install-skills", "skills-status", "skill-status", "skills-folder", "skill-folder"],
      },
      onSelect: (dialog) => {
        runSkills(dialog)
      },
    },
    {
      title: "Skills Status",
      value: "skill.status",
      category: "Agent",
      onSelect: () => {
        void showSkillStatus()
      },
    },
    {
      title: "Open Skills Folder",
      value: "skill.folder",
      category: "Agent",
      onSelect: () => {
        void openDir(path.join(Global.Path.cache, "skills")).then(() => dialog.clear())
      },
    },
    {
      title: "MCP Status",
      value: "mcp.status.summary",
      category: "Agent",
      onSelect: () => {
        void showMcpStatus()
      },
    },
    {
      title: "Open MCP Folder",
      value: "mcp.folder",
      category: "Agent",
      onSelect: () => {
        void openDir(sync.data.path.config || Global.Path.config).then(() => dialog.clear())
      },
    },
    {
      title: "Agent cycle",
      value: "agent.cycle",
      keybind: "agent_cycle",
      category: "Agent",
      hidden: true,
      onSelect: () => {
        local.agent.move(1)
      },
    },
    {
      title: "Variant cycle",
      value: "variant.cycle",
      keybind: "variant_cycle",
      category: "Agent",
      onSelect: () => {
        local.model.variant.cycle()
      },
    },
    {
      title: "Switch model variant",
      value: "variant.list",
      category: "Agent",
      hidden: local.model.variant.list().length === 0,
      slash: {
        name: "variants",
      },
      onSelect: () => {
        dialog.replace(() => <DialogVariant />)
      },
    },
    {
      title: "Agent cycle reverse",
      value: "agent.cycle.reverse",
      keybind: "agent_cycle_reverse",
      category: "Agent",
      hidden: true,
      onSelect: () => {
        local.agent.move(-1)
      },
    },
    {
      title: "Mux Router",
      value: "router.mux",
      slash: {
        name: "mux",
        aliases: ["mu", "mux-status", "mu-status", "mux-keys", "mu-keys", "mux-models", "mu-models", "mux-switch", "mu-switch"],
      },
      onSelect: (dialog) => {
        runMux(dialog)
      },
      category: "Provider",
    },
    {
      title: "Mux Status",
      value: "router.mux.status",
      onSelect: () => {
        dialog.replace(() => <DialogRouterManager />)
      },
      category: "Provider",
    },
    {
      title: "Mux Keys",
      value: "router.mux.keys",
      onSelect: () => {
        dialog.replace(() => <DialogRouterManagerKeys />)
      },
      category: "Provider",
    },
    {
      title: "Mux Models",
      value: "router.mux.models",
      onSelect: () => {
        dialog.replace(() => <DialogMuxModels />)
      },
      category: "Provider",
    },
    {
      title: "Mux Switch",
      value: "router.mux.switch",
      onSelect: () => {
        dialog.replace(() => <DialogRouterManager />)
      },
      category: "Provider",
    },
    {
      title: "Mux About",
      value: "router.mux.about",
      onSelect: () => {
        dialog.replace(() => <DialogRouterManager />)
      },
      category: "Provider",
    },
    {
      title: "Connect provider",
      value: "provider.connect",
      suggested: !connected(),
      slash: {
        name: "connect",
      },
      onSelect: () => {
        dialog.replace(() => <DialogProviderList />)
      },
      category: "Provider",
    },
    {
      title: "View status",
      keybind: "status_view",
      value: "opencode.status",
      slash: {
        name: "status",
      },
      onSelect: () => {
        dialog.replace(() => <DialogStatus />)
      },
      category: "System",
    },
    {
      title: "Switch theme",
      value: "theme.switch",
      keybind: "theme_list",
      slash: {
        name: "themes",
      },
      onSelect: () => {
        dialog.replace(() => <DialogThemeList />)
      },
      category: "System",
    },
    {
      title: `Layout: ${lid()}`,
      value: "layout.cycle",
      category: "Layout",
      slash: {
        name: "layout",
        aliases: [
          "layout-standard",
          "layout-workspace",
          "layout-focus",
          "layout-modern",
          "layout-soft",
          "layout-minimalist",
          "sidebar-left",
          "sidebar-right",
          "sidebar-auto",
          "sidebar-hide",
          "sidebar-width-narrow",
          "sidebar-width-wide",
          "session-input-top",
          "session-input-bottom",
          "home-input-center",
          "home-input-bottom",
          "home-width-narrow",
          "home-width-wide",
        ],
      },
      onSelect: (dialog) => {
        runLayout(dialog)
      },
    },
    {
      title: "Layout Standard",
      value: "layout.standard",
      category: "Layout",
      onSelect: (dialog) => {
        apply("standard")
        dialog.clear()
      },
    },
    {
      title: "Layout Workspace",
      value: "layout.workspace",
      category: "Layout",
      onSelect: (dialog) => {
        apply("workspace")
        dialog.clear()
      },
    },
    {
      title: "Layout Focus",
      value: "layout.focus",
      category: "Layout",
      onSelect: (dialog) => {
        apply("focus")
        dialog.clear()
      },
    },
    {
      title: "Layout Modern",
      value: "layout.modern",
      category: "Layout",
      onSelect: (dialog) => {
        apply("modern")
        dialog.clear()
      },
    },
    {
      title: "Layout Soft",
      value: "layout.soft",
      category: "Layout",
      onSelect: (dialog) => {
        apply("soft")
        dialog.clear()
      },
    },
    {
      title: "Layout Minimalist",
      value: "layout.minimalist",
      category: "Layout",
      onSelect: (dialog) => {
        apply("minimalist")
        dialog.clear()
      },
    },
    {
      title: "Sidebar Left",
      value: "layout.sidebar.left",
      category: "Layout",
      onSelect: (dialog) => {
        kv.set("sidebar_position", "left")
        dialog.clear()
      },
    },
    {
      title: "Sidebar Right",
      value: "layout.sidebar.right",
      category: "Layout",
      onSelect: (dialog) => {
        kv.set("sidebar_position", "right")
        dialog.clear()
      },
    },
    {
      title: "Sidebar Auto",
      value: "layout.sidebar.auto",
      category: "Layout",
      onSelect: (dialog) => {
        kv.set("sidebar", "auto")
        dialog.clear()
      },
    },
    {
      title: "Sidebar Hidden",
      value: "layout.sidebar.hide",
      category: "Layout",
      onSelect: (dialog) => {
        kv.set("sidebar", "hide")
        dialog.clear()
      },
    },
    {
      title: "Sidebar Width Narrow",
      value: "layout.sidebar.width.narrow",
      category: "Layout",
      onSelect: (dialog) => {
        kv.set("sidebar_width", 32)
        dialog.clear()
      },
    },
    {
      title: "Sidebar Width Wide",
      value: "layout.sidebar.width.wide",
      category: "Layout",
      onSelect: (dialog) => {
        kv.set("sidebar_width", 52)
        dialog.clear()
      },
    },
    {
      title: "Session Input Top",
      value: "layout.session.top",
      category: "Layout",
      onSelect: (dialog) => {
        kv.set("session_prompt_position", "top")
        dialog.clear()
      },
    },
    {
      title: "Session Input Bottom",
      value: "layout.session.bottom",
      category: "Layout",
      onSelect: (dialog) => {
        kv.set("session_prompt_position", "bottom")
        dialog.clear()
      },
    },
    {
      title: "Home Input Center",
      value: "layout.home.center",
      category: "Layout",
      onSelect: (dialog) => {
        kv.set("home_prompt_position", "center")
        dialog.clear()
      },
    },
    {
      title: "Home Input Bottom",
      value: "layout.home.bottom",
      category: "Layout",
      onSelect: (dialog) => {
        kv.set("home_prompt_position", "bottom")
        dialog.clear()
      },
    },
    {
      title: "Home Width Narrow",
      value: "layout.home.width.narrow",
      category: "Layout",
      onSelect: (dialog) => {
        kv.set("home_prompt_width", 62)
        dialog.clear()
      },
    },
    {
      title: "Home Width Wide",
      value: "layout.home.width.wide",
      category: "Layout",
      onSelect: (dialog) => {
        kv.set("home_prompt_width", 104)
        dialog.clear()
      },
    },
    {
      title: persona() ? "Personalize Mode: On" : "Personalize Mode: Off",
      value: "personalize.toggle",
      category: "System",
      slash: {
        name: "personalize",
        aliases: ["personalize-save"],
      },
      onSelect: async (dialog) => {
        await runPersonalize(dialog)
      },
    },
    {
      title: "Personalize Save Input",
      value: "personalize.save",
      category: "System",
      onSelect: async (dialog) => {
        const text = promptRef.current?.current.input.trim()
        if (!text) {
          toast.show({
            variant: "warning",
            message: "Write a command first, then run /personalize save",
          })
          dialog.clear()
          return
        }
        await Ready.prompt(text)
        toast.show({
          variant: "info",
          message: "Saved as default personalize startup command",
        })
        dialog.clear()
      },
    },
    {
      title: "Toggle Theme Mode",
      value: "theme.switch_mode",
      onSelect: (dialog) => {
        setMode(mode() === "dark" ? "light" : "dark")
        dialog.clear()
      },
      category: "System",
    },
    {
      title: locked() ? "Unlock Theme Mode" : "Lock Theme Mode",
      value: "theme.mode.lock",
      onSelect: (dialog) => {
        if (locked()) unlock()
        else lock()
        dialog.clear()
      },
      category: "System",
    },
    {
      title: "Help",
      value: "help.show",
      slash: {
        name: "help",
      },
      onSelect: () => {
        dialog.replace(() => <DialogHelp />)
      },
      category: "System",
    },
    {
      title: "Open docs",
      value: "docs.open",
      onSelect: () => {
        open("https://opencode.ai/docs").catch(() => {})
        dialog.clear()
      },
      category: "System",
    },
    {
      title: "Exit the app",
      value: "app.exit",
      slash: {
        name: "exit",
        aliases: ["quit", "q"],
      },
      onSelect: () => exit(),
      category: "System",
    },
    {
      title: "Toggle debug panel",
      category: "System",
      value: "app.debug",
      onSelect: (dialog) => {
        renderer.toggleDebugOverlay()
        dialog.clear()
      },
    },
    {
      title: "Toggle console",
      category: "System",
      value: "app.console",
      onSelect: (dialog) => {
        renderer.console.toggle()
        dialog.clear()
      },
    },
    {
      title: "Write heap snapshot",
      category: "System",
      value: "app.heap_snapshot",
      onSelect: async (dialog) => {
        const files = await props.onSnapshot?.()
        toast.show({
          variant: "info",
          message: `Heap snapshot written to ${files?.join(", ")}`,
          duration: 5000,
        })
        dialog.clear()
      },
    },
    {
      title: "Suspend terminal",
      value: "terminal.suspend",
      keybind: "terminal_suspend",
      category: "System",
      hidden: true,
      onSelect: () => {
        process.once("SIGCONT", () => {
          renderer.resume()
        })

        renderer.suspend()
        // pid=0 means send the signal to all processes in the process group
        process.kill(0, "SIGTSTP")
      },
    },
    {
      title: terminalTitleEnabled() ? "Disable terminal title" : "Enable terminal title",
      value: "terminal.title.toggle",
      keybind: "terminal_title_toggle",
      category: "System",
      onSelect: (dialog) => {
        setTerminalTitleEnabled((prev) => {
          const next = !prev
          kv.set("terminal_title_enabled", next)
          if (!next) renderer.setTerminalTitle("")
          return next
        })
        dialog.clear()
      },
    },
    {
      title: kv.get("animations_enabled", true) ? "Disable animations" : "Enable animations",
      value: "app.toggle.animations",
      category: "System",
      onSelect: (dialog) => {
        kv.set("animations_enabled", !kv.get("animations_enabled", true))
        dialog.clear()
      },
    },
    {
      title: kv.get("diff_wrap_mode", "word") === "word" ? "Disable diff wrapping" : "Enable diff wrapping",
      value: "app.toggle.diffwrap",
      category: "System",
      onSelect: (dialog) => {
        const current = kv.get("diff_wrap_mode", "word")
        kv.set("diff_wrap_mode", current === "word" ? "none" : "word")
        dialog.clear()
      },
    },
  ])

  sdk.event.on(TuiEvent.CommandExecute.type, (evt) => {
    command.trigger(evt.properties.command)
  })

  sdk.event.on(TuiEvent.ToastShow.type, (evt) => {
    toast.show({
      title: evt.properties.title,
      message: evt.properties.message,
      variant: evt.properties.variant,
      duration: evt.properties.duration,
    })
  })

  sdk.event.on(TuiEvent.SessionSelect.type, (evt) => {
    route.navigate({
      type: "session",
      sessionID: evt.properties.sessionID,
    })
  })

  sdk.event.on("session.deleted", (evt) => {
    if (route.data.type === "session" && route.data.sessionID === evt.properties.info.id) {
      route.navigate({ type: "home" })
      toast.show({
        variant: "info",
        message: "The current session was deleted",
      })
    }
  })

  sdk.event.on("session.error", (evt) => {
    const error = evt.properties.error
    if (error && typeof error === "object" && error.name === "MessageAbortedError") return
    const message = errorMessage(error)

    toast.show({
      variant: "error",
      message,
      duration: 5000,
    })
  })

  sdk.event.on("installation.update-available", async (evt) => {
    const version = evt.properties.version

    const skipped = kv.get("skipped_version")
    if (skipped && !semver.gt(version, skipped)) return

    const choice = await DialogConfirm.show(
      dialog,
      `Update Available`,
      `A new release v${version} is available. Would you like to update now?`,
      "skip",
    )

    if (choice === false) {
      kv.set("skipped_version", version)
      return
    }

    if (choice !== true) return

    toast.show({
      variant: "info",
      message: `Updating to v${version}...`,
      duration: 30000,
    })

    const result = await sdk.client.global.upgrade({ target: version })

    if (result.error || !result.data?.success) {
      toast.show({
        variant: "error",
        title: "Update Failed",
        message: "Update failed",
        duration: 10000,
      })
      return
    }

    await DialogAlert.show(
      dialog,
      "Update Complete",
      `Successfully updated to OpenCode v${result.data.version}. Please restart the application.`,
    )

    exit()
  })

  const plugin = createMemo(() => {
    if (!ready()) return
    if (route.data.type !== "plugin") return
    const render = routeView(route.data.id)
    if (!render) return <PluginRouteMissing id={route.data.id} onHome={() => route.navigate({ type: "home" })} />
    return render({ params: route.data.data })
  })

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      backgroundColor={theme.background}
      onMouseDown={(evt) => {
        if (!Flag.OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT) return
        if (evt.button !== MouseButton.RIGHT) return

        if (!Selection.copy(renderer, toast)) return
        evt.preventDefault()
        evt.stopPropagation()
      }}
      onMouseUp={Flag.OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT ? undefined : () => Selection.copy(renderer, toast)}
    >
      <Show when={Flag.OPENCODE_SHOW_TTFD}>
        <TimeToFirstDraw />
      </Show>
      <Show when={ready()}>
        <Switch>
          <Match when={route.data.type === "home"}>
            <Home />
          </Match>
          <Match when={route.data.type === "session"}>
            <Session />
          </Match>
        </Switch>
      </Show>
      {plugin()}
      <TuiPluginRuntime.Slot name="app" />
      <StartupLoading ready={ready} />
    </box>
  )
}

import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { createResource, createMemo, createSignal } from "solid-js"
import { useDialog } from "@tui/ui/dialog"
import { useSDK } from "@tui/context/sdk"
import { DialogConfirm } from "@tui/ui/dialog-confirm"
import { DialogAlert } from "@tui/ui/dialog-alert"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { Locale } from "@/util/locale"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"

type McpRegistryEntry = {
  name: string
  description: string
  category: string
  type: "local" | "remote"
  command?: string[]
  url?: string
  envHint?: Record<string, string>
  website: string
  stars: number
  installed: boolean
}

// Curated registry of popular MCP servers
const MCP_REGISTRY: Omit<McpRegistryEntry, "installed" | "stars">[] = [
  {
    name: "filesystem",
    description: "Read, write, and manage files on your system",
    category: "System",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-filesystem"],
    website: "https://github.com/modelcontextprotocol/servers",
  },
  {
    name: "github",
    description: "GitHub API: repos, issues, PRs, and more",
    category: "Development",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-github"],
    envHint: { GITHUB_PERSONAL_ACCESS_TOKEN: "Your GitHub PAT" },
    website: "https://github.com/modelcontextprotocol/servers",
  },
  {
    name: "git",
    description: "Git operations: log, diff, status, commit",
    category: "Development",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-git"],
    website: "https://github.com/modelcontextprotocol/servers",
  },
  {
    name: "postgresql",
    description: "Read-only PostgreSQL database queries",
    category: "Database",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-postgres"],
    envHint: { DATABASE_URL: "postgresql://..." },
    website: "https://github.com/modelcontextprotocol/servers",
  },
  {
    name: "sqlite",
    description: "SQLite database interaction",
    category: "Database",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-sqlite"],
    envHint: { SQLITE_DB_PATH: "/path/to/db.sqlite" },
    website: "https://github.com/modelcontextprotocol/servers",
  },
  {
    name: "fetch",
    description: "Web content fetching and reading",
    category: "Web",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-fetch"],
    website: "https://github.com/modelcontextprotocol/servers",
  },
  {
    name: "puppeteer",
    description: "Headless browser automation",
    category: "Web",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-puppeteer"],
    website: "https://github.com/modelcontextprotocol/servers",
  },
  {
    name: "slack",
    description: "Slack messaging and channels",
    category: "Communication",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-slack"],
    envHint: { SLACK_BOT_TOKEN: "xoxb-...", SLACK_TEAM_ID: "T01234567" },
    website: "https://github.com/modelcontextprotocol/servers",
  },
  {
    name: "google-maps",
    description: "Google Maps geocoding, places, directions",
    category: "Location",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-google-maps"],
    envHint: { GOOGLE_MAPS_API_KEY: "Your API key" },
    website: "https://github.com/modelcontextprotocol/servers",
  },
  {
    name: "brave-search",
    description: "Web search via Brave Search API",
    category: "Search",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-brave-search"],
    envHint: { BRAVE_API_KEY: "Your Brave Search API key" },
    website: "https://github.com/modelcontextprotocol/servers",
  },
  {
    name: "memory",
    description: "Persistent knowledge graph for context",
    category: "Memory",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-memory"],
    website: "https://github.com/modelcontextprotocol/servers",
  },
  {
    name: "sequential-thinking",
    description: "Structured step-by-step reasoning",
    category: "Reasoning",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"],
    website: "https://github.com/modelcontextprotocol/servers",
  },
  {
    name: "everart",
    description: "AI image generation",
    category: "Creative",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-everart"],
    envHint: { EVERART_API_KEY: "Your EverArt API key" },
    website: "https://github.com/modelcontextprotocol/servers",
  },
]

export function DialogMcpInstaller() {
  const dialog = useDialog()
  const sdk = useSDK()
  const sync = useSync()
  const { theme } = useTheme()
  dialog.setSize("large")

  const [filter, setFilter] = createSignal("")

  const [cfg] = createResource(async () => {
    try {
      const res = await sdk.client.config.get()
      return res.data
    } catch {
      return undefined
    }
  })

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const configData = cfg()
    const existingMcp = (configData as any)?.mcp ?? {}
    const needle = filter().toLowerCase()

    return MCP_REGISTRY.filter(
      (entry) =>
        !needle ||
        entry.name.toLowerCase().includes(needle) ||
        entry.description.toLowerCase().includes(needle) ||
        entry.category.toLowerCase().includes(needle),
    ).map((entry) => {
      const installed = !!existingMcp[entry.name]
      const envHint = entry.envHint
        ? `env: ${Object.keys(entry.envHint).join(", ")}`
        : ""

      return {
        title: `${entry.name.padEnd(22)} ${entry.type === "local" ? "📦" : "🌐"} ${entry.category}`,
        value: entry.name,
        description: Locale.truncate(entry.description, 55) + (envHint ? ` [${envHint}]` : ""),
        category: installed ? "Installed" : "Available",
        onSelect: () => handleInstall(entry),
      }
    })
  })

  async function scope() {
    const value = await DialogPrompt.show(dialog, "Install Scope", {
      placeholder: "project | mux",
      value: "project",
    })
    if (!value) return
    const text = value.trim().toLowerCase()
    if (text === "project" || text === "local") return "project" as const
    if (text === "mux" || text === "global") return "global" as const
    await DialogAlert.show(dialog, "Invalid Scope", "Use 'project' or 'mux'.")
  }

  function env(input?: string) {
    if (!input) return undefined
    const out: Record<string, string> = {}
    for (const line of input.split("\n")) {
      const idx = line.indexOf("=")
      if (idx <= 0) continue
      out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
    return Object.keys(out).length ? out : undefined
  }

  async function save(where: "project" | "global", apply: (cfg: any) => any) {
    if (where === "project") {
      const cfg = (await sdk.client.config.get()).data
      if (!cfg) throw new Error("Failed to load project config")
      await sdk.client.config.update(apply(cfg))
      return
    }

    const base = sdk.url.replace(/\/$/, "")
    const res = await fetch(`${base}/config/global`)
    if (!res.ok) throw new Error("Failed to load global config")
    const cfg = await res.json()
    const next = apply(cfg)
    const out = await fetch(`${base}/config/global`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
    if (!out.ok) throw new Error("Failed to update global config")
  }

  async function handleInstall(entry: typeof MCP_REGISTRY[number]) {
    const where = await scope()
    if (!where) return

    const configData = cfg()
    const existingMcp = (configData as any)?.mcp ?? {}

    if (existingMcp[entry.name]) {
      await DialogAlert.show(dialog, "Already Installed", `${entry.name} MCP server is already configured.`)
      return
    }

    let envVars: Record<string, string> | undefined
    if (entry.envHint) {
      const envKeys = Object.keys(entry.envHint)
      const envPrompt = await DialogPrompt.show(dialog, `Environment Variables for ${entry.name}`, {
        placeholder: envKeys.map((k) => `${k}=`).join("\n"),
      })
      envVars = env(envPrompt ?? undefined)
    }

    const confirmed = await DialogConfirm.show(
      dialog,
      `Install ${entry.name}`,
      `Add ${entry.name} MCP server?\n\nType: ${entry.type}\n${entry.type === "local" ? `Command: ${entry.command?.join(" ")}` : `URL: ${entry.url}`}${envVars ? `\nEnv: ${Object.keys(envVars).join(", ")}` : ""}`,
      "Install",
    )

    if (!confirmed) return

    const mcpConfig: any = entry.type === "local"
      ? { type: "local", command: entry.command, environment: envVars }
      : { type: "remote", url: entry.url }

    try {
      await save(where, (cfg: any) => ({
        ...cfg,
        mcp: { ...(cfg?.mcp ?? {}), [entry.name]: mcpConfig },
      }))
      // Refresh MCP status
      const status = await sdk.client.mcp.status()
      if (status.data) sync.set("mcp", status.data)
      await DialogAlert.show(dialog, "Installed ✓", `${entry.name} MCP server has been added (${where}).`)
    } catch (e: any) {
      await DialogAlert.show(dialog, "Install Failed", e.message ?? String(e))
    }
  }

  async function handleCreate() {
    const where = await scope()
    if (!where) return

    const name = await DialogPrompt.show(dialog, "MCP Name", { placeholder: "my-mcp" })
    if (!name?.trim()) return

    const type = await DialogPrompt.show(dialog, "MCP Type", { placeholder: "local | remote", value: "local" })
    if (!type) return

    const mode = type.trim().toLowerCase()
    if (mode !== "local" && mode !== "remote") {
      await DialogAlert.show(dialog, "Invalid Type", "Use 'local' or 'remote'.")
      return
    }

    const target = await DialogPrompt.show(
      dialog,
      mode === "local" ? "Command" : "URL",
      mode === "local" ? { placeholder: "npx -y my-mcp-server" } : { placeholder: "https://example.com/mcp" },
    )
    if (!target?.trim()) return

    const envPrompt = await DialogPrompt.show(dialog, "Environment (optional)", {
      placeholder: "KEY=value",
    })
    const environment = env(envPrompt ?? undefined)
    const list = mode === "local" ? target.trim().split(/\s+/).filter(Boolean) : []

    const mcp =
      mode === "local"
        ? {
            type: "local" as const,
            command: list,
            ...(environment ? { environment } : {}),
          }
        : {
            type: "remote" as const,
            url: target.trim(),
          }

    if (mode === "local" && list.length === 0) {
      await DialogAlert.show(dialog, "Invalid Command", "Provide a valid local command.")
      return
    }

    try {
      await save(where, (cfg: any) => ({
        ...cfg,
        mcp: { ...(cfg?.mcp ?? {}), [name.trim()]: mcp },
      }))
      const status = await sdk.client.mcp.status()
      if (status.data) sync.set("mcp", status.data)
      await DialogAlert.show(dialog, "MCP Created", `${name.trim()} created (${where}).`)
    } catch (e: any) {
      await DialogAlert.show(dialog, "Create Failed", e.message ?? String(e))
    }
  }

  const merged = createMemo<DialogSelectOption<string>[]>(() => [
    ...options(),
    {
      title: "Create MCP",
      value: "__create__",
      description: "Create a custom MCP by answering prompts",
      category: "Manage",
      onSelect: () => handleCreate(),
    },
  ])

  return (
    <DialogSelect
      title="Install MCP Servers"
      placeholder="Search MCP servers..."
      options={merged()}
      onFilter={(q) => setFilter(q)}
      keybind={[]}
    />
  )
}

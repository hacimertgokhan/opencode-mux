import { createMemo, createSignal } from "solid-js"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { DialogAlert } from "@tui/ui/dialog-alert"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { useToast } from "@tui/ui/toast"
import { useLocal } from "../context/local"
import { useSDK } from "../context/sdk"
import {
  activateKey,
  addKey,
  authorsOutput,
  infoOutput,
  keysListOutput,
  modelAvailabilityOutput,
  removeKey,
  switchOutput,
  testKey,
} from "@/router-manager"

async function showOutput(dialog: ReturnType<typeof useDialog>, title: string, output: string) {
  await DialogAlert.show(dialog, title, output)
}

async function askIndex(dialog: ReturnType<typeof useDialog>, title: string) {
  const value = await DialogPrompt.show(dialog, title, {
    placeholder: "1-based index",
  })
  if (!value) return undefined
  const index = Number(value.trim())
  if (!Number.isInteger(index) || index <= 0) {
    throw new Error("Please enter a valid 1-based index")
  }
  return index - 1
}

function formatCost(value: number | undefined) {
  if (value === undefined || value === 0) return "free"
  return `$${value}/1M`
}

type LocalPreset = {
  id: "ollama" | "lmstudio"
  name: string
  url: string
}

type LocalPatch = {
  id: string
  name: string
  url: string
  models: string[]
}

type LocalProvider = {
  npm?: string
  name?: string
  options?: Record<string, unknown>
  models?: Record<string, { name?: string }>
}

type LocalConfig = {
  provider?: Record<string, LocalProvider>
  enabled_providers?: string[]
  disabled_providers?: string[]
  [key: string]: unknown
}

const LOCAL_PRESETS: LocalPreset[] = [
  {
    id: "ollama",
    name: "Ollama",
    url: "http://localhost:11434/v1",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    url: "http://127.0.0.1:1234/v1",
  },
]

function cleanUrl(value: string) {
  const text = value.trim()
  if (!text) return text
  if (text.endsWith("/")) return text.slice(0, -1)
  return text
}

function parseModels(value: string) {
  const seen = new Set<string>()
  return value
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false
      if (seen.has(item)) return false
      seen.add(item)
      return true
    })
}

async function discoverModels(url: string) {
  const base = cleanUrl(url)
  if (!base) return []
  try {
    const res = await fetch(`${base}/models`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return []
    const body = await res.json().catch(() => undefined)
    if (!Array.isArray(body?.data)) return []
    const seen = new Set<string>()
    return body.data
      .map((item: { id?: unknown }) => (typeof item?.id === "string" ? item.id.trim() : ""))
      .filter((item: string) => {
        if (!item) return false
        if (seen.has(item)) return false
        seen.add(item)
        return true
      })
  } catch {
    return []
  }
}

function patchConfig(cfg: LocalConfig, items: LocalPatch[]) {
  const next = { ...cfg }
  const map = { ...(cfg.provider ?? {}) }

  for (const item of items) {
    const prev = map[item.id] ?? {}
    const prevModels = prev.models ?? {}
    const models = {
      ...prevModels,
      ...Object.fromEntries(item.models.map((id) => [id, { name: prevModels[id]?.name ?? id }])),
    }
    map[item.id] = {
      ...prev,
      npm: prev.npm ?? "@ai-sdk/openai-compatible",
      name: prev.name ?? `${item.name} (local)`,
      options: {
        ...(prev.options ?? {}),
        baseURL: item.url,
      },
      models,
    }
  }

  next.provider = map

  if (Array.isArray(cfg.enabled_providers)) {
    const seen = new Set(cfg.enabled_providers)
    for (const item of items) seen.add(item.id)
    next.enabled_providers = [...seen]
  }

  if (Array.isArray(cfg.disabled_providers)) {
    const blocked = new Set(items.map((item) => item.id))
    next.disabled_providers = cfg.disabled_providers.filter((item) => !blocked.has(item))
  }

  return next
}

export function DialogRouterManager() {
  const dialog = useDialog()
  const toast = useToast()
  const local = useLocal()
  const sdk = useSDK()
  const [busy, setBusy] = createSignal(false)
  const selectedCount = createMemo(() => local.model.mux.selected().length)

  async function setupLocal(
    preset: LocalPreset,
    options: {
      promptUrl: boolean
      promptModels: boolean
    },
  ) {
    const input = options.promptUrl
      ? await DialogPrompt.show(dialog, `Setup ${preset.name}`, {
          value: preset.url,
          placeholder: preset.url,
          description: () => <text>Base URL (OpenAI-compatible endpoint)</text>,
        })
      : preset.url
    if (input === null) return undefined

    const url = cleanUrl((input || preset.url).trim())
    let models = await discoverModels(url)

    if (!models.length && options.promptModels) {
      const typed = await DialogPrompt.show(dialog, `${preset.name} Model IDs`, {
        placeholder: "qwen3:8b, llama3.2:3b",
        description: () => <text>/models did not return data. Enter model IDs (comma or newline separated).</text>,
      })
      if (typed === null) return undefined
      models = parseModels(typed)
    }

    if (!models.length) return undefined
    return {
      id: preset.id,
      name: preset.name,
      url,
      models,
    } satisfies LocalPatch
  }

  async function saveLocal(items: LocalPatch[]) {
    if (!items.length) {
      throw new Error("No local models found. Ensure Ollama or LM Studio is running.")
    }
    const cfg = (await sdk.client.config.get()).data as LocalConfig | undefined
    const next = patchConfig(cfg ?? {}, items)
    await sdk.client.config.update(next as Record<string, unknown>)
  }

  const run = async (fn: () => Promise<void>) => {
    if (busy()) return
    setBusy(true)
    try {
      await fn()
    } catch (error) {
      toast.error(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogSelect
      title="Mux Router"
      options={[
        {
          title: "Quick Setup Local LLMs",
          value: "mux.local.quick",
          description: "Auto-detect Ollama + LM Studio and add discovered models",
          onSelect: () =>
            run(async () => {
              const items = (
                await Promise.all(
                  LOCAL_PRESETS.map((preset) =>
                    setupLocal(preset, {
                      promptUrl: false,
                      promptModels: false,
                    }),
                  ),
                )
              ).filter(Boolean) as LocalPatch[]
              await saveLocal(items)
              toast.show({
                message: `Local setup completed (${items.length} provider)`,
                variant: "info",
                duration: 3000,
              })
            }),
        },
        {
          title: "Setup Ollama",
          value: "mux.local.ollama",
          description: "Set Ollama endpoint and model list with simple prompts",
          onSelect: () =>
            run(async () => {
              const preset = LOCAL_PRESETS.find((item) => item.id === "ollama")
              if (!preset) return
              const item = await setupLocal(preset, {
                promptUrl: true,
                promptModels: true,
              })
              if (!item) {
                throw new Error("No models found for Ollama.")
              }
              await saveLocal([item])
              toast.show({
                message: `Ollama configured (${item.models.length} model)`,
                variant: "info",
                duration: 3000,
              })
            }),
        },
        {
          title: "Setup LM Studio",
          value: "mux.local.lmstudio",
          description: "Set LM Studio endpoint and model list with simple prompts",
          onSelect: () =>
            run(async () => {
              const preset = LOCAL_PRESETS.find((item) => item.id === "lmstudio")
              if (!preset) return
              const item = await setupLocal(preset, {
                promptUrl: true,
                promptModels: true,
              })
              if (!item) {
                throw new Error("No models found for LM Studio.")
              }
              await saveLocal([item])
              toast.show({
                message: `LM Studio configured (${item.models.length} model)`,
                variant: "info",
                duration: 3000,
              })
            }),
        },
        {
          title: local.model.mux.enabled() ? "Disable Mux Mode" : "Enable Mux Mode",
          value: "mux.toggle",
          description: local.model.mux.enabled()
            ? "Send prompts with the currently selected model only"
            : "Auto-route prompts across your selected models (OpenRouter + local providers)",
          onSelect: () =>
            run(async () => {
              const enabled = await local.model.mux.toggleEnabled()
              toast.show({
                message: enabled ? "Mux mode enabled" : "Mux mode disabled",
                variant: "info",
                duration: 2500,
              })
            }),
        },
        {
          title: "Mux Models",
          value: "mux.models",
          description: `${selectedCount()} selected model${selectedCount() === 1 ? "" : "s"}`,
          onSelect: () => dialog.replace(() => <DialogMuxModels />),
        },
        {
          title: "Key Status",
          value: "mux.status",
          description: "Show token and credit usage for OpenRouter keys",
          onSelect: () => run(async () => showOutput(dialog, "Mux / Key Status", await infoOutput())),
        },
        {
          title: "Model Availability",
          value: "mux.availability",
          description: "Estimate how many tokens each key can still spend per model",
          onSelect: () =>
            run(async () => {
              dialog.setSize("xlarge")
              await showOutput(dialog, "Mux / Model Availability", await modelAvailabilityOutput(local.model.mux.catalog()))
            }),
        },
        {
          title: "Keys",
          value: "mux.keys",
          description: "Add, remove, activate, and test OpenRouter keys",
          onSelect: () => dialog.replace(() => <DialogRouterManagerKeys />),
        },
        {
          title: "Switch Best Key",
          value: "mux.switch",
          description: "Switch to the key with the most remaining credits",
          onSelect: () => run(async () => showOutput(dialog, "Mux / Switch", await switchOutput())),
        },
        {
          title: "About",
          value: "mux.about",
          description: "Show project and author information",
          onSelect: () => run(async () => showOutput(dialog, "Mux / About", authorsOutput())),
        },
      ]}
    />
  )
}

export function DialogMuxModels() {
  const dialog = useDialog()
  const toast = useToast()
  const local = useLocal()
  const [busy, setBusy] = createSignal(false)
  const selected = createMemo(() => new Set(local.model.mux.selected().map((item) => `${item.providerID}/${item.modelID}`)))
  const catalog = createMemo(() =>
    [...local.model.mux.catalog()].sort((a, b) => {
      const aSelected = selected().has(`${a.providerID}/${a.modelID}`)
      const bSelected = selected().has(`${b.providerID}/${b.modelID}`)
      if (aSelected !== bSelected) return aSelected ? -1 : 1
      return (a.name ?? a.modelID).localeCompare(b.name ?? b.modelID)
    }),
  )

  const run = async (fn: () => Promise<void>) => {
    if (busy()) return
    setBusy(true)
    try {
      await fn()
    } catch (error) {
      toast.error(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogSelect
      title="Mux / Models"
      options={[
        {
          title: "Back",
          value: "back",
          description: "Return to mux menu",
          onSelect: () => dialog.replace(() => <DialogRouterManager />),
        },
        ...catalog().map((model) => {
          const key = `${model.providerID}/${model.modelID}`
          const isSelected = selected().has(key)
          return {
            title: `${isSelected ? "[x]" : "[ ]"} ${model.name ?? model.modelID}`,
            value: key,
            description: `${model.providerID}/${model.modelID}`,
            footer: `in ${formatCost(model.cost?.input)} · out ${formatCost(model.cost?.output)}`,
            onSelect: () =>
              run(async () => {
                await local.model.mux.toggleModel({ providerID: model.providerID, modelID: model.modelID })
              }),
          }
        }),
      ]}
      skipFilter={false}
      flat={true}
    />
  )
}

export function DialogRouterManagerKeys() {
  const dialog = useDialog()
  const toast = useToast()
  const [busy, setBusy] = createSignal(false)

  const run = async (fn: () => Promise<void>) => {
    if (busy()) return
    setBusy(true)
    try {
      await fn()
    } catch (error) {
      toast.error(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogSelect
      title="Mux / Keys"
      options={[
        {
          title: "Back",
          value: "back",
          description: "Return to mux menu",
          onSelect: () => dialog.replace(() => <DialogRouterManager />),
        },
        {
          title: "List Keys",
          value: "list",
          description: "Show all configured keys",
          onSelect: () => run(async () => showOutput(dialog, "Configured Keys", await keysListOutput())),
        },
        {
          title: "Add Key",
          value: "add",
          description: "Add a new OpenRouter key",
          onSelect: () =>
            run(async () => {
              const key = await DialogPrompt.show(dialog, "Add OpenRouter Key", {
                placeholder: "sk-or-v1-...",
              })
              if (!key) return
              const label = await DialogPrompt.show(dialog, "Key Label", {
                placeholder: "Optional label",
              })
              await showOutput(dialog, "Add Key", await addKey(key.trim(), label?.trim() || undefined))
            }),
        },
        {
          title: "Remove Key",
          value: "remove",
          description: "Remove a key by 1-based index",
          onSelect: () =>
            run(async () => {
              const index = await askIndex(dialog, "Remove Key Index")
              if (index === undefined) return
              await showOutput(dialog, "Remove Key", await removeKey(index))
            }),
        },
        {
          title: "Activate Key",
          value: "activate",
          description: "Set the active key by 1-based index",
          onSelect: () =>
            run(async () => {
              const index = await askIndex(dialog, "Activate Key Index")
              if (index === undefined) return
              await showOutput(dialog, "Activate Key", await activateKey(index))
            }),
        },
        {
          title: "Test Key",
          value: "test",
          description: "Test the active key or a selected key",
          onSelect: () =>
            run(async () => {
              const value = await DialogPrompt.show(dialog, "Test Key", {
                placeholder: "Leave empty for active key or enter 1-based index",
              })
              const index = value?.trim() ? Number(value.trim()) - 1 : -1
              if (value?.trim() && (!Number.isInteger(index) || index < 0)) {
                throw new Error("Please enter a valid 1-based index")
              }
              await showOutput(dialog, "Test Key", await testKey(index))
            }),
        },
      ]}
    />
  )
}

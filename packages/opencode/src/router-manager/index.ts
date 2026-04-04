import fs from "fs/promises"
import os from "os"
import path from "path"
import { Auth } from "@/auth"

const CONFIG_DIR = path.join(os.homedir(), ".opencode-router-manager")
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json")
const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key"
const AUTHORS = [{ name: "hacimertgokhan", github: "https://github.com/hacimertgokhan" }]
const PROJECT_URL = "https://github.com/hacimertgokhan/opencode-mux"
const VERSION = "1.0.0"
const OPENROUTER_RETRY_HINTS = [
  "upstream error from alibaba",
  "request rate increased too quickly",
  "scale requests more smoothly over time",
  "rate limit",
  "rate-limit",
  "too many requests",
]

export type APIKeyEntry = {
  key: string
  label: string
  addedAt: string
  enabled: boolean
}

export type RouterManagerConfig = {
  keys: APIKeyEntry[]
  activeKeyIndex: number
  mux?: {
    enabled: boolean
    selectedModels: ModelRef[]
  }
}

export type ModelRef = {
  providerID: string
  modelID: string
}

export type ModelCatalogEntry = ModelRef & {
  name?: string
  cost?: {
    input?: number
    output?: number
  }
}

export type KeyInfo = {
  label?: string | null
  limit?: number | null
  limit_remaining?: number | null
  limit_reset?: string | null
  usage?: number | null
  usage_daily?: number | null
  usage_weekly?: number | null
  usage_monthly?: number | null
  is_free_tier?: boolean | null
  total_usage_tokens?: number | null
}

type SwitchResult = {
  switched: boolean
  index: number
  key: APIKeyEntry
  remaining: number | null
  previousIndex: number
}

function defaultConfig(): RouterManagerConfig {
  return { keys: [], activeKeyIndex: -1, mux: { enabled: false, selectedModels: [] } }
}

function normalizeMux(raw: any): NonNullable<RouterManagerConfig["mux"]> {
  const selectedModels = Array.isArray(raw?.selectedModels)
    ? raw.selectedModels
      .filter((item: any) => item && typeof item.providerID === "string" && typeof item.modelID === "string")
      .map((item: any) => ({ providerID: item.providerID, modelID: item.modelID }))
    : []
  return {
    enabled: raw?.enabled === true,
    selectedModels,
  }
}

function uniqueModels(items: ModelRef[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.providerID}/${item.modelID}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function modelRefKey(model: ModelRef) {
  return `${model.providerID}/${model.modelID}`
}

async function ensureConfigDir() {
  await fs.mkdir(CONFIG_DIR, { recursive: true })
}

export async function loadConfig(): Promise<RouterManagerConfig> {
  await ensureConfigDir()
  try {
    const content = await fs.readFile(CONFIG_FILE, "utf8")
    const parsed = JSON.parse(content)
    return {
      keys: Array.isArray(parsed?.keys)
        ? parsed.keys.map((item: any) => ({
          key: String(item?.key ?? ""),
          label: String(item?.label ?? ""),
          addedAt: String(item?.addedAt ?? new Date().toISOString()),
          enabled: item?.enabled !== false,
        }))
        : [],
      activeKeyIndex: Number.isInteger(parsed?.activeKeyIndex) ? parsed.activeKeyIndex : -1,
      mux: normalizeMux(parsed?.mux),
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      return defaultConfig()
    }
    const config = defaultConfig()
    await saveConfig(config)
    return config
  }
}

export async function saveConfig(config: RouterManagerConfig) {
  await ensureConfigDir()
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 })
}

export function maskKey(key: string) {
  if (!key || key.length < 12) return "***"
  return `${key.slice(0, 8)}...${key.slice(-4)}`
}

export function isValidKeyFormat(key: string) {
  return key.startsWith("sk-or-")
}

export function formatCredits(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "Unlimited"
  return `$${value.toFixed(4)}`
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function bestRemainingValue(value: number | null | undefined) {
  if (value === null || value === undefined) return Number.POSITIVE_INFINITY
  return value
}

export async function getKeyInfo(apiKey: string): Promise<KeyInfo> {
  const response = await fetch(OPENROUTER_KEY_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  const text = await response.text()
  let body: any
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = undefined
  }

  if (!response.ok) {
    const message = body?.error?.message || text || `HTTP ${response.status}`
    throw new Error(message)
  }

  return body?.data ?? {}
}

export async function syncAuthFromConfig(config?: RouterManagerConfig) {
  const current = config ?? (await loadConfig())
  const active = current.keys[current.activeKeyIndex]
  if (!active?.key) {
    await Auth.remove("openrouter").catch(() => { })
    return
  }

  await Auth.set("openrouter", {
    type: "api",
    key: active.key,
  })
}

export async function getActiveKey() {
  const config = await loadConfig()
  const key = config.keys[config.activeKeyIndex]
  if (!key) return undefined
  return key
}

export async function getActiveApiKey() {
  return (await getActiveKey())?.key
}

export async function getMuxConfig() {
  return (await loadConfig()).mux ?? defaultConfig().mux!
}

export async function setMuxEnabled(enabled: boolean) {
  const config = await loadConfig()
  config.mux = normalizeMux(config.mux)
  config.mux.enabled = enabled
  await saveConfig(config)
  return config.mux
}

export async function toggleMuxEnabled() {
  const config = await loadConfig()
  config.mux = normalizeMux(config.mux)
  config.mux.enabled = !config.mux.enabled
  await saveConfig(config)
  return config.mux
}

export async function setMuxSelectedModels(models: ModelRef[]) {
  const config = await loadConfig()
  config.mux = normalizeMux(config.mux)
  config.mux.selectedModels = uniqueModels(models)
  await saveConfig(config)
  return config.mux
}

export async function toggleMuxSelectedModel(model: ModelRef) {
  const config = await loadConfig()
  config.mux = normalizeMux(config.mux)
  const key = modelRefKey(model)
  const exists = config.mux.selectedModels.some((item) => modelRefKey(item) === key)
  config.mux.selectedModels = exists
    ? config.mux.selectedModels.filter((item) => modelRefKey(item) !== key)
    : uniqueModels([model, ...config.mux.selectedModels])
  await saveConfig(config)
  return config.mux
}

function estimateTokens(remainingCredits: number | null | undefined, pricePerMillion: number | null | undefined) {
  if (remainingCredits === null || remainingCredits === undefined) return Number.POSITIVE_INFINITY
  if (pricePerMillion === null || pricePerMillion === undefined || pricePerMillion <= 0) return Number.POSITIVE_INFINITY
  return Math.floor((remainingCredits / pricePerMillion) * 1_000_000)
}

export function formatTokens(tokens: number) {
  if (!Number.isFinite(tokens)) return "unlimited"
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return `${tokens}`
}

function minCreditForModel(model: ModelCatalogEntry) {
  const input = model.cost?.input ?? 0
  if (input <= 0) return 0
  return (input / 1_000_000) * 2000
}

export function canUseModel(remainingCredits: number | null | undefined, model: ModelCatalogEntry) {
  if (remainingCredits === null || remainingCredits === undefined) return true
  return remainingCredits > minCreditForModel(model)
}

export function summarizeModelBudget(model: ModelCatalogEntry, remainingCredits: number | null | undefined) {
  return {
    inputTokens: estimateTokens(remainingCredits, model.cost?.input),
    outputTokens: estimateTokens(remainingCredits, model.cost?.output),
  }
}

export function getMuxCandidates(current: ModelRef, catalog: ModelCatalogEntry[], mux: NonNullable<RouterManagerConfig["mux"]>) {
  const selected = mux.selectedModels
    .map((item) => catalog.find((candidate) => modelRefKey(candidate) === modelRefKey(item)))
    .filter(Boolean) as ModelCatalogEntry[]
  const requested = catalog.find((item) => modelRefKey(item) === modelRefKey(current))
  return uniqueModels([current, ...selected])
    .map((item) => catalog.find((candidate) => modelRefKey(candidate) === modelRefKey(item)))
    .filter(Boolean) as ModelCatalogEntry[]
}

export async function resolveMuxSelection(current: ModelRef, catalog: ModelCatalogEntry[]) {
  const config = await loadConfig()
  const mux = normalizeMux(config.mux)
  if (!mux.enabled) {
    return {
      model: current,
      keySwitched: false,
      modelSwitched: false,
      reason: "mux-disabled",
    }
  }

  const candidates = getMuxCandidates(current, catalog, mux)
  if (!candidates.length) {
    return {
      model: current,
      keySwitched: false,
      modelSwitched: false,
      reason: "no-candidates",
    }
  }

  const activeIndex = config.activeKeyIndex
  const activeKey = config.keys[activeIndex]
  let keyStates:
    | {
        index: number
        key: APIKeyEntry
        remaining: number | null
        ok: boolean
      }[]
    | undefined

  async function states() {
    if (keyStates) return keyStates
    keyStates = await Promise.all(
      config.keys.map(async (key, index) => {
        if (!key.enabled) return { index, key, remaining: null as number | null, ok: false }
        try {
          const info = await getKeyInfo(key.key)
          return { index, key, remaining: info.limit_remaining ?? null, ok: true }
        } catch {
          return { index, key, remaining: null as number | null, ok: false }
        }
      }),
    )
    return keyStates
  }

  for (const candidate of candidates) {
    const modelSwitched = modelRefKey(candidate) !== modelRefKey(current)

    if (candidate.providerID !== "openrouter") {
      return {
        model: { providerID: candidate.providerID, modelID: candidate.modelID },
        keySwitched: false,
        modelSwitched,
        reason: modelSwitched ? "direct-provider" : "same-model",
      }
    }

    const list = await states()
    if (!list.length) {
      continue
    }

    const activeUsable = list.find((state) => state.index === activeIndex && state.ok && canUseModel(state.remaining, candidate))
    if (activeUsable) {
      return {
        model: { providerID: candidate.providerID, modelID: candidate.modelID },
        keySwitched: false,
        modelSwitched,
        reason: modelSwitched ? "same-key-different-model" : "same-key-same-model",
      }
    }

    const alternative = list
      .filter((state) => state.ok && canUseModel(state.remaining, candidate))
      .sort((a, b) => bestRemainingValue(b.remaining) - bestRemainingValue(a.remaining))[0]

    if (!alternative) continue
    if (config.activeKeyIndex !== alternative.index) {
      config.activeKeyIndex = alternative.index
      await saveConfig(config)
      await syncAuthFromConfig(config)
    }
    return {
      model: { providerID: candidate.providerID, modelID: candidate.modelID },
      keySwitched: activeKey?.key !== alternative.key.key,
      modelSwitched,
      reason: modelSwitched ? "different-key-different-model" : "different-key-same-model",
    }
  }

  return {
    model: current,
    keySwitched: false,
    modelSwitched: false,
    reason: "no-usable-model",
  }
}

export async function modelAvailabilityOutput(catalog: ModelCatalogEntry[]) {
  const config = await loadConfig()
  const mux = normalizeMux(config.mux)
  if (config.keys.length === 0) {
    const local = catalog.filter((item) => item.providerID !== "openrouter")
    if (!local.length) {
      return "No OpenRouter API keys configured."
    }
    const names = local.slice(0, 5).map((item) => `${item.providerID}/${item.modelID}`)
    return [
      "No OpenRouter API keys configured.",
      `Local/other models in mux catalog: ${names.join(", ")}${local.length > 5 ? ` (+${local.length - 5} more)` : ""}`,
      "These providers do not need OpenRouter key rotation.",
    ].join("\n")
  }

  const selectedCatalog = (mux.selectedModels.length ? mux.selectedModels : catalog)
    .map((item) => catalog.find((candidate) => modelRefKey(candidate) === modelRefKey(item)))
    .filter(Boolean) as ModelCatalogEntry[]

  const models = selectedCatalog.slice(0, 12)
  const activeIndex = config.activeKeyIndex
  const active = config.keys[activeIndex]
  const meta = active ? await getKeyInfo(active.key).catch(() => undefined) : undefined

  const lines = [
    "MUX MODEL AVAILABILITY",
    `Status: ${mux.enabled ? "ENABLED" : "DISABLED"}  |  Models: ${mux.selectedModels.length} selected  |  Keys: ${config.keys.length} configured`,
    `Active key: ${active ? `#${activeIndex + 1} - ${meta?.label || active.label || "Unnamed"}` : "None"}`,
  ]

  for (const [index, key] of config.keys.entries()) {
    const isActive = index === activeIndex
    lines.push("")
    lines.push(`Key #${index + 1}${isActive ? " ◄ ACTIVE" : ""} - ${key.label || "Unnamed"}`)

    try {
      const info = await getKeyInfo(key.key)
      const remaining = info.limit_remaining
      const isUnlimited = remaining === null || remaining === undefined

      lines.push(`  Credits: ${formatCredits(remaining)}${isActive ? " (current)" : ""}`)

      if (!isUnlimited && remaining !== null && info.limit) {
        const pct = Math.max(0, Math.min(100, (remaining / info.limit) * 100))
        lines.push(`  Usage:   ${pct.toFixed(0)}%`)
      }

      for (const model of models) {
        const budget = summarizeModelBudget(model, remaining)
        const usable = canUseModel(remaining, model)
        const status = usable ? "ok" : "low"
        const marker = isActive && usable ? " ◄" : ""
        lines.push(
          `  [${status}] ${model.name || model.modelID} - in: ~${formatTokens(budget.inputTokens)}  out: ~${formatTokens(budget.outputTokens)}${marker}`,
        )
      }
    } catch (error) {
      lines.push(`  Error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  lines.push("")
  lines.push("ok = usable  |  low = low credits  |  ◄ = active key")

  return lines.join("\n")
}

export async function keysListOutput() {
  const config = await loadConfig()
  if (config.keys.length === 0) {
    return "No API keys configured. Add one with `opencode-mux router keys add <API_KEY> [label]`."
  }

  const lines = ["Configured OpenRouter API keys", ""]
  for (const [index, key] of config.keys.entries()) {
    const marker = index === config.activeKeyIndex ? " <-- ACTIVE" : ""
    const status = key.enabled ? "ON" : "OFF"
    lines.push(`  #${index + 1}  ${maskKey(key.key)}  [${status}]${marker}`)
    lines.push(`      Label: ${key.label || "Unnamed"}  |  Added: ${formatDate(key.addedAt)}`)
    lines.push("")
  }
  lines.push(`  Total keys: ${config.keys.length}`)
  return lines.join("\n")
}

export async function addKey(key: string, label?: string) {
  if (!key) throw new Error("API key is required")

  const config = await loadConfig()
  if (config.keys.some((item) => item.key === key)) {
    throw new Error("This key already exists")
  }

  let verification: KeyInfo | undefined
  let verificationError: string | undefined
  try {
    verification = await getKeyInfo(key)
  } catch (error) {
    verificationError = error instanceof Error ? error.message : String(error)
  }

  const nextLabel = label?.trim() || verification?.label || `Key #${config.keys.length + 1}`
  config.keys.push({
    key,
    label: nextLabel,
    addedAt: new Date().toISOString(),
    enabled: true,
  })
  if (config.activeKeyIndex === -1) {
    config.activeKeyIndex = 0
  }
  await saveConfig(config)
  await syncAuthFromConfig(config)

  const lines = []
  if (!isValidKeyFormat(key)) {
    lines.push("Warning: key does not start with `sk-or-`. Make sure this is a valid OpenRouter key.")
  }
  if (verificationError) {
    lines.push(`Key verification failed: ${verificationError}`)
    lines.push("Key was still added and can be tested later.")
  } else if (verification) {
    lines.push("Key verified successfully.")
    lines.push(
      `Label: ${verification.label || "N/A"} | Limit: ${formatCredits(verification.limit)} | Remaining: ${formatCredits(verification.limit_remaining)}`,
    )
  }
  lines.push(`Key added as #${config.keys.length}.`)
  return lines.join("\n")
}

export async function removeKey(index: number) {
  const config = await loadConfig()
  if (index < 0 || index >= config.keys.length) {
    throw new Error("Invalid key index. Use `keys list` to see valid indices.")
  }

  const [removed] = config.keys.splice(index, 1)
  if (config.activeKeyIndex === index) {
    config.activeKeyIndex = config.keys.length ? 0 : -1
  } else if (config.activeKeyIndex > index) {
    config.activeKeyIndex--
  }
  await saveConfig(config)
  await syncAuthFromConfig(config)
  return `Removed key #${index + 1} (${removed?.label || "Unnamed"}).`
}

export async function activateKey(index: number) {
  const config = await loadConfig()
  if (index < 0 || index >= config.keys.length) {
    throw new Error("Invalid key index")
  }

  config.activeKeyIndex = index
  await saveConfig(config)
  await syncAuthFromConfig(config)
  const key = config.keys[index]
  return `Activated key #${index + 1} (${key.label || "Unnamed"})\nKey: ${maskKey(key.key)}`
}

export async function testKey(index = -1) {
  const config = await loadConfig()
  const resolvedIndex = index >= 0 ? index : config.activeKeyIndex
  if (resolvedIndex < 0 || resolvedIndex >= config.keys.length) {
    throw new Error("No key available to test")
  }

  const key = config.keys[resolvedIndex]
  const info = await getKeyInfo(key.key)
  return [
    `Testing key #${resolvedIndex + 1} (${key.label || "Unnamed"})...`,
    "Status: OK",
    `Label: ${info.label || "N/A"}`,
    `Limit: ${formatCredits(info.limit)}`,
    `Left: ${formatCredits(info.limit_remaining)}`,
    `Free: ${info.is_free_tier ? "Yes" : "No"}`,
  ].join("\n")
}

export async function infoOutput() {
  const config = await loadConfig()
  if (config.keys.length === 0) {
    return "No API keys configured. Add one with `opencode-mux router keys add <API_KEY> [label]`."
  }

  const active = config.keys[config.activeKeyIndex]
  const meta = active ? await getKeyInfo(active.key).catch(() => undefined) : undefined
  const lines = [
    "OpenRouter key status - token and credit usage",
    "",
    `Active key: ${active ? `#${config.activeKeyIndex + 1} - ${meta?.label || active.label || "Unnamed"}` : "None"}`,
    "=".repeat(70),
  ]
  for (const [index, key] of config.keys.entries()) {
    const marker = index === config.activeKeyIndex ? " [ACTIVE]" : ""
    lines.push("")
    lines.push(`Key #${index + 1}${marker} - ${key.label || "Unnamed"}`)
    lines.push(`Key:       ${maskKey(key.key)}`)
    lines.push(`Status:    ${key.enabled ? "enabled" : "disabled"}`)

    try {
      const info = await getKeyInfo(key.key)
      lines.push(`Label:     ${info.label || "N/A"}`)
      lines.push(
        `Limit:     ${formatCredits(info.limit)}${info.limit_reset ? ` (resets: ${formatDate(info.limit_reset)})` : ""}`,
      )
      lines.push(`Remaining: ${formatCredits(info.limit_remaining)}`)
      lines.push(`Usage:     ${formatCredits(info.usage)} (all time)`)
      lines.push(`Daily:     ${formatCredits(info.usage_daily)}`)
      lines.push(`Weekly:    ${formatCredits(info.usage_weekly)}`)
      lines.push(`Monthly:   ${formatCredits(info.usage_monthly)}`)
      lines.push(`Free Tier: ${info.is_free_tier ? "Yes" : "No"}`)

      if (info.limit !== null && info.limit !== undefined && info.limit_remaining !== null && info.limit_remaining !== undefined) {
        const pct = info.limit > 0 ? Math.max(0, Math.min(100, (info.limit_remaining / info.limit) * 100)) : 0
        const barLength = 30
        const filled = Math.round((pct / 100) * barLength)
        lines.push(`Bar:       [${"#".repeat(filled)}${"-".repeat(barLength - filled)}] ${pct.toFixed(1)}%`)
      }

      if ((info.limit_remaining ?? 0) <= 0) {
        lines.push("LIMIT REACHED - consider switching keys")
      }
    } catch (error) {
      lines.push(`Error:     ${error instanceof Error ? error.message : String(error)}`)
    }

    lines.push("-".repeat(70))
  }

  return lines.join("\n")
}

export async function switchToBestKey(options?: { excludeKey?: string; syncAuth?: boolean }) {
  const config = await loadConfig()
  if (config.keys.length === 0) {
    throw new Error("No API keys configured")
  }

  let bestIndex = -1
  let bestRemaining = Number.NEGATIVE_INFINITY

  for (const [index, key] of config.keys.entries()) {
    if (!key.enabled) continue
    if (options?.excludeKey && key.key === options.excludeKey) continue

    try {
      const info = await getKeyInfo(key.key)
      const remaining = bestRemainingValue(info.limit_remaining)
      if (remaining > bestRemaining) {
        bestRemaining = remaining
        bestIndex = index
      }
    } catch {
      continue
    }
  }

  if (bestIndex === -1) {
    throw new Error("No working alternative keys found")
  }

  const previousIndex = config.activeKeyIndex
  config.activeKeyIndex = bestIndex
  await saveConfig(config)
  if (options?.syncAuth !== false) {
    await syncAuthFromConfig(config)
  }

  const key = config.keys[bestIndex]
  return {
    switched: previousIndex !== bestIndex,
    index: bestIndex,
    key,
    remaining: Number.isFinite(bestRemaining) ? bestRemaining : null,
    previousIndex,
  } satisfies SwitchResult
}

export async function switchOutput() {
  const config = await loadConfig()
  if (config.keys.length === 1) {
    return "Only one key is configured, there is nothing to switch."
  }

  const result = await switchToBestKey({ syncAuth: true })
  if (!result.switched) {
    return `Current key #${result.index + 1} (${result.key.label || "Unnamed"}) is already the best option (${formatCredits(result.remaining)} remaining).`
  }
  return [
    `Switched from #${result.previousIndex + 1} to #${result.index + 1} (${result.key.label || "Unnamed"})`,
    `Remaining credits: ${formatCredits(result.remaining)}`,
  ].join("\n")
}

export function authorsOutput() {
  return [
    `opencode-mux v${VERSION}`,
    "=".repeat(50),
    "",
    "Authors / Developers:",
    "",
    ...AUTHORS.flatMap((author) => [author.name, `GitHub: ${author.github}`, ""]),
    "Project Repository:",
    PROJECT_URL,
  ].join("\n")
}

export async function retryOpenRouterWithKeyRotation(
  fetchFn: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const res = await fetchFn(input, init)
  if (!(await shouldRotateOpenRouterKey(res))) {
    return res
  }

  const headers = new Headers(init?.headers)
  const authorization = headers.get("authorization") || headers.get("Authorization") || ""
  const currentKey = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined

  let next: SwitchResult | undefined
  try {
    next = await switchToBestKey({ excludeKey: currentKey, syncAuth: true })
  } catch {
    return res
  }

  if (!next?.key?.key || next.key.key === currentKey) {
    return res
  }

  const retryHeaders = new Headers(init?.headers)
  retryHeaders.set("Authorization", `Bearer ${next.key.key}`)
  return fetchFn(input, {
    ...init,
    headers: retryHeaders,
  })
}

export async function shouldRotateOpenRouterKey(res: Response) {
  if ([402, 429].includes(res.status)) return true
  if (res.status < 400) return false
  const text = await res
    .clone()
    .text()
    .catch(() => "")
  if (!text) return false
  const lowered = text.toLowerCase()
  return OPENROUTER_RETRY_HINTS.some((hint) => lowered.includes(hint))
}

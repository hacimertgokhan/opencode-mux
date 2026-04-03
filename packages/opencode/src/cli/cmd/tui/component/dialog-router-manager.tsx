import { createMemo, createSignal } from "solid-js"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { DialogAlert } from "@tui/ui/dialog-alert"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { useToast } from "@tui/ui/toast"
import { useLocal } from "../context/local"
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

export function DialogRouterManager() {
  const dialog = useDialog()
  const toast = useToast()
  const local = useLocal()
  const [busy, setBusy] = createSignal(false)
  const selectedCount = createMemo(() => local.model.mux.selected().length)

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
          title: local.model.mux.enabled() ? "Disable Mux Mode" : "Enable Mux Mode",
          value: "mux.toggle",
          description: local.model.mux.enabled()
            ? "Send prompts with the currently selected model only"
            : "Auto-route prompts across your selected OpenRouter models and keys",
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
          description: "Show token and credit usage for all keys",
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
          description: "Add, remove, activate, and test keys",
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
            description: model.modelID,
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

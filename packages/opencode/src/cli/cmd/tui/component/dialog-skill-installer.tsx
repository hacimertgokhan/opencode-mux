import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { createMemo } from "solid-js"
import { useDialog } from "@tui/ui/dialog"
import { useSDK } from "@tui/context/sdk"
import { DialogSkillInstallerBrowse } from "./dialog-skill-installer-browse"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { DialogAlert } from "@tui/ui/dialog-alert"
import { DialogSkill } from "./dialog-skill"
import { Global } from "@/global"
import path from "path"
import { mkdir } from "fs/promises"

function repo(input: string) {
  const text = input.trim()
  if (!text) return
  const hit = text.match(/github\.com\/([^/]+)\/([^/]+)/i)
  if (hit) {
    return { owner: hit[1], repo: hit[2].replace(/\.git$/i, "") }
  }
  const parts = text.replace(/^https?:\/\//i, "").split("/")
  if (parts.length >= 2 && !parts[0].includes(".")) {
    return { owner: parts[0], repo: parts[1].replace(/\.git$/i, "") }
  }
}

function slug(input: string) {
  const text = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return text || "custom-skill"
}

async function scope(dialog: ReturnType<typeof useDialog>) {
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

export function DialogSkillInstaller() {
  const dialog = useDialog()
  const sdk = useSDK()
  dialog.setSize("large")

  const options = createMemo<DialogSelectOption<string>[]>(() => [
    {
      title: "Browse & Search",
      value: "browse",
      description: "Search GitHub for skill repositories",
      category: "Discover",
      onSelect: () => {
        dialog.replace(() => <DialogSkillInstallerBrowse />)
      },
    },
    {
      title: "Add Repository URL",
      value: "add-url",
      description: "Install skills from a direct URL",
      category: "Discover",
      onSelect: async () => {
        const where = await scope(dialog)
        if (!where) return
        const url = await DialogPrompt.show(dialog, "Add Skill URL", {
          placeholder: "https://github.com/owner/repo or .../blob/.../SKILL.md",
        })
        if (!url) return
        const pair = repo(url)
        if (!pair) {
          await DialogAlert.show(dialog, "Invalid URL", "Please enter a valid GitHub repository URL.")
          return
        }
        const baseUrl = sdk.url.replace(/\/$/, "")
        const res = await fetch(`${baseUrl}/skill-installer/install`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner: pair.owner, repo: pair.repo, url, scope: where }),
        })
        const data = await res.json()
        if (data?.installed?.length) {
          await DialogAlert.show(dialog, "Skills Installed", `Installed (${where}): ${data.installed.join(", ")}`)
        } else {
          await DialogAlert.show(dialog, "No Skills Found", `No installable skills found in ${pair.owner}/${pair.repo}.`)
        }
      },
    },
    {
      title: "Create Skill",
      value: "create",
      description: "Create a new skill by answering prompts",
      category: "Manage",
      onSelect: async () => {
        const where = await scope(dialog)
        if (!where) return

        const name = await DialogPrompt.show(dialog, "Skill Name", {
          placeholder: "frontend-design",
        })
        if (!name?.trim()) return

        const desc = await DialogPrompt.show(dialog, "Skill Description", {
          placeholder: "What this skill helps with",
        })
        if (!desc?.trim()) return

        const body = await DialogPrompt.show(dialog, "Skill Instructions", {
          placeholder: "Write the workflow/instructions for this skill",
        })
        if (!body?.trim()) return

        const root =
          where === "global"
            ? path.join(Global.Path.home, ".agents", "skills")
            : path.join((await sdk.client.path.get()).data?.worktree ?? process.cwd(), ".agents", "skills")
        const dir = path.join(root, slug(name))
        const file = path.join(dir, "SKILL.md")
        const text = [`---`, `name: ${name.trim()}`, `description: ${desc.trim()}`, `---`, ``, body.trim(), ``].join("\n")

        await mkdir(dir, { recursive: true })
        await Bun.write(file, text)

        const baseUrl = sdk.url.replace(/\/$/, "")
        await fetch(`${baseUrl}/instance/dispose`, { method: "POST" }).catch(() => {})
        await DialogAlert.show(dialog, "Skill Created", `${name.trim()} created in:\n${dir}`)
      },
    },
    {
      title: "View Installed Skills",
      value: "view-local",
      description: "Manage locally installed skills",
      category: "Manage",
      onSelect: () => {
        dialog.replace(() => <DialogSkill onSelect={() => dialog.clear()} />)
      },
    },
  ])

  return <DialogSelect title="Install Skills" placeholder="Choose an option..." options={options()} />
}

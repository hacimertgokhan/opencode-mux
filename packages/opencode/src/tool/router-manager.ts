import z from "zod"
import { Tool } from "./tool"
import {
  activateKey,
  addKey,
  authorsOutput,
  infoOutput,
  keysListOutput,
  removeKey,
  switchOutput,
  testKey,
} from "@/router-manager"

export const AikInfoTool = Tool.define("aik_info", {
  description: "Show token and credit usage for all configured OpenRouter keys.",
  parameters: z.object({}),
  async execute() {
    return {
      title: "OpenRouter key info",
      output: await infoOutput(),
      metadata: {},
    }
  },
})

const aikKeysParams = z.object({
  action: z.enum(["list", "add", "remove", "activate", "test"]).describe("The key management action to perform"),
  key: z.string().optional().describe("The OpenRouter API key to add when action is add"),
  label: z.string().optional().describe("Optional label for the key when action is add"),
  index: z.number().int().positive().optional().describe("1-based key index for remove, activate, or test"),
})

export const AikKeysTool = Tool.define("aik_keys", {
  description: "Manage OpenRouter API keys: list, add, remove, activate, and test keys.",
  parameters: aikKeysParams,
  async execute(params) {
    let output = ""

    switch (params.action) {
      case "list":
        output = await keysListOutput()
        break
      case "add":
        output = await addKey(params.key ?? "", params.label)
        break
      case "remove":
        if (!params.index) throw new Error("index is required for remove")
        output = await removeKey(params.index - 1)
        break
      case "activate":
        if (!params.index) throw new Error("index is required for activate")
        output = await activateKey(params.index - 1)
        break
      case "test":
        output = await testKey(params.index ? params.index - 1 : -1)
        break
    }

    return {
      title: `OpenRouter keys: ${params.action}`,
      output,
      metadata: {},
    }
  },
})

export const AikSwitchKeyTool = Tool.define("aik_switch_key", {
  description: "Switch to the OpenRouter key with the most remaining credits.",
  parameters: z.object({}),
  async execute() {
    return {
      title: "Switched OpenRouter key",
      output: await switchOutput(),
      metadata: {},
    }
  },
})

export const AikAuthorsTool = Tool.define("aik_authors", {
  description: "Show project authors and repository information for the router manager integration.",
  parameters: z.object({}),
  async execute() {
    return {
      title: "Router manager authors",
      output: authorsOutput(),
      metadata: {},
    }
  },
})

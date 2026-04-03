import { cmd } from "./cmd"
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

function print(output: string) {
  process.stdout.write(output.trim() + "\n")
}

export const RouterManagerCommand = cmd({
  command: "router",
  aliases: ["mux"],
  describe: "manage OpenRouter key rotation for opencode-mux",
  builder: (yargs) =>
    yargs
      .command({
        command: "info",
        describe: "show usage for all configured keys",
        async handler() {
          print(await infoOutput())
        },
      })
      .command({
        command: "authors",
        describe: "show router manager project info",
        async handler() {
          print(authorsOutput())
        },
      })
      .command({
        command: "switch-key",
        aliases: ["switch"],
        describe: "switch to the best available key",
        async handler() {
          print(await switchOutput())
        },
      })
      .command({
        command: "keys",
        describe: "list and manage configured keys",
        builder: (sub) =>
          sub
            .command({
              command: "list",
              aliases: ["ls"],
              describe: "list all configured keys",
              async handler() {
                print(await keysListOutput())
              },
            })
            .command({
              command: "add <key> [label...]",
              describe: "add a new OpenRouter key",
              builder: (args) =>
                args
                  .positional("key", { type: "string", demandOption: true })
                  .positional("label", { type: "string" }),
              async handler(args) {
                const label = Array.isArray(args.label) ? args.label.join(" ") : args.label
                print(await addKey(String(args.key), label ? String(label) : undefined))
              },
            })
            .command({
              command: "remove <index>",
              describe: "remove a key by its 1-based index",
              builder: (args) => args.positional("index", { type: "number", demandOption: true }),
              async handler(args) {
                print(await removeKey(Number(args.index) - 1))
              },
            })
            .command({
              command: "activate <index>",
              describe: "set the active key by 1-based index",
              builder: (args) => args.positional("index", { type: "number", demandOption: true }),
              async handler(args) {
                print(await activateKey(Number(args.index) - 1))
              },
            })
            .command({
              command: "test [index]",
              describe: "test the active key or a specific 1-based index",
              builder: (args) => args.positional("index", { type: "number" }),
              async handler(args) {
                print(await testKey(args.index ? Number(args.index) - 1 : -1))
              },
            })
            .demandCommand(),
        async handler() {},
      })
      .demandCommand(),
  async handler() {},
})

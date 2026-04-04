import { describe, expect, test } from "bun:test"
import os from "os"
import path from "path"
import { Ready } from "../../src/ready"

describe("ready", () => {
  test("parses app and project actions from mixed Turkish text", () => {
    const cwd = "/tmp/mux-ready"
    const out = Ready.steps(
      "spotify'ı aç daha sonra x/x/x pathindeki projeyi webstorm ile aç",
      cwd,
    )
    expect(out).toEqual([
      {
        type: "app",
        app: "Spotify",
      },
      {
        type: "project",
        app: "WebStorm",
        path: path.join(cwd, "x/x/x"),
      },
    ])
  })

  test("parses quoted home path with selected app", () => {
    const out = Ready.steps(`open "~/Work/demo" with webstorm`, "/tmp")
    expect(out).toEqual([
      {
        type: "project",
        app: "WebStorm",
        path: path.join(os.homedir(), "Work/demo"),
      },
    ])
  })

  test("returns empty list when text has no ready action", () => {
    const out = Ready.steps("merhaba nasılsın bugün")
    expect(out).toEqual([])
  })
})

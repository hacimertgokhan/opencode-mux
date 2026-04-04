import { describe, expect, test } from "bun:test"
import { shouldRotateOpenRouterKey } from "../../src/router-manager"

describe("router-manager retry hints", () => {
  test("rotates on standard rate-limit status", async () => {
    const res = new Response("{}", { status: 429, headers: { "content-type": "application/json" } })
    expect(await shouldRotateOpenRouterKey(res)).toBe(true)
  })

  test("rotates on Alibaba upstream rate text", async () => {
    const res = new Response(
      JSON.stringify({
        error: {
          message:
            "Upstream error from Alibaba: Request rate increased too quickly. To ensure system stability, please adjust your client logic to scale requests more smoothly over time.",
        },
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    )
    expect(await shouldRotateOpenRouterKey(res)).toBe(true)
  })

  test("does not rotate on unrelated failures", async () => {
    const res = new Response(JSON.stringify({ error: { message: "model not found" } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })
    expect(await shouldRotateOpenRouterKey(res)).toBe(false)
  })
})

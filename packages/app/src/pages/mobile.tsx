import type { Message, Part, Session, SessionStatus } from "@opencode-ai/sdk/v2/client"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { showToast } from "@opencode-ai/ui/toast"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogSelectServer } from "@/components/dialog-select-server"
import { base64Encode } from "@opencode-ai/util/encode"
import { useNavigate } from "@solidjs/router"
import { DateTime } from "luxon"
import { batch, createMemo, For, onCleanup, onMount, Show } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { serverName, useServer } from "@/context/server"
import { formatServerError } from "@/utils/server-errors"

type Row = {
  info: Message
  parts: Part[]
}

type SyncStore = {
  loading: boolean
  sending: boolean
  acting: string
  txt: string
  sid: string
  err: string
  path: {
    directory: string
    worktree: string
  }
  sessions: Session[]
  status: Record<string, SessionStatus>
  messages: Message[]
  parts: Record<string, Part[]>
}

export default function Mobile() {
  const sdk = useGlobalSDK()
  const svr = useServer()
  const dialog = useDialog()
  const nav = useNavigate()
  const [store, setStore] = createStore<SyncStore>({
    loading: true,
    sending: false,
    acting: "",
    txt: "",
    sid: "",
    err: "",
    path: {
      directory: "",
      worktree: "",
    },
    sessions: [],
    status: {},
    messages: [],
    parts: {},
  })

  const name = createMemo(() => {
    const cur = svr.current
    if (!cur) return "Sunucu yok"
    return serverName(cur)
  })

  const list = createMemo(() => store.sessions)

  const stamp = (time?: number) => {
    if (!time) return "-"
    const x = DateTime.fromMillis(time)
    return x.toRelative() ?? x.toLocaleString(DateTime.DATETIME_SHORT)
  }

  const preview = (msg: Message) => {
    const parts = store.parts[msg.id] ?? []
    const text = parts
      .filter((part) => part.type === "text")
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join("\n")
    if (text) return text.slice(0, 240)
    const part = parts[0]
    if (!part) return "(boş)"
    if (part.type === "tool") return `[tool] ${part.tool}`
    return `[${part.type}]`
  }

  const href = (session: Session) => `/${base64Encode(session.directory)}/session/${session.id}`

  const loadMessages = (sid: string) => {
    if (!sid) {
      setStore("messages", [])
      setStore("parts", {})
      return Promise.resolve()
    }
    return sdk.client.session
      .messages({ sessionID: sid, limit: 40 })
      .then((res) => {
        if (store.sid !== sid) return
        const msgs = (res.data ?? []).slice().sort((a, b) => a.info.time.created - b.info.time.created)
        const partsMap: Record<string, Part[]> = {}
        for (const msg of msgs) {
          partsMap[msg.info.id] = msg.parts ?? []
        }
        setStore(
          "messages",
          msgs.map((m) => m.info),
        )
        setStore("parts", reconcile(partsMap))
      })
      .catch((err) => {
        showToast({
          variant: "error",
          title: "Mesajlar yüklenemedi",
          description: formatServerError(err),
        })
      })
  }

  let busy = false
  const pull = () => {
    if (busy) return
    busy = true
    Promise.all([
      sdk.client.path.get(),
      sdk.client.session.list({ roots: true, limit: 80 }),
      sdk.client.session.status(),
    ])
      .then((all) => {
        const path = all[0].data
        const sessions = (all[1].data ?? [])
          .filter((s) => !s.time.archived)
          .sort((a, b) => b.time.updated - a.time.updated)
        const status = all[2].data ?? {}
        const keep = sessions.find((s) => s.id === store.sid)?.id
        const run = sessions.find((s) => {
          const type = status[s.id]?.type
          return type === "busy" || type === "retry"
        })?.id
        const sid = keep ?? run ?? sessions[0]?.id ?? ""
        setStore({
          loading: false,
          err: "",
          path: {
            directory: path?.directory ?? "",
            worktree: path?.worktree ?? "",
          },
          sessions,
          status,
          sid,
        })
        if (!sid) {
          setStore("messages", [])
          setStore("parts", {})
          return
        }
        if (sid === store.sid && store.messages.length > 0) return
        return loadMessages(sid)
      })
      .catch((err) => {
        setStore("loading", false)
        setStore("err", formatServerError(err))
      })
      .finally(() => {
        busy = false
      })
  }

  const run = (sid: string, fn: () => Promise<unknown>) => {
    setStore("acting", sid)
    fn()
      .then(() => pull())
      .catch((err) => {
        showToast({
          variant: "error",
          title: "İşlem başarısız",
          description: formatServerError(err),
        })
      })
      .finally(() => {
        setStore("acting", "")
      })
  }

  const send = () => {
    const txt = store.txt.trim()
    if (!txt) return
    if (store.sending) return
    setStore("sending", true)
    let sid = store.sid
    const ready = sid
      ? Promise.resolve(sid)
      : sdk.client.session.create({ title: txt.slice(0, 80) }).then((res) => (res.data?.id ? res.data.id : ""))
    ready
      .then((id) => {
        sid = id
        if (sid) {
          setStore("sid", sid)
          return sdk.client.session.promptAsync({
            sessionID: sid,
            parts: [{ type: "text", text: txt }],
          })
        }
        return Promise.reject(new Error("Session oluşturulamadı"))
      })
      .then(() => {
        setStore("txt", "")
        pull()
        if (!sid) return
        setTimeout(() => {
          loadMessages(sid)
        }, 500)
      })
      .catch((err) => {
        showToast({
          variant: "error",
          title: "Prompt gönderilemedi",
          description: formatServerError(err),
        })
      })
      .finally(() => {
        setStore("sending", false)
      })
  }

  onMount(() => {
    pull()
    let refreshTimer: ReturnType<typeof setTimeout>
    let statusTimer: ReturnType<typeof setTimeout>
    const unsub = sdk.event.listen((e) => {
      const event = e.details
      const props = event.properties as Record<string, any>
      const sessionID = props?.sessionID

      if (event.type === "message.part.delta") {
        const partID = props?.partID
        const field = props?.field
        const delta = props?.delta
        if (sessionID === store.sid && partID && field === "text" && delta) {
          batch(() => {
            setStore(
              "parts",
              produce((parts) => {
                for (const msgID of Object.keys(parts)) {
                  const msgParts = parts[msgID]
                  for (let i = 0; i < msgParts.length; i++) {
                    const p = msgParts[i]
                    if (p.id === partID && p.type === "text") {
                      msgParts[i] = { ...p, text: (p.text ?? "") + delta }
                      break
                    }
                  }
                }
              }),
            )
          })
        }
      }

      if (event.type === "message.part.updated" || event.type === "message.updated") {
        if (sessionID === store.sid) {
          clearTimeout(refreshTimer)
          refreshTimer = setTimeout(() => loadMessages(sessionID), 300)
        }
      }

      if (event.type === "session.status") {
        clearTimeout(statusTimer)
        statusTimer = setTimeout(() => pull(), 500)
      }
    })
    onCleanup(() => {
      unsub()
      clearInterval(id)
      clearTimeout(refreshTimer)
      clearTimeout(statusTimer)
    })
  })

  const id = setInterval(() => {
    pull()
    if (store.sid) loadMessages(store.sid)
  }, 4_000)

  return (
    <div class="w-full h-dvh flex flex-col bg-background-base">
      {/* Header */}
      <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-weak-base bg-surface-base">
        <div class="flex items-center gap-2">
          <Icon name="status" size="normal" />
          <div class="text-16-medium text-text-strong">Mobil Kontrol</div>
        </div>
        <div class="flex items-center gap-1">
          <Button variant="ghost" size="small" onClick={() => dialog.show(() => <DialogSelectServer />)}>
            <Icon name="server" size="small" />
          </Button>
          <Button variant="ghost" size="small" onClick={() => nav("/")}>
            <Icon name="arrow-left" size="small" />
          </Button>
        </div>
      </div>

      {/* Server Info */}
      <div class="px-4 py-2 border-b border-border-weak-base bg-surface-weak-base">
        <div class="flex items-center gap-2">
          <div
            classList={{
              "size-2 rounded-full": true,
              "bg-icon-success-base": svr.healthy() === true,
              "bg-icon-critical-base": svr.healthy() === false,
              "bg-border-weak-base": svr.healthy() === undefined,
            }}
          />
          <div class="text-12-regular text-text-strong truncate flex-1">{name()}</div>
        </div>
        <Show when={store.path.directory}>
          <div class="text-11-regular text-text-weak truncate mt-0.5">{store.path.directory}</div>
        </Show>
      </div>

      {/* Prompt Input */}
      <div class="px-4 py-3 border-b border-border-weak-base bg-surface-base">
        <textarea
          class="w-full rounded-md border border-border-weak-base bg-background-base px-3 py-2 text-14-regular text-text-strong outline-none focus:border-border-strong-base min-h-20 resize-none"
          placeholder="Bir prompt yaz..."
          value={store.txt}
          onInput={(e) => setStore("txt", e.currentTarget.value)}
        />
        <div class="mt-2 flex items-center justify-between">
          <Button size="normal" disabled={store.sending || !store.txt.trim()} onClick={send} class="flex-1">
            {store.sending ? "Gönderiliyor..." : "Gönder"}
          </Button>
        </div>
      </div>

      {/* Error */}
      <Show when={store.err}>
        <div class="mx-4 mt-2 rounded-md border border-border-critical-base bg-surface-critical-weak p-2 text-12-regular text-text-critical">
          {store.err}
        </div>
      </Show>

      {/* Sessions List */}
      <div class="flex-1 overflow-auto px-4 py-3">
        <Show
          when={!store.loading}
          fallback={<div class="text-12-regular text-text-weak text-center py-4">Yükleniyor...</div>}
        >
          <Show
            when={list().length > 0}
            fallback={<div class="text-12-regular text-text-weak text-center py-4">Session bulunamadı</div>}
          >
            <div class="flex flex-col gap-2">
              <For each={list()}>
                {(session) => {
                  const isLive = (() => {
                    const type = store.status[session.id]?.type
                    return type === "busy" || type === "retry"
                  })()
                  const isSelected = store.sid === session.id
                  return (
                    <div
                      classList={{
                        "rounded-lg border px-3 py-2.5": true,
                        "border-border-strong-base bg-surface-raised-base": isSelected,
                        "border-border-weak-base bg-surface-base": !isSelected,
                      }}
                    >
                      <button
                        type="button"
                        class="w-full text-left"
                        onClick={() => {
                          setStore("sid", session.id)
                          loadMessages(session.id)
                        }}
                      >
                        <div class="flex items-start justify-between gap-2">
                          <div class="flex-1 min-w-0">
                            <div class="text-14-medium text-text-strong truncate">{session.title}</div>
                            <div class="text-11-regular text-text-weak mt-0.5">{stamp(session.time.updated)}</div>
                          </div>
                          <Show when={isLive}>
                            <div class="text-11-medium text-icon-warning-base shrink-0">
                              {store.status[session.id]?.type}
                            </div>
                          </Show>
                        </div>
                      </button>
                      <Show when={isSelected}>
                        <div class="mt-2 flex items-center gap-1 flex-wrap pt-2 border-t border-border-weak-base">
                          <Button
                            variant="ghost"
                            size="small"
                            class="px-2"
                            disabled={store.acting === session.id}
                            onClick={() => run(session.id, () => sdk.client.session.abort({ sessionID: session.id }))}
                          >
                            Durdur
                          </Button>
                          <Button
                            variant="ghost"
                            size="small"
                            class="px-2"
                            disabled={store.acting === session.id}
                            onClick={() =>
                              run(session.id, () =>
                                sdk.client.session.update({ sessionID: session.id, time: { archived: Date.now() } }),
                              )
                            }
                          >
                            Arşivle
                          </Button>
                          <Button
                            variant="ghost"
                            size="small"
                            class="px-2"
                            disabled={store.acting === session.id}
                            onClick={() =>
                              run(session.id, () =>
                                sdk.client.session.fork({ sessionID: session.id }).then((res) => {
                                  const sid = res.data?.id
                                  if (!sid) return
                                  setStore("sid", sid)
                                }),
                              )
                            }
                          >
                            Fork
                          </Button>
                          <Button
                            variant="ghost"
                            size="small"
                            class="px-2"
                            onClick={() => {
                              nav(href(session))
                            }}
                          >
                            Aç
                          </Button>
                        </div>
                        {/* Messages */}
                        <Show when={store.messages.length > 0}>
                          <div class="mt-2 pt-2 border-t border-border-weak-base max-h-64 overflow-auto flex flex-col gap-1.5">
                            <For each={store.messages}>
                              {(msg) => (
                                <div class="rounded-md bg-background-base px-2 py-1.5">
                                  <div class="flex items-center gap-1.5 text-10-regular text-text-weak">
                                    <Icon name={msg.role === "user" ? "bubble-5" : "brain"} size="small" />
                                    <span>{msg.role}</span>
                                    <span>•</span>
                                    <span>{stamp(msg.time.created)}</span>
                                  </div>
                                  <div class="mt-0.5 whitespace-pre-wrap break-words text-12-regular text-text-strong">
                                    {preview(msg)}
                                  </div>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                      </Show>
                    </div>
                  )
                }}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}

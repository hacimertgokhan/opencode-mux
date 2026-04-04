"use client"

import { useState, useEffect, useRef } from "react"

function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true
          const dur = 2000
          const start = performance.now()
          const tick = (now: number) => {
            const p = Math.min((now - start) / dur, 1)
            const ease = 1 - Math.pow(1 - p, 4)
            setVal(Math.round(ease * target))
            if (p < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }
      },
      { threshold: 0.3 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [target])

  return (
    <span ref={ref}>
      {val.toLocaleString()}
      {suffix}
    </span>
  )
}

function RoutingViz() {
  const [activeKey, setActiveKey] = useState(0)
  const [activeModel, setActiveModel] = useState(0)
  const [reqCount, setReqCount] = useState(847)
  const keys = ["sk-or-a1b2...", "sk-or-c3d4...", "sk-or-e5f6..."]
  const models = ["claude-3.5-sonnet", "gpt-4o", "gemini-2.0-flash"]

  useEffect(() => {
    const ki = setInterval(() => {
      setActiveKey((p) => (p + 1) % keys.length)
      setReqCount((p) => p + Math.floor(Math.random() * 3))
    }, 2000)
    const mi = setInterval(() => setActiveModel((p) => (p + 1) % models.length), 3000)
    return () => {
      clearInterval(ki)
      clearInterval(mi)
    }
  }, [keys.length, models.length])

  return (
    <div className="routing-viz">
      <div className="routing-header">
        <span className="routing-live">● LIVE</span>
        <span className="routing-reqs">{reqCount.toLocaleString()} requests</span>
      </div>
      <div className="routing-flow">
        <div className="routing-node routing-source">
          <div className="routing-node-icon">⚡</div>
          <div className="routing-node-label">Request</div>
        </div>
        <svg className="routing-lines" viewBox="0 0 200 60">
          <defs>
            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          <line x1="0" y1="30" x2="200" y2="30" stroke="url(#lineGrad)" strokeWidth="2" strokeDasharray="6 3">
            <animate attributeName="stroke-dashoffset" from="0" to="-18" dur="1s" repeatCount="indefinite" />
          </line>
          <circle r="3" fill="#34d399">
            <animateMotion dur="1.5s" repeatCount="indefinite" path="M0,30 L200,30" />
          </circle>
        </svg>
        <div className="routing-node routing-dest">
          <div className="routing-node-icon">🧠</div>
          <div className="routing-node-label">{models[activeModel]}</div>
        </div>
      </div>
      <div className="routing-keys">
        {keys.map((k, i) => (
          <div key={i} className={`routing-key ${i === activeKey ? "active" : ""}`}>
            <div className="routing-key-dot">{i === activeKey ? "●" : "○"}</div>
            <div className="routing-key-text">{k}</div>
          </div>
        ))}
      </div>
      <div className="routing-status">
        <span className="routing-status-label">Routing via</span>
        <span className="routing-status-value">{keys[activeKey]}</span>
        <span className="routing-status-arrow">→</span>
        <span className="routing-status-model">{models[activeModel]}</span>
      </div>
    </div>
  )
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVisible(true)
      },
      { threshold: 0.15 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={ref} className={`reveal ${visible ? "visible" : ""}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

export default function Home() {
  const [phase, setPhase] = useState<"x" | "mux" | "site">("x")
  const [lines, setLines] = useState<{ t: string; c: string }[]>([])
  const [copied, setCopied] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("mux"), 1200)
    const t2 = setTimeout(() => setPhase("site"), 2200)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  useEffect(() => {
    if (phase !== "site") return
    const seq = [
      { t: "$", c: "mux" },
      { t: "ok", c: "Mux enabled. Routing via OpenRouter..." },
      { t: "$", c: "/mux keys" },
      { t: "out", c: "┌─ API Keys ───────────────────────┐" },
      { t: "out", c: "│  sk-or-v1-abc1...   ●  active    │" },
      { t: "out", c: "│  sk-or-v1-def4...   ○  standby   │" },
      { t: "out", c: "└──────────────────────────────────┘" },
      { t: "$", c: "/mux models" },
      { t: "out", c: "claude-3.5-sonnet  ●  preferred" },
      { t: "out", c: "gpt-4o             ○  fallback" },
      { t: "out", c: "gemini-2.0-flash   ○  fallback" },
      { t: "$", c: "refactor the auth module to use JWT" },
      { t: "dim", c: "reading src/auth/index.ts..." },
      { t: "dim", c: "generating changes..." },
      { t: "ok", c: "3 files modified · 1.4s" },
    ]

    let d = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    seq.forEach((item) => {
      const timer = setTimeout(() => {
        setLines((prev) => [...prev, item])
      }, d)
      timers.push(timer)
      d += item.t === "$" ? 600 : 250
    })
    return () => timers.forEach(clearTimeout)
  }, [phase])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setMousePos({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight })
    }
    window.addEventListener("mousemove", handler)
    return () => window.removeEventListener("mousemove", handler)
  }, [])

  const copy = () => {
    navigator.clipboard.writeText(
      "curl -fsSL https://raw.githubusercontent.com/hacimertgokhan/opencode-mux/main/install | bash",
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div className="noise" />

      <div
        className="mouse-glow"
        style={{
          left: `${mousePos.x * 100}%`,
          top: `${mousePos.y * 100}%`,
        }}
      />

      {phase === "x" && (
        <div className="intro">
          <div className="intro-x">x</div>
        </div>
      )}
      {phase === "mux" && (
        <div className="intro">
          <div className="intro-mux show">mux</div>
        </div>
      )}
      {phase === "site" && (
        <nav className="nav-inner">
          <a href="#" className="nav-logo">
            mux
          </a>
          <div className="nav-links">
            <a href="#platforms">Platforms</a>
            <a href="#playground">Playground</a>
            <a href="#routing">Routing</a>
            <a href="#features">Features</a>
            <a href="https://github.com/hacimertgokhan/opencode-mux" className="nav-btn">
              GitHub
            </a>
          </div>
        </nav>
      )}

      <section className="hero">
        <div
          className="hero-glow"
          style={{
            transform: `translate(${(mousePos.x - 0.5) * 20}px, ${(mousePos.y - 0.5) * 20}px)`,
          }}
        />
        <h1 className="hero-title">
          No more
          <br />
          rate limits.
        </h1>
        <p className="hero-sub">
          Smart routing for OpenCode. Switch between API keys and models automatically so you never stop coding.
        </p>
        <div className="hero-actions">
          <a href="#playground" className="btn btn-solid">
            See it in action
          </a>
          <a href="https://github.com/hacimertgokhan/opencode-mux" className="btn btn-ghost">
            GitHub
          </a>
        </div>
        <div style={{ marginTop: 48, opacity: 0, animation: "fadeUp 0.6s ease 3s forwards" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "10px 16px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
              fontFamily: "var(--mono)",
              fontSize: 13,
            }}
          >
            <span style={{ color: "#444" }}>$</span>
            <span style={{ color: "#888" }}>curl -fsSL .../install | bash</span>
            <button
              onClick={copy}
              style={{
                padding: "4px 10px",
                background: "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: 6,
                color: "#555",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "var(--sans)",
                fontWeight: 500,
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </section>

      <div className="marquee-section">
        <div className="marquee-track">
          {[
            "OpenRouter",
            "Claude",
            "GPT-4o",
            "Gemini",
            "Llama",
            "Mistral",
            "DeepSeek",
            "Groq",
            "Together",
            "Fireworks",
            "OpenRouter",
            "Claude",
            "GPT-4o",
            "Gemini",
            "Llama",
            "Mistral",
            "DeepSeek",
            "Groq",
            "Together",
            "Fireworks",
          ].map((t, i) => (
            <span key={i} className="marquee-item">
              {t}
              <span className="marquee-dot" />
            </span>
          ))}
        </div>
      </div>

      <section className="metrics-section">
        <div className="metrics-grid">
          <Reveal delay={0}>
            <div className="metric-card">
              <div className="metric-value">
                <Counter target={2847563} />
              </div>
              <div className="metric-label">Requests routed</div>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="metric-card">
              <div className="metric-value">
                <Counter target={1247} />
              </div>
              <div className="metric-label">Active users</div>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="metric-card">
              <div className="metric-value">
                <Counter target={99} suffix=".97%" />
              </div>
              <div className="metric-label">Uptime</div>
            </div>
          </Reveal>
          <Reveal delay={300}>
            <div className="metric-card">
              <div className="metric-value">
                <Counter target={12} suffix="ms" />
              </div>
              <div className="metric-label">Avg routing latency</div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section-full" id="platforms">
        <Reveal>
          <div className="section-head">
            <div className="section-label">Platforms</div>
            <div className="section-title">Code anywhere</div>
            <div className="section-desc">Terminal, desktop, browser, or IDE. Mux works wherever you do.</div>
          </div>
        </Reveal>

        <div className="platforms">
          <Reveal delay={0}>
            <div className="platform">
              <div className="platform-name">Terminal</div>
              <div className="platform-desc">
                Full TUI with built-in Mux routing. Manage keys and models with slash commands.
              </div>
              <div className="platform-tags">
                <span className="platform-tag">macOS</span>
                <span className="platform-tag">Linux</span>
                <span className="platform-tag">Windows</span>
              </div>
              <div className="platform-visual">
                <svg viewBox="0 0 500 180" fill="none" style={{ width: "100%" }}>
                  <rect width="500" height="180" rx="8" fill="#080808" stroke="rgba(255,255,255,0.05)" />
                  <rect width="500" height="24" rx="8" fill="#0c0c0c" />
                  <circle cx="14" cy="12" r="4.5" fill="#ff5f57" />
                  <circle cx="28" cy="12" r="4.5" fill="#febc2e" />
                  <circle cx="42" cy="12" r="4.5" fill="#28c840" />
                  <text x="18" y="52" fill="#fff" fontSize="11" fontFamily="JetBrains Mono,monospace">
                    $
                  </text>
                  <text x="32" y="52" fill="#fff" fontSize="11" fontFamily="JetBrains Mono,monospace">
                    mux
                  </text>
                  <text x="18" y="72" fill="#34d399" fontSize="10" fontFamily="JetBrains Mono,monospace">
                    ✓ enabled
                  </text>
                  <text x="18" y="92" fill="#fff" fontSize="11" fontFamily="JetBrains Mono,monospace">
                    $
                  </text>
                  <text x="32" y="92" fill="#fff" fontSize="11" fontFamily="JetBrains Mono,monospace">
                    /mux keys
                  </text>
                  <text x="18" y="112" fill="#555" fontSize="9" fontFamily="JetBrains Mono,monospace">
                    ┌─ keys ─────────────────────────┐
                  </text>
                  <text x="18" y="126" fill="#555" fontSize="9" fontFamily="JetBrains Mono,monospace">
                    │ ● sk-or-v1-abc1 active
                  </text>
                  <text x="18" y="140" fill="#555" fontSize="9" fontFamily="JetBrains Mono,monospace">
                    │ ○ sk-or-v1-def4 standby
                  </text>
                  <text x="18" y="154" fill="#555" fontSize="9" fontFamily="JetBrains Mono,monospace">
                    └────────────────────────────────┘
                  </text>
                </svg>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="platform">
              <div className="platform-name">Desktop</div>
              <div className="platform-desc">Native app with session management and Mux dashboard built in.</div>
              <div className="platform-tags">
                <span className="platform-tag">macOS</span>
                <span className="platform-tag">Windows</span>
                <span className="platform-tag">Linux</span>
              </div>
              <div className="platform-visual">
                <svg viewBox="0 0 500 180" fill="none" style={{ width: "100%" }}>
                  <rect width="500" height="180" rx="8" fill="#080808" stroke="rgba(255,255,255,0.05)" />
                  <rect width="500" height="24" rx="8" fill="#0c0c0c" />
                  <circle cx="14" cy="12" r="4.5" fill="#ff5f57" />
                  <circle cx="28" cy="12" r="4.5" fill="#febc2e" />
                  <circle cx="42" cy="12" r="4.5" fill="#28c840" />
                  <rect y="24" width="100" height="156" fill="#050505" />
                  <text x="12" y="48" fill="#333" fontSize="8" fontFamily="JetBrains Mono,monospace">
                    SESSIONS
                  </text>
                  <rect x="4" y="56" width="92" height="20" rx="4" fill="rgba(255,255,255,0.04)" />
                  <circle cx="14" cy="66" r="2.5" fill="#fff" />
                  <text x="22" y="69" fill="#fff" fontSize="8">
                    main
                  </text>
                  <circle cx="14" cy="88" r="2.5" fill="#333" />
                  <text x="22" y="91" fill="#555" fontSize="8">
                    feature/auth
                  </text>
                  <rect x="116" y="36" width="368" height="44" rx="6" fill="#0c0c0c" />
                  <text x="132" y="54" fill="#888" fontSize="9">
                    Build a REST API with Express
                  </text>
                  <text x="132" y="70" fill="#444" fontSize="7">
                    claude-3.5-sonnet
                  </text>
                  <rect x="116" y="90" width="368" height="74" rx="6" fill="#050505" stroke="rgba(255,255,255,0.06)" />
                  <text x="132" y="112" fill="#fff" fontSize="9">
                    const app = express()
                  </text>
                  <text x="132" y="128" fill="#fff" fontSize="9">
                    app.get(&quot;/api&quot;, handler)
                  </text>
                  <text x="132" y="144" fill="#fff" fontSize="9">
                    app.listen(3000)
                  </text>
                  <rect x="400" y="140" width="64" height="16" rx="4" fill="rgba(255,255,255,0.04)" />
                  <text x="410" y="152" fill="#34d399" fontSize="7" fontFamily="JetBrains Mono,monospace">
                    MUX ON
                  </text>
                </svg>
              </div>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="platform">
              <div className="platform-name">Web</div>
              <div className="platform-desc">
                Access sessions from any browser. Share, collaborate, manage remotely.
              </div>
              <div className="platform-tags">
                <span className="platform-tag">Any browser</span>
                <span className="platform-tag">Shareable</span>
              </div>
              <div className="platform-visual">
                <svg viewBox="0 0 500 180" fill="none" style={{ width: "100%" }}>
                  <rect width="500" height="180" rx="8" fill="#080808" stroke="rgba(255,255,255,0.05)" />
                  <rect width="500" height="24" rx="8" fill="#0c0c0c" />
                  <rect x="12" y="7" width="180" height="10" rx="4" fill="#050505" />
                  <text x="20" y="16" fill="#333" fontSize="7" fontFamily="JetBrains Mono,monospace">
                    opencode.app/session/x8k2m
                  </text>
                  <rect x="16" y="36" width="300" height="128" rx="6" fill="#050505" />
                  <rect x="32" y="52" width="180" height="26" rx="6" fill="#0c0c0c" />
                  <text x="46" y="69" fill="#888" fontSize="9">
                    Create a landing page
                  </text>
                  <rect x="32" y="88" width="180" height="60" rx="6" fill="#0c0c0c" stroke="rgba(255,255,255,0.06)" />
                  <text x="46" y="108" fill="#fff" fontSize="9">
                    Generating...
                  </text>
                  <rect x="46" y="118" width="100" height="2" rx="1" fill="#161616" />
                  <rect x="46" y="118" width="65" height="2" rx="1" fill="#fff" />
                  <text x="46" y="136" fill="#444" fontSize="7">
                    claude-3.5-sonnet
                  </text>
                  <rect x="332" y="52" width="152" height="112" rx="6" fill="#0c0c0c" />
                  <text x="346" y="72" fill="#fff" fontSize="8" fontFamily="JetBrains Mono,monospace" fontWeight="bold">
                    mux
                  </text>
                  <text x="346" y="92" fill="#34d399" fontSize="8">
                    ● active
                  </text>
                  <text x="346" y="108" fill="#555" fontSize="7">
                    2 keys loaded
                  </text>
                  <text x="346" y="124" fill="#555" fontSize="7">
                    3 models
                  </text>
                  <text x="346" y="140" fill="#555" fontSize="7">
                    142 requests today
                  </text>
                </svg>
              </div>
            </div>
          </Reveal>

          <Reveal delay={300}>
            <div className="platform">
              <div className="platform-name">VS Code</div>
              <div className="platform-desc">AI assistance inside your editor. Mux routes in the background.</div>
              <div className="platform-tags">
                <span className="platform-tag">VS Code</span>
                <span className="platform-tag">Cursor</span>
                <span className="platform-tag">Windsurf</span>
              </div>
              <div className="platform-visual">
                <svg viewBox="0 0 500 180" fill="none" style={{ width: "100%" }}>
                  <rect width="500" height="180" rx="8" fill="#080808" stroke="rgba(255,255,255,0.05)" />
                  <rect width="500" height="24" rx="8" fill="#0c0c0c" />
                  <text
                    x="250"
                    y="16"
                    textAnchor="middle"
                    fill="#333"
                    fontSize="8"
                    fontFamily="JetBrains Mono,monospace"
                  >
                    Visual Studio Code
                  </text>
                  <rect y="24" width="36" height="156" fill="#050505" />
                  <rect x="6" y="36" width="24" height="24" rx="4" fill="rgba(255,255,255,0.04)" />
                  <path
                    d="M14 48l4 4-4 4"
                    stroke="#fff"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <rect x="36" y="24" width="300" height="156" fill="#080808" />
                  <text x="52" y="50" fill="#555" fontSize="8" fontFamily="JetBrains Mono,monospace">
                    1
                  </text>
                  <text x="72" y="50" fill="#c084fc" fontSize="8" fontFamily="JetBrains Mono,monospace">
                    function
                  </text>
                  <text x="120" y="50" fill="#fff" fontSize="8" fontFamily="JetBrains Mono,monospace">
                    App() {"{"}
                  </text>
                  <text x="52" y="66" fill="#555" fontSize="8" fontFamily="JetBrains Mono,monospace">
                    2
                  </text>
                  <text x="72" y="66" fill="#888" fontSize="8" fontFamily="JetBrains Mono,monospace">
                    {" "}
                    return &lt;div&gt;Hello&lt;/div&gt;
                  </text>
                  <text x="52" y="82" fill="#555" fontSize="8" fontFamily="JetBrains Mono,monospace">
                    3
                  </text>
                  <text x="72" y="82" fill="#fff" fontSize="8" fontFamily="JetBrains Mono,monospace">
                    {"}"}
                  </text>
                  <rect x="336" y="24" width="164" height="156" fill="#050505" />
                  <text x="350" y="46" fill="#fff" fontSize="8" fontFamily="JetBrains Mono,monospace" fontWeight="bold">
                    mux
                  </text>
                  <rect x="350" y="56" width="130" height="18" rx="4" fill="rgba(255,255,255,0.03)" />
                  <text x="360" y="68" fill="#34d399" fontSize="7">
                    ● routing active
                  </text>
                  <text x="350" y="92" fill="#555" fontSize="7">
                    key: sk-or-v1-abc...
                  </text>
                  <text x="350" y="106" fill="#555" fontSize="7">
                    model: claude-3.5
                  </text>
                  <text x="350" y="120" fill="#555" fontSize="7">
                    status: healthy
                  </text>
                  <text x="350" y="144" fill="#333" fontSize="7">
                    Tab to toggle
                  </text>
                </svg>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section-full" id="routing">
        <Reveal>
          <div className="section-head">
            <div className="section-label">Live Routing</div>
            <div className="section-title">Watch Mux work</div>
            <div className="section-desc">
              Real-time visualization of how Mux intelligently routes your requests across keys and models.
            </div>
          </div>
        </Reveal>
        <Reveal delay={200}>
          <RoutingViz />
        </Reveal>
      </section>

      <section className="terminal-section" id="playground">
        <div className="terminal-wrap">
          <div>
            <Reveal>
              <div className="section-label">Playground</div>
              <div className="section-title">Watch it work</div>
              <div className="section-desc" style={{ marginBottom: 32 }}>
                Mux manages your keys, picks models, and tracks costs — all in the background.
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="checklist">
                <div className="check-item">
                  <div className="check-icon">
                    <svg viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2 5l2.5 2.5L8 3"
                        stroke="#fff"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  Auto key switching
                </div>
                <div className="check-item">
                  <div className="check-icon">
                    <svg viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2 5l2.5 2.5L8 3"
                        stroke="#fff"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  Model fallback
                </div>
                <div className="check-item">
                  <div className="check-icon">
                    <svg viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2 5l2.5 2.5L8 3"
                        stroke="#fff"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  Cost tracking
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <div className="terminal-box">
              <div className="terminal-bar">
                <div className="terminal-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="terminal-tab">mux</div>
              </div>
              <div className="terminal-body">
                {lines.map((l, i) => (
                  <div key={i} className="t-line" style={{ animationDelay: `${i * 0.08}s` }}>
                    {l.t === "$" ? (
                      <>
                        <span className="t-prompt">
                          {l.c === "mux" || l.c.startsWith("/") || l.c.length > 10 ? "$ " : ""}
                        </span>
                        <span style={{ color: "#fff" }}>
                          {l.c === "mux" || l.c.startsWith("/") || l.c.length > 10 ? l.c : l.c}
                        </span>
                      </>
                    ) : (
                      <span className={l.t === "ok" ? "t-ok" : l.t === "dim" ? "t-dim" : "t-out"}>{l.c}</span>
                    )}
                  </div>
                ))}
                <div className="t-line" style={{ animationDelay: "3s" }}>
                  <span className="t-prompt">$ </span>
                  <span className="t-cursor" />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section-full" id="features">
        <Reveal>
          <div className="section-head">
            <div className="section-label">Features</div>
            <div className="section-title">Built different</div>
          </div>
        </Reveal>

        <div className="features">
          {[
            { t: "Auto-switching", d: "Credits run low, Mux switches keys. Zero downtime, zero manual work." },
            { t: "Multi-key", d: "Add unlimited OpenRouter keys. Mux picks the best one for each request." },
            { t: "Smart models", d: "Set preferences, Mux handles availability and fallbacks automatically." },
            { t: "Live monitoring", d: "Track credits, usage, and model status in real-time from the TUI." },
            { t: "Cost optimized", d: "Route prompts efficiently across models to minimize spending." },
            { t: "Zero config", d: "Install, add keys, start coding. No config files to manage." },
          ].map((f, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="feat">
                <div className="feat-title">{f.t}</div>
                <div className="feat-desc">{f.d}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section-full" id="how">
        <Reveal>
          <div className="section-head">
            <div className="section-label">How it works</div>
            <div className="section-title">Four steps</div>
          </div>
        </Reveal>
        <div className="steps">
          {[
            { n: "01", t: "Install", d: "One command. Takes seconds." },
            { n: "02", t: "Add keys", d: "/mux keys to add your OpenRouter API keys." },
            { n: "03", t: "Pick models", d: "Choose which models Mux can route to." },
            { n: "04", t: "Code", d: "That is it. Mux handles the rest." },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 100}>
              <div className="step">
                <div className="step-num">{s.n}</div>
                <div className="step-title">{s.t}</div>
                <div className="step-desc">{s.d}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="cta">
        <Reveal>
          <h2>Start coding.</h2>
          <p>Install Mux and never hit a rate limit again.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <a href="#playground" className="btn btn-solid">
              Get started
            </a>
            <a href="https://github.com/hacimertgokhan/opencode-mux" className="btn btn-ghost">
              GitHub
            </a>
          </div>
        </Reveal>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-copy">Built by hacimertgokhan</div>
          <div className="footer-links">
            <a href="https://github.com/hacimertgokhan/opencode-mux">GitHub</a>
            <a href="https://discord.gg/opencode">Discord</a>
            <a href="https://x.com/opencode">X</a>
          </div>
        </div>
      </footer>
    </>
  )
}

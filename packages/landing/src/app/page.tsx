"use client"

import { useEffect, useRef, useState } from "react"

const plats = [
  {
    t: "Terminal",
    d: "Manage keys and models with slash commands.",
    p: ["macOS", "Linux", "Windows"],
  },
  {
    t: "Desktop",
    d: "Track sessions while routing keeps running in the background.",
    p: ["Native app", "Session view", "Built-in mux"],
  },
  {
    t: "Web",
    d: "Connect from any browser and share sessions safely.",
    p: ["Any browser", "Shareable", "Remote"],
  },
  {
    t: "IDE",
    d: "Work directly from your editor while mux handles routing.",
    p: ["VS Code", "Cursor", "Windsurf"],
  },
]

const feats = [
  { t: "Auto key switch", d: "Automatically switches active keys when credits run low." },
  { t: "Model fallback", d: "Moves to fallback models when your primary model is unavailable." },
  { t: "Live status", d: "See key, model, and usage state in real time." },
  { t: "Thin config", d: "No heavy config setup after installation." },
  { t: "Cost aware", d: "Balances model selection with cost efficiency." },
  { t: "No downtime", d: "Keeps requests moving instead of failing on a single key." },
]

const steps = [
  { n: "01", t: "Install", d: "Complete setup with one command." },
  { n: "02", t: "Add keys", d: "Use `/mux keys` to add your OpenRouter keys." },
  { n: "03", t: "Set models", d: "Choose primary and fallback models for routing." },
  { n: "04", t: "Ship", d: "Focus on coding while mux handles routing operations." },
]

function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const seen = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || seen.current) return
        seen.current = true
        const dur = 1300
        const from = performance.now()
        const tick = (now: number) => {
          const p = Math.min((now - from) / dur, 1)
          const eased = 1 - (1 - p) ** 4
          setVal(Math.round(target * eased))
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.35 },
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

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setOn(true)
      },
      { threshold: 0.2 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={ref} className={`reveal ${on ? "show" : ""}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

function RoutingViz() {
  const [keyIx, setKeyIx] = useState(0)
  const [mdlIx, setMdlIx] = useState(0)
  const [req, setReq] = useState(1842)
  const key = ["sk-or-a1b2...", "sk-or-c3d4...", "sk-or-e5f6..."]
  const mdl = ["claude-3.5-sonnet", "gpt-4o", "gemini-2.0-flash"]

  useEffect(() => {
    const kt = setInterval(() => {
      setKeyIx((v) => (v + 1) % key.length)
      setReq((v) => v + Math.floor(Math.random() * 4))
    }, 1800)
    const mt = setInterval(() => setMdlIx((v) => (v + 1) % mdl.length), 2600)
    return () => {
      clearInterval(kt)
      clearInterval(mt)
    }
  }, [key.length, mdl.length])

  return (
    <div className="routing">
      <div className="routing-top">
        <span className="live">live</span>
        <span className="req">{req.toLocaleString()} req</span>
      </div>
      <div className="flow">
        <div className="node">request</div>
        <div className="line" />
        <div className="node">{mdl[mdlIx]}</div>
      </div>
      <div className="keys">
        {key.map((v, i) => (
          <div key={v} className={`key ${i === keyIx ? "on" : ""}`}>
            <span className="dot" />
            <span>{v}</span>
          </div>
        ))}
      </div>
      <div className="status">
        <span className="muted">routing:</span>
        <span>{key[keyIx]}</span>
        <span className="muted">to</span>
        <span>{mdl[mdlIx]}</span>
      </div>
    </div>
  )
}

export default function Home() {
  const [phase, setPhase] = useState<"x" | "mux" | "site">("x")
  const [rows, setRows] = useState<{ k: string; t: string }[]>([])
  const [done, setDone] = useState(false)
  const [pt, setPt] = useState({ x: 0.5, y: 0.5 })

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("mux"), 900)
    const t2 = setTimeout(() => setPhase("site"), 1900)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  useEffect(() => {
    if (phase !== "site") return
    const seq = [
      { k: "cmd", t: "mux" },
      { k: "ok", t: "Mux enabled. Routing via OpenRouter." },
      { k: "cmd", t: "/mux keys" },
      { k: "out", t: "sk-or-v1-abc1...   active" },
      { k: "out", t: "sk-or-v1-def4...   standby" },
      { k: "cmd", t: "/mux models" },
      { k: "out", t: "claude-3.5-sonnet  preferred" },
      { k: "out", t: "gpt-4o             fallback" },
      { k: "cmd", t: "refactor auth module to use JWT" },
      { k: "dim", t: "reading src/auth/index.ts..." },
      { k: "ok", t: "3 files modified in 1.4s" },
    ]

    let ms = 0
    const list: ReturnType<typeof setTimeout>[] = []
    seq.forEach((v) => {
      list.push(
        setTimeout(() => {
          setRows((prev) => [...prev, v])
        }, ms),
      )
      ms += v.k === "cmd" ? 520 : 250
    })

    return () => list.forEach(clearTimeout)
  }, [phase])

  useEffect(() => {
    const move = (e: MouseEvent) => {
      setPt({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight })
    }
    window.addEventListener("pointermove", move)
    return () => window.removeEventListener("pointermove", move)
  }, [])

  const copy = () => {
    navigator.clipboard.writeText(
      "curl -fsSL https://raw.githubusercontent.com/hacimertgokhan/opencode-mux/dev/install | bash",
    )
    setDone(true)
    setTimeout(() => setDone(false), 1800)
  }

  return (
    <>
      <div className="grain" />
      <div
        className="halo"
        style={{
          left: `${pt.x * 100}%`,
          top: `${pt.y * 100}%`,
        }}
      />

      {phase !== "site" && (
        <div className="intro">
          <div className="intro-word">{phase}</div>
        </div>
      )}

      {phase === "site" && (
        <header className="top">
          <div className="top-wrap">
            <a href="#" className="logo">
              mux
            </a>
            <nav className="links">
              <a href="#platforms">Platforms</a>
              <a href="#playground">Playground</a>
              <a href="#routing">Routing</a>
              <a href="#features">Features</a>
              <a href="https://github.com/hacimertgokhan/opencode-mux" className="link-btn">
                GitHub
              </a>
            </nav>
          </div>
        </header>
      )}

      <main className="main">
        <section className="hero">
          <p className="eyebrow">Smart routing layer for OpenCode</p>
          <h1 className="title">Less noise. Clearer flow.</h1>
          <p className="sub">
            Mux balances multiple API keys and models for you, so you stay focused on writing code.
          </p>
          <div className="hero-row">
            <a href="#playground" className="btn btn-solid">
              Live demo
            </a>
            <a href="https://github.com/hacimertgokhan/opencode-mux" className="btn btn-line">
              GitHub
            </a>
          </div>
          <div className="cmd">
            <span>$ curl -fsSL .../install | bash</span>
            <button onClick={copy} className="cmd-copy">
              {done ? "copied" : "copy"}
            </button>
          </div>
          <div className="stats">
            <div className="stat">
              <div className="stat-val">
                <Counter target={2847563} />
              </div>
              <div className="stat-key">requests routed</div>
            </div>
            <div className="stat">
              <div className="stat-val">
                <Counter target={1247} />
              </div>
              <div className="stat-key">active users</div>
            </div>
            <div className="stat">
              <div className="stat-val">
                <Counter target={99} suffix=".97%" />
              </div>
              <div className="stat-key">uptime</div>
            </div>
            <div className="stat">
              <div className="stat-val">
                <Counter target={12} suffix="ms" />
              </div>
              <div className="stat-key">avg latency</div>
            </div>
          </div>
        </section>

        <section className="section band" id="platforms">
          <Reveal>
            <div className="head">
              <p className="kicker">Platforms</p>
              <h2>Keep the same flow everywhere</h2>
              <p className="desc">Use one routing logic from terminal to IDE.</p>
            </div>
          </Reveal>
          <div className="grid platform-grid">
            {plats.map((v, i) => (
              <Reveal key={v.t} delay={i * 70}>
                <article className="card platform">
                  <h3>{v.t}</h3>
                  <p>{v.d}</p>
                  <div className="pills">
                    {v.p.map((tag) => (
                      <span key={tag} className="pill">
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="section split" id="playground">
          <div>
            <Reveal>
              <div className="head">
                <p className="kicker">Playground</p>
                <h2>Add routing without changing your terminal flow</h2>
                <p className="desc">Mux handles key switching, fallback, and status tracking in the background.</p>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <ul className="check">
                <li>Auto key switching</li>
                <li>Model fallback</li>
                <li>Live cost and status</li>
              </ul>
            </Reveal>
          </div>
          <Reveal delay={180}>
            <div className="terminal">
              <div className="term-bar">
                <div className="dots">
                  <span />
                  <span />
                  <span />
                </div>
                <span>mux</span>
              </div>
              <div className="term-body">
                {rows.map((v, i) => (
                  <div key={`${v.t}-${i}`} className={`line line-${v.k}`} style={{ animationDelay: `${i * 0.06}s` }}>
                    {v.k === "cmd" ? <span>$ {v.t}</span> : <span>{v.t}</span>}
                  </div>
                ))}
                <div className="line line-cmd" style={{ animationDelay: "2.8s" }}>
                  <span>$ </span>
                  <span className="cursor" />
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        <section className="section" id="routing">
          <Reveal>
            <div className="head">
              <p className="kicker">Routing</p>
              <h2>Live routing visibility</h2>
              <p className="desc">See the active key and model in one panel.</p>
            </div>
          </Reveal>
          <Reveal delay={150}>
            <RoutingViz />
          </Reveal>
        </section>

        <section className="section" id="features">
          <Reveal>
            <div className="head">
              <p className="kicker">Features</p>
              <h2>Clear, thin, and production-ready</h2>
            </div>
          </Reveal>
          <div className="grid feat-grid">
            {feats.map((v, i) => (
              <Reveal key={v.t} delay={i * 70}>
                <article className="card feat">
                  <h3>{v.t}</h3>
                  <p>{v.d}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="section">
          <Reveal>
            <div className="head">
              <p className="kicker">How it works</p>
              <h2>Setup in four steps</h2>
            </div>
          </Reveal>
          <div className="grid step-grid">
            {steps.map((v, i) => (
              <Reveal key={v.n} delay={i * 90}>
                <article className="card step">
                  <span className="n">{v.n}</span>
                  <h3>{v.t}</h3>
                  <p>{v.d}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="cta">
          <Reveal>
            <h2>Keep your pace, not your limits.</h2>
            <p>Install mux and leave routing operations in the background.</p>
            <div className="hero-row">
              <a href="#playground" className="btn btn-solid">
                Get started
              </a>
              <a href="https://github.com/hacimertgokhan/opencode-mux" className="btn btn-line">
                GitHub
              </a>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="foot">
        <span>Built by hacimertgokhan</span>
        <div>
          <a href="https://github.com/hacimertgokhan/opencode-mux">GitHub</a>
          <a href="https://discord.gg/opencode">Discord</a>
          <a href="https://x.com/opencode">X</a>
        </div>
      </footer>
    </>
  )
}

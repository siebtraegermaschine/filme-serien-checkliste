/**
 * KPI-Cockpit für MovieMatch — App-Version.
 *
 * Abhängigkeiten: nur React. Kein Tailwind, keine Chart-Bibliothek.
 * Erwartet vier Endpunkte (siehe docs/kpi.md):
 *   GET  /api/kpi/snapshot        -> { generated_at, period, metrics }
 *   GET  /api/kpi/history?weeks=26 -> [{ t, north, mau }]
 *   GET  /api/kpi/targets         -> { metric_id: number }
 *   PUT  /api/kpi/targets         -> Body { metric_id: number }
 *   GET  /api/kpi/plan            -> { targetMau, months, retention, k }
 *   PUT  /api/kpi/plan            -> Body dito
 *
 * Authentifizierung läuft über die Session (credentials: "include").
 * Der KPI_TOKEN gehört ausschließlich in Cron und curl, niemals in diesen Client.
 */
import React, { useState, useEffect, useMemo, useRef } from "react";

const API = "/api/kpi";

/* ---------------------------------------------------------------- */
/* Kennzahlen-Definition                                             */
/* ---------------------------------------------------------------- */
const METRICS = [
  { id: "matched_sessions_week", label: "Abgeschlossene Match-Sessions / Woche", group: "Nordstern", unit: "n", dir: "up" },

  { id: "new_users_week", label: "Neue Nutzer / Woche", group: "Akquise", unit: "n", dir: "up" },
  { id: "invited_share", label: "Anteil Neuanmeldungen über Einladung", group: "Akquise", unit: "pct", dir: "up", hint: "Der Loop-Anteil. Alles darunter musst du bezahlen oder redaktionell erarbeiten." },
  { id: "cac", label: "CAC (bezahlte Nutzer)", group: "Akquise", unit: "eur", dir: "down" },

  { id: "activation_rate", label: "Aktivierung: Match in Session 1", group: "Aktivierung", unit: "pct", dir: "up", hint: "Erstnutzer, die in der ersten Sitzung ein Match mit einer zweiten Person abschließen." },
  { id: "time_to_first_match", label: "Zeit bis zum ersten Match (Median)", group: "Aktivierung", unit: "min", dir: "down" },
  { id: "guest_signup_rate", label: "Gast → Account", group: "Aktivierung", unit: "pct", dir: "up" },

  { id: "dau", label: "DAU", group: "Engagement", unit: "n", dir: "up" },
  { id: "wau", label: "WAU", group: "Engagement", unit: "n", dir: "up" },
  { id: "mau", label: "MAU", group: "Engagement", unit: "n", dir: "up" },
  { id: "sessions_per_group_month", label: "Sessions je aktiver Gruppe / Monat", group: "Engagement", unit: "x", dir: "up" },
  { id: "swipes_per_session", label: "Bewertungen je Session", group: "Engagement", unit: "x", dir: "up" },

  { id: "invites_per_user", label: "Einladungen je Nutzer", group: "Viralität", unit: "x", dir: "up" },
  { id: "invite_accept_rate", label: "Annahmequote Einladung", group: "Viralität", unit: "pct", dir: "up" },
  { id: "cycle_time_days", label: "Zykluszeit Einladung (Tage)", group: "Viralität", unit: "d", dir: "down", hint: "Anmeldung bis erste versendete Einladung. Kurze Zyklen wirken wie ein höherer K-Faktor." },

  { id: "d1", label: "Retention D1", group: "Retention", unit: "pct", dir: "up" },
  { id: "d7", label: "Retention D7", group: "Retention", unit: "pct", dir: "up" },
  { id: "d30", label: "Retention D30", group: "Retention", unit: "pct", dir: "up" },
  { id: "group_retention_m1", label: "Gruppen-Retention M1", group: "Retention", unit: "pct", dir: "up", hint: "Wichtiger als Nutzer-Retention — die Gruppe erzeugt die Wechselkosten." },
  { id: "active_groups", label: "Aktive Gruppen", group: "Retention", unit: "n", dir: "up" },
  { id: "avg_group_size", label: "Ø Gruppengröße", group: "Retention", unit: "x", dir: "up" },

  { id: "paying_users", label: "Zahlende Nutzer", group: "Erlös", unit: "n", dir: "up" },
  { id: "mrr", label: "MRR Abo", group: "Erlös", unit: "eur", dir: "up" },
  { id: "affiliate_revenue_month", label: "Affiliate-Erlös / Monat", group: "Erlös", unit: "eur", dir: "up" },
  { id: "ad_revenue_month", label: "Werbeerlös / Monat", group: "Erlös", unit: "eur", dir: "up" },

  { id: "profiled_users", label: "Nutzer mit ≥20 Bewertungen", group: "B2B", unit: "n", dir: "up", hint: "Die verwertbare Segmentbasis. Ohne Geschmacksprofil kein B2B-Produkt." },
  { id: "b2b_pipeline", label: "B2B-Pipeline", group: "B2B", unit: "eur", dir: "up" },
  { id: "b2b_arr", label: "B2B-ARR", group: "B2B", unit: "eur", dir: "up" },
];

const GROUPS = ["Akquise", "Aktivierung", "Engagement", "Viralität", "Retention", "Erlös", "B2B"];

const CHAIN = [
  { id: "new_users_week", stage: "Akquise" },
  { id: "activation_rate", stage: "Aktivierung" },
  { id: "sessions_per_group_month", stage: "Frequenz" },
  { id: "d30", stage: "Retention" },
  { id: "k_factor", stage: "Viralität", derived: true, unit: "x", dir: "up" },
  { id: "arpu_year", stage: "Erlös", derived: true, unit: "eur", dir: "up" },
];

/* ---------------------------------------------------------------- */
/* Rechnen und Formatieren                                           */
/* ---------------------------------------------------------------- */
function derive(m = {}) {
  const n = (k) => (typeof m[k] === "number" && isFinite(m[k]) ? m[k] : null);
  const rev = ["mrr", "affiliate_revenue_month", "ad_revenue_month"].map(n).filter((v) => v != null).reduce((a, b) => a + b, 0);
  const mau = n("mau");
  const perUser = mau ? rev / mau : null;
  return {
    k_factor: n("invites_per_user") != null && n("invite_accept_rate") != null ? n("invites_per_user") * n("invite_accept_rate") : null,
    dau_mau: n("dau") && mau ? n("dau") / mau : null,
    wau_mau: n("wau") && mau ? n("wau") / mau : null,
    revenue_month: rev,
    arpu_year: mau ? (rev * 12) / mau : null,
    payback_months: perUser && n("cac") ? n("cac") / perUser : null,
  };
}
const nf = (v, d = 0) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
function fmt(v, unit) {
  if (v == null || !isFinite(v)) return "—";
  switch (unit) {
    case "pct": return nf(v * 100, v * 100 < 10 ? 1 : 0) + " %";
    case "eur": return nf(v, Math.abs(v) < 100 ? 2 : 0) + " €";
    case "min": return nf(v, 1) + " min";
    case "d": return nf(v, 1) + " d";
    case "x": return nf(v, 2);
    default: return nf(v, v < 10 && v % 1 !== 0 ? 2 : 0);
  }
}
function attainment(actual, target, dir) {
  if (actual == null || target == null || target === 0 || actual === 0) {
    if (actual === 0 && target != null && target !== 0 && dir === "up") return 0;
    return null;
  }
  const r = dir === "down" ? target / actual : actual / target;
  return isFinite(r) && r >= 0 ? r : null;
}
const COL = { ok: "#1B7A57", warn: "#B26A00", bad: "#B33A2B", line: "#D8DCE3" };
const statusColor = (a) => (a == null ? COL.line : a >= 1 ? COL.ok : a >= 0.7 ? COL.warn : COL.bad);

/* ---------------------------------------------------------------- */
/* Stylesheet — bewusst eingebettet, damit die Datei portabel bleibt */
/* ---------------------------------------------------------------- */
const CSS = `
.mmk{--bg:#EDEFF2;--sf:#fff;--ink:#15171C;--ink2:#3D424D;--mut:#767D8A;--ln:#D8DCE3;--plan:#2F53C8;
  background:var(--bg);color:var(--ink);min-height:100vh;
  font-family:'Archivo',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;}
.mmk *{box-sizing:border-box}
.mmk .mono{font-family:'IBM Plex Mono',ui-monospace,'SFMono-Regular',Menlo,monospace;font-variant-numeric:tabular-nums}
.mmk .wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.mmk header{background:var(--sf);border-bottom:1px solid var(--ln)}
.mmk .eyebrow{font-size:11px;letter-spacing:.12em;color:var(--mut)}
.mmk h1{font-size:26px;font-weight:700;letter-spacing:-.02em;margin:4px 0 0}
.mmk h2{font-size:17px;font-weight:600;margin:0 0 4px}
.mmk h3{font-size:12px;font-weight:700;letter-spacing:.08em;margin:0 0 8px}
.mmk .tabs{display:flex;gap:2px}
.mmk .tab{padding:10px 16px;border:0;border-bottom:2px solid transparent;background:none;cursor:pointer;
  font:inherit;font-size:14px;font-weight:500;color:var(--mut)}
.mmk .tab[aria-selected=true]{border-bottom-color:var(--ink);color:var(--ink);font-weight:600}
.mmk .tab:focus-visible{outline:2px solid var(--plan);outline-offset:-2px}
.mmk .card{background:var(--sf);border:1px solid var(--ln);padding:20px}
.mmk .grid{display:grid;gap:16px}
.mmk .chain{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));background:var(--sf);border:1px solid var(--ln)}
.mmk .link{padding:16px;border-right:1px solid var(--ln)}
.mmk .link:last-child{border-right:0}
.mmk .link.min{background:#FBF1EF}
.mmk .bar{height:6px;background:#E7EAEF;margin-top:8px}
.mmk .bar>i{display:block;height:100%}
.mmk .row{display:grid;grid-template-columns:1fr 120px 120px 150px;gap:8px;align-items:center;
  padding:12px 16px;border-bottom:1px solid var(--ln)}
.mmk .row:last-child{border-bottom:0}
.mmk .head{padding:8px 16px;border-bottom:1px solid var(--ln);font-size:10px;letter-spacing:.08em;color:var(--mut)}
.mmk input{font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--ln);background:#F7F8FB;width:100%}
.mmk input:focus-visible{outline:2px solid var(--plan);outline-offset:-1px}
.mmk .tgt{text-align:right;color:var(--plan)}
.mmk button.act{padding:9px 16px;border:0;background:var(--ink);color:#fff;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.mmk button.ghost{padding:9px 16px;border:1px solid var(--ln);background:var(--sf);font:inherit;font-size:13px;cursor:pointer}
.mmk .r{text-align:right}
.mmk .mut{color:var(--mut)}
.mmk .sec{margin:0 0 28px}
@media(max-width:820px){
  .mmk .chain{grid-template-columns:repeat(2,minmax(0,1fr))}
  .mmk .link{border-bottom:1px solid var(--ln)}
  .mmk .row{grid-template-columns:1fr 90px;grid-template-areas:"a b" "c c"}
  .mmk .head{display:none}
}
@media(prefers-reduced-motion:no-preference){.mmk .bar>i{transition:width .4s ease}}
`;

/* ---------------------------------------------------------------- */
export default function KpiCockpit() {
  const [snap, setSnap] = useState(null);
  const [history, setHistory] = useState([]);
  const [targets, setTargets] = useState({});
  const [plan, setPlan] = useState({ targetMau: 20000, months: 12, retention: 0.35, k: 0.5 });
  const [tab, setTab] = useState("live");
  const [state, setState] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const saveTimer = useRef(null);

  const get = (p) => fetch(API + p, { credentials: "include" }).then((r) => {
    if (!r.ok) throw new Error(p + " → HTTP " + r.status);
    return r.json();
  });

  useEffect(() => {
    (async () => {
      try {
        const [s, h, t, p] = await Promise.all([
          get("/snapshot"),
          get("/history?weeks=26").catch(() => []),
          get("/targets").catch(() => ({})),
          get("/plan").catch(() => null),
        ]);
        setSnap(s); setHistory(Array.isArray(h) ? h : []); setTargets(t || {});
        if (p) setPlan((x) => ({ ...x, ...p }));
        setState("ready");
      } catch (e) { setError(e.message); setState("error"); }
    })();
  }, []);

  function persist(path, body) {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(API + path, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).then((r) => setSaved(r.ok ? "Gespeichert" : "Nicht gespeichert"))
        .catch(() => setSaved("Nicht gespeichert"));
    }, 600);
  }
  function setTarget(id, v) {
    const next = { ...targets, [id]: v === "" ? null : Number(v) };
    setTargets(next); persist("/targets", next);
  }
  function updatePlan(patch) {
    const next = { ...plan, ...patch };
    setPlan(next); persist("/plan", next);
  }

  const values = snap?.metrics || {};
  const d = useMemo(() => derive(values), [values]);
  const derivedTargets = useMemo(() => ({
    k_factor: (targets.invites_per_user || 0) * (targets.invite_accept_rate || 0) || null,
    arpu_year: targets.mau ? (((targets.mrr || 0) + (targets.affiliate_revenue_month || 0) + (targets.ad_revenue_month || 0)) * 12) / targets.mau : null,
  }), [targets]);

  const chain = useMemo(() => {
    const rows = CHAIN.map((c) => {
      const def = METRICS.find((m) => m.id === c.id);
      const dir = c.dir || def?.dir || "up";
      const actual = c.derived ? d[c.id] : values[c.id];
      const target = c.derived ? derivedTargets[c.id] : targets[c.id];
      return { ...c, dir, unit: c.unit || def?.unit || "x", actual, target, a: attainment(actual, target, dir) };
    });
    const withA = rows.filter((r) => r.a != null);
    return { rows, min: withA.length ? withA.reduce((p, c) => (c.a < p.a ? c : p)) : null };
  }, [values, targets, d, derivedTargets]);

  const projection = useMemo(() => {
    const start = values.mau || 0;
    const { targetMau, months, retention, k } = plan;
    const sim = (s) => { let m = start; for (let i = 0; i < months; i++) m = m * retention + s * (1 + k); return m; };
    let need = 0;
    if (sim(0) < targetMau) {
      let lo = 0, hi = Math.max(1000, targetMau);
      for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (sim(mid) < targetMau) lo = mid; else hi = mid; }
      need = hi;
    }
    const path = []; let m = start;
    path.push({ x: 0, y: m });
    for (let i = 1; i <= months; i++) { m = m * retention + need * (1 + k); path.push({ x: i, y: m }); }
    return { need, path };
  }, [values.mau, plan]);

  if (state === "loading") return <Shell><p className="mut">Kennzahlen werden geladen …</p></Shell>;
  if (state === "error") return (
    <Shell>
      <div className="card">
        <h2>Snapshot nicht abrufbar</h2>
        <p className="mut" style={{ fontSize: 14 }}>{error}</p>
        <p style={{ fontSize: 14 }}>Prüfe, ob der Cron-Job der Vorwoche gelaufen ist, und ruf sonst <code>/api/kpi/rebuild?weeks=12</code> auf.</p>
      </div>
    </Shell>
  );

  const paidShare = 1 - (values.invited_share ?? 0);
  const budget = projection.need * paidShare * (values.cac ?? 0);

  return (
    <Shell>
      <div className="wrap" style={{ paddingTop: 20, paddingBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="eyebrow mono">MOVIEMATCH · KENNZAHLEN-COCKPIT</div>
            <h1>Ist gegen Ziel, Stufe für Stufe</h1>
          </div>
          <div className="r">
            <div className="eyebrow mono">BERICHTSWOCHE</div>
            <div className="mono" style={{ fontSize: 14 }}>
              {snap?.period ? `${snap.period.from} – ${snap.period.to}` : "—"}
            </div>
            {saved && <div className="mono mut" style={{ fontSize: 11 }}>{saved}</div>}
          </div>
        </div>
      </div>
      <div className="wrap"><div className="tabs" role="tablist">
        {[["live", "Live & Ziele"], ["plan", "Planung"]].map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} className="tab" onClick={() => setTab(id)}>{l}</button>
        ))}
      </div></div>

      <div style={{ borderTop: "1px solid var(--ln)" }} />

      <main className="wrap" style={{ paddingTop: 28, paddingBottom: 48 }}>
        {tab === "live" && (
          <>
            <section className="sec grid" style={{ gridTemplateColumns: "minmax(220px,1fr) 2fr" }}>
              <div className="card">
                <div className="eyebrow mono">NORDSTERN</div>
                <div className="mono" style={{ fontSize: 42, fontWeight: 600, lineHeight: 1.1, marginTop: 6 }}>
                  {fmt(values.matched_sessions_week, "n")}
                </div>
                <div style={{ fontSize: 13, color: "var(--ink2)" }}>Match-Sessions je Woche</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--ln)", fontSize: 13 }}>
                  <span className="mut">Ziel</span><span className="mono">{fmt(targets.matched_sessions_week, "n")}</span>
                </div>
                <Bar a={attainment(values.matched_sessions_week, targets.matched_sessions_week, "up")} />
              </div>
              <div className="card">
                <div className="eyebrow mono" style={{ marginBottom: 10 }}>VERLAUF · MATCH-SESSIONS JE WOCHE</div>
                <Spark data={history} />
              </div>
            </section>

            <section className="sec">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                <h2>Die Kette</h2>
                <span className="mut" style={{ fontSize: 13 }}>Jede Stufe ist ein Faktor. Die schwächste deckelt alles danach.</span>
              </div>
              <div className="chain">
                {chain.rows.map((r, i) => (
                  <div key={r.id} className={"link" + (chain.min?.id === r.id ? " min" : "")}>
                    <div className="mono" style={{ fontSize: 10, letterSpacing: ".1em", color: "var(--mut)" }}>
                      {String(i + 1).padStart(2, "0")} {r.stage.toUpperCase()}
                    </div>
                    <div className="mono" style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}>{fmt(r.actual, r.unit)}</div>
                    <div className="mono mut" style={{ fontSize: 11 }}>Ziel {fmt(r.target, r.unit)}</div>
                    <Bar a={r.a} />
                    {chain.min?.id === r.id && <div style={{ fontSize: 11, fontWeight: 600, color: COL.bad, marginTop: 6 }}>Engpass</div>}
                  </div>
                ))}
              </div>
            </section>

            <section className="sec grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
              <Tile label="K-Faktor" value={fmt(d.k_factor, "x")} note="Einladungen × Annahme" />
              <Tile label="DAU / MAU" value={fmt(d.dau_mau, "pct")} note="Nutzungsdichte" />
              <Tile label="WAU / MAU" value={fmt(d.wau_mau, "pct")} note="passt zum Wochenrhythmus" />
              <Tile label="ARPU / Jahr" value={fmt(d.arpu_year, "eur")} note="alle Erlöse ÷ MAU" />
              <Tile label="CAC-Payback" value={d.payback_months ? nf(d.payback_months, 1) + " Mon." : "—"} note="nur bezahlte Nutzer" />
            </section>

            {GROUPS.map((g) => (
              <section className="sec" key={g}>
                <h3 className="mono">{g.toUpperCase()}</h3>
                <div style={{ background: "var(--sf)", border: "1px solid var(--ln)" }}>
                  <div className="head mono" style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 150px", gap: 8 }}>
                    <div>KENNZAHL</div><div className="r">IST</div><div className="r">ZIEL</div><div className="r">ZIELERREICHUNG</div>
                  </div>
                  {METRICS.filter((m) => m.group === g).map((m) => {
                    const a = attainment(values[m.id], targets[m.id], m.dir);
                    return (
                      <div className="row" key={m.id}>
                        <div style={{ gridArea: "a" }}>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{m.label}</div>
                          {m.hint && <div className="mut" style={{ fontSize: 12, marginTop: 2 }}>{m.hint}</div>}
                          {values[m.id] == null && <div className="mono" style={{ fontSize: 11, color: COL.warn, marginTop: 2 }}>keine Daten</div>}
                        </div>
                        <div className="r mono" style={{ fontSize: 15, gridArea: "b" }}>{fmt(values[m.id], m.unit)}</div>
                        <div style={{ gridArea: "c" }}>
                          <input className="mono tgt" inputMode="decimal" aria-label={"Ziel " + m.label}
                            value={targets[m.id] ?? ""} onChange={(e) => setTarget(m.id, e.target.value)} />
                          {m.unit === "pct" && <div className="mono mut" style={{ fontSize: 10 }}>0–1</div>}
                        </div>
                        <div>
                          <div className="r mono" style={{ fontSize: 13, color: statusColor(a) }}>{a == null ? "—" : nf(a * 100, 0) + " %"}</div>
                          <Bar a={a} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}

        {tab === "plan" && (
          <>
            <h2>Vom Ziel zur Wochenzahl</h2>
            <p style={{ fontSize: 14, color: "var(--ink2)", maxWidth: 620, marginTop: 0 }}>
              MAU-Ziel und Zeitraum setzen. Die Rechnung nutzt Monatsretention und K-Faktor und gibt aus,
              wie viele Neuanmeldungen pro Woche das erfordert — und was der bezahlte Anteil davon kostet.
            </p>
            <section className="sec grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
              <Field label="MAU-Ziel" value={plan.targetMau} onChange={(v) => updatePlan({ targetMau: Number(v) || 0 })} />
              <Field label="Zeitraum (Monate)" value={plan.months} onChange={(v) => updatePlan({ months: Math.max(1, Number(v) || 1) })} />
              <Field label="Monatsretention (0–1)" value={plan.retention} onChange={(v) => updatePlan({ retention: Number(v) || 0 })} />
              <Field label="K-Faktor" value={plan.k} onChange={(v) => updatePlan({ k: Number(v) || 0 })} />
            </section>
            <section className="sec grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
              <Tile big accent label="Neuanmeldungen / Woche" value={nf(projection.need / 4.33, 0)} />
              <Tile big label="Neuanmeldungen / Monat" value={nf(projection.need, 0)} />
              <Tile big label="davon durch den Loop" value={nf(projection.need * plan.k, 0)} />
            </section>
            <section className="sec card">
              <div className="eyebrow mono" style={{ marginBottom: 6 }}>MEDIABUDGET</div>
              <p style={{ fontSize: 14, color: "var(--ink2)", margin: 0 }}>
                Bei einem Einladungsanteil von {fmt(values.invited_share, "pct")} musst du{" "}
                <strong className="mono">{nf(projection.need * paidShare, 0)}</strong> Nutzer pro Monat selbst beschaffen.
                Bei einem CAC von {fmt(values.cac, "eur")} sind das <strong className="mono">{nf(budget, 0)} €</strong> monatlich.
                {d.arpu_year != null && values.cac != null && (
                  <> Dem stehen {fmt(d.arpu_year, "eur")} Jahresumsatz je Nutzer gegenüber — {d.arpu_year < values.cac
                    ? "der Einkauf rechnet sich nicht, der Loop muss den Großteil tragen."
                    : "der Einkauf trägt sich rechnerisch."}</>
                )}
              </p>
            </section>
            <section className="card">
              <div className="eyebrow mono" style={{ marginBottom: 10 }}>HOCHRECHNUNG MAU</div>
              <Spark data={projection.path.map((p) => ({ t: "M" + p.x, north: p.y }))} accent />
            </section>
          </>
        )}
      </main>
    </Shell>
  );
}

/* ---------------------------------------------------------------- */
function Shell({ children }) {
  return <div className="mmk"><style>{CSS}</style>{children}</div>;
}
function Bar({ a }) {
  const p = a == null ? 0 : Math.max(0, Math.min(1, a));
  return <div className="bar"><i style={{ width: p * 100 + "%", background: statusColor(a) }} /></div>;
}
function Tile({ label, value, note, big, accent }) {
  return (
    <div className="card" style={{ borderColor: accent ? "#2F53C8" : undefined }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: ".08em", color: "var(--mut)" }}>{label.toUpperCase()}</div>
      <div className="mono" style={{ fontSize: big ? 32 : 22, fontWeight: 600, marginTop: 6, color: accent ? "#2F53C8" : undefined }}>{value}</div>
      {note && <div className="mut" style={{ fontSize: 11, marginTop: 2 }}>{note}</div>}
    </div>
  );
}
function Field({ label, value, onChange }) {
  return (
    <label style={{ display: "block" }}>
      <span className="mono" style={{ fontSize: 10, letterSpacing: ".08em", color: "var(--mut)" }}>{label.toUpperCase()}</span>
      <input className="mono" style={{ marginTop: 4, fontSize: 16, background: "#fff" }}
        inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
/* Minimaler SVG-Verlauf — spart eine Chart-Abhängigkeit */
function Spark({ data, accent }) {
  const pts = (data || []).filter((p) => typeof p.north === "number" && isFinite(p.north));
  if (pts.length < 2) return <div className="mut" style={{ fontSize: 13, height: 150, display: "flex", alignItems: "center" }}>
    Der Verlauf entsteht ab der zweiten Berichtswoche.</div>;
  const W = 640, H = 150, P = 24;
  const ys = pts.map((p) => p.north);
  const min = Math.min(...ys, 0), max = Math.max(...ys);
  const x = (i) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (v) => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.north).toFixed(1)}`).join(" ");
  const stroke = accent ? "#2F53C8" : "#15171C";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="150" role="img"
      aria-label={`Verlauf von ${nf(pts[0].north, 0)} auf ${nf(pts[pts.length - 1].north, 0)}`}>
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke={COL.line} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" />
      {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.north)} r="2.5" fill={stroke} />)}
      <text x={P} y={14} fontSize="11" fill="#767D8A" fontFamily="monospace">{nf(max, 0)}</text>
      <text x={W - P} y={H - 6} fontSize="11" fill="#767D8A" fontFamily="monospace" textAnchor="end">
        {pts[pts.length - 1].t}
      </text>
    </svg>
  );
}

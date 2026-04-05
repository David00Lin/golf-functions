import { useState, useMemo } from "react";
import { useAutoSave } from "./hooks/useAutoSave";

const HOLES = 18;
const GOLD = "#c8a96e";
const GREEN = "#4a9b7f";
const RED = "#f87171";
const DIM = "#4a5a4a";

const TEAM_MODES = [
  { id: "fixed_12_34", label: "固定\n1&2 vs 3&4" },
  { id: "fixed_13_24", label: "固定\n1&3 vs 2&4" },
  { id: "fixed_14_23", label: "固定\n1&4 vs 2&3" },
  { id: "order_14_23", label: "打順\n1&4 vs 2&3" },
  { id: "bag_rotate",  label: "バッグ順\nローテ" },
  { id: "order_rotate",label: "打順\nローテ" },
];

function getRotateTeams(h: number, indices: number[]): [number[], number[]] {
  const rem = (h + 1) % 3;
  const [i0, i1, i2, i3] = indices;
  if (rem === 1) return [[i0, i1], [i2, i3]];
  if (rem === 2) return [[i0, i2], [i1, i3]];
  return [[i0, i3], [i1, i2]];
}

import type { Opts } from "./types";

interface Result3 {
  solo: number;
  pair: number[];
  soloTeam: number;
  pairTeam: number;
  diff: number;
  mult: number;
  tied: boolean;
  pts: number[];
}

interface Result4 {
  tA: number[];
  tB: number[];
  scA: number;
  scB: number;
  diff: number;
  mult: number;
  tied: boolean;
  pts: number[];
}

type Result = Result3 | Result4 | null;

export default function App() {
  const [mode, setMode] = useState<3 | 4>(3);
  const [names, setNames] = useState(["", "", "", ""]);
  const [scores, setScores] = useState<string[][]>(() =>
    Array(HOLES).fill(null).map(() => Array(4).fill(""))
  );
  const [pars, setPars] = useState<number[]>(Array(HOLES).fill(4));
  const [opts, setOpts] = useState<Opts>({
    carry: false, birdieReverse: false, truncate: false, push: false,
  });
  const [pushCounts, setPushCounts] = useState<number[]>(Array(HOLES).fill(0));
  const [teamMode, setTeamMode] = useState("fixed_12_34");

  const n = mode;

  const setScore = (h: number, pi: number, v: string) =>
    setScores(prev => prev.map((row, rh) =>
      rh === h ? row.map((s, rp) => rp === pi ? v : s) : row
    ));

  const orders = useMemo(() => {
    const result: number[][] = [];
    let order = Array.from({ length: n }, (_, i) => i);
    for (let h = 0; h < HOLES; h++) {
      result.push([...order]);
      const s = scores[h];
      if (s.slice(0, n).every(v => v !== "")) {
        const snap = [...order];
        order = snap.slice().sort((a, b) => {
          const d = Number(s[a]) - Number(s[b]);
          return d !== 0 ? d : snap.indexOf(a) - snap.indexOf(b);
        });
      }
    }
    return result;
  }, [scores, n]);

  const getTeams4 = (h: number): [number[], number[]] => {
    const order = orders[h];
    switch (teamMode) {
      case "fixed_12_34": return [[0, 1], [2, 3]];
      case "fixed_13_24": return [[0, 2], [1, 3]];
      case "fixed_14_23": return [[0, 3], [1, 2]];
      case "order_14_23": return [[order[0], order[3]], [order[1], order[2]]];
      case "bag_rotate":  return getRotateTeams(h, [0, 1, 2, 3]);
      case "order_rotate":return getRotateTeams(h, order);
      default: return [[0, 1], [2, 3]];
    }
  };

  const results3 = useMemo((): (Result3 | null)[] => {
    if (mode !== 3) return [];
    let carry = 1;
    return orders.map((order, h) => {
      const s = scores[h];
      if (s.slice(0, 3).some(v => v === "")) return null;
      const par = pars[h];
      const solo = order[0];
      const pair = [order[1], order[2]];
      const ss = Number(s[solo]);
      const ps = pair.map(pi => Number(s[pi]));
      let soloTeam = ss * 11;
      let lo = Math.min(...ps), hi = Math.max(...ps);
      if (opts.birdieReverse && ss < par) [lo, hi] = [hi, lo];
      let pairTeam = lo * 10 + hi;
      if (opts.truncate) {
        soloTeam = Math.floor(soloTeam / 10) * 10;
        pairTeam = Math.floor(pairTeam / 10) * 10;
      }
      const diff = pairTeam - soloTeam;
      const pushMult = opts.push ? Math.pow(2, pushCounts[h]) : 1;
      const mult = carry * pushMult;
      if (diff === 0 && opts.carry) {
        carry++;
        return { solo, pair, soloTeam, pairTeam, diff: 0, mult, tied: true, pts: Array(4).fill(0) };
      }
      carry = 1;
      const pts = Array(4).fill(0);
      const x = Math.abs(diff) * mult;
      if (diff < 0) { pts[solo] = x * 2; pair.forEach(p => { pts[p] = -x; }); }
      else           { pts[solo] = -x * 2; pair.forEach(p => { pts[p] = x; }); }
      return { solo, pair, soloTeam, pairTeam, diff, mult, tied: false, pts };
    });
  }, [orders, scores, pars, opts, pushCounts, mode]);

  const results4 = useMemo((): (Result4 | null)[] => {
    if (mode !== 4) return [];
    let carry = 1;
    return Array(HOLES).fill(null).map((_, h) => {
      const s = scores[h];
      if (s.slice(0, 4).some(v => v === "")) return null;
      const par = pars[h];
      const [tA, tB] = getTeams4(h);
      const sA = tA.map(pi => Number(s[pi]));
      const sB = tB.map(pi => Number(s[pi]));
      let loA = Math.min(...sA), hiA = Math.max(...sA);
      let loB = Math.min(...sB), hiB = Math.max(...sB);
      if (opts.birdieReverse) {
        if (sA.some(sc => sc < par)) [loA, hiA] = [hiA, loA];
        if (sB.some(sc => sc < par)) [loB, hiB] = [hiB, loB];
      }
      let scA = loA * 10 + hiA;
      let scB = loB * 10 + hiB;
      if (opts.truncate) {
        scA = Math.floor(scA / 10) * 10;
        scB = Math.floor(scB / 10) * 10;
      }
      const diff = scB - scA;
      const pushMult = opts.push ? Math.pow(2, pushCounts[h]) : 1;
      const mult = carry * pushMult;
      if (diff === 0 && opts.carry) {
        carry++;
        return { tA, tB, scA, scB, diff: 0, mult, tied: true, pts: Array(4).fill(0) };
      }
      carry = 1;
      const pts = Array(4).fill(0);
      const x = Math.abs(diff) * mult;
      if (diff > 0) {
        tA.forEach(p => { pts[p] = x; }); tB.forEach(p => { pts[p] = -x; });
      } else if (diff < 0) {
        tA.forEach(p => { pts[p] = -x; }); tB.forEach(p => { pts[p] = x; });
      }
      return { tA, tB, scA, scB, diff, mult, tied: false, pts };
    });
  }, [orders, scores, pars, opts, pushCounts, mode, teamMode]);

  const results: Result[] = mode === 3 ? results3 : results4;

  const totals = useMemo(() => {
    const t = Array(4).fill(0);
    results.forEach(r => {
      if (!r || r.tied) return;
      r.pts.forEach((p, i) => { t[i] += p; });
    });
    return t;
  }, [results]);

  useAutoSave({ mode: n, teamMode, names, pars, scores, opts, totals });

  const gridCols = `36px repeat(${n}, 1fr)`;
  const cell: React.CSSProperties = { borderLeft: "1px solid #1a3a1a", padding: "4px 3px" };

  return (
    <div style={{ minHeight: "100vh", background: "#1a2e1a", fontFamily: "'Georgia', serif", color: "#f5f0e8" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f1f0f, #1a3a1a)",
        borderBottom: `2px solid ${GOLD}`,
        padding: "16px 16px 12px", textAlign: "center",
      }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: GOLD, marginBottom: 4 }}>GOLF BETTING GAME</div>
        <div style={{ fontSize: 22, fontWeight: "bold" }}>Las Vegas</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10 }}>
          {([3, 4] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "5px 22px", borderRadius: 20,
              border: `1.5px solid ${mode === m ? GOLD : "#2a4a2a"}`,
              background: mode === m ? "#2a1f00" : "transparent",
              color: mode === m ? GOLD : "#6b8b6b",
              fontSize: 13, cursor: "pointer", fontWeight: mode === m ? "bold" : "normal",
            }}>{m}人</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "12px 8px" }}>
        {/* Player names */}
        <div style={{ background: "#0f1f0f", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #2a4a2a" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: GOLD, marginBottom: 6 }}>PLAYERS</div>
          <div style={{ display: "flex", gap: 6 }}>
            {Array.from({ length: n }, (_, i) => (
              <div key={i} style={{ flex: 1 }}>
                <input
                  value={names[i]}
                  onChange={e => setNames(names.map((x, j) => j === i ? e.target.value : x))}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "6px 2px", textAlign: "center",
                    background: "#1a2e1a", border: "1px solid #2a4a2a",
                    borderRadius: 6, color: "#f5f0e8", fontSize: 13, outline: "none",
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 4人チーム分け */}
        {mode === 4 && (
          <div style={{ background: "#0f1f0f", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #2a4a2a" }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: GOLD, marginBottom: 8 }}>チーム分け</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, alignItems: "stretch" }}>
              {TEAM_MODES.map(({ id, label }) => {
                const active = teamMode === id;
                let display = label;
                if (id === "fixed_12_34") display = "固定\n1・2\nvs\n3・4";
                if (id === "fixed_13_24") display = "固定\n1・3\nvs\n2・4";
                if (id === "fixed_14_23") display = "固定\n1・4\nvs\n2・3";
                return (
                  <button key={id} onClick={() => setTeamMode(id)} style={{
                    padding: "7px 4px", borderRadius: 8,
                    border: `1.5px solid ${active ? GOLD : "#2a4a2a"}`,
                    background: active ? "#2a1f00" : "transparent",
                    color: active ? GOLD : "#6b8b6b",
                    fontSize: 9, cursor: "pointer",
                    fontWeight: active ? "bold" : "normal",
                    whiteSpace: "pre-line", lineHeight: 1.4,
                    textAlign: "center", height: "100%",
                  }}>
                    {display}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Options */}
        <div style={{ background: "#0f1f0f", borderRadius: 10, padding: "8px 12px", marginBottom: 10, border: "1px solid #2a4a2a" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: GOLD, marginBottom: 6 }}>OPTIONS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {([
              { k: "birdieReverse" as const, l: "バーディー逆転" },
              { k: "truncate" as const, l: "1の位切捨て" },
              { k: "carry" as const, l: "キャリー" },
              { k: "push" as const, l: "プッシュ" },
            ]).map(({ k, l }) => (
              <button key={k} onClick={() => setOpts(o => ({ ...o, [k]: !o[k] }))} style={{
                padding: "4px 11px", borderRadius: 20,
                border: `1.5px solid ${opts[k] ? GOLD : "#2a4a2a"}`,
                background: opts[k] ? "#2a1f00" : "transparent",
                color: opts[k] ? GOLD : "#6b8b6b",
                fontSize: 11, cursor: "pointer",
                fontWeight: opts[k] ? "bold" : "normal",
              }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Score grid */}
        <div style={{ background: "#0f1f0f", borderRadius: 10, border: "1px solid #2a4a2a", overflow: "hidden", marginBottom: 10 }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: gridCols, background: "#0a160a", borderBottom: "1px solid #2a4a2a" }}>
            <div style={{ padding: "7px 2px", textAlign: "center", fontSize: 9, color: "#4a6a4a" }}>H</div>
            {Array.from({ length: n }, (_, i) => (
              <div key={i} style={{
                padding: "7px 2px", textAlign: "center", fontSize: 11, fontWeight: "bold",
                color: GOLD, borderLeft: "1px solid #2a4a2a",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {names[i]}
              </div>
            ))}
          </div>

          {/* Holes */}
          {Array(HOLES).fill(null).map((_, h) => {
            const r = results[h];
            const order = orders[h];
            const soloIdx = mode === 3 ? order[0] : null;
            const [tA4] = mode === 4 ? getTeams4(h) : [[], []];
            return (
              <div key={h} style={{ borderBottom: "1px solid #1a3a1a" }}>
                {/* Score row */}
                <div style={{
                  display: "grid", gridTemplateColumns: gridCols,
                  background: h % 2 === 0 ? "#0f1f0f" : "#0b190b",
                }}>
                  {/* Hole + par */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4px 2px" }}>
                    <span style={{ fontSize: 11, fontWeight: "bold", color: GOLD }}>{h + 1}</span>
                    <div style={{ display: "flex", gap: 1, marginTop: 2 }}>
                      {[3, 4, 5].map(p => (
                        <button key={p} onClick={() => setPars(prev => prev.map((v, ph) => ph === h ? p : v))} style={{
                          padding: "1px 3px", fontSize: 7, borderRadius: 3,
                          border: `1px solid ${pars[h] === p ? GOLD : "#2a4a2a"}`,
                          background: pars[h] === p ? "#2a1f00" : "transparent",
                          color: pars[h] === p ? GOLD : "#4a6a4a",
                          cursor: "pointer",
                        }}>{p}</button>
                      ))}
                    </div>
                    {opts.push && (
                      <select
                        value={pushCounts[h]}
                        onChange={e => setPushCounts(prev => prev.map((v, ph) => ph === h ? Number(e.target.value) : v))}
                        style={{ marginTop: 2, fontSize: 7, padding: "1px 2px", borderRadius: 3, background: "#1a2e1a", border: "1px solid #2a4a2a", color: GOLD }}
                      >
                        <option value={0}>P×0</option>
                        <option value={1}>P×1</option>
                        <option value={2}>P×2</option>
                      </select>
                    )}
                  </div>

                  {Array.from({ length: n }, (_, pi) => {
                    const sc = scores[h][pi];
                    const par = pars[h];
                    const numSc = Number(sc);
                    let scoreColor = "#f5f0e8";
                    if (sc !== "") {
                      if (numSc <= par - 1) scoreColor = "#fbbf24";
                      else if (numSc === par) scoreColor = GREEN;
                      else if (numSc >= par + 2) scoreColor = RED;
                    }
                    const isSolo = mode === 3 && soloIdx === pi;
                    const isTeamA = mode === 4 && tA4.includes(pi);
                    return (
                      <div key={pi} style={{
                        ...cell,
                        background: isSolo ? "rgba(200,169,110,0.06)"
                          : isTeamA ? "rgba(200,169,110,0.03)" : "rgba(74,155,127,0.03)",
                      }}>
                        {mode === 4 && (
                          <div style={{ fontSize: 7, textAlign: "center", color: isTeamA ? GOLD : GREEN, marginBottom: 1 }}>
                            {isTeamA ? "A" : "B"}
                          </div>
                        )}
                        <input
                          type="number"
                          value={sc}
                          onChange={e => setScore(h, pi, e.target.value)}
                          min={1} max={15}
                          style={{
                            width: "100%", boxSizing: "border-box",
                            padding: "7px 0", textAlign: "center",
                            background: "transparent",
                            border: `1.5px solid ${isSolo ? "#3a2e00" : isTeamA ? "#2a2000" : "#1a3a2e"}`,
                            borderRadius: 6,
                            fontSize: 17, fontWeight: "bold",
                            color: scoreColor, outline: "none",
                            MozAppearance: "textfield",
                          } as React.CSSProperties}
                          placeholder="·"
                        />
                        {isSolo && <div style={{ fontSize: 7, textAlign: "center", color: GOLD, marginTop: 1 }}>単独</div>}
                      </div>
                    );
                  })}
                </div>

                {/* Result row */}
                {r && !r.tied && (
                  <div style={{ display: "grid", gridTemplateColumns: gridCols, background: "#080f08" }}>
                    <div style={{ padding: "2px", textAlign: "center", fontSize: 8, color: "#3a5a3a", display: "flex", alignItems: "center", justifyContent: "center" }}>pt</div>
                    {Array.from({ length: n }, (_, pi) => {
                      const pt = r.pts[pi];
                      return (
                        <div key={pi} style={{
                          ...cell, padding: "3px 3px", textAlign: "center",
                          fontSize: 12, fontWeight: "bold",
                          color: pt > 0 ? GREEN : pt < 0 ? RED : DIM,
                        }}>
                          {pt > 0 ? `+${pt}` : pt === 0 ? "" : pt}
                        </div>
                      );
                    })}
                  </div>
                )}
                {r && r.tied && (
                  <div style={{ padding: "2px 8px", background: "#080f08", fontSize: 8, color: GOLD, textAlign: "center" }}>
                    引き分け → 次×{r.mult + 1}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div style={{ background: "#0a160a", borderRadius: 10, padding: "14px 16px", border: `2px solid ${GOLD}` }}>
          <div style={{ fontSize: 9, letterSpacing: 3, color: GOLD, textAlign: "center", marginBottom: 10 }}>FINAL SCORE</div>
          {Array.from({ length: n }, (_, pi) => (
            <div key={pi} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 0",
              borderBottom: pi < n - 1 ? "1px solid #1a3a1a" : "none",
            }}>
              <span style={{ fontSize: 14, color: "#c8d8c8" }}>{names[pi]}</span>
              <span style={{
                fontSize: 20, fontWeight: "bold",
                color: totals[pi] > 0 ? GOLD : totals[pi] < 0 ? RED : DIM,
              }}>
                {totals[pi] > 0 ? `+${totals[pi]}` : totals[pi]}
              </span>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", fontSize: 8, color: "#2a4a2a", marginTop: 10, paddingBottom: 20, letterSpacing: 1 }}>
          {mode === 3
            ? "3人版：単独はペア各人と個別決済（方法A）• 打順=前H昇順"
            : `4人版：${TEAM_MODES.find(t => t.id === teamMode)?.label.replace("\n", " ")}`}
        </div>
      </div>
    </div>
  );
}

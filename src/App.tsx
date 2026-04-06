import React, { useState, useMemo, useEffect } from "react";
import type { Opts } from "./types";
import { useSession } from "./hooks/useSession";
import { supabase } from "./lib/supabase";
import { getSessionId, getDeviceId, newSession } from "./lib/session";

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

interface Result3 {
  solo: number; pair: number[]; soloTeam: number; pairTeam: number;
  diff: number; mult: number; tied: boolean; pts: number[];
}
interface Result4 {
  tA: number[]; tB: number[]; scA: number; scB: number;
  diff: number; mult: number; tied: boolean; pts: number[];
}
type Result = Result3 | Result4 | null;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function App() {
  const [mode, setMode] = useState<3 | 4>(3);
  const [courseName, setCourseName] = useState("");
  const [sessionDisplayDate, setSessionDisplayDate] = useState(
    new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })
  );
  const [, setSessionId] = useState(getSessionId());
  const [names, setNames] = useState(["Player1", "Player2", "Player3", "Player4"]);
  const [scores, setScores] = useState<string[][]>(() =>
    Array(HOLES).fill(null).map(() => Array(4).fill(""))
  );
  const [pars, setPars] = useState<number[]>(Array(HOLES).fill(4));
  const [opts, setOpts] = useState<Opts>({
    carry: false, birdieReverse: false, truncate: false, push: false,
  });
  const [pushCounts, setPushCounts] = useState<number[]>(Array(HOLES).fill(0));
  const [teamMode, setTeamMode] = useState("fixed_12_34");
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const isViewing = viewingSessionId !== null;

  const { showHistory, toggleHistory, setShowHistory, historyList } = useSession();

  // セッション復元
  useEffect(() => {
    const id = getSessionId();
    supabase.from("sessions").select("*").eq("id", id).single()
      .then(({ data }) => {
        if (!data) return;
        setMode(data.mode as 3 | 4);
        setCourseName(data.course_name ?? "");
        setNames(data.names);
        setPars(data.pars);
        setScores(data.scores);
        setOpts(data.opts);
        setTeamMode(data.team_mode);
        setSessionDisplayDate(formatDate(data.updated_at));
        setSavedSnapshot(JSON.stringify({
          courseName: data.course_name ?? "",
          names: data.names,
          scores: data.scores,
          opts: data.opts,
          mode: data.mode,
          teamMode: data.team_mode,
        }));
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 履歴から読み込み（閲覧モード）
  async function loadSessionById(id: string) {
    if (isDirty && !window.confirm("現在の入力内容は保存されません。過去の記録を表示しますか？")) return;
    const { data } = await supabase.from("sessions").select("*").eq("id", id).single();
    if (!data) return;
    // localStorage / sessionId は変更しない（現セッションIDを守る）
    setMode(data.mode as 3 | 4);
    setCourseName(data.course_name ?? "");
    setNames(data.names);
    setPars(data.pars);
    setScores(data.scores);
    setOpts(data.opts);
    setTeamMode(data.team_mode);
    setSessionDisplayDate(formatDate(data.updated_at));
    setSavedSnapshot(JSON.stringify({
      courseName: data.course_name ?? "",
      names: data.names,
      scores: data.scores,
      opts: data.opts,
      mode: data.mode,
      teamMode: data.team_mode,
    }));
    setViewingSessionId(id);
    setShowHistory(false);
  }

  // 閲覧中のゲームを継続する
  function handleContinueSession() {
    if (!viewingSessionId) return;
    localStorage.setItem("golf_session_id", viewingSessionId);
    setSessionId(viewingSessionId);
    setViewingSessionId(null);
    // savedSnapshot は loadSessionById で設定済み → isDirty=false（保存済み扱い）
  }

  // 新しいゲーム
  function handleNewSession() {
    if (!hasAnyInput) return;
    if (isDirty && !window.confirm("新しいゲームを開始しますか？\n現在の入力内容は保存されません。")) return;
    startNewSession();
  }

  function startNewSession() {
    const id = newSession();
    setSessionId(id);
    setMode(3);
    setCourseName("");
    setNames(["Player1", "Player2", "Player3", "Player4"]);
    setScores(Array(HOLES).fill(null).map(() => Array(4).fill("")));
    setPars(Array(HOLES).fill(4));
    setOpts({ carry: false, birdieReverse: false, truncate: false, push: false });
    setPushCounts(Array(HOLES).fill(0));
    setTeamMode("fixed_12_34");
    setSessionDisplayDate(new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }));
    setSavedSnapshot(null);
    setShowHistory(false);
    setViewingSessionId(null);
  }

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

  const halfTotals = useMemo(() => {
    const t = Array(4).fill(0);
    results.slice(0, 9).forEach(r => {
      if (!r || r.tied) return;
      r.pts.forEach((p, i) => { t[i] += p; });
    });
    return t;
  }, [results]);

  const totals = useMemo(() => {
    const t = Array(4).fill(0);
    results.forEach(r => {
      if (!r || r.tied) return;
      r.pts.forEach((p, i) => { t[i] += p; });
    });
    return t;
  }, [results]);

  const hasAnyInput = courseName.trim() !== "" ||
    scores.some(row => row.slice(0, n).some(s => s !== ""));

  const canSave = !isViewing &&
    courseName.trim() !== "" &&
    names.slice(0, n).every(name => name.trim() !== "");

  const allFilled = canSave &&
    scores.every(row => row.slice(0, n).every(s => s !== ""));

  // 保存済みスナップショット（一致 = 保存済み = ポップアップ不要）
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const currentSnapshot = useMemo(() =>
    JSON.stringify({ courseName, names, scores, opts, mode, teamMode }),
    [courseName, names, scores, opts, mode, teamMode]
  );
  const isDirty = savedSnapshot !== currentSnapshot;

  const [saving, setSaving] = useState(false);

  async function saveSession() {
    if (!canSave || saving) return;
    setSaving(true);
    await supabase.from("sessions").upsert({
      id: getSessionId(),
      device_id: getDeviceId(),
      updated_at: new Date().toISOString(),
      mode: n,
      team_mode: teamMode,
      course_name: courseName,
      names,
      pars,
      scores,
      opts,
      totals,
    });
    setSavedSnapshot(currentSnapshot);
    setSaving(false);
  }

  // 全項目入力済みで未保存の場合は自動保存
  useEffect(() => {
    if (!allFilled || !isDirty || saving) return;
    const timer = setTimeout(() => { saveSession(); }, 1500);
    return () => clearTimeout(timer);
  }, [allFilled, currentSnapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  const gridCols = `36px repeat(${n}, 1fr)`;
  const cell: React.CSSProperties = { borderLeft: "1px solid #1a3a1a", padding: "4px 3px" };

  return (
    <div style={{ minHeight: "100vh", background: "#1a2e1a", fontFamily: "'Georgia', serif", color: "#f5f0e8" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f1f0f, #1a3a1a)",
        borderBottom: `2px solid ${GOLD}`,
        padding: "16px 16px 12px", textAlign: "center",
        position: "relative",
      }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: GOLD, marginBottom: 4 }}>GOLF BETTING GAME</div>
        <div style={{ fontSize: 22, fontWeight: "bold" }}>Las Vegas</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10 }}>
          {([3, 4] as const).map(m => (
            <button key={m} onClick={() => !isViewing && setMode(m)} style={{
              padding: "5px 22px", borderRadius: 20,
              border: `1.5px solid ${mode === m ? GOLD : "#2a4a2a"}`,
              background: mode === m ? "#2a1f00" : "transparent",
              color: mode === m ? GOLD : "#6b8b6b",
              fontSize: 13, cursor: isViewing ? "default" : "pointer",
              fontWeight: mode === m ? "bold" : "normal",
              opacity: isViewing ? 0.5 : 1,
            }}>{m}人</button>
          ))}
        </div>
        {/* 履歴ボタン */}
        <button onClick={toggleHistory} style={{
          position: "absolute", top: 16, right: 12,
          padding: "4px 10px", borderRadius: 12,
          border: `1px solid ${showHistory ? GOLD : "#2a4a2a"}`,
          background: showHistory ? "#2a1f00" : "transparent",
          color: showHistory ? GOLD : "#6b8b6b",
          fontSize: 10, cursor: "pointer",
        }}>履歴</button>
        {/* 新しいゲームボタン */}
        <button
          onClick={handleNewSession}
          disabled={!hasAnyInput}
          style={{
            position: "absolute", top: 16, left: 12,
            padding: "4px 10px", borderRadius: 12,
            border: `1px solid ${hasAnyInput ? "#4a6a4a" : "#2a3a2a"}`,
            background: "transparent",
            color: hasAnyInput ? "#6b8b6b" : "#2a3a2a",
            fontSize: 10, cursor: hasAnyInput ? "pointer" : "default",
          }}>新ゲーム</button>
      </div>

      {/* 閲覧モードバナー */}
      {isViewing && (
        <div style={{
          background: "#1a1000", borderBottom: `1px solid ${GOLD}`,
          padding: "6px 16px", textAlign: "center",
          fontSize: 11, color: GOLD, letterSpacing: 1,
        }}>
          過去の記録を閲覧中
        </div>
      )}

      {/* 履歴パネル */}
      {showHistory && (
        <div style={{
          background: "#0a160a", borderBottom: "1px solid #2a4a2a",
          maxHeight: 280, overflowY: "auto",
        }}>
          {historyList.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: "#4a6a4a" }}>記録なし</div>
          ) : historyList.map(s => (
            <div key={s.id} onClick={() => loadSessionById(s.id)} style={{
              padding: "10px 16px", borderBottom: "1px solid #1a2a1a",
              cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 12, color: "#c8d8c8", marginBottom: 2 }}>
                  {s.course_name || "（コース名なし）"}
                </div>
                <div style={{ fontSize: 9, color: "#4a6a4a" }}>
                  {formatDate(s.updated_at)} · {s.mode}人 · ID: {s.id.slice(0, 8)}
                </div>
              </div>
              <div style={{ fontSize: 9, color: "#6b8b6b" }}>
                {s.names.slice(0, s.mode).join(" / ")}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "12px 8px" }}>
        {/* Course name */}
        <div style={{ background: "#0f1f0f", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #2a4a2a" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: GOLD, marginBottom: 6 }}>GOLF COURSE</div>
          <input
            value={courseName}
            onChange={e => setCourseName(e.target.value)}
            placeholder="ゴルフ場名を入力"
            disabled={isViewing}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "6px 8px", textAlign: "left",
              background: "#1a2e1a", border: "1px solid #2a4a2a",
              borderRadius: 6, color: isViewing ? "#6b8b6b" : "#f5f0e8", fontSize: 13, outline: "none",
              marginBottom: 6, opacity: isViewing ? 0.7 : 1,
            }}
          />
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 10, color: "#6b8b6b" }}>{sessionDisplayDate}</span>
          </div>
        </div>

        {/* Player names */}
        <div style={{ background: "#0f1f0f", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #2a4a2a" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: GOLD, marginBottom: 6 }}>PLAYERS</div>
          <div style={{ display: "flex", gap: 6 }}>
            {Array.from({ length: n }, (_, i) => (
              <div key={i} style={{ flex: 1 }}>
                <input
                  value={names[i]}
                  onChange={e => setNames(names.map((x, j) => j === i ? e.target.value : x))}
                  disabled={isViewing}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "6px 2px", textAlign: "center",
                    background: "#1a2e1a", border: "1px solid #2a4a2a",
                    borderRadius: 6, color: isViewing ? "#6b8b6b" : "#f5f0e8", fontSize: 13, outline: "none",
                    opacity: isViewing ? 0.7 : 1,
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5, alignItems: "stretch", pointerEvents: isViewing ? "none" : "auto", opacity: isViewing ? 0.6 : 1 }}>
              {TEAM_MODES.map(({ id, label }) => {
                const active = teamMode === id;
                let display = label;
                if (id === "fixed_12_34") display = `固定\n${names[0]}&${names[1]}\nvs\n${names[2]}&${names[3]}`;
                if (id === "fixed_13_24") display = `固定\n${names[0]}&${names[2]}\nvs\n${names[1]}&${names[3]}`;
                if (id === "fixed_14_23") display = `固定\n${names[0]}&${names[3]}\nvs\n${names[1]}&${names[2]}`;
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, pointerEvents: isViewing ? "none" : "auto", opacity: isViewing ? 0.6 : 1 }}>
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

          {Array(HOLES).fill(null).map((_, h) => {
            const r = results[h];
            const order = orders[h];
            const soloIdx = mode === 3 ? order[0] : null;
            const [tA4] = mode === 4 ? getTeams4(h) : [[], []];
            return (
              <React.Fragment key={h}>
              <div style={{ borderBottom: "1px solid #1a3a1a" }}>
                <div style={{
                  display: "grid", gridTemplateColumns: gridCols,
                  background: h % 2 === 0 ? "#0f1f0f" : "#0b190b",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4px 2px" }}>
                    <span style={{ fontSize: 11, fontWeight: "bold", color: GOLD }}>{h + 1}</span>
                    <div style={{ display: "flex", gap: 1, marginTop: 2, pointerEvents: isViewing ? "none" : "auto" }}>
                      {[3, 4, 5].map(p => (
                        <button key={p} onClick={() => setPars(prev => prev.map((v, ph) => ph === h ? p : v))} style={{
                          padding: "1px 3px", fontSize: 7, borderRadius: 3,
                          border: `1px solid ${pars[h] === p ? GOLD : "#2a4a2a"}`,
                          background: pars[h] === p ? "#2a1f00" : "transparent",
                          color: pars[h] === p ? GOLD : "#4a6a4a",
                          cursor: isViewing ? "default" : "pointer",
                        }}>{p}</button>
                      ))}
                    </div>
                    {opts.push && (
                      <select
                        value={pushCounts[h]}
                        onChange={e => setPushCounts(prev => prev.map((v, ph) => ph === h ? Number(e.target.value) : v))}
                        disabled={isViewing}
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
                          disabled={isViewing}
                          style={{
                            width: "100%", boxSizing: "border-box",
                            padding: "7px 0", textAlign: "center",
                            background: "transparent",
                            border: `1.5px solid ${isSolo ? "#3a2e00" : isTeamA ? "#2a2000" : "#1a3a2e"}`,
                            borderRadius: 6,
                            fontSize: 17, fontWeight: "bold",
                            color: scoreColor, outline: "none",
                            MozAppearance: "textfield",
                            opacity: isViewing ? 0.8 : 1,
                          } as React.CSSProperties}
                          placeholder="·"
                        />
                        {isSolo && <div style={{ fontSize: 7, textAlign: "center", color: GOLD, marginTop: 1 }}>単独</div>}
                      </div>
                    );
                  })}
                </div>

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

              {/* ハーフ小計（9H後） */}
              {h === 8 && (
                <div style={{
                  display: "grid", gridTemplateColumns: gridCols,
                  background: "#0a1a0a", borderTop: `1px solid ${GOLD}`,
                  borderBottom: `2px solid ${GOLD}`,
                }}>
                  <div style={{ padding: "5px 2px", textAlign: "center", fontSize: 8, color: GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 1 }}>
                    <span style={{ fontSize: 7 }}>前半</span>
                    <span>計</span>
                  </div>
                  {Array.from({ length: n }, (_, pi) => {
                    const pt = halfTotals[pi];
                    return (
                      <div key={pi} style={{
                        ...cell, padding: "5px 3px", textAlign: "center",
                        fontSize: 13, fontWeight: "bold",
                        color: pt > 0 ? GOLD : pt < 0 ? RED : DIM,
                      }}>
                        {pt > 0 ? `+${pt}` : pt === 0 ? "-" : pt}
                      </div>
                    );
                  })}
                </div>
              )}
              </React.Fragment>
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

        <div style={{ textAlign: "center", fontSize: 8, color: "#2a4a2a", marginTop: 10, letterSpacing: 1 }}>
          {mode === 3
            ? "3人版：単独はペア各人と個別決済（方法A）• 打順=前H昇順"
            : `4人版：${TEAM_MODES.find(t => t.id === teamMode)?.label.replace("\n", " ")}`}
        </div>

        {/* ゲームの保存ボタン */}
        {/* 閲覧モード: このゲームを続けるボタン */}
        {isViewing && (
          <div style={{ marginTop: 16, marginBottom: 24, textAlign: "center" }}>
            <button onClick={handleContinueSession} style={{
              padding: "10px 32px", borderRadius: 24,
              border: `1.5px solid ${GOLD}`,
              background: "#2a1f00", color: GOLD,
              fontSize: 13, cursor: "pointer", fontWeight: "bold", letterSpacing: 1,
            }}>
              このゲームを続ける
            </button>
          </div>
        )}

        {/* 通常モード: 保存ボタン */}
        {!isViewing && (
          <div style={{ marginTop: 16, marginBottom: 24, textAlign: "center" }}>
            <button
              onClick={saveSession}
              disabled={!canSave || saving}
              style={{
                padding: "12px 40px", borderRadius: 24,
                border: `1.5px solid ${canSave ? GREEN : "#2a4a2a"}`,
                background: canSave ? "rgba(74,155,127,0.15)" : "transparent",
                color: canSave ? GREEN : "#2a4a2a",
                fontSize: 14, fontWeight: "bold", letterSpacing: 1,
                cursor: canSave ? "pointer" : "default",
              }}
            >
              {saving ? "保存中..." : !isDirty ? "保存済み" : "ゲームの保存"}
            </button>
            {!canSave && (
              <div style={{ fontSize: 9, color: "#3a5a3a", marginTop: 6 }}>
                コース名・プレイヤー名をすべて入力してください
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

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

const TEAM_MODES_3 = [
  { id: "order_1_23",  label: "打順\n1位 vs 2&3位" },
  { id: "fixed_1_23",  label: "固定\n1 vs 2&3" },
  { id: "fixed_2_13",  label: "固定\n2 vs 1&3" },
  { id: "fixed_3_12",  label: "固定\n3 vs 1&2" },
];

const TEAM_MODES_4 = [
  { id: "order_14_23", label: "打順\n1&4 vs 2&3" },
  { id: "order_rotate",label: "打順\nローテ" },
  { id: "bag_rotate",  label: "バッグ順\nローテ" },
  { id: "fixed_12_34", label: "固定\n1&2 vs 3&4" },
  { id: "fixed_13_24", label: "固定\n1&3 vs 2&4" },
  { id: "fixed_14_23", label: "固定\n1&4 vs 2&3" },
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
  const [sessionId, setSessionId] = useState(getSessionId());
  const [names, setNames] = useState(["Player1", "Player2", "Player3", "Player4"]);
  const [scores, setScores] = useState<string[][]>(() =>
    Array(HOLES).fill(null).map(() => Array(4).fill(""))
  );
  const [pars, setPars] = useState<number[]>(Array(HOLES).fill(4));
  const [opts, setOpts] = useState<Opts>({
    carry: false, birdieReverse: false, truncate: false, push: false,
  });
  const [pushCounts, setPushCounts] = useState<number[]>(Array(HOLES).fill(0));
  const [teamMode, setTeamMode] = useState("order_1_23");
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const isViewing = viewingSessionId !== null;
  const [isSharedView, setIsSharedView] = useState(false);
  const [isParticipant, setIsParticipant] = useState(false);
  const isReadOnly = isViewing || isSharedView;
  const isSettingsLocked = isParticipant || isReadOnly; // オーナー以外は設定変更不可
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [shareInput, setShareInput] = useState("");

  const { showHistory, toggleHistory, setShowHistory, historyList, fetchHistory } = useSession();

  // セッション復元（URLパラメータ ?s= による参加 / ?c= による共有閲覧を含む）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("s");
    const ctoken = params.get("c");
    window.history.replaceState({}, "", window.location.pathname);

    if (ctoken) {
      // 共有コード経由：閲覧専用モードで開く
      supabase.from("share_tokens").select("session_id").eq("token", ctoken.toUpperCase()).single()
        .then(({ data: tokenData }) => {
          if (!tokenData) return;
          return supabase.from("sessions").select("*").eq("id", tokenData.session_id).single();
        })
        .then((res) => {
          if (!res || !res.data) return;
          const data = res.data;
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
          setIsSharedView(true);
        });
      return;
    }

    if (sid) {
      localStorage.setItem("golf_session_id", sid);
      setSessionId(sid);
      setIsParticipant(true); // 招待リンク経由 = 参加者（設定変更不可）
    }
    const id = sid ?? getSessionId();
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

  // Realtime：他のデバイスからの更新を受信して state に反映
  useEffect(() => {
    const channel = supabase
      .channel(`session-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          const d = payload.new as any;
          setMode(d.mode as 3 | 4);
          setCourseName(d.course_name ?? "");
          setNames(d.names);
          setPars(d.pars);
          setScores(d.scores);
          setOpts(d.opts);
          setTeamMode(d.team_mode);
          setSavedSnapshot(JSON.stringify({
            courseName: d.course_name ?? "",
            names: d.names,
            scores: d.scores,
            opts: d.opts,
            mode: d.mode,
            teamMode: d.team_mode,
          }));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setIsParticipant(false); // 自分の履歴 = オーナー扱い
    setShowHistory(false);
  }

  // モード切り替え（teamMode をそのモードのデフォルトにリセット）
  function handleModeChange(m: 3 | 4) {
    setMode(m);
    setTeamMode(m === 3 ? "order_1_23" : "order_14_23");
  }

  // 履歴削除
  async function deleteSessionById(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("この記録を削除しますか？")) return;
    await supabase.from("sessions").delete().eq("id", id);
    if (viewingSessionId === id) startNewSession();
    fetchHistory();
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
    setTeamMode("order_1_23");
    setSessionDisplayDate(new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }));
    setSavedSnapshot(null);
    setShowHistory(false);
    setViewingSessionId(null);
    setIsParticipant(false);
    setIsSharedView(false);
    setShareCode(null);
    setShareInput("");
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
      let solo: number;
      let pair: number[];
      if      (teamMode === "fixed_1_23") { solo = 0; pair = [1, 2]; }
      else if (teamMode === "fixed_2_13") { solo = 1; pair = [0, 2]; }
      else if (teamMode === "fixed_3_12") { solo = 2; pair = [0, 1]; }
      else                                { solo = order[0]; pair = [order[1], order[2]]; } // order_1_23
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
      if (diff < 0) { pts[solo] = -x * 2; pair.forEach(p => { pts[p] = x; }); }
      else           { pts[solo] = x * 2; pair.forEach(p => { pts[p] = -x; }); }
      return { solo, pair, soloTeam, pairTeam, diff, mult, tied: false, pts };
    });
  }, [orders, scores, pars, opts, pushCounts, mode, teamMode]);

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
        tA.forEach(p => { pts[p] = -x; }); tB.forEach(p => { pts[p] = x; });
      } else if (diff < 0) {
        tA.forEach(p => { pts[p] = x; }); tB.forEach(p => { pts[p] = -x; });
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

  // 精算：誰が誰にいくら払うか（最小取引数）
  const settlement = useMemo(() => {
    const debtors:   { idx: number; amount: number }[] = [];
    const creditors: { idx: number; amount: number }[] = [];
    for (let i = 0; i < n; i++) {
      if (totals[i] > 0) debtors.push({ idx: i, amount: totals[i] });
      else if (totals[i] < 0) creditors.push({ idx: i, amount: -totals[i] });
    }
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);
    const txs: { from: number; to: number; amount: number }[] = [];
    let di = 0, ci = 0;
    while (di < debtors.length && ci < creditors.length) {
      const pay = Math.min(debtors[di].amount, creditors[ci].amount);
      txs.push({ from: debtors[di].idx, to: creditors[ci].idx, amount: pay });
      debtors[di].amount -= pay;
      creditors[ci].amount -= pay;
      if (debtors[di].amount === 0) di++;
      if (creditors[ci].amount === 0) ci++;
    }
    return txs;
  }, [totals, n]);

  const hasAnyInput = courseName.trim() !== "" ||
    scores.some(row => row.slice(0, n).some(s => s !== ""));

  const canSave = !isViewing &&
    courseName.trim() !== "" &&
    names.slice(0, n).every(name => name.trim() !== "");

  // 保存済みスナップショット（一致 = 保存済み = ポップアップ不要）
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const currentSnapshot = useMemo(() =>
    JSON.stringify({ courseName, names, scores, opts, mode, teamMode }),
    [courseName, names, scores, opts, mode, teamMode]
  );
  const isDirty = savedSnapshot !== currentSnapshot;

  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  function generateShareToken(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字(0,O,1,I)を除外
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }

  async function issueShareCode() {
    if (!canSave) return;
    const token = generateShareToken();
    await supabase.from("share_tokens").insert({ token, session_id: sessionId });
    setShareCode(token);
  }

  async function openByShareCode() {
    const token = shareInput.trim().toUpperCase();
    if (token.length !== 6) return;
    const { data: tokenData } = await supabase
      .from("share_tokens").select("session_id").eq("token", token).single();
    if (!tokenData) { alert("コードが見つかりません"); return; }
    const { data } = await supabase.from("sessions").select("*").eq("id", tokenData.session_id).single();
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
    setIsSharedView(true);
    setShareInput("");
    setShowHistory(false);
  }

  async function copyInviteLink() {
    const url = `${window.location.origin}${window.location.pathname}?s=${sessionId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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

  // コース名・プレイヤー名が入力済みで未保存の場合は自動保存（スコア途中入力もDB同期）
  useEffect(() => {
    if (!canSave || !isDirty || saving) return;
    const timer = setTimeout(() => { saveSession(); }, 1500);
    return () => clearTimeout(timer);
  }, [canSave, currentSnapshot]); // eslint-disable-line react-hooks/exhaustive-deps

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
          {isParticipant ? (
            // 参加者: オーナーが設定した人数のみ表示（切り替え不可）
            <div style={{
              padding: "5px 22px", borderRadius: 20,
              border: `1.5px solid ${GOLD}`,
              background: "#2a1f00", color: GOLD,
              fontSize: 13, fontWeight: "bold",
            }}>{mode}人</div>
          ) : (
            // オーナー: 切り替えボタン表示
            ([3, 4] as const).map(m => (
              <button key={m} onClick={() => !isReadOnly && handleModeChange(m)} style={{
                padding: "5px 22px", borderRadius: 20,
                border: `1.5px solid ${mode === m ? GOLD : "#2a4a2a"}`,
                background: mode === m ? "#2a1f00" : "transparent",
                color: mode === m ? GOLD : "#6b8b6b",
                fontSize: 13, cursor: isReadOnly ? "default" : "pointer",
                fontWeight: mode === m ? "bold" : "normal",
                opacity: isReadOnly ? 0.5 : 1,
              }}>{m}人</button>
            ))
          )}
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

      {/* バナー */}
      {(isViewing || isSharedView || isParticipant) && (
        <div style={{
          background: isParticipant ? "#0a1a2a" : "#1a1000",
          borderBottom: `1px solid ${isParticipant ? "#2a4a6a" : GOLD}`,
          padding: "6px 16px", textAlign: "center",
          fontSize: 11, color: isParticipant ? "#4a9bdb" : GOLD, letterSpacing: 1,
        }}>
          {isSharedView
            ? "共有された記録を閲覧中（編集不可）"
            : isParticipant
            ? "参加中 — スコア入力のみ可（ゴルフ場・プレイヤー名・設定はオーナーが管理）"
            : "過去の記録を閲覧中"}
        </div>
      )}

      {/* 履歴パネル */}
      {showHistory && (
        <div style={{
          background: "#0a160a", borderBottom: "1px solid #2a4a2a",
          maxHeight: 320, overflowY: "auto",
        }}>
          {/* 共有コード入力 */}
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #1a3a1a", display: "flex", gap: 6, alignItems: "center" }}>
            <input
              value={shareInput}
              onChange={e => setShareInput(e.target.value.toUpperCase())}
              placeholder="共有コード（6桁）"
              maxLength={6}
              style={{
                flex: 1, padding: "6px 8px", borderRadius: 6,
                background: "#1a2e1a", border: "1px solid #2a4a2a",
                color: "#f5f0e8", fontSize: 13, outline: "none",
                letterSpacing: 3, textAlign: "center",
              }}
            />
            <button
              onClick={openByShareCode}
              disabled={shareInput.trim().length !== 6}
              style={{
                padding: "6px 14px", borderRadius: 6,
                border: `1px solid ${shareInput.trim().length === 6 ? GOLD : "#2a4a2a"}`,
                background: "transparent",
                color: shareInput.trim().length === 6 ? GOLD : "#3a5a3a",
                fontSize: 12, cursor: shareInput.trim().length === 6 ? "pointer" : "default",
              }}
            >開く</button>
          </div>
          {historyList.length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: "#4a6a4a" }}>記録なし</div>
          ) : historyList.map(s => (
            <div key={s.id} onClick={() => loadSessionById(s.id)} style={{
              padding: "10px 16px", borderBottom: "1px solid #1a2a1a",
              cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
              gap: 8,
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, color: "#c8d8c8", marginBottom: 2 }}>
                  {s.course_name || "（コース名なし）"}
                </div>
                <div style={{ fontSize: 9, color: "#4a6a4a" }}>
                  {formatDate(s.updated_at)} · {s.mode}人 · ID: {s.id.slice(0, 8)}
                </div>
              </div>
              <div style={{ fontSize: 9, color: "#6b8b6b", flexShrink: 0 }}>
                {s.names.slice(0, s.mode).join(" / ")}
              </div>
              <button
                onClick={(e) => deleteSessionById(s.id, e)}
                style={{
                  flexShrink: 0, padding: "3px 7px", borderRadius: 4,
                  border: "1px solid #3a2a2a", background: "transparent",
                  color: "#6a4a4a", fontSize: 13, cursor: "pointer", lineHeight: 1,
                }}
              >×</button>
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
            disabled={isSettingsLocked}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "6px 8px", textAlign: "left",
              background: "#1a2e1a", border: "1px solid #2a4a2a",
              borderRadius: 6, color: isSettingsLocked ? "#6b8b6b" : "#f5f0e8", fontSize: 13, outline: "none",
              marginBottom: 6, opacity: isSettingsLocked ? 0.7 : 1,
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
                  disabled={isSettingsLocked}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "6px 2px", textAlign: "center",
                    background: "#1a2e1a", border: "1px solid #2a4a2a",
                    borderRadius: 6, color: isSettingsLocked ? "#6b8b6b" : "#f5f0e8", fontSize: 13, outline: "none",
                    opacity: isSettingsLocked ? 0.7 : 1,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 4人チーム分け */}
        <div style={{ background: "#0f1f0f", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #2a4a2a" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: GOLD, marginBottom: 8 }}>チーム分け</div>
          <div style={{ display: "grid", gridTemplateColumns: mode === 3 ? "1fr 1fr" : "1fr 1fr 1fr", gap: 5, alignItems: "stretch", pointerEvents: isSettingsLocked ? "none" : "auto", opacity: isSettingsLocked ? 0.6 : 1 }}>
            {(mode === 3 ? TEAM_MODES_3 : TEAM_MODES_4).map(({ id, label }) => {
              const active = teamMode === id;
              let display = label;
              if (id === "fixed_1_23")  display = `固定\n${names[0]}\nvs\n${names[1]}&${names[2]}`;
              if (id === "fixed_2_13")  display = `固定\n${names[1]}\nvs\n${names[0]}&${names[2]}`;
              if (id === "fixed_3_12")  display = `固定\n${names[2]}\nvs\n${names[0]}&${names[1]}`;
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

        {/* Options */}
        <div style={{ background: "#0f1f0f", borderRadius: 10, padding: "8px 12px", marginBottom: 10, border: "1px solid #2a4a2a" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: GOLD, marginBottom: 6 }}>OPTIONS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, pointerEvents: isSettingsLocked ? "none" : "auto", opacity: isSettingsLocked ? 0.6 : 1 }}>
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
            const soloIdx = mode === 3
              ? teamMode === "fixed_1_23" ? 0
              : teamMode === "fixed_2_13" ? 1
              : teamMode === "fixed_3_12" ? 2
              : order[0]
              : null;
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
                    <div style={{ display: "flex", gap: 1, marginTop: 2, pointerEvents: isReadOnly ? "none" : "auto" }}>
                      {[3, 4, 5].map(p => (
                        <button key={p} onClick={() => setPars(prev => prev.map((v, ph) => ph === h ? p : v))} style={{
                          padding: "1px 3px", fontSize: 7, borderRadius: 3,
                          border: `1px solid ${pars[h] === p ? GOLD : "#2a4a2a"}`,
                          background: pars[h] === p ? "#2a1f00" : "transparent",
                          color: pars[h] === p ? GOLD : "#4a6a4a",
                          cursor: isReadOnly ? "default" : "pointer",
                        }}>{p}</button>
                      ))}
                    </div>
                    {opts.push && (
                      <select
                        value={pushCounts[h]}
                        onChange={e => setPushCounts(prev => prev.map((v, ph) => ph === h ? Number(e.target.value) : v))}
                        disabled={isReadOnly}
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
                          disabled={isReadOnly}
                          style={{
                            width: "100%", boxSizing: "border-box",
                            padding: "7px 0", textAlign: "center",
                            background: "transparent",
                            border: `1.5px solid ${isSolo ? "#3a2e00" : isTeamA ? "#2a2000" : "#1a3a2e"}`,
                            borderRadius: 6,
                            fontSize: 17, fontWeight: "bold",
                            color: scoreColor, outline: "none",
                            MozAppearance: "textfield",
                            opacity: isReadOnly ? 0.8 : 1,
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
                          color: pt > 0 ? RED : pt < 0 ? GREEN : DIM,
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
                        color: pt > 0 ? RED : pt < 0 ? GOLD : DIM,
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
                color: totals[pi] > 0 ? RED : totals[pi] < 0 ? GOLD : DIM,
              }}>
                {totals[pi] > 0 ? `+${totals[pi]}` : totals[pi]}
              </span>
            </div>
          ))}

          {/* 精算 */}
          {settlement.length > 0 && (
            <>
              <div style={{
                margin: "12px 0 10px",
                borderTop: "1px solid #2a4a2a",
                paddingTop: 10,
                fontSize: 9, letterSpacing: 3, color: "#6b8b6b", textAlign: "center",
              }}>
                精 算
              </div>
              {settlement.map((tx, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 0",
                  borderBottom: i < settlement.length - 1 ? "1px solid #1a2a1a" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{
                      fontSize: 13, color: RED, fontWeight: "bold",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80,
                    }}>{names[tx.from]}</span>
                    <span style={{ fontSize: 14, color: "#3a6a3a", flexShrink: 0 }}>→</span>
                    <span style={{
                      fontSize: 13, color: GOLD, fontWeight: "bold",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80,
                    }}>{names[tx.to]}</span>
                  </div>
                  <span style={{ fontSize: 17, fontWeight: "bold", color: "#f5f0e8", flexShrink: 0 }}>
                    {tx.amount}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        <div style={{ textAlign: "center", fontSize: 8, color: "#2a4a2a", marginTop: 10, letterSpacing: 1 }}>
          {mode === 3
            ? `3人版：単独はペア各人と個別決済（方法A）• ${(TEAM_MODES_3.find(t => t.id === teamMode) ?? TEAM_MODES_3[0]).label.replace(/\n/g, " ")}`
            : `4人版：${(TEAM_MODES_4.find(t => t.id === teamMode) ?? TEAM_MODES_4[0]).label.replace(/\n/g, " ")}`}
        </div>

        {/* 閲覧モード（自分の履歴）: このゲームを続けるボタン */}
        {isViewing && !isSharedView && (
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

        {/* 通常モード: 保存ボタン + 招待 + 共有コード */}
        {!isViewing && !isSharedView && (
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
            {/* 招待・共有はオーナーのみ表示 */}
            <div style={{ marginTop: 10, display: isParticipant ? "none" : "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              {/* 招待リンク: 設定入力済み + 保存済みの場合のみ有効 */}
              <button
                onClick={copyInviteLink}
                disabled={!canSave || isDirty}
                title={isDirty ? "保存してから共有できます" : !canSave ? "コース名・プレイヤー名を入力してください" : ""}
                style={{
                  padding: "6px 16px", borderRadius: 20,
                  border: `1px solid ${copied ? GOLD : (canSave && !isDirty) ? "#2a4a2a" : "#1a2a1a"}`,
                  background: "transparent",
                  color: copied ? GOLD : (canSave && !isDirty) ? "#4a6a4a" : "#2a3a2a",
                  fontSize: 11, cursor: (canSave && !isDirty) ? "pointer" : "default", letterSpacing: 1,
                  opacity: (canSave && !isDirty) ? 1 : 0.4,
                }}
              >
                {copied ? "コピーしました" : "招待リンクをコピー"}
              </button>
              <button
                onClick={issueShareCode}
                disabled={!canSave || isDirty}
                title={isDirty ? "保存してから共有できます" : !canSave ? "コース名・プレイヤー名を入力してください" : ""}
                style={{
                  padding: "6px 16px", borderRadius: 20,
                  border: `1px solid ${(canSave && !isDirty) ? "#2a4a6a" : "#1a2a1a"}`,
                  background: "transparent",
                  color: (canSave && !isDirty) ? "#4a7a9b" : "#2a3a2a",
                  fontSize: 11, cursor: (canSave && !isDirty) ? "pointer" : "default", letterSpacing: 1,
                  opacity: (canSave && !isDirty) ? 1 : 0.4,
                }}
              >
                共有コードを発行
              </button>
            </div>
            {shareCode && (
              <div style={{ marginTop: 12, padding: "10px 16px", background: "#0a160a", borderRadius: 10, border: "1px solid #2a4a6a", display: "inline-block" }}>
                <div style={{ fontSize: 9, color: "#4a7a9b", letterSpacing: 2, marginBottom: 4 }}>SHARE CODE</div>
                <div style={{ fontSize: 26, fontWeight: "bold", letterSpacing: 8, color: "#f5f0e8" }}>{shareCode}</div>
                <div style={{ fontSize: 9, color: "#4a6a4a", marginTop: 4 }}>相手に伝えて「履歴」→コード入力で閲覧できます</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useMemo, useEffect } from "react";
import type { Opts } from "./types";
import { useSession } from "./hooks/useSession";
import { supabase } from "./lib/supabase";
import { getSessionId, getDeviceId, newSession } from "./lib/session";

const HOLES = 18;
const PAR_AUTOFILL_THRESHOLD = 2;
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

const JST = { timeZone: "Asia/Tokyo" } as const;
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", ...JST });
}

export default function App() {
  const [mode, setMode] = useState<3 | 4>(4);
  const [courseName, setCourseName] = useState("");
  const [sessionDisplayDate, setSessionDisplayDate] = useState(
    new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", ...JST })
  );
  const [sessionId, setSessionId] = useState(getSessionId());
  const [names, setNames] = useState(["Player1", "Player2", "Player3", "Player4"]);
  const [scores, setScores] = useState<string[][]>(() =>
    Array(HOLES).fill(null).map(() => Array(4).fill(""))
  );
  const [pars, setPars] = useState<number[]>(Array(HOLES).fill(4));
  const [opts, setOpts] = useState<Opts>({
    carry: false, birdieReverse: false, truncate: false, push: false, olympic: false,
  });
  const [localOpts, setLocalOpts] = useState<Opts | null>(null);
  const [localTeamMode, setLocalTeamMode] = useState<string | null>(null);
  const [pushCounts, setPushCounts] = useState<number[]>(Array(HOLES).fill(0));
  const [olympicMedals, setOlympicMedals] = useState<(string | null)[][]>(
    () => Array(HOLES).fill(null).map(() => Array(4).fill(null))
  );
  const [olympicPts, setOlympicPts] = useState({ gold: 5, silver: 3, bronze: 2, iron: 1 });
  const [teamMode, setTeamMode] = useState("order_1_23");
  const [frontLabel, setFrontLabel] = useState("");
  const [backLabel, setBackLabel] = useState("");
  const [courseSuggestions, setCourseSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [courseNameValid, setCourseNameValid] = useState(false);
  const [activeCell, setActiveCell] = useState<{ h: number; pi: number } | null>(null);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const isViewing = viewingSessionId !== null;
  const [isSharedView, setIsSharedView] = useState(false);
  const [isParticipant, setIsParticipant] = useState(false);
  const isReadOnly = isViewing || isSharedView;
  const isSettingsLocked = isParticipant || isReadOnly; // オーナー以外は設定変更不可
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminSessionList, setAdminSessionList] = useState<{ id: string; course_name: string | null; mode: number; updated_at: string; names: string[]; device_id: string }[]>([]);
  // 参加者・閲覧者・管理者はオプション・チーム分けをローカルのみ変更可（DB非反映）
  const displayOpts = (isParticipant || isSharedView || isAdminMode) && localOpts !== null ? localOpts : opts;
  const displayTeamMode = (isParticipant || isSharedView || isAdminMode) && localTeamMode !== null ? localTeamMode : teamMode;
  const [playerTokens, setPlayerTokens] = useState<(string | null)[]>([null, null, null, null]);
  const [playerTokenExpiresAt, setPlayerTokenExpiresAt] = useState<(string | null)[]>([null, null, null, null]);
  const [viewCode, setViewCode] = useState<string | null>(null);
  const [shareInput, setShareInput] = useState("");
  const [accessLogs, setAccessLogs] = useState<{ device_id: string; ip_address: string | null; accessed_at: string; role: string }[]>([]);

  const { showHistory, toggleHistory, setShowHistory, historyList, fetchHistory } = useSession();

  // コース名サジェスト検索（300ms debounce）
  useEffect(() => {
    if (!courseName.trim() || courseNameValid || isSettingsLocked) {
      setCourseSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("courses").select("name")
        .ilike("name", `%${courseName.trim()}%`)
        .limit(8);
      const list = data?.map(d => d.name) ?? [];
      setCourseSuggestions(list);
      setShowSuggestions(list.length > 0);
    }, 300);
    return () => clearTimeout(timer);
  }, [courseName, courseNameValid, isSettingsLocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // par 自動入力ヘルパー
  async function tryAutofillPars(label: string, holeOffset: number) {
    const { data: course } = await supabase
      .from("courses").select("id").ilike("name", courseName).maybeSingle();
    if (!course) return;
    const { data } = await supabase
      .from("course_sections").select("pars")
      .eq("course_id", course.id).ilike("label", label);
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const key = JSON.stringify(row.pars);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= PAR_AUTOFILL_THRESHOLD) {
      const best: number[] = JSON.parse(top[0]);
      setPars(prev => prev.map((p, i) =>
        i >= holeOffset && i < holeOffset + 9 ? best[i - holeOffset] : p
      ));
    }
  }

  // コース名が確定したとき、既に選択済みのラベルがあればpar自動入力
  useEffect(() => {
    if (!courseNameValid || isReadOnly) return;
    if (frontLabel) tryAutofillPars(frontLabel, 0);
    if (backLabel)  tryAutofillPars(backLabel, 9);
  }, [courseNameValid]); // eslint-disable-line react-hooks/exhaustive-deps

  // サイトアクセスログ記録（初回マウント時のみ）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlParams = params.toString() || null;
    fetch("https://api.ipify.org?format=json").catch(() => null)
      .then(r => r ? r.json() : { ip: null })
      .then(({ ip }) => {
        supabase.from("site_access_logs").insert({
          device_id: getDeviceId(),
          ip_address: ip,
          user_agent: navigator.userAgent,
          url_params: urlParams,
        });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // セッション復元（URLパラメータ ?c= によるコード参加を含む）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ctoken = params.get("c");
    window.history.replaceState({}, "", window.location.pathname);

    if (ctoken) {
      // コード経由：role に応じて参加者 or 閲覧専用モードで開く
      supabase.from("share_tokens").select("session_id, role, expires_at").eq("token", ctoken.toUpperCase()).single()
        .then(async ({ data: tokenData }) => {
          if (!tokenData) return;
          if (tokenData.role === "join" && tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
            alert("このコードは有効期限が切れています。再発行してもらってください。");
            return;
          }
          const { data } = await supabase.from("sessions").select("*").eq("id", tokenData.session_id).single();
          if (!data) return;
          setMode(data.mode as 3 | 4);
          setCourseName(data.course_name ?? "");
          setNames(data.names);
          setPars(data.pars);
          setScores(data.scores);
          setOpts(data.opts);
          setTeamMode(data.team_mode);
          setFrontLabel(data.front_label ?? "");
          setBackLabel(data.back_label ?? "");
          setCourseNameValid(!!data.course_name);
          setSessionDisplayDate(formatDate(data.updated_at));
          setSavedSnapshot(JSON.stringify({
            courseName: data.course_name ?? "",
            names: data.names, scores: data.scores,
            opts: data.opts, mode: data.mode, teamMode: data.team_mode,
            frontLabel: data.front_label ?? "", backLabel: data.back_label ?? "",
          }));
          if (tokenData.role === "join") {
            localStorage.setItem("golf_session_id", tokenData.session_id);
            setSessionId(tokenData.session_id);
            setIsParticipant(true);
          } else {
            setIsSharedView(true);
          }
        });
      return;
    }

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
        setFrontLabel(data.front_label ?? "");
        setBackLabel(data.back_label ?? "");
        setCourseNameValid(!!data.course_name);
        setSessionDisplayDate(formatDate(data.updated_at));
        setSavedSnapshot(JSON.stringify({
          courseName: data.course_name ?? "",
          names: data.names, scores: data.scores,
          opts: data.opts, mode: data.mode, teamMode: data.team_mode,
          frontLabel: data.front_label ?? "", backLabel: data.back_label ?? "",
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
          setFrontLabel(d.front_label ?? "");
          setBackLabel(d.back_label ?? "");
          setCourseNameValid(!!d.course_name);
          setSavedSnapshot(JSON.stringify({
            courseName: d.course_name ?? "",
            names: d.names, scores: d.scores,
            opts: d.opts, mode: d.mode, teamMode: d.team_mode,
            frontLabel: d.front_label ?? "", backLabel: d.back_label ?? "",
          }));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // オーナー用：既発行コードをDBから取得して常時表示
  useEffect(() => {
    if (isSharedView || isParticipant) return;
    const targetId = viewingSessionId ?? sessionId;
    supabase.from("share_tokens").select("token, role, expires_at, player_index").eq("session_id", targetId)
      .then(({ data }) => {
        if (!data) return;
        const tokens: (string | null)[] = [null, null, null, null];
        const expires: (string | null)[] = [null, null, null, null];
        setViewCode(null);
        data.forEach(row => {
          if (row.role === "join" && row.player_index != null) {
            if (!row.expires_at || new Date(row.expires_at) > new Date()) {
              tokens[row.player_index] = row.token;
              expires[row.player_index] = row.expires_at ?? null;
            }
          } else if (row.role === "view") {
            setViewCode(row.token);
          }
        });
        setPlayerTokens(tokens);
        setPlayerTokenExpiresAt(expires);
      });
  }, [sessionId, viewingSessionId, isSharedView, isParticipant]); // eslint-disable-line react-hooks/exhaustive-deps

  // オーナー用：アクセスログ取得
  useEffect(() => {
    if (isSharedView || isParticipant) return;
    const targetId = viewingSessionId ?? sessionId;
    supabase.from("share_access_logs").select("device_id, ip_address, accessed_at, role")
      .eq("session_id", targetId).order("accessed_at", { ascending: false })
      .then(({ data }) => { setAccessLogs(data ?? []); });
  }, [sessionId, viewingSessionId, isSharedView, isParticipant]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setFrontLabel(data.front_label ?? "");
    setBackLabel(data.back_label ?? "");
    setCourseNameValid(!!data.course_name);
    setSessionDisplayDate(formatDate(data.updated_at));
    setSavedSnapshot(JSON.stringify({
      courseName: data.course_name ?? "",
      names: data.names, scores: data.scores,
      opts: data.opts, mode: data.mode, teamMode: data.team_mode,
      frontLabel: data.front_label ?? "", backLabel: data.back_label ?? "",
    }));
    setViewingSessionId(id);
    setIsParticipant(false); // 自分の履歴 = オーナー扱い
    setLocalOpts(null);
    setLocalTeamMode(null);
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
    setLocalOpts(null);
    setLocalTeamMode(null);
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
    setMode(4);
    setCourseName("");
    setNames(["Player1", "Player2", "Player3", "Player4"]);
    setScores(Array(HOLES).fill(null).map(() => Array(4).fill("")));
    setPars(Array(HOLES).fill(4));
    setOpts({ carry: false, birdieReverse: false, truncate: false, push: false, olympic: false });
    setOlympicMedals(Array(HOLES).fill(null).map(() => Array(4).fill(null)));
    setPushCounts(Array(HOLES).fill(0));
    setTeamMode("order_1_23");
    setFrontLabel("");
    setBackLabel("");
    setCourseNameValid(false);
    setCourseSuggestions([]);
    setSessionDisplayDate(new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", ...JST }));
    setSavedSnapshot(null);
    setShowHistory(false);
    setViewingSessionId(null);
    setIsParticipant(false);
    setIsSharedView(false);
    setIsAdminMode(false);
    setAdminSessionList([]);
    setPlayerTokens([null, null, null, null]);
    setPlayerTokenExpiresAt([null, null, null, null]);
    setViewCode(null);
    setShareInput("");
  }

  const n = mode;

  const setScore = (h: number, pi: number, v: string) => {
    if (v !== "" && !/^\d+$/.test(v)) return;
    setScores(prev => prev.map((row, rh) =>
      rh === h ? row.map((s, rp) => rp === pi ? v : s) : row
    ));
  };

  function handleNumpad(key: string) {
    if (!activeCell) return;
    const { h, pi } = activeCell;
    const cur = scores[h][pi];
    if (key === "⌫") { setScore(h, pi, cur.slice(0, -1)); return; }
    if (cur.length >= 2) { setScore(h, pi, key); return; }
    const next = cur + key;
    setScore(h, pi, parseInt(next) > 15 ? key : next);
  }

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
    switch (displayTeamMode) {
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
      if      (displayTeamMode === "fixed_1_23") { solo = 0; pair = [1, 2]; }
      else if (displayTeamMode === "fixed_2_13") { solo = 1; pair = [0, 2]; }
      else if (displayTeamMode === "fixed_3_12") { solo = 2; pair = [0, 1]; }
      else                                        { solo = order[0]; pair = [order[1], order[2]]; } // order_1_23
      const ss = Number(s[solo]);
      const ps = pair.map(pi => Number(s[pi]));
      let soloTeam = ss * 11;
      let lo = Math.min(...ps), hi = Math.max(...ps);
      if (displayOpts.birdieReverse && ss < par) [lo, hi] = [hi, lo];
      let pairTeam = lo * 10 + hi;
      if (displayOpts.truncate) {
        soloTeam = Math.floor(soloTeam / 10) * 10;
        pairTeam = Math.floor(pairTeam / 10) * 10;
      }
      const diff = pairTeam - soloTeam;
      const pushMult = displayOpts.push ? Math.pow(2, pushCounts[h]) : 1;
      const mult = carry * pushMult;
      if (diff === 0 && displayOpts.carry) {
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
  }, [orders, scores, pars, displayOpts, displayTeamMode, pushCounts, mode]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (displayOpts.birdieReverse) {
        if (sA.some(sc => sc < par)) [loB, hiB] = [hiB, loB]; // Aがバーディー → 相手Bの数字を逆転
        if (sB.some(sc => sc < par)) [loA, hiA] = [hiA, loA]; // Bがバーディー → 相手Aの数字を逆転
      }
      let scA = loA * 10 + hiA;
      let scB = loB * 10 + hiB;
      if (displayOpts.truncate) {
        scA = Math.floor(scA / 10) * 10;
        scB = Math.floor(scB / 10) * 10;
      }
      const diff = scB - scA;
      const pushMult = displayOpts.push ? Math.pow(2, pushCounts[h]) : 1;
      const mult = carry * pushMult;
      if (diff === 0 && displayOpts.carry) {
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
  }, [orders, scores, pars, displayOpts, displayTeamMode, pushCounts, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const results: Result[] = mode === 3 ? results3 : results4;

  const halfTotals = useMemo(() => {
    const t = Array(4).fill(0);
    results.slice(0, 9).forEach(r => {
      if (!r || r.tied) return;
      r.pts.forEach((p, i) => { t[i] += p; });
    });
    return t;
  }, [results]);

  const backTotals = useMemo(() => {
    const t = Array(4).fill(0);
    results.slice(9, 18).forEach(r => {
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

  const grossTotals = useMemo(() => {
    return Array.from({ length: 4 }, (_, pi) =>
      scores.reduce((sum, row) => {
        const v = parseInt(row[pi], 10);
        return sum + (isNaN(v) ? 0 : v);
      }, 0)
    );
  }, [scores]);

  const grossHalf = useMemo(() => {
    return Array.from({ length: 4 }, (_, pi) =>
      scores.slice(0, 9).reduce((sum, row) => {
        const v = parseInt(row[pi], 10);
        return sum + (isNaN(v) ? 0 : v);
      }, 0)
    );
  }, [scores]);

  const grossBack = useMemo(() => {
    return Array.from({ length: 4 }, (_, pi) =>
      scores.slice(9, 18).reduce((sum, row) => {
        const v = parseInt(row[pi], 10);
        return sum + (isNaN(v) ? 0 : v);
      }, 0)
    );
  }, [scores]);

  const MEDAL_PTS = (medal: string | null) => {
    if (!medal) return 0;
    if (medal === "金") return olympicPts.gold;
    if (medal === "銀") return olympicPts.silver;
    if (medal === "銅") return olympicPts.bronze;
    if (medal === "鉄") return olympicPts.iron;
    return 0;
  };

  // ゼロサム計算: 未選択=0点として計算（1人以上選択されていれば計算開始）
  const calcOlympicHolePts = (row: (string | null)[], numPlayers: number): number[] => {
    const assigned = row.slice(0, numPlayers);
    if (!assigned.some(m => m !== null)) return Array(numPlayers).fill(0);
    const total = assigned.reduce((s, m) => s + MEDAL_PTS(m), 0);
    return Array.from({ length: numPlayers }, (_, pi) => MEDAL_PTS(row[pi]) * numPlayers - total);
  };

  const olympicHalf = useMemo(() =>
    Array.from({ length: 4 }, (_, pi) =>
      olympicMedals.slice(0, 9).reduce((sum, row) => sum + calcOlympicHolePts(row, n)[pi], 0)
    ), [olympicMedals, olympicPts, n]); // eslint-disable-line react-hooks/exhaustive-deps

  const olympicBack = useMemo(() =>
    Array.from({ length: 4 }, (_, pi) =>
      olympicMedals.slice(9, 18).reduce((sum, row) => sum + calcOlympicHolePts(row, n)[pi], 0)
    ), [olympicMedals, olympicPts, n]); // eslint-disable-line react-hooks/exhaustive-deps

  const olympicTotals = useMemo(() =>
    Array.from({ length: 4 }, (_, pi) =>
      olympicMedals.reduce((sum, row) => sum + calcOlympicHolePts(row, n)[pi], 0)
    ), [olympicMedals, olympicPts, n]); // eslint-disable-line react-hooks/exhaustive-deps

  // 精算：誰が誰にいくら払うか（最小取引数）
  const settlement = useMemo(() => {
    const debtors:   { idx: number; amount: number }[] = [];
    const creditors: { idx: number; amount: number }[] = [];
    for (let i = 0; i < n; i++) {
      const combined = totals[i] + (displayOpts.olympic ? olympicTotals[i] : 0);
      if (combined < 0) debtors.push({ idx: i, amount: -combined });
      else if (combined > 0) creditors.push({ idx: i, amount: combined });
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
  }, [totals, olympicTotals, displayOpts.olympic, n]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasAnyInput = courseName.trim() !== "" ||
    scores.some(row => row.slice(0, n).some(s => s !== ""));

  const filledHoles = scores.filter(row => row.slice(0, n).every(s => s !== "")).length;
  const canSave = !isViewing &&
    courseNameValid &&
    names.slice(0, n).every(name => name.trim() !== "" && !/^Player\d+$/.test(name.trim())) &&
    !pars.every(v => v === 4) &&
    filledHoles >= 3;

  // 保存済みスナップショット（一致 = 保存済み = ポップアップ不要）
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const currentSnapshot = useMemo(() =>
    JSON.stringify({ courseName, names, scores, opts, mode, teamMode, frontLabel, backLabel }),
    [courseName, names, scores, opts, mode, teamMode, frontLabel, backLabel]
  );
  const isDirty = savedSnapshot !== currentSnapshot;

  const [saving, setSaving] = useState(false);

  function generateShareToken(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }

  // 再発行時は同一session_id・同一roleの既存コードを削除してから新規作成
  async function issueViewCodeForViewing() {
    if (!viewingSessionId) return;
    const { data: existing } = await supabase
      .from("share_tokens").select("token").eq("session_id", viewingSessionId).eq("role", "view").maybeSingle();
    if (existing && !window.confirm("前回のコードは使用不可になります。再発行しますか？")) return;
    await supabase.from("share_tokens").delete().eq("session_id", viewingSessionId).eq("role", "view");
    const token = generateShareToken();
    const { error } = await supabase.from("share_tokens").insert({ token, session_id: viewingSessionId, role: "view" });
    if (error) { alert(`コード発行に失敗しました: ${error.message}`); return; }
    setViewCode(token);
  }

  async function issueCode(role: "view") {
    if (!canSave || isDirty) return;
    const { data: existing } = await supabase
      .from("share_tokens").select("token").eq("session_id", sessionId).eq("role", role).maybeSingle();
    if (existing && !window.confirm("前回のコードは使用不可になります。再発行しますか？")) return;
    await supabase.from("share_tokens").delete().eq("session_id", sessionId).eq("role", role);
    const token = generateShareToken();
    const { error } = await supabase.from("share_tokens").insert({ token, session_id: sessionId, role });
    if (error) { alert(`コード発行に失敗しました: ${error.message}`); return; }
    setViewCode(token);
  }

  async function issuePlayerCode(playerIndex: number) {
    if (!canSave || isDirty) return;
    const { data: existing } = await supabase
      .from("share_tokens").select("token")
      .eq("session_id", sessionId).eq("role", "join").eq("player_index", playerIndex)
      .maybeSingle();
    if (existing && !window.confirm("前回のコードは使用不可になります。再発行しますか？")) return;
    await supabase.from("share_tokens").delete()
      .eq("session_id", sessionId).eq("role", "join").eq("player_index", playerIndex);
    const token = generateShareToken();
    const expiresAt = new Date(Date.now() + 16 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("share_tokens").insert({
      token, session_id: sessionId, role: "join", player_index: playerIndex, expires_at: expiresAt,
    });
    if (error) { alert(`コード発行に失敗しました: ${error.message}`); return; }
    setPlayerTokens(prev => prev.map((t, i) => i === playerIndex ? token : t));
    setPlayerTokenExpiresAt(prev => prev.map((t, i) => i === playerIndex ? expiresAt : t));
  }

  async function deletePlayerCode(playerIndex: number) {
    await supabase.from("share_tokens").delete()
      .eq("session_id", sessionId).eq("role", "join").eq("player_index", playerIndex);
    setPlayerTokens(prev => prev.map((t, i) => i === playerIndex ? null : t));
    setPlayerTokenExpiresAt(prev => prev.map((t, i) => i === playerIndex ? null : t));
  }

  async function openByShareCode() {
    const rawInput = shareInput.trim();

    // 開発者マスターコード
    if (rawInput.toLowerCase() === "wanida") {
      const { data } = await supabase
        .from("sessions")
        .select("id, course_name, mode, updated_at, names, device_id")
        .order("updated_at", { ascending: false })
        .limit(500);
      setAdminSessionList(data ?? []);
      setIsAdminMode(true);
      setShowHistory(true);
      setShareInput("");
      return;
    }

    const token = rawInput.toUpperCase();
    if (token.length !== 6) return;
    const { data: tokenData, error: tokenError } = await supabase
      .from("share_tokens").select("session_id, role, expires_at").eq("token", token).single();
    if (tokenError || !tokenData) {
      alert(tokenError ? `エラー: ${tokenError.message}` : "コードが見つかりません");
      return;
    }
    if (tokenData.role === "join" && tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
      alert("このコードは有効期限が切れています。再発行してもらってください。");
      return;
    }
    const { data } = await supabase.from("sessions").select("*").eq("id", tokenData.session_id).single();
    if (!data) return;
    const snap = JSON.stringify({
      courseName: data.course_name ?? "",
      names: data.names, scores: data.scores,
      opts: data.opts, mode: data.mode, teamMode: data.team_mode,
    });
    setMode(data.mode as 3 | 4);
    setCourseName(data.course_name ?? "");
    setCourseNameValid(!!data.course_name);
    setNames(data.names);
    setPars(data.pars);
    setScores(data.scores);
    setOpts(data.opts);
    setTeamMode(data.team_mode);
    setFrontLabel(data.front_label ?? "");
    setBackLabel(data.back_label ?? "");
    setSessionDisplayDate(formatDate(data.updated_at));
    setSavedSnapshot(snap);
    if (tokenData.role === "join") {
      localStorage.setItem("golf_session_id", tokenData.session_id);
      setSessionId(tokenData.session_id);
      setIsParticipant(true);
      setIsSharedView(false);
    } else {
      setIsSharedView(true);
      setIsParticipant(false);
    }
    setLocalOpts(null);
    setLocalTeamMode(null);
    setShareInput("");
    setShowHistory(false);

    // アクセスログを記録（best-effort）
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json").catch(() => null);
      const ip = ipRes ? (await ipRes.json()).ip : null;
      await supabase.from("share_access_logs").insert({
        session_id: tokenData.session_id,
        token,
        role: tokenData.role,
        device_id: getDeviceId(),
        ip_address: ip,
      });
    } catch (_) { /* best-effort */ }
  }

  async function handleSaveAndView() {
    await saveSession();
    setViewingSessionId(sessionId);
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
      front_label: frontLabel,
      back_label: backLabel,
    });
    setSavedSnapshot(currentSnapshot);
    setSaving(false);

    // course_sections へ par データを投稿（best-effort）
    if (courseName.trim()) {
      try {
        // courses: 同名コースがなければ insert（あれば select）
        let { data: course } = await supabase
          .from("courses").select("id").ilike("name", courseName.trim()).maybeSingle();
        if (!course) {
          const res = await supabase
            .from("courses").insert({ name: courseName.trim() }).select("id").single();
          course = res.data;
        }
        if (course) {
          const deviceId = getDeviceId();
          const isAllFour = (p: number[]) => p.every(v => v === 4);
          const submissions = [];
          const frontPars = pars.slice(0, 9);
          const backPars  = pars.slice(9, 18);
          if (frontLabel && !isAllFour(frontPars)) submissions.push({ course_id: course.id, label: frontLabel, pars: frontPars, device_id: deviceId });
          if (backLabel  && !isAllFour(backPars))  submissions.push({ course_id: course.id, label: backLabel,  pars: backPars,  device_id: deviceId });
          for (const s of submissions) {
            await supabase.from("course_sections").upsert(s, { onConflict: "course_id,label,device_id" });
          }
        }
      } catch (_) { /* best-effort */ }
    }
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
        {/* ハンバーガーメニュー */}
        <button style={{
          position: "absolute", top: 14, right: 12,
          background: "transparent", border: "none",
          color: GOLD, fontSize: 20, cursor: "pointer",
          lineHeight: 1, padding: "2px 4px",
        }}>☰</button>
        {/* セパレーター */}
        <div style={{ borderTop: "1px solid #2a4a2a", marginTop: 10 }} />
        {/* コントロール行: 新ゲーム | セグメント人数切替 | 履歴 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, padding: "0 4px" }}>
          <button
            onClick={handleNewSession}
            disabled={!hasAnyInput}
            style={{
              padding: "4px 10px", borderRadius: 12,
              border: `1px solid ${hasAnyInput ? "#4a6a4a" : "#2a3a2a"}`,
              background: "transparent",
              color: hasAnyInput ? "#6b8b6b" : "#2a3a2a",
              fontSize: 10, cursor: hasAnyInput ? "pointer" : "default",
            }}>新ゲーム</button>
          {isParticipant ? (
            <div style={{
              padding: "3px 14px", borderRadius: 6,
              border: `1px solid ${GOLD}`,
              background: "#2a1f00", color: GOLD,
              fontSize: 12, fontWeight: "bold",
            }}>{mode}人</div>
          ) : (
            <div style={{ display: "inline-flex", border: "1px solid #2a4a2a", borderRadius: 8, overflow: "hidden", opacity: isReadOnly ? 0.5 : 1 }}>
              {([3, 4] as const).map((m, i) => (
                <button key={m} onClick={() => !isReadOnly && handleModeChange(m)} style={{
                  padding: "3px 16px",
                  border: "none",
                  borderRight: i === 0 ? "1px solid #2a4a2a" : "none",
                  background: mode === m ? "#2a1f00" : "transparent",
                  color: mode === m ? GOLD : "#6b8b6b",
                  fontSize: 12, cursor: isReadOnly ? "default" : "pointer",
                  fontWeight: mode === m ? "bold" : "normal",
                }}>{m}人</button>
              ))}
            </div>
          )}
          <button onClick={toggleHistory} style={{
            padding: "4px 10px", borderRadius: 12,
            border: `1px solid ${showHistory ? GOLD : "#2a4a2a"}`,
            background: showHistory ? "#2a1f00" : "transparent",
            color: showHistory ? GOLD : "#6b8b6b",
            fontSize: 10, cursor: "pointer",
          }}>履歴</button>
        </div>
      </div>

      {/* バナー */}
      {(isViewing || isSharedView || isParticipant) && (
        <div style={{
          background: isParticipant ? "#0a1a2a" : "#1a1000",
          borderBottom: `1px solid ${isParticipant ? "#2a4a6a" : GOLD}`,
          padding: "8px 16px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
          flexWrap: "wrap",
        }}>
          <span style={{
            fontSize: 11, color: isParticipant ? "#4a9bdb" : GOLD, letterSpacing: 1,
          }}>
            {isSharedView
              ? "共有された記録を閲覧中（編集不可）"
              : isParticipant
              ? "参加中 — スコア入力のみ可（ゴルフ場・プレイヤー名・設定はオーナーが管理）"
              : "過去の記録を閲覧中"}
          </span>
          {isViewing && !isSharedView && (
            <>
              <button onClick={issueViewCodeForViewing} style={{
                padding: "5px 14px", borderRadius: 20,
                border: "1px solid #2a4a6a",
                background: "transparent", color: "#4a7a9b",
                fontSize: 11, cursor: "pointer", letterSpacing: 0.5,
                whiteSpace: "nowrap",
              }}>
                閲覧コードを発行
              </button>
              <button onClick={handleContinueSession} style={{
                padding: "5px 20px", borderRadius: 20,
                border: `1.5px solid ${GOLD}`,
                background: GOLD, color: "#1a1000",
                fontSize: 12, cursor: "pointer", fontWeight: "bold", letterSpacing: 0.5,
                whiteSpace: "nowrap",
              }}>
                このゲームを続ける
              </button>
            </>
          )}
          {isViewing && !isSharedView && viewCode && (
            <div style={{ width: "100%", textAlign: "center", marginTop: 4 }}>
              <span style={{ fontSize: 9, color: "#4a7a9b", letterSpacing: 1 }}>閲覧コード: </span>
              <span style={{ fontSize: 18, fontWeight: "bold", letterSpacing: 6, color: "#f5f0e8" }}>{viewCode}</span>
            </div>
          )}
          {isViewing && !isSharedView && accessLogs.length > 0 && (() => {
            const uniqueDevices = new Set(accessLogs.map(l => l.device_id)).size;
            const last = accessLogs[0];
            return (
              <div style={{ width: "100%", marginTop: 6, padding: "6px 12px", background: "#080f08", borderRadius: 8, border: "1px solid #1a3a1a" }}>
                <div style={{ fontSize: 9, color: "#6b8b6b", letterSpacing: 1, marginBottom: 3 }}>アクセス状況（オーナーのみ表示）</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "#c8d8c8" }}>総アクセス: <b style={{ color: GOLD }}>{accessLogs.length}</b> 回</span>
                  <span style={{ fontSize: 11, color: "#c8d8c8" }}>ユニーク: <b style={{ color: GOLD }}>{uniqueDevices}</b> 人</span>
                </div>
                <div style={{ fontSize: 9, color: "#4a6a4a", marginTop: 3 }}>
                  最終アクセス: {new Date(last.accessed_at).toLocaleString("ja-JP", JST)}
                </div>
              </div>
            );
          })()}
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
          {isAdminMode && (
            <div style={{ padding: "6px 16px", background: "#1a0a00", borderBottom: "1px solid #4a2a00" }}>
              <span style={{ fontSize: 9, color: "#c0602a", letterSpacing: 1 }}>
                DEV MODE — 全ユーザー全履歴 ({adminSessionList.length}件)
              </span>
            </div>
          )}
          {(isAdminMode ? adminSessionList : historyList).length === 0 ? (
            <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: "#4a6a4a" }}>記録なし</div>
          ) : (isAdminMode ? adminSessionList : historyList).map(s => (
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
                  {isAdminMode && <span style={{ color: "#6a4a2a", marginLeft: 4 }}>device: {(s as any).device_id?.slice(0, 8)}</span>}
                </div>
              </div>
              <div style={{ fontSize: 9, color: "#6b8b6b", flexShrink: 0 }}>
                {s.names.slice(0, s.mode).join(" / ")}
              </div>
              {!isAdminMode && (
                <button
                  onClick={(e) => deleteSessionById(s.id, e)}
                  style={{
                    flexShrink: 0, padding: "3px 7px", borderRadius: 4,
                    border: "1px solid #3a2a2a", background: "transparent",
                    color: "#6a4a4a", fontSize: 13, cursor: "pointer", lineHeight: 1,
                  }}
                >×</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "12px 8px" }}>
        {/* Course name */}
        <div style={{ background: "#0f1f0f", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #2a4a2a" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: GOLD, marginBottom: 6 }}>GOLF COURSE</div>
          <div style={{ position: "relative", marginBottom: 4 }}>
            <input
              value={courseName}
              onChange={e => { setCourseName(e.target.value); setCourseNameValid(false); }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onFocus={() => { if (courseSuggestions.length > 0) setShowSuggestions(true); }}
              placeholder="ゴルフ場名を検索"
              disabled={isSettingsLocked}
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "6px 8px", textAlign: "left",
                background: "#1a2e1a",
                border: `1px solid ${courseName && !courseNameValid ? RED : courseNameValid ? GOLD : "#2a4a2a"}`,
                borderRadius: 6, color: isSettingsLocked ? "#6b8b6b" : "#f5f0e8", fontSize: 13, outline: "none",
                opacity: isSettingsLocked ? 0.7 : 1,
              }}
            />
            {showSuggestions && courseSuggestions.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0,
                background: "#0f1f0f", border: `1px solid ${GOLD}`,
                borderRadius: 6, zIndex: 100, maxHeight: 200, overflowY: "auto",
                boxShadow: "0 4px 12px rgba(0,0,0,0.6)", marginTop: 2,
              }}>
                {courseSuggestions.map(name => (
                  <div
                    key={name}
                    onMouseDown={() => { setCourseName(name); setCourseNameValid(true); setShowSuggestions(false); }}
                    style={{
                      padding: "8px 10px", fontSize: 12, cursor: "pointer",
                      borderBottom: "1px solid #1a3a1a", color: "#f5f0e8",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#1a3a1a")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >{name}</div>
                ))}
              </div>
            )}
          </div>
          {courseName && !courseNameValid && !isReadOnly && (
            <div style={{ fontSize: 9, color: RED, marginBottom: 4 }}>登録されていないゴルフ場です</div>
          )}
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 10, color: "#6b8b6b" }}>{sessionDisplayDate}</span>
          </div>
          {/* 前半/後半ラベル */}
          <div style={{ marginTop: 8, borderTop: "1px solid #1a3a1a", paddingTop: 8, pointerEvents: isSettingsLocked ? "none" : "auto", opacity: isSettingsLocked ? 0.6 : 1 }}>
            {([["前半", frontLabel, setFrontLabel, 0], ["後半", backLabel, setBackLabel, 9]] as const).map(([half, label, setLabel, offset], idx) => (
              <div key={half} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: idx === 0 ? 5 : 0 }}>
                <span style={{ fontSize: 9, color: "#6a8a6a", minWidth: 26 }}>{half}</span>
                {(["In", "Out"] as const).map(v => (
                  <button key={v} onClick={() => {
                    const next = label === v ? "" : v;
                    setLabel(next);
                    if (next && courseNameValid && !isReadOnly) tryAutofillPars(next, offset);
                  }} style={{
                    padding: "3px 8px", borderRadius: 10, fontSize: 10,
                    border: `1px solid ${label === v ? GOLD : "#2a4a2a"}`,
                    background: label === v ? "#2a1f00" : "transparent",
                    color: label === v ? GOLD : "#6b8b6b",
                    cursor: "pointer",
                  }}>{v}</button>
                ))}
                <input
                  value={label === "In" || label === "Out" ? "" : label}
                  onChange={e => setLabel(e.target.value)}
                  onFocus={() => { if (label === "In" || label === "Out") setLabel(""); }}
                  onBlur={e => { if (e.target.value && courseNameValid && !isReadOnly) tryAutofillPars(e.target.value, offset); }}
                  placeholder="自由記載"
                  style={{
                    flex: 1, fontSize: 10, padding: "3px 6px", borderRadius: 6,
                    background: "#0a160a", border: "1px solid #2a4a2a",
                    color: "#f5f0e8", outline: "none",
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Player names */}
        <div style={{ background: "#0f1f0f", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #2a4a2a" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: GOLD, marginBottom: 4 }}>PLAYERS</div>
          <div style={{ fontSize: 8, color: "#5a7a5a", marginBottom: 6, letterSpacing: 0.5 }}>1H の打順に入力してください</div>
          <div style={{ display: "flex", gap: 6 }}>
            {(() => {
              const issuedCount = playerTokens.slice(0, n).filter(t => t !== null).length;
              const maxCodes = n - 1;
              return Array.from({ length: n }, (_, i) => {
                const token = playerTokens[i];
                const expiresAt = playerTokenExpiresAt[i];
                const canIssueCode = canSave && !isDirty && issuedCount < maxCodes;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
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
                    {!isParticipant && !isSharedView && !isViewing && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        {token ? (
                          <>
                            <div style={{ fontSize: 11, fontWeight: "bold", letterSpacing: 2, color: "#f5f0e8", textAlign: "center" }}>{token}</div>
                            {expiresAt && (
                              <div style={{ fontSize: 7, color: "#c0a030", textAlign: "center" }}>
                                {new Date(expiresAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", ...JST })}まで
                              </div>
                            )}
                            <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
                              <button
                                onClick={() => navigator.clipboard.writeText(token)}
                                style={{ padding: "2px 4px", fontSize: 8, borderRadius: 4, border: "1px solid #2a6a4a", background: "transparent", color: "#4a9b6b", cursor: "pointer" }}
                              >コピー</button>
                              <button
                                onClick={() => issuePlayerCode(i)}
                                style={{ padding: "2px 4px", fontSize: 8, borderRadius: 4, border: "1px solid #2a4a6a", background: "transparent", color: "#4a7a9b", cursor: "pointer" }}
                              >再発行</button>
                              <button
                                onClick={() => deletePlayerCode(i)}
                                style={{ padding: "2px 4px", fontSize: 8, borderRadius: 4, border: "1px solid #4a2a2a", background: "transparent", color: "#9b4a4a", cursor: "pointer" }}
                              >削除</button>
                            </div>
                          </>
                        ) : canIssueCode ? (
                          <button
                            onClick={() => issuePlayerCode(i)}
                            title={isDirty ? "保存してから発行できます" : !canSave ? "コース名・プレイヤー名を入力" : ""}
                            style={{
                              width: "100%", padding: "3px 0", fontSize: 8, borderRadius: 4,
                              border: "1px solid #2a6a4a",
                              background: "transparent", color: "#4a9b6b",
                              cursor: "pointer",
                            }}
                          >編集コード発行</button>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* 4人チーム分け */}
        <div style={{ background: "#0f1f0f", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #2a4a2a" }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: GOLD, marginBottom: 8 }}>チーム分け</div>
          {(isParticipant || isSharedView || isAdminMode) && (
            <div style={{ fontSize: 8, color: "#4a7a4a", marginBottom: 4, letterSpacing: 0.5 }}>※ この端末のみの表示設定（保存されません）</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: mode === 3 ? "1fr 1fr" : "1fr 1fr 1fr", gap: 5, alignItems: "stretch", pointerEvents: (isSettingsLocked && !isParticipant && !isSharedView && !isAdminMode) ? "none" : "auto", opacity: (isSettingsLocked && !isParticipant && !isSharedView && !isAdminMode) ? 0.6 : 1 }}>
            {(mode === 3 ? TEAM_MODES_3 : TEAM_MODES_4).map(({ id, label }) => {
              const active = displayTeamMode === id;
              let display = label;
              if (id === "fixed_1_23")  display = `固定\n${names[0]}\nvs\n${names[1]}&${names[2]}`;
              if (id === "fixed_2_13")  display = `固定\n${names[1]}\nvs\n${names[0]}&${names[2]}`;
              if (id === "fixed_3_12")  display = `固定\n${names[2]}\nvs\n${names[0]}&${names[1]}`;
              if (id === "fixed_12_34") display = `固定\n${names[0]}&${names[1]}\nvs\n${names[2]}&${names[3]}`;
              if (id === "fixed_13_24") display = `固定\n${names[0]}&${names[2]}\nvs\n${names[1]}&${names[3]}`;
              if (id === "fixed_14_23") display = `固定\n${names[0]}&${names[3]}\nvs\n${names[1]}&${names[2]}`;
              return (
                <button key={id} onClick={() => {
                  if (isParticipant || isSharedView || isAdminMode) setLocalTeamMode(id);
                  else setTeamMode(id);
                }} style={{
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, pointerEvents: (isSettingsLocked && !isParticipant && !isSharedView && !isAdminMode) ? "none" : "auto", opacity: (isSettingsLocked && !isParticipant && !isSharedView && !isAdminMode) ? 0.6 : 1 }}>
            {(isParticipant || isSharedView || isAdminMode) && (
              <div style={{ width: "100%", fontSize: 8, color: "#4a7a4a", marginBottom: 2, letterSpacing: 0.5 }}>※ この端末のみの表示設定（保存されません）</div>
            )}
            {([
              { k: "birdieReverse" as const, l: "バーディー逆転" },
              { k: "truncate" as const, l: "1の位切捨て" },
              { k: "carry" as const, l: "キャリー" },
              { k: "push" as const, l: "プッシュ" },
              { k: "olympic" as const, l: "オリンピック" },
            ]).map(({ k, l }) => (
              <button key={k} onClick={() => {
                if (isParticipant || isSharedView || isAdminMode) {
                  setLocalOpts(prev => ({ ...(prev ?? opts), [k]: !(prev ?? opts)[k] }));
                } else {
                  setOpts(o => ({ ...o, [k]: !o[k] }));
                }
              }} style={{
                padding: "4px 11px", borderRadius: 20,
                border: `1.5px solid ${displayOpts[k] ? GOLD : "#2a4a2a"}`,
                background: displayOpts[k] ? "#2a1f00" : "transparent",
                color: displayOpts[k] ? GOLD : "#6b8b6b",
                fontSize: 11, cursor: "pointer",
                fontWeight: displayOpts[k] ? "bold" : "normal",
              }}>{l}</button>
            ))}
            {displayOpts.olympic && (
              <div style={{ width: "100%", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4, paddingTop: 6, borderTop: "1px solid #1a3a1a" }}>
                <span style={{ fontSize: 8, color: "#6b8b6b" }}>
                  点数設定{(isParticipant || isSharedView || isAdminMode) ? "（この端末のみ）" : ""}:
                </span>
                {([
                  { key: "gold" as const, l: "金", color: "#f5c842" },
                  { key: "silver" as const, l: "銀", color: "#b0b8c0" },
                  { key: "bronze" as const, l: "銅", color: "#cd7f32" },
                  { key: "iron" as const, l: "鉄", color: "#7a8a9a" },
                ]).filter(({ l }) => !(n === 3 && l === "鉄")).map(({ key, l, color }) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <span style={{ fontSize: 9, color }}>{l}</span>
                    <input
                      type="number" min={0} max={99}
                      value={olympicPts[key]}
                      onChange={e => setOlympicPts(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                      style={{
                        width: 32, padding: "2px 3px", fontSize: 10, textAlign: "center",
                        background: "#1a2e1a", border: "1px solid #2a4a2a",
                        borderRadius: 4, color: "#f5f0e8", outline: "none",
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Score grid */}
        <div style={{ background: "#0f1f0f", borderRadius: 10, border: "1px solid #2a4a2a", overflow: "hidden", marginBottom: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: gridCols, background: "#0a160a", borderBottom: "1px solid #2a4a2a" }}>
            <div style={{ padding: "7px 2px", textAlign: "center", fontSize: 9, color: "#4a6a4a" }}>{frontLabel || "H"}</div>
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
              ? displayTeamMode === "fixed_1_23" ? 0
              : displayTeamMode === "fixed_2_13" ? 1
              : displayTeamMode === "fixed_3_12" ? 2
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
                    {displayOpts.push && (
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
                        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <div
                            onClick={() => { if (!isReadOnly) setActiveCell({ h, pi }); }}
                            style={{
                              flex: 1, boxSizing: "border-box",
                              padding: "7px 0", textAlign: "center",
                              background: activeCell?.h === h && activeCell?.pi === pi
                                ? "rgba(200,169,110,0.15)" : "transparent",
                              border: `1.5px solid ${
                                activeCell?.h === h && activeCell?.pi === pi ? GOLD
                                : isSolo ? "#3a2e00" : isTeamA ? "#2a2000" : "#1a3a2e"
                              }`,
                              borderRadius: 6,
                              fontSize: 17, fontWeight: "bold",
                              color: sc ? scoreColor : "#3a4a3a",
                              cursor: isReadOnly ? "default" : "pointer",
                              userSelect: "none",
                              minHeight: 32, display: "flex",
                              alignItems: "center", justifyContent: "center",
                              opacity: isReadOnly ? 0.8 : 1,
                            }}
                          >{sc || "·"}</div>
                          {displayOpts.olympic && (() => {
                            const olPt = calcOlympicHolePts(olympicMedals[h], n)[pi];
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "center" }}>
                                {([
                                  { m: "金", color: "#f5c842" },
                                  { m: "銀", color: "#b0b8c0" },
                                  { m: "銅", color: "#cd7f32" },
                                  { m: "鉄", color: "#7a8a9a" },
                                ]).filter(({ m }) => !(n === 3 && m === "鉄")).map(({ m, color }) => {
                                  const selected = olympicMedals[h][pi] === m;
                                  const takenByOther = !selected && olympicMedals[h].some((v, rp) => rp !== pi && v === m);
                                  return (
                                    <button
                                      key={m}
                                      disabled={takenByOther}
                                      onClick={() => {
                                        if (takenByOther) return;
                                        setOlympicMedals(prev => prev.map((row, rh) =>
                                          rh === h ? row.map((v, rp) => rp === pi ? (v === m ? null : m) : v) : row
                                        ));
                                      }}
                                      style={{
                                        padding: "1px 2px", fontSize: 7, lineHeight: 1,
                                        borderRadius: 3,
                                        border: `1px solid ${selected ? color : takenByOther ? "#1a2a1a" : "#2a4a2a"}`,
                                        background: selected ? color + "33" : "transparent",
                                        color: selected ? color : takenByOther ? "#2a3a2a" : "#3a5a3a",
                                        cursor: takenByOther ? "default" : "pointer",
                                        fontWeight: selected ? "bold" : "normal",
                                        minWidth: 14,
                                        opacity: takenByOther ? 0.35 : 1,
                                      }}
                                    >{m}</button>
                                  );
                                })}
                                {olPt !== 0 && (
                                  <span style={{
                                    fontSize: 8, fontWeight: "bold", lineHeight: 1, marginTop: 1,
                                    color: olPt > 0 ? "#f5c842" : RED,
                                  }}>
                                    {olPt > 0 ? `+${olPt}` : olPt}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
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

              {/* 後半小計（18H後） */}
              {h === 17 && (
                <>
                  <div style={{
                    display: "grid", gridTemplateColumns: gridCols,
                    background: "#0a1a0a", borderTop: `1px solid ${GOLD}`,
                    borderBottom: displayOpts.olympic ? "1px solid #2a3a1a" : `2px solid ${GOLD}`,
                  }}>
                    <div style={{ padding: "5px 2px", textAlign: "center", fontSize: 8, color: GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 1 }}>
                      <span style={{ fontSize: 7 }}>{backLabel || "後半"}</span>
                      <span>計</span>
                    </div>
                    {Array.from({ length: n }, (_, pi) => {
                      const pt = backTotals[pi];
                      const gs = grossBack[pi];
                      return (
                        <div key={pi} style={{
                          ...cell, padding: "5px 3px", textAlign: "center",
                          fontSize: 13, fontWeight: "bold",
                          color: pt > 0 ? GOLD : pt < 0 ? RED : DIM,
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
                        }}>
                          <span>{pt > 0 ? `+${pt}` : pt === 0 ? "-" : pt}</span>
                          {gs > 0 && <span style={{ fontSize: 8, color: "#f5f0e8", fontWeight: "normal", lineHeight: 1 }}>{gs}</span>}
                        </div>
                      );
                    })}
                  </div>
                  {displayOpts.olympic && (
                    <div style={{
                      display: "grid", gridTemplateColumns: gridCols,
                      background: "#090f09", borderBottom: `2px solid ${GOLD}`,
                    }}>
                      <div style={{ padding: "3px 2px", textAlign: "center", fontSize: 7, color: "#5a4a1a", display: "flex", alignItems: "center", justifyContent: "center" }}>OL計</div>
                      {Array.from({ length: n }, (_, pi) => {
                        const pt = olympicBack[pi];
                        return (
                          <div key={pi} style={{
                            ...cell, padding: "3px 3px", textAlign: "center",
                            fontSize: 11, fontWeight: "bold",
                            color: pt > 0 ? "#f5c842" : DIM,
                          }}>
                            {pt > 0 ? `+${pt}` : "-"}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ハーフ小計（9H後） */}
              {h === 8 && (
                <>
                  <div style={{
                    display: "grid", gridTemplateColumns: gridCols,
                    background: "#0a1a0a", borderTop: `1px solid ${GOLD}`,
                    borderBottom: displayOpts.olympic ? "1px solid #2a3a1a" : `2px solid ${GOLD}`,
                  }}>
                    <div style={{ padding: "5px 2px", textAlign: "center", fontSize: 8, color: GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 1 }}>
                      <span style={{ fontSize: 7 }}>{frontLabel || "前半"}</span>
                      <span>計</span>
                    </div>
                    {Array.from({ length: n }, (_, pi) => {
                      const pt = halfTotals[pi];
                      const gs = grossHalf[pi];
                      return (
                        <div key={pi} style={{
                          ...cell, padding: "5px 3px", textAlign: "center",
                          fontSize: 13, fontWeight: "bold",
                          color: pt > 0 ? GOLD : pt < 0 ? RED : DIM,
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
                        }}>
                          <span>{pt > 0 ? `+${pt}` : pt === 0 ? "-" : pt}</span>
                          {gs > 0 && <span style={{ fontSize: 8, color: "#f5f0e8", fontWeight: "normal", lineHeight: 1 }}>{gs}</span>}
                        </div>
                      );
                    })}
                  </div>
                  {displayOpts.olympic && (
                    <div style={{
                      display: "grid", gridTemplateColumns: gridCols,
                      background: "#090f09", borderBottom: `2px solid ${GOLD}`,
                    }}>
                      <div style={{ padding: "3px 2px", textAlign: "center", fontSize: 7, color: "#5a4a1a", display: "flex", alignItems: "center", justifyContent: "center" }}>OL計</div>
                      {Array.from({ length: n }, (_, pi) => {
                        const pt = olympicHalf[pi];
                        return (
                          <div key={pi} style={{
                            ...cell, padding: "3px 3px", textAlign: "center",
                            fontSize: 11, fontWeight: "bold",
                            color: pt > 0 ? "#f5c842" : DIM,
                          }}>
                            {pt > 0 ? `+${pt}` : "-"}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              {h === 8 && backLabel && (
                <div style={{
                  display: "grid", gridTemplateColumns: gridCols,
                  background: "#0a160a", borderBottom: "1px solid #2a4a2a",
                }}>
                  <div style={{ padding: "4px 2px", textAlign: "center", fontSize: 9, color: "#4a6a4a" }}>{backLabel}</div>
                  {Array.from({ length: n }, (_, i) => (
                    <div key={i} style={{ borderLeft: "1px solid #2a4a2a" }} />
                  ))}
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
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                  <span style={{
                    fontSize: 20, fontWeight: "bold",
                    color: totals[pi] > 0 ? GOLD : totals[pi] < 0 ? RED : DIM,
                  }}>
                    {totals[pi] > 0 ? `+${totals[pi]}` : totals[pi]}
                  </span>
                  {grossTotals[pi] > 0 && (
                    <span style={{ fontSize: 11, color: "#f5f0e8", fontWeight: "normal" }}>({grossTotals[pi]})</span>
                  )}
                </span>
                {displayOpts.olympic && olympicTotals[pi] > 0 && (
                  <span style={{ fontSize: 12, fontWeight: "bold", color: "#f5c842" }}>
                    OL +{olympicTotals[pi]}
                  </span>
                )}
              </div>
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
            ? `3人版：単独はペア各人と個別決済（方法A）• ${(TEAM_MODES_3.find(t => t.id === displayTeamMode) ?? TEAM_MODES_3[0]).label.replace(/\n/g, " ")}`
            : `4人版：${(TEAM_MODES_4.find(t => t.id === displayTeamMode) ?? TEAM_MODES_4[0]).label.replace(/\n/g, " ")}`}
        </div>

        {/* 通常モード: 保存ボタン + 招待 + 共有コード */}
        {!isViewing && !isSharedView && (
          <div style={{ marginTop: 16, marginBottom: 24, textAlign: "center" }}>
            <button
              onClick={handleSaveAndView}
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
            {/* 閲覧コード発行はオーナーのみ表示 */}
            {!isParticipant && (() => {
              const enabled = canSave && !isDirty;
              const tip = isDirty ? "保存してから発行できます" : !canSave ? "コース名・プレイヤー名を入力してください" : "";
              return (
                <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => issueCode("view")}
                    disabled={!enabled}
                    title={tip}
                    style={{
                      padding: "6px 16px", borderRadius: 20,
                      border: `1px solid ${enabled ? "#2a4a6a" : "#1a2a1a"}`,
                      background: "transparent",
                      color: enabled ? "#4a7a9b" : "#2a3a2a",
                      fontSize: 11, cursor: enabled ? "pointer" : "default", letterSpacing: 1,
                      opacity: enabled ? 1 : 0.4,
                    }}
                  >
                    閲覧コードを発行
                  </button>
                </div>
              );
            })()}
            {viewCode && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <div style={{ padding: "10px 16px", background: "#0a160a", borderRadius: 10, border: "1px solid #2a4a6a", display: "inline-block" }}>
                  <div style={{ fontSize: 9, color: "#4a7a9b", letterSpacing: 2, marginBottom: 4 }}>閲覧コード（読み取り専用）</div>
                  <div style={{ fontSize: 26, fontWeight: "bold", letterSpacing: 8, color: "#f5f0e8" }}>{viewCode}</div>
                  <div style={{ fontSize: 9, color: "#4a6a4a", marginTop: 4 }}>再発行すると旧コードは無効になります</div>
                </div>
              </div>
            )}
            {accessLogs.length > 0 && !isParticipant && !isSharedView && (() => {
              const uniqueDevices = new Set(accessLogs.map(l => l.device_id)).size;
              const last = accessLogs[0];
              return (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "#080f08", borderRadius: 8, border: "1px solid #1a3a1a" }}>
                  <div style={{ fontSize: 9, color: "#6b8b6b", letterSpacing: 1, marginBottom: 4 }}>アクセス状況（オーナーのみ表示）</div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "#c8d8c8" }}>
                      総アクセス: <b style={{ color: GOLD }}>{accessLogs.length}</b> 回
                    </span>
                    <span style={{ fontSize: 11, color: "#c8d8c8" }}>
                      ユニーク: <b style={{ color: GOLD }}>{uniqueDevices}</b> 人
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: "#4a6a4a", marginTop: 4 }}>
                    最終アクセス: {new Date(last.accessed_at).toLocaleString("ja-JP", JST)}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* テンキー */}
      {activeCell && !isReadOnly && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: "#0f1f0f", borderTop: `2px solid ${GOLD}`,
          padding: "8px 12px 12px", zIndex: 300,
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6,
          maxWidth: 520, margin: "0 auto",
        }}>
          {["1","2","3","4","5","6","7","8","9","✕","0","⌫"].map(key => (
            <button
              key={key}
              onPointerDown={e => { e.preventDefault(); if (key === "✕") { setActiveCell(null); } else { handleNumpad(key); } }}
              style={{
                padding: "14px 0", borderRadius: 8, fontSize: 20, fontWeight: "bold",
                cursor: "pointer", userSelect: "none",
                background: key === "✕" ? "#1a0a0a" : "#1a2e1a",
                border: `1px solid ${key === "✕" ? RED : "#2a4a2a"}`,
                color: key === "✕" ? RED : key === "⌫" ? GOLD : "#f5f0e8",
              }}
            >{key}</button>
          ))}
        </div>
      )}
    </div>
  );
}

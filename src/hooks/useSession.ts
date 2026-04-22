import { useState } from "react";
import { supabase } from "../lib/supabase";

export interface SessionSummary {
  id: string;
  course_name: string;
  updated_at: string;
  names: string[];
  totals: number[];
  mode: number;
}

export function useSession(userId: string | undefined) {
  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState<SessionSummary[]>([]);

  async function fetchHistory() {
    if (!userId) return;
    const { data } = await supabase
      .from("sessions")
      .select("id, course_name, updated_at, names, totals, mode")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(30);
    setHistoryList((data ?? []) as SessionSummary[]);
  }

  function toggleHistory() {
    if (!showHistory) fetchHistory();
    setShowHistory(v => !v);
  }

  return {
    showHistory,
    setShowHistory,
    toggleHistory,
    historyList,
    fetchHistory,
  };
}

import { useState } from "react";
import { supabase } from "../lib/supabase";
import { getDeviceId } from "../lib/session";

export interface SessionSummary {
  id: string;
  course_name: string;
  updated_at: string;
  names: string[];
  totals: number[];
  mode: number;
}

export function useSession() {
  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState<SessionSummary[]>([]);

  async function fetchHistory() {
    const deviceId = getDeviceId();
    const { data } = await supabase
      .from("sessions")
      .select("id, course_name, updated_at, names, totals, mode")
      .eq("device_id", deviceId)
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
  };
}

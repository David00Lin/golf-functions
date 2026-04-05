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

const TODAY = new Date().toISOString().slice(0, 10);

export function useSession() {
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState<SessionSummary[]>([]);

  function checkAndSetReadOnly(updatedAt: string) {
    setIsReadOnly(updatedAt.slice(0, 10) !== TODAY);
  }

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
    isReadOnly,
    enableEdit: () => setIsReadOnly(false),
    showHistory,
    setShowHistory,
    toggleHistory,
    historyList,
    checkAndSetReadOnly,
  };
}

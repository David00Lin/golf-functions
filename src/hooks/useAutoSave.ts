import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { getDeviceId, getSessionId } from "../lib/session";
import type { Opts } from "../types";

interface SavePayload {
  mode: number;
  teamMode: string;
  courseName: string;
  names: string[];
  pars: number[];
  scores: string[][];
  opts: Opts;
  totals: number[];
  isReadOnly: boolean;
}

export function useAutoSave(payload: SavePayload) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    if (payload.isReadOnly) return;

    timer.current = setTimeout(async () => {
      const sessionId = getSessionId();
      const deviceId = getDeviceId();

      await supabase.from("sessions").upsert({
        id: sessionId,
        device_id: deviceId,
        updated_at: new Date().toISOString(),
        mode: payload.mode,
        team_mode: payload.teamMode,
        course_name: payload.courseName,
        names: payload.names,
        pars: payload.pars,
        scores: payload.scores,
        opts: payload.opts,
        totals: payload.totals,
      });
    }, 1000);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [
    payload.isReadOnly,
    payload.mode,
    payload.teamMode,
    payload.courseName,
    JSON.stringify(payload.names),
    JSON.stringify(payload.pars),
    JSON.stringify(payload.scores),
    JSON.stringify(payload.opts),
    JSON.stringify(payload.totals),
  ]);
}

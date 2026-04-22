import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setSession(session);
        if (event === "INITIAL_SESSION") {
          if (session) {
            setLoading(false);
          } else {
            supabase.auth.signInAnonymously().then(({ data }) => {
              setUser(data.user);
              setSession(data.session);
              setLoading(false);
            });
          }
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  const isAnonymous = user?.is_anonymous ?? true;

  async function linkWithGoogle() {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession) {
      await signInWithGoogle();
      return;
    }
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) await signInWithGoogle();
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    const { data } = await supabase.auth.signInAnonymously();
    setUser(data.user);
    setSession(data.session);
  }

  return { user, session, loading, isAnonymous, linkWithGoogle, signOut };
}

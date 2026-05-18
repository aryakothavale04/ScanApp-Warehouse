"use client";

import { LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { api, getStoredAccessCode, setStoredAccessCode } from "@/src/lib/api";

export default function AccessCodeGate({ children }) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedCode = getStoredAccessCode();
    setUnlocked(Boolean(storedCode));
    setChecking(false);

    function lockApp() {
      setUnlocked(false);
      setCode("");
      setError("Enter access code again.");
    }

    window.addEventListener("scanapp-auth-required", lockApp);
    return () => window.removeEventListener("scanapp-auth-required", lockApp);
  }, []);

  async function unlock(event) {
    event.preventDefault();
    const nextCode = code.trim();
    if (!nextCode) {
      setError("Enter access code.");
      return;
    }

    setChecking(true);
    setError("");
    setStoredAccessCode(nextCode);
    try {
      await api.orders();
      setUnlocked(true);
      setCode("");
    } catch {
      setError("Wrong access code.");
      setUnlocked(false);
    } finally {
      setChecking(false);
    }
  }

  if (checking && !unlocked) {
    return (
      <main className="grid min-h-screen place-items-center bg-limewash px-4 dark:bg-[#101714]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-leaf/20 border-t-leaf" />
      </main>
    );
  }

  if (unlocked) return children;

  return (
    <main className="grid min-h-screen place-items-center bg-limewash px-4 dark:bg-[#101714]">
      <form onSubmit={unlock} className="w-full max-w-xs rounded-lg bg-white p-4 shadow-soft dark:bg-[#151f1a]">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-leaf/10 text-leaf">
            <LockKeyhole size={19} />
          </div>
          <div>
            <p className="text-base font-black">Access Code</p>
            <p className="text-xs text-black/55 dark:text-white/55">Enter code to open app.</p>
          </div>
        </div>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode="numeric"
          autoFocus
          className="w-full rounded-lg border border-black/10 bg-white px-3 py-3 text-center text-xl font-black tracking-[0.3em] outline-none focus:border-leaf dark:bg-[#101712]"
          placeholder="Code"
        />
        {error && <p className="mt-2 text-center text-xs font-bold text-red-700 dark:text-red-300">{error}</p>}
        <button
          type="submit"
          disabled={checking}
          className="mt-4 min-h-11 w-full rounded-lg bg-leaf px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {checking ? "Checking..." : "Open App"}
        </button>
      </form>
    </main>
  );
}

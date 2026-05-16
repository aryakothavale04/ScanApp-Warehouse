"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "@/src/lib/api";

const RETRY_DELAY_MS = 5000;
const UNAVAILABLE_AFTER_MS = 60000;
const HEALTH_TIMEOUT_MS = 8000;

export function useBackendStatus() {
  const startedAtRef = useRef(null);
  const retryTimerRef = useRef(null);
  const isMountedRef = useRef(false);
  const [state, setState] = useState({
    status: "checking",
    elapsedMs: 0,
    message: null
  });

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const checkBackend = useCallback(async () => {
    if (!startedAtRef.current) {
      startedAtRef.current = Date.now();
    }

    const elapsedMs = Date.now() - startedAtRef.current;
    const nextPendingStatus = elapsedMs >= UNAVAILABLE_AFTER_MS ? "offline" : "waking";

    setState((current) => ({
      status: current.status === "checking" ? "checking" : nextPendingStatus,
      elapsedMs,
      message: current.message
    }));

    if (!API_URL) {
      setState({
        status: "offline",
        elapsedMs,
        message: "NEXT_PUBLIC_API_URL is not configured"
      });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_URL}/api/health`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }

      if (!isMountedRef.current) return;

      clearRetryTimer();
      setState({
        status: "online",
        elapsedMs: Date.now() - startedAtRef.current,
        message: null
      });
    } catch (error) {
      if (!isMountedRef.current) return;

      const nextElapsedMs = Date.now() - startedAtRef.current;
      setState({
        status: nextElapsedMs >= UNAVAILABLE_AFTER_MS ? "offline" : "waking",
        elapsedMs: nextElapsedMs,
        message: error.name === "AbortError" ? "Health check timed out" : error.message
      });

      clearRetryTimer();
      retryTimerRef.current = setTimeout(checkBackend, RETRY_DELAY_MS);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [clearRetryTimer]);

  useEffect(() => {
    isMountedRef.current = true;
    startedAtRef.current = Date.now();
    checkBackend();

    return () => {
      isMountedRef.current = false;
      clearRetryTimer();
    };
  }, [checkBackend, clearRetryTimer]);

  const progress = Math.min(100, Math.round((state.elapsedMs / UNAVAILABLE_AFTER_MS) * 100));

  return {
    ...state,
    progress,
    isChecking: state.status === "checking",
    isWaking: state.status === "waking",
    isOnline: state.status === "online",
    isOffline: state.status === "offline"
  };
}

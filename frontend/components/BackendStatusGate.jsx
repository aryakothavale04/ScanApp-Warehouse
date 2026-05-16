"use client";

import BackendWakeLoader from "@/components/BackendWakeLoader";
import { useBackendStatus } from "@/hooks/useBackendStatus";

export default function BackendStatusGate({ children }) {
  const backend = useBackendStatus();

  if (!backend.isOnline) {
    return <BackendWakeLoader status={backend.status} progress={backend.progress} />;
  }

  return children;
}

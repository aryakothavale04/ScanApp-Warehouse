"use client";

import { ServerCrash } from "lucide-react";
import FooterCredit from "./FooterCredit";

export default function BackendWakeLoader({ status = "checking", progress = 0 }) {
  const isOffline = status === "offline";
  const title = isOffline ? "Server is currently unavailable" : "Waking up server...";
  const subtitle = isOffline
    ? "Please try again shortly. We will keep checking in the background."
    : "Free server may take 30-60 seconds to start";

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f8f3] px-4 py-8 text-[#17201b] dark:bg-[#101714] dark:text-[#eef7ec]">
      <div className="w-full max-w-md">
        <section className="rounded-lg border border-black/10 bg-white p-6 shadow-soft dark:border-white/10 dark:bg-[#151f1a] sm:p-8">
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-lg bg-leaf/10 text-leaf">
            {isOffline ? (
              <ServerCrash size={30} />
            ) : (
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-leaf/20 border-t-leaf" />
            )}
          </div>

          <div className="text-center">
            <p className="text-xl font-black sm:text-2xl">{title}</p>
            <p className="mt-2 text-sm leading-6 text-black/60 dark:text-white/60">{subtitle}</p>
          </div>

          <div className="mt-6 overflow-hidden rounded-full bg-black/10 dark:bg-white/10" aria-label="Backend wake progress">
            <div
              className="h-2 rounded-full bg-leaf transition-all duration-700 ease-out"
              style={{ width: `${Math.max(progress, isOffline ? 100 : 8)}%` }}
            />
          </div>

          {!isOffline && (
            <div className="mt-4 flex justify-center gap-1.5" aria-hidden="true">
              {[0, 1, 2].map((item) => (
                <span
                  key={item}
                  className="h-2 w-2 animate-pulse rounded-full bg-leaf"
                  style={{ animationDelay: `${item * 180}ms` }}
                />
              ))}
            </div>
          )}
        </section>
        <FooterCredit inline />
      </div>
    </main>
  );
}

"use client";

export default function FooterCredit({ inline = false }) {
  const creditLinkClass =
    "transition hover:text-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/30 dark:hover:text-white/60 dark:focus-visible:outline-white/30";

  if (inline) {
    return (
      <footer className="mt-3 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35 dark:text-white/35">
          <a className={creditLinkClass} href="https://kothavalearya.online">
            Developed by Arya Kothavale
          </a>
        </p>
      </footer>
    );
  }

  return (
    <footer className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:px-5">
      <div className="mx-auto max-w-6xl border-t border-black/10 pt-4 text-center dark:border-white/10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/35 dark:text-white/35">
          <a className={creditLinkClass} href="https://kothavalearya.online">
            Developed by Arya Kothavale
          </a>
        </p>
      </div>
    </footer>
  );
}

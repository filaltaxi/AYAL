export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#1f6f5c" />
        <path d="M8 17.5 16 10l8 7.5V24a1 1 0 0 1-1 1h-4.5v-5h-5v5H9a1 1 0 0 1-1-1z" fill="#fbf8f3" />
        <circle cx="23.5" cy="9.5" r="3" fill="#e9a34f" />
      </svg>
      <span className="font-display text-xl font-bold tracking-tight text-ink">Ayal</span>
    </span>
  );
}

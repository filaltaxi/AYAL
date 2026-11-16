"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="pt-10 text-center">
      <h1 className="page-title">Something went wrong</h1>
      <p className="mt-2 text-muted">It&apos;s probably a connection hiccup. Try again in a moment.</p>
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={reset} className="btn-primary">Try again</button>
        <Link href="/" className="btn-outline">Go home</Link>
      </div>
      {error.digest && <p className="mt-4 text-xs text-muted">Reference: {error.digest}</p>}
    </div>
  );
}

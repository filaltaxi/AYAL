"use client";

import Link from "next/link";
import { useTransition } from "react";
import { deleteListing, setListingPaused } from "@/app/actions";

export function ListingRowActions({ id, paused }: { id: string; paused: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
      <Link href={`/me/listings/${id}/edit`} className="btn-outline px-3 py-1.5">Edit</Link>
      <button disabled={pending} onClick={() => start(() => setListingPaused(id, !paused))} className="btn-outline px-3 py-1.5">
        {paused ? "Resume" : "Pause"}
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this listing? Requests on it will be removed too.")) start(() => deleteListing(id));
        }}
        className="btn-danger ml-auto px-3 py-1.5"
      >
        Delete
      </button>
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { leaveReview } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/SubmitButton";

const LABELS = ["", "Poor", "Not great", "Okay", "Good", "Excellent"];

export function ReviewForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(leaveReview, null);
  const [rating, setRating] = useState(0);

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="rating" value={rating || ""} />
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => setRating(n)}
            className={`text-3xl leading-none transition ${n <= rating ? "text-accent" : "text-line hover:text-accent/60"}`}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-sm text-muted">{LABELS[rating]}</span>
      </div>
      <textarea name="comment" maxLength={500} rows={3} className="input" placeholder="What went well? Anything others should know? (optional)" />
      <FormMessage state={state} />
      <SubmitButton className="btn-primary" pendingText="Posting…">Post review</SubmitButton>
    </form>
  );
}

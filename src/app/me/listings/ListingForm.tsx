"use client";

import { useActionState } from "react";
import { saveListing } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/SubmitButton";
import type { Category, Listing } from "@/lib/types";

export function ListingForm({ categories, listing }: { categories: Category[]; listing?: Listing }) {
  const [state, action] = useActionState(saveListing, null);
  return (
    <form action={action} className="card mt-5 space-y-5 p-5">
      {listing && <input type="hidden" name="id" value={listing.id} />}
      <div>
        <label className="label" htmlFor="category_id">Category</label>
        <select id="category_id" name="category_id" className="input" required defaultValue={listing?.category_id ?? ""}>
          <option value="" disabled>Choose…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="title">What do you offer?</label>
        <input id="title" name="title" className="input" required minLength={3} maxLength={80} defaultValue={listing?.title} placeholder="e.g. Maths tuition for class 6–10" />
      </div>
      <div>
        <label className="label" htmlFor="description">Describe it</label>
        <textarea id="description" name="description" className="input" rows={5} required minLength={10} maxLength={1000} defaultValue={listing?.description} placeholder="What you do, your experience, what people should know." />
        <p className="hint">Don&apos;t include your phone number or address. Contact happens in the app.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="price_text">Price</label>
          <input id="price_text" name="price_text" className="input" required maxLength={60} defaultValue={listing?.price_text} placeholder="₹200/hr, ₹50/trip, Ask me" />
        </div>
        <div>
          <label className="label" htmlFor="availability">When are you free?</label>
          <input id="availability" name="availability" className="input" maxLength={120} defaultValue={listing?.availability} placeholder="Weekday evenings, weekends" />
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton>{listing ? "Save changes" : "Publish listing"}</SubmitButton>
    </form>
  );
}

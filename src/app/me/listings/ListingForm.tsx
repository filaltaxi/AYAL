"use client";

import { useActionState, useState } from "react";
import { saveListing } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/SubmitButton";
import type { Category, Listing } from "@/lib/types";

type Nearby = { id: number; name: string; distance_km: number };

export function ListingForm({
  categories,
  listing,
  nearby,
  selectedAreas = [],
  homeName,
}: {
  categories: Category[];
  listing?: Listing;
  nearby: Nearby[];
  selectedAreas?: number[];
  homeName: string;
}) {
  const [state, action] = useActionState(saveListing, null);
  const [areas, setAreas] = useState<number[]>(selectedAreas);
  const toggle = (id: number) => setAreas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
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
      <fieldset>
        <legend className="label">Where will you work?</legend>
        <p className="text-sm text-muted">
          Always in <strong className="text-ink">{homeName}</strong>, where you live. You can also serve up to 2 nearby open
          localities; neighbours there see you below their own locals.
        </p>
        {nearby.length === 0 ? (
          <p className="hint">No other open localities within 5 km yet.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {nearby.map((n) => {
              const on = areas.includes(n.id);
              return (
                <label key={n.id} className={on ? "chip-active cursor-pointer" : "chip cursor-pointer"}>
                  <input
                    type="checkbox"
                    name="areas"
                    value={n.id}
                    checked={on}
                    disabled={!on && areas.length >= 2}
                    onChange={() => toggle(n.id)}
                    className="sr-only"
                  />
                  {on ? "✓ " : "+ "}
                  {n.name} <span className="opacity-70">· {n.distance_km} km</span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton>{listing ? "Save changes" : "Publish listing"}</SubmitButton>
    </form>
  );
}

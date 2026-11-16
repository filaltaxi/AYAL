export function Prose({ title, draft, children }: { title: string; draft?: boolean; children: React.ReactNode }) {
  return (
    <article className="max-w-2xl">
      <h1 className="page-title">{title}</h1>
      {draft && (
        <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm">
          Draft for the pilot. Have a lawyer review this before a public launch.
        </p>
      )}
      <div className="mt-4 space-y-3 text-[15px] leading-relaxed [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </article>
  );
}

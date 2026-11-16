import Link from "next/link";

export default function NotFound() {
  return (
    <div className="pt-10 text-center">
      <h1 className="page-title">Not found</h1>
      <p className="mt-2 text-muted">This page doesn&apos;t exist, or it isn&apos;t available to you.</p>
      <Link href="/" className="btn-primary mt-5">Go home</Link>
    </div>
  );
}

import { Prose } from "@/components/Prose";

export const metadata = { title: "Safety" };

export default function SafetyPage() {
  return (
    <Prose title="Staying safe on Ayal">
      <p>Ayal helps neighbours find each other. It doesn&apos;t employ, check or guarantee anyone, so use the same sense you would with any new acquaintance.</p>
      <h2>Built in</h2>
      <ul>
        <li>Everyone is 18+ and has verified a phone number. Numbers are never shown to other users.</li>
        <li>Contact only opens after the provider accepts a request. Either side can call it off.</li>
        <li>“Location verified” means their phone&apos;s GPS matched the locality. “Self-selected” means it didn&apos;t, or they skipped the check.</li>
        <li>Providers see how long a person has been on Ayal and how many jobs they&apos;ve completed.</li>
      </ul>
      <h2>Before meeting</h2>
      <ul>
        <li>Agree time, place and price in the chat so there&apos;s a record.</li>
        <li>For a first meeting, meet at the door, the gate or a common area.</li>
        <li>Tell someone at home who you&apos;re meeting and when.</li>
        <li>Pay after the work is done, ideally by UPI so there&apos;s a record.</li>
      </ul>
      <h2>If something goes wrong</h2>
      <ul>
        <li>Leave if you feel unsafe. In an emergency, call 112.</li>
        <li>Use “Report” on the listing or request, then “Block”. Reports go to the Ayal team.</li>
      </ul>
    </Prose>
  );
}

import { Prose } from "@/components/Prose";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <Prose title="Terms of use" draft>
      <p>By using Ayal you agree to these terms.</p>
      <h2>What Ayal is</h2>
      <p>Ayal is a platform that lets residents of a locality list skills and contact each other. Ayal is not a party to any arrangement between users, does not employ providers, and does not verify skills, quality, identity or background.</p>
      <h2>Who can use it</h2>
      <ul>
        <li>You must be 18 or older.</li>
        <li>One account per person, linked to one phone number you control.</li>
        <li>Choose the locality you actually live in.</li>
      </ul>
      <h2>Not allowed</h2>
      <ul>
        <li>Illegal services, or anything unsafe, discriminatory or sexual.</li>
        <li>Harassment, spam, fake listings or misleading information.</li>
        <li>Posting other people&apos;s personal information.</li>
      </ul>
      <h2>Our part</h2>
      <p>We may remove listings or accounts that break these terms. Ayal is provided as-is during the pilot, without guarantees of availability.</p>
    </Prose>
  );
}

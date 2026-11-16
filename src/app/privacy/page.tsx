import { Prose } from "@/components/Prose";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <Prose title="Privacy" draft>
      <p>Ayal collects only what it needs to connect neighbours, in line with India&apos;s Digital Personal Data Protection Act, 2023.</p>
      <h2>What we collect and why</h2>
      <ul>
        <li><strong>Google name, email and photo:</strong> to sign you in and show your name and photo to people you interact with. Email is used for request alerts, which you can turn off.</li>
        <li><strong>Phone number:</strong> to make sure each account is a real person. Never shown to other users.</li>
        <li><strong>Date of birth:</strong> only to confirm you&apos;re 18+. Never shown.</li>
        <li><strong>Location:</strong> your phone&apos;s GPS is checked against your locality at that moment. We keep only the result (verified or not), never your coordinates.</li>
        <li><strong>Listings, requests and messages:</strong> to run the service. Messages are visible only to the two people in the request.</li>
      </ul>
      <h2>Your choices</h2>
      <ul>
        <li>Edit your name and email alerts in Account.</li>
        <li>Delete your account anytime from Account. This removes your profile, listings, requests and messages.</li>
      </ul>
      <p>We don&apos;t sell your data or show ads based on it.</p>
    </Prose>
  );
}

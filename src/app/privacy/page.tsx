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
        <li><strong>Listings, requests and messages:</strong> to run the service. Messages are visible only to the two people in the request. If a message or person is reported, the Ayal team may read that conversation to look into it.</li>
        <li><strong>Who can see your profile:</strong> your name and photo are public only while you have a live listing. Otherwise only people you&apos;ve exchanged a request with can see them.</li>
        <li><strong>Reviews and vouches:</strong> a review shows your name on the provider&apos;s profile. Vouches show only as a count.</li>
        <li><strong>Phone notifications:</strong> if you turn them on, we store a device address your browser gives us. Notifications never include names or message text. Turn them off anytime in Account.</li>
        <li><strong>Listing views:</strong> we count daily views per listing and show the total only to its owner. We don&apos;t record who viewed.</li>
      </ul>
      <h2>Your choices</h2>
      <ul>
        <li>Edit your name and email alerts in Account.</li>
        <li>Delete your account anytime from Account. This removes your profile, listings, messages, reviews you received and your devices. Requests you were part of stay with the other person, showing you as “Former member”, and reviews you wrote stay without your name.</li>
      </ul>
      <p>We don&apos;t sell your data or show ads based on it.</p>
    </Prose>
  );
}

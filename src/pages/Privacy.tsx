import { Layout } from '../components/Layout';

const CONTACT = 'privacy@soderholm.app';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-title text-pine">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-ink">{children}</div>
    </section>
  );
}

export function Privacy() {
  return (
    <Layout>
      <article className="mx-auto max-w-2xl py-10">
        <p className="eyebrow">Privacy</p>
        <h1 className="mt-2 text-4xl text-pine">How your group’s details are handled</h1>
        <p className="mt-4 text-lede text-muted">
          This is a plain-English summary of what this Secret Santa site stores, who can see it and when it’s deleted. There are no accounts.
        </p>

        <Section title="What we store">
          <p>When an organiser creates a group, we store:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>each person’s name and gift hint, and the draw rules</li>
            <li>the group message, budget, event date and time zone</li>
            <li>email addresses, if the organiser adds them</li>
            <li>wishlists that people write for their Santa</li>
            <li>who gives a gift to whom</li>
            <li>when each link was first opened and when emails were sent</li>
          </ul>
          <p>Links are stored in scrambled (hashed or encrypted) form. We don’t store passwords, payment details or your IP address with the group.</p>
        </Section>

        <Section title="Why">
          <p>Only to run this draw: to show each person their match and to send the emails the organiser asks for, or the reminders they switch on. Nothing else.</p>
        </Section>

        <Section title="Who can see what">
          <ul className="list-disc space-y-1 pl-5">
            <li>The organiser sees everyone’s names, hints and email addresses, whether each link has been opened, and when emails were sent. They don’t see who has whom or anyone’s wishlist.</li>
            <li>The one exception is the full record file the organiser can choose to download. It shows who gives to whom, so they can avoid repeats next year.</li>
            <li>Each person sees their own match, their match’s gift hint and wishlist, and the group message, budget and date.</li>
            <li>Your wishlist is shown only to your Santa.</li>
          </ul>
          <p>Anyone who has a link can open it, so treat links like a key and only share them with the right person.</p>
        </Section>

        <Section title="Services we use">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Cloudflare</strong> hosts the site and the database, and runs the bot check (Turnstile) on forms. The bot check processes technical details such as your IP address and browser to tell people from bots.</li>
            <li><strong>Resend</strong> delivers emails. It’s used only if the organiser adds email addresses, or when you ask to recover a link.</li>
          </ul>
          <p>There are no analytics, ads or trackers on this site.</p>
        </Section>

        <Section title="Never sold or used for marketing">
          <p>Your details are never sold, rented or shared for marketing. Every email is about this draw only.</p>
        </Section>

        <Section title="When it’s deleted">
          <ul className="list-disc space-y-1 pl-5">
            <li>Automatically on 1 February, at least 14 days after the later of the day the group was created and the event date. The organiser page shows the exact date.</li>
            <li>Straight away if the organiser chooses Delete now on the organiser page.</li>
          </ul>
          <p>After deletion the group can’t be opened again. Cloudflare’s database recovery backups may still hold deleted data for up to 30 days before it’s gone for good. Resend keeps email delivery logs, including the recipient’s address and the email itself, for up to 30 days.</p>
        </Section>

        <Section title="Removal requests and questions">
          <p>If you’re in a group and want your details removed, ask your organiser to edit or delete the group, or email <a className="text-pine underline underline-offset-2" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
          <p>Questions about this notice go to the same address.</p>
        </Section>

        <p className="mt-10 text-caption text-muted">Last updated 1 October 2026. This is a plain-language notice, not legal advice.</p>
      </article>
    </Layout>
  );
}

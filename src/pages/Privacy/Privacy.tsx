import { LegalLayout, LegalSection } from "../../components/LegalLayout";
import { siteInfo } from "../../data/nav";

export function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      lastUpdated="1 August 2026"
      intro={`This policy explains what personal information ${siteInfo.name} collects through this website, why we collect it, and how it's handled. We process personal information in accordance with South Africa's Protection of Personal Information Act (POPIA).`}
    >
      <LegalSection heading="Information We Collect">
        <p>When you submit one of our contact or inquiry forms, we collect the information you provide, which may include:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your name, email address, and phone number</li>
          <li>Your company or business name</li>
          <li>The type of service you're interested in and details about your project</li>
          <li>Any dates, files, or additional messages you choose to share</li>
        </ul>
        <p>
          We also collect anonymous, aggregate traffic data (such as page views and approximate visit
          times) via a first-party analytics script running on this site. This data is not linked to
          your name or contact details and is used only to understand how our own site is performing.
        </p>
      </LegalSection>

      <LegalSection heading="How We Use Your Information">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>To respond to your inquiry and discuss your project</li>
          <li>To prepare quotes, proposals, and project timelines</li>
          <li>To deliver and manage services for existing clients</li>
          <li>To send you updates related to a project you've engaged us for</li>
          <li>To understand and improve traffic to our own website</li>
        </ul>
        <p>We do not sell your information to third parties, and we do not use it for unsolicited marketing.</p>
      </LegalSection>

      <LegalSection heading="How We Store & Protect Your Information">
        <p>
          Information submitted through our forms is stored in a secure, access-controlled database
          (provided by Supabase) and email notifications are sent via a transactional email provider
          (Resend). This website itself is hosted on Vercel. Access to your information is limited to
          the people at {siteInfo.name} who need it to respond to you or deliver a service.
        </p>
      </LegalSection>

      <LegalSection heading="Third-Party Service Providers">
        <p>We rely on the following service providers to operate this website and respond to inquiries:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong className="text-foreground">Supabase</strong> — database storage</li>
          <li><strong className="text-foreground">Resend</strong> — transactional email delivery</li>
          <li><strong className="text-foreground">Vercel</strong> — website hosting</li>
        </ul>
        <p>Each of these providers has its own privacy and security practices governing how they handle data on our behalf.</p>
      </LegalSection>

      <LegalSection heading="Cookies & Tracking">
        <p>
          This site does not use advertising cookies or cross-site tracking. The analytics script
          mentioned above records anonymous page-view data using a randomly generated identifier
          stored in your browser — it is not tied to your identity and is not shared with advertisers.
        </p>
      </LegalSection>

      <LegalSection heading="Data Retention">
        <p>
          We keep information you submit for as long as necessary to respond to your inquiry or
          deliver a service you've engaged us for. You may request that we delete your information
          at any time — see "Your Rights" below.
        </p>
      </LegalSection>

      <LegalSection heading="Your Rights Under POPIA">
        <p>You have the right to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Ask what personal information we hold about you</li>
          <li>Ask us to correct inaccurate information</li>
          <li>Ask us to delete your information</li>
          <li>Object to how we're processing your information</li>
          <li>Lodge a complaint with South Africa's Information Regulator (inforegulator.org.za) if you believe your rights have been infringed</li>
        </ul>
        <p>To exercise any of these rights, contact us using the details below.</p>
      </LegalSection>

      <LegalSection heading="Children's Privacy">
        <p>This website is intended for business use and is not directed at children. We do not knowingly collect personal information from minors.</p>
      </LegalSection>

      <LegalSection heading="Changes to This Policy">
        <p>We may update this policy from time to time. The "Last updated" date at the top of this page reflects the most recent revision.</p>
      </LegalSection>

      <LegalSection heading="Contact Us">
        <p>
          Questions about this policy or your information? Reach us at{" "}
          <a href={`mailto:${siteInfo.email}`} className="text-primary hover:underline">
            {siteInfo.email}
          </a>{" "}
          or {siteInfo.phone}.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}

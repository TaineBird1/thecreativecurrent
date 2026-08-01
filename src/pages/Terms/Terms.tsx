import { LegalLayout, LegalSection } from "../../components/LegalLayout";
import { siteInfo } from "../../data/nav";

export function Terms() {
  return (
    <LegalLayout
      title="Terms of Service"
      lastUpdated="1 August 2026"
      intro={`These terms govern your use of this website (${siteInfo.name}). They don't cover the specific terms of any paid design, development, or management services — those are set out separately in a written quote or agreement between you and us.`}
    >
      <LegalSection heading="Acceptance of Terms">
        <p>By browsing or submitting a form on this website, you agree to these terms. If you don't agree with them, please don't use this site.</p>
      </LegalSection>

      <LegalSection heading="Use of This Website">
        <p>This website is provided for you to learn about our services and get in touch with us. You agree not to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Use the site for any unlawful purpose</li>
          <li>Attempt to scrape, copy, or systematically extract content from the site</li>
          <li>Attempt to disrupt, overload, or gain unauthorized access to the site or its systems</li>
          <li>Submit false or misleading information through our forms</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Intellectual Property">
        <p>
          The design, layout, branding, and written content on this website belong to {siteInfo.name}{" "}
          unless otherwise noted. You may not reproduce, distribute, or create derivative works from
          this content without our written permission.
        </p>
      </LegalSection>

      <LegalSection heading="Service Engagements">
        <p>
          Nothing on this website constitutes a binding offer to provide services. Any actual project
          — scope, pricing, timelines, and deliverables — is governed by a separate written agreement
          or quote that both parties sign off on before work begins.
        </p>
      </LegalSection>

      <LegalSection heading="No Warranty">
        <p>
          We try to keep the information on this website accurate and up to date, but we make no
          guarantees about its completeness or accuracy. This website and its content are provided
          "as is," without warranties of any kind.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of Liability">
        <p>
          To the fullest extent permitted by law, {siteInfo.name} is not liable for any indirect,
          incidental, or consequential damages arising from your use of this website.
        </p>
      </LegalSection>

      <LegalSection heading="Links to Other Sites">
        <p>This site may link to third-party websites. We're not responsible for the content or practices of sites we don't operate.</p>
      </LegalSection>

      <LegalSection heading="Governing Law">
        <p>These terms are governed by the laws of the Republic of South Africa.</p>
      </LegalSection>

      <LegalSection heading="Changes to These Terms">
        <p>We may update these terms from time to time. The "Last updated" date at the top of this page reflects the most recent revision.</p>
      </LegalSection>

      <LegalSection heading="Contact Us">
        <p>
          Questions about these terms? Reach us at{" "}
          <a href={`mailto:${siteInfo.email}`} className="text-primary hover:underline">
            {siteInfo.email}
          </a>{" "}
          or {siteInfo.phone}.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}

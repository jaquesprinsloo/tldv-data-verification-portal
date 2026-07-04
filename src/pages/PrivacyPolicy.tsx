import { useEffect } from "react";
import { Shield, Mail, Lock, Eye, FileText, UserCheck, Clock, AlertCircle } from "lucide-react";

export default function PrivacyPolicy() {
  useEffect(() => {
    document.title = "Privacy Policy | PreAppliCheck — TLDV";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-poppins">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-6 max-w-4xl flex items-center gap-3">
          <Shield className="h-6 w-6 text-red-600" />
          <h1 className="text-xl font-bold tracking-tight">PreAppliCheck</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-4xl">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Privacy Policy</h2>
          <p className="text-muted-foreground text-sm">
            Effective Date: {new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <p>
              PreAppliCheck, a division of <strong>True Lie Detectors &amp; Vetting (Pty) Ltd</strong> ("we", "us", or "our"),
              respects your privacy and is committed to protecting your personal information in accordance with the
              <strong> Protection of Personal Information Act 4 of 2013 (POPIA)</strong> of South Africa.
              This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our
              background-screening services, portals, and communications.
            </p>
          </section>

          <section className="bg-card rounded-lg border p-5 space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <UserCheck className="h-4 w-4 text-red-600" />
              Information Officer
            </div>
            <p>
              Our Information Officer is responsible for ensuring compliance with POPIA.
              If you have any questions about this policy or wish to exercise your rights, please contact us at{" "}
              <a href="mailto:Admin@tldv.co.za" className="text-red-600 underline">Admin@tldv.co.za</a>.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Eye className="h-4 w-4 text-red-600" />
              What personal information we collect
            </div>
            <p>We may collect and process the following categories of personal information:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Identity information:</strong> full name, ID number, date of birth, nationality, and photographic verification.</li>
              <li><strong>Contact information:</strong> email address, phone number, and physical address.</li>
              <li><strong>Employment and educational history:</strong> previous employers, qualifications, and professional references.</li>
              <li><strong>Criminal and legal history:</strong> disclosures relating to arrests, convictions, and civil judgments, where lawfully permitted.</li>
              <li><strong>Financial information:</strong> credit history and financial standing, collected only with consent and where relevant to the screening scope.</li>
              <li><strong>Device and location data:</strong> IP address, GPS coordinates, and device metadata when you interact with our online application or portals.</li>
              <li><strong>Biometric data:</strong> identity-verification selfies captured during the digital application process.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <FileText className="h-4 w-4 text-red-600" />
              How we collect personal information
            </div>
            <p>We collect personal information directly from you, from your employer or prospective employer (where you have consented), and from verified third-party sources such as credit bureaus, criminal-record databases, and educational institutions. All collection is conducted lawfully and transparently under POPIA.</p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Shield className="h-4 w-4 text-red-600" />
              Purpose of processing
            </div>
            <p>We process personal information only for the specific purposes for which it was collected, including:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Conducting background screening and risk assessments on behalf of our clients.</li>
              <li>Verifying identity, qualifications, employment history, and criminal records.</li>
              <li>Generating background-screening reports and risk profiles.</li>
              <li>Facilitating polygraph examinations and managing related appointments.</li>
              <li>Complying with legal and regulatory obligations.</li>
              <li>Communicating with data subjects and clients regarding screening outcomes.</li>
            </ul>
            <p>We do not use personal information for any purpose incompatible with the original reason for collection unless permitted by law or with your further consent.</p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Lock className="h-4 w-4 text-red-600" />
              Sharing and disclosure
            </div>
            <p>
              We only share personal information with the client organisation that requested the screening, and with trusted
              third-party service providers who assist in verification (for example, credit bureaus, qualification-verification bodies, and criminal-record agencies). All third parties are bound by confidentiality and data-protection obligations consistent with POPIA. We do not sell or trade personal information.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Lock className="h-4 w-4 text-red-600" />
              Security safeguards
            </div>
            <p>
              We implement appropriate technical and organisational measures to protect personal information against loss, unauthorised access, destruction, and unlawful processing. These measures include encryption in transit, access controls, audit logs, and regular security assessments. Access to personal information is restricted to authorised personnel who require it for legitimate screening purposes.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Clock className="h-4 w-4 text-red-600" />
              Retention
            </div>
            <p>
              We retain personal information only for as long as necessary to fulfil the purpose for which it was collected, or as required by law. Once the retention period expires, personal information is securely deleted or de-identified in accordance with our data-retention policy and the <em>No Trace</em> deletion protocol where applicable.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <UserCheck className="h-4 w-4 text-red-600" />
              Your rights under POPIA
            </div>
            <p>As a data subject, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Be informed that your personal information is being collected.</li>
              <li>Request access to the personal information we hold about you.</li>
              <li>Request correction or deletion of inaccurate, irrelevant, or outdated personal information.</li>
              <li>Object to the processing of your personal information in certain circumstances.</li>
              <li>Lodge a complaint with the Information Regulator of South Africa if you believe your rights have been infringed.</li>
            </ul>
            <p>
              To exercise any of these rights, please email us at{" "}
              <a href="mailto:Admin@tldv.co.za" className="text-red-600 underline">Admin@tldv.co.za</a>{" "}
              with proof of identity. We will respond within the timeframes prescribed by POPIA.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <AlertCircle className="h-4 w-4 text-red-600" />
              Changes to this policy
            </div>
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements.
              The updated version will be posted on this page with a revised effective date. We encourage you to review this policy periodically.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Mail className="h-4 w-4 text-red-600" />
              Contact us
            </div>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy or our handling of your personal information, please contact our Information Officer at{" "}
              <a href="mailto:Admin@tldv.co.za" className="text-red-600 underline">Admin@tldv.co.za</a>.
            </p>
          </section>
        </div>

        <footer className="mt-12 pt-6 border-t text-center text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} True Lie Detectors &amp; Vetting (Pty) Ltd. All rights reserved.</p>
          <p className="mt-1">PreAppliCheck is a division of True Lie Detectors &amp; Vetting.</p>
        </footer>
      </main>
    </div>
  );
}

import { useEffect } from "react";
import { Shield, Mail, Lock, Eye, FileText, UserCheck, Clock, AlertCircle, Globe, Cookie } from "lucide-react";

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
            Effective Date: 4 July 2026
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <p>
              PreAppliCheck, a division of True Lie Detectors &amp; Vetting (Pty) Ltd ("we", "us", or "our"), respects your privacy and is committed to protecting your personal information in accordance with the Protection of Personal Information Act 4 of 2013 (POPIA).
              This Privacy Policy explains how we collect, use, store, and protect personal information when you use our background screening services, online portals, and communications.
            </p>
          </section>

          <section className="bg-card rounded-lg border p-5 space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <UserCheck className="h-4 w-4 text-red-600" />
              Information Officer
            </div>
            <p>
              Our Information Officer oversees POPIA compliance. For any questions or to exercise your rights, please contact us at{" "}
              <a href="mailto:admin@tldv.co.za" className="text-red-600 underline">admin@tldv.co.za</a>.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Eye className="h-4 w-4 text-red-600" />
              What Personal Information We Collect
            </div>
            <p>We may collect and process the following categories of personal information:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Identity information:</strong> Full name, ID number, date of birth, nationality, and photographic verification.</li>
              <li><strong>Contact information:</strong> Email address, phone number, and physical address.</li>
              <li><strong>Employment and educational history:</strong> Previous employers, qualifications, and professional references.</li>
              <li><strong>Criminal and legal history:</strong> Information relating to arrests, convictions, and civil judgments (only where lawfully permitted and relevant).</li>
              <li><strong>Financial information:</strong> Credit history (collected only with consent and where relevant to the role).</li>
              <li><strong>Device and online data:</strong> IP address, device information, and browser data when you use our portals or online application.</li>
              <li><strong>Biometric data:</strong> Selfies or photographs captured during digital identity verification (collected only with your explicit consent).</li>
            </ul>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <FileText className="h-4 w-4 text-red-600" />
              How We Collect Personal Information
            </div>
            <p>We collect personal information directly from you, from your current or prospective employer (with your consent), and from trusted third-party sources such as credit bureaus, educational institutions, and criminal record databases.</p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Shield className="h-4 w-4 text-red-600" />
              Legal Basis and Purpose of Processing
            </div>
            <p>We process personal information only for legitimate purposes, including:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Conducting background screening and verification on behalf of our clients</li>
              <li>Verifying identity, qualifications, employment history, and criminal records</li>
              <li>Generating background screening reports</li>
              <li>Complying with legal and regulatory obligations</li>
              <li>Communicating with you and our clients regarding screening outcomes</li>
            </ul>
            <p>We rely on one or more of the following legal bases: your consent, necessity for the performance of a contract, compliance with a legal obligation, or our legitimate interests (balanced against your rights).</p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Lock className="h-4 w-4 text-red-600" />
              Sharing and Disclosure
            </div>
            <p>
              We only share personal information with:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>The client organisation that requested the screening (with your consent)</li>
              <li>Trusted third-party verification providers (e.g. credit bureaus, qualification verifiers, criminal record agencies)</li>
            </ul>
            <p>All third parties are bound by confidentiality and data protection obligations. We do not sell or trade personal information.</p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Globe className="h-4 w-4 text-red-600" />
              International Transfers
            </div>
            <p>
              Where necessary (for example, when verifying international qualifications or criminal records), we may transfer personal information outside South Africa. In such cases, we take appropriate steps to ensure an adequate level of protection in accordance with POPIA.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Lock className="h-4 w-4 text-red-600" />
              Security Safeguards
            </div>
            <p>
              We implement appropriate technical and organisational measures to protect personal information against loss, unauthorised access, and unlawful processing. These include encryption, access controls, and regular security assessments.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Clock className="h-4 w-4 text-red-600" />
              Retention
            </div>
            <p>
              We retain personal information only for as long as necessary to fulfil the purpose for which it was collected, or as required by law. Once the retention period expires, information is securely deleted or de-identified.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <UserCheck className="h-4 w-4 text-red-600" />
              Your Rights under POPIA
            </div>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Be informed that your personal information is being collected</li>
              <li>Request access to the personal information we hold about you</li>
              <li>Request correction or deletion of inaccurate or outdated information</li>
              <li>Object to the processing of your personal information in certain circumstances</li>
              <li>Lodge a complaint with the Information Regulator of South Africa</li>
            </ul>
            <p>
              To exercise any of these rights, please email{" "}
              <a href="mailto:admin@tldv.co.za" className="text-red-600 underline">admin@tldv.co.za</a>{" "}
              with proof of identity. We will respond within the timeframes required by POPIA.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Cookie className="h-4 w-4 text-red-600" />
              Cookies and Online Tracking
            </div>
            <p>
              When you use our website or online portals, we may collect technical information such as your IP address and device data through cookies and similar technologies. This helps us improve our services and ensure security. You can manage cookie preferences through your browser settings.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <AlertCircle className="h-4 w-4 text-red-600" />
              Changes to This Policy
            </div>
            <p>
              We may update this Privacy Policy from time to time. The latest version will always be available on our website with the effective date clearly displayed.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Mail className="h-4 w-4 text-red-600" />
              Contact Us
            </div>
            <p>
              If you have any questions or concerns about this Privacy Policy or how we handle your personal information, please contact our Information Officer at{" "}
              <a href="mailto:admin@tldv.co.za" className="text-red-600 underline">admin@tldv.co.za</a>.
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

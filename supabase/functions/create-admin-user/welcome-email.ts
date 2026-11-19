import logo from './tldv-welcome-logo.png.asset.json' with { type: 'json' };

const portalOrigin = 'https://portal.tldv.co.za';
const colors = {
  header: '#000000',
  action: '#b91c1c',
  brand: '#ec1c24',
  canvas: '#f1f1f2',
  surface: '#ffffff',
  detail: '#f7f7f8',
  ink: '#18181b',
  muted: '#52525b',
  border: '#e4e4e7',
};

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function renderWelcomeEmail({ name, email, role, link, hasSetupLink }: {
  name: string;
  email: string;
  role: string;
  link: string;
  hasSetupLink: boolean;
}) {
  const intro = hasSetupLink
    ? 'Your TLDV portal account is ready. Set your password to get started.'
    : 'Your TLDV portal account is ready. Open the portal to sign in.';
  const action = hasSetupLink ? 'Set my password' : 'Open the portal';
  const securityNote = hasSetupLink
    ? 'For your security, this link can only be used once and expires shortly. We never send your password by email.'
    : 'If you need help setting your password, contact your portal administrator.';

  const text = [
    `Welcome, ${name}.`, intro, `Email: ${email}`, `Role: ${role}`, `${action}: ${link}`,
    securityNote, 'True Lie Detectors & Vetting · TLDV Data Verification Portal',
  ].join('\n\n');

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to the TLDV Portal</title></head>
<body style="margin:0;padding:0;background:${colors.canvas};font-family:Arial,Helvetica,sans-serif;color:${colors.ink};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${intro}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${colors.canvas}">
    <tr><td align="center" style="padding:24px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${colors.surface}" style="max-width:600px;border:1px solid ${colors.border};">
        <tr><td align="center" bgcolor="${colors.header}" style="padding:20px 24px;border-bottom:4px solid ${colors.brand};">
          <img src="${portalOrigin}${logo.url}" alt="TLDV — True Lie Detectors &amp; Vetting" width="300" style="display:block;width:100%;max-width:300px;height:auto;margin:0 auto;border:0;color:${colors.surface};font-size:16px;">
        </td></tr>
        <tr><td style="padding:30px 26px 28px;font-family:Arial,Helvetica,sans-serif;color:${colors.ink};">
          <p style="margin:0 0 8px;color:${colors.action};font-size:13px;line-height:20px;font-weight:bold;">TLDV DATA VERIFICATION PORTAL</p>
          <h1 style="margin:0 0 12px;font-size:30px;line-height:36px;overflow-wrap:anywhere;">Welcome, ${escapeHtml(name)}.</h1>
          <p style="margin:0 0 22px;font-size:16px;line-height:25px;">${intro}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${colors.detail}" style="border:1px solid ${colors.border};border-radius:6px;">
            <tr><td style="padding:14px 16px;font-size:15px;line-height:23px;overflow-wrap:anywhere;word-break:break-word;">
              <strong style="color:${colors.muted};font-size:13px;">Email address</strong><br>${escapeHtml(email)}
            </td></tr>
            <tr><td style="padding:12px 16px 14px;border-top:1px solid ${colors.border};font-size:15px;line-height:23px;">
              <strong style="color:${colors.muted};font-size:13px;">Account role</strong><br>${escapeHtml(role)}
            </td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;">
            <tr><td bgcolor="${colors.action}" style="border-radius:6px;mso-padding-alt:13px 23px;">
              <a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 23px;mso-padding-alt:0;color:${colors.surface};font-weight:bold;font-size:16px;line-height:22px;text-decoration:none;">${action}</a>
            </td></tr>
          </table>
          <p style="margin:16px 0 0;color:${colors.muted};font-size:14px;line-height:21px;">${securityNote}${hasSetupLink ? ' If you need help, contact your portal administrator.' : ''}</p>
        </td></tr>
        <tr><td bgcolor="${colors.detail}" style="padding:16px 26px;border-top:1px solid ${colors.border};color:${colors.muted};font-size:13px;line-height:20px;">
          <strong style="color:${colors.ink};">True Lie Detectors &amp; Vetting</strong><br>This email was sent automatically. Please do not reply.
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;

  return { html, text };
}
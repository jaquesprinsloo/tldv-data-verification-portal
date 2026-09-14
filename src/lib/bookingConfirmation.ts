import { format, parseISO } from "date-fns";

export interface BookingConfirmationRecord {
  id?: string;
  booking_reference: string;
  attention_name: string;
  attention_email?: string | null;
  company_name: string;
  scheduled_date: string; // yyyy-MM-dd
  scheduled_time: string; // HH:mm
  examiners: string[];
  examiner_emails: string[];
  service_required: string;
  polygraph_types: string[];
  vetting_types: string[];
  candidate_quantity: number;
  venue_id?: string | null;
  location_label?: string | null;
  special_notes?: string | null;
  status?: string;
  sent_at?: string | null;
  sent_to?: string[];
}

export const SERVICE_OPTIONS = [
  "Polygraph Examinations",
  "Vetting",
  "Polygraph Examinations & Vetting",
];

export const COMPANY_DETAILS = {
  name: "True Lie Detectors & Vetting (Pty) Ltd",
  address:
    "Office 3, First Floor, Right Side Wing, Refined Park, 11 Inanda Rd, Hillcrest, Durban, 3610",
  branchAddress: "Shop 3, Makhado Crossing, Songozwi St, Louis Trichardt, 0909",
  phone: "062 859 6678",
  email: "admin@tldv.co.za",
  branches: ["Durban", "Bloemfontein", "Vereeniging", "Pretoria", "Bela-Bela", "Barberton"],
};

/** "09:00" / "09:00:00" -> "09h00" */
export const formatTimeLabel = (time?: string | null) => {
  if (!time) return "";
  const [h, m] = String(time).split(":");
  return `${(h || "").padStart(2, "0")}h${(m || "00").padStart(2, "0")}`;
};

/** "2026-04-01" -> "Wednesday, 01 April 2026" */
export const formatDateLabel = (date?: string | null) => {
  if (!date) return "";
  try {
    return format(parseISO(date), "EEEE, dd MMMM yyyy");
  } catch {
    return date;
  }
};

export const formatScheduleLabel = (date?: string | null, time?: string | null) =>
  `${formatDateLabel(date)}, at ${formatTimeLabel(time)}`;

export const listOrNA = (values?: string[] | null) =>
  values && values.length ? values.join(", ") : "N/A";

/** Booking Confirmation - (date) - (company) */
export const bookingFileName = (rec: BookingConfirmationRecord, ext = "pdf") => {
  const datePart = rec.scheduled_date ? format(parseISO(rec.scheduled_date), "dd MMMM yyyy") : "TBC";
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "-").trim();
  return `Booking Confirmation - ${safe(datePart)} - ${safe(rec.company_name || "Client")}.${ext}`;
};

export const generateBookingReference = (companyName: string, date: string) => {
  const initials = (companyName || "TLDV")
    .replace(/[^A-Za-z ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join("");
  const datePart = date ? date.replace(/-/g, "") : format(new Date(), "yyyyMMdd");
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `BC-${datePart}-${initials || "TLDV"}${rand}`;
};

const esc = (s?: string | null) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Email HTML mirroring the printed booking confirmation */
export const buildBookingEmailHtml = (rec: BookingConfirmationRecord, venueLabel: string) => {
  const timeLabel = formatTimeLabel(rec.scheduled_time);
  const row = (label: string, value: string, bold = false) => `
    <tr>
      <td style="border:1px solid #111;padding:8px 10px;font-weight:700;width:45%;">${esc(label)}</td>
      <td style="border:1px solid #111;padding:8px 10px;${bold ? "font-weight:700;" : ""}">${esc(value)}</td>
    </tr>`;
  return `
  <div style="font-family:Georgia,'Times New Roman',serif;color:#111;max-width:680px;margin:0 auto;">
    <h1 style="text-align:center;font-size:26px;margin:8px 0 18px;">Booking Confirmation</h1>
    <table style="width:100%;border-collapse:collapse;border:1px solid #111;margin-bottom:16px;">
      <tr>
        <td style="padding:10px;width:50%;font-weight:700;">Attention: ${esc(rec.attention_name)}</td>
        <td style="padding:10px;font-weight:700;">Company Name: ${esc(rec.company_name)}</td>
      </tr>
      <tr>
        <td style="padding:10px;font-weight:700;">Scheduled date and time: ${esc(
          formatScheduleLabel(rec.scheduled_date, rec.scheduled_time),
        )}</td>
        <td style="padding:10px;font-weight:700;">Examiner: ${esc(listOrNA(rec.examiners))}</td>
      </tr>
      <tr>
        <td colspan="2" style="background:#e9e9e9;padding:10px;text-align:center;font-weight:700;border-top:1px solid #111;">Booking Information</td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      ${row("Service Required:", rec.service_required, true)}
      ${row("Polygraph Examination Type:", listOrNA(rec.polygraph_types))}
      ${row("Vetting Type:", listOrNA(rec.vetting_types))}
      ${row("Candidate Quantity:", String(rec.candidate_quantity ?? ""))}
      ${row("Location:", venueLabel || "To be confirmed")}
      ${row("Special Notes", rec.special_notes || "—", true)}
    </table>
    <ul style="font-size:14px;line-height:1.6;padding-left:20px;">
      <li>The appointment is scheduled to start at ${esc(timeLabel)}.</li>
      <li>The Examinee/s need to arrange his/her own transport to and from the facility, it is the examinee&rsquo;s responsibility to ensure that he/she arrives for their allocated time slot.</li>
      <li>Late arrivals (within reason) and no shows will be billed according to the set out late cancelation clause, changes in appointment details need to be communicated two (2) working days prior to the scheduled appointment to ensure that alternative arrangements can be made.</li>
    </ul>
    <div style="border-top:3px solid #c8102e;margin-top:20px;padding-top:10px;font-size:12px;text-align:center;color:#333;">
      <p style="margin:2px 0;">${esc(COMPANY_DETAILS.branchAddress)} &middot; ${esc(COMPANY_DETAILS.phone)} &middot; ${esc(COMPANY_DETAILS.email)}</p>
      <p style="margin:2px 0;font-weight:700;">${esc(COMPANY_DETAILS.name)}</p>
      <p style="margin:2px 0;">${esc(COMPANY_DETAILS.address)}</p>
      <p style="margin:2px 0;">${COMPANY_DETAILS.branches.join(" &middot; ")}</p>
    </div>
  </div>`;
};

const icsEscape = (s?: string | null) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

/** Outlook-compatible calendar invite (2 hours per candidate slot, min 1 hour) */
export const buildBookingIcs = (
  rec: BookingConfirmationRecord,
  venueLabel: string,
  attendees: string[],
) => {
  const [h, m] = String(rec.scheduled_time || "09:00").split(":");
  const start = new Date(`${rec.scheduled_date}T${(h || "09").padStart(2, "0")}:${(m || "00").padStart(2, "0")}:00+02:00`);
  const hours = Math.max(1, Math.min(8, rec.candidate_quantity || 1));
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const summary = `${rec.service_required} — ${rec.company_name}`;
  const description = [
    `Attention: ${rec.attention_name}`,
    `Company: ${rec.company_name}`,
    `Examiner(s): ${listOrNA(rec.examiners)}`,
    `Service Required: ${rec.service_required}`,
    `Polygraph Examination Type: ${listOrNA(rec.polygraph_types)}`,
    `Vetting Type: ${listOrNA(rec.vetting_types)}`,
    `Candidate Quantity: ${rec.candidate_quantity}`,
    `Location: ${venueLabel || "To be confirmed"}`,
    rec.special_notes ? `Special Notes: ${rec.special_notes}` : "",
    "",
    `The appointment is scheduled to start at ${formatTimeLabel(rec.scheduled_time)}.`,
    "The Examinee/s need to arrange his/her own transport to and from the facility.",
    "Late arrivals and no shows will be billed according to the late cancelation clause. Changes must be communicated two (2) working days prior to the appointment.",
    "",
    `Booking Reference: ${rec.booking_reference}`,
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//True Lie Detectors & Vetting//Booking Confirmation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${rec.booking_reference}@tldv.co.za`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `LOCATION:${icsEscape(venueLabel || "To be confirmed")}`,
    "ORGANIZER;CN=True Lie Detectors & Vetting:mailto:admin@tldv.co.za",
    ...attendees
      .filter(Boolean)
      .map((a) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a}`),
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "BEGIN:VALARM",
    "TRIGGER:-PT60M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
};

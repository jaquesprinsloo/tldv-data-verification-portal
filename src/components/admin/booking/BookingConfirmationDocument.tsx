import { forwardRef } from "react";
import tldvLogo from "@/assets/tldv-logo-primary.png";
import {
  BookingConfirmationRecord,
  COMPANY_DETAILS,
  formatScheduleLabel,
  formatTimeLabel,
  listOrNA,
} from "@/lib/bookingConfirmation";
import { MapPin, Phone, Mail } from "lucide-react";

interface Props {
  record: BookingConfirmationRecord;
  venueLabel: string;
}

const Cell = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <tr>
    <td className="border border-foreground px-3 py-2 font-bold align-top w-[45%]">{label}</td>
    <td className={`border border-foreground px-3 py-2 align-top ${bold ? "font-bold" : ""}`}>{value}</td>
  </tr>
);

const BookingConfirmationDocument = forwardRef<HTMLDivElement, Props>(
  ({ record, venueLabel }, ref) => (
    <div ref={ref} className="bg-white text-black p-8 font-serif text-[13px] leading-relaxed">
      <div className="flex justify-center mb-4">
        <img src={tldvLogo} alt="True Lie Detectors & Vetting" className="h-20 object-contain" />
      </div>

      <h1 className="text-center text-2xl font-bold mb-5">Booking Confirmation</h1>

      <table className="w-full border border-black border-collapse mb-5">
        <tbody>
          <tr>
            <td className="px-3 py-3 font-bold w-1/2 align-top">Attention: {record.attention_name}</td>
            <td className="px-3 py-3 font-bold align-top">Company Name: {record.company_name}</td>
          </tr>
          <tr>
            <td className="px-3 py-3 font-bold align-top">
              Scheduled date and time: {formatScheduleLabel(record.scheduled_date, record.scheduled_time)}
            </td>
            <td className="px-3 py-3 font-bold align-top">Examiner: {listOrNA(record.examiners)}</td>
          </tr>
          <tr>
            <td colSpan={2} className="bg-[#e9e9e9] border-t border-black text-center font-bold py-3">
              Booking Information
            </td>
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse mb-5">
        <tbody>
          <Cell label="Service Required:" value={record.service_required} bold />
          <Cell label="Polygraph Examination Type:" value={listOrNA(record.polygraph_types)} />
          <Cell label="Vetting Type:" value={listOrNA(record.vetting_types)} />
          <Cell label="Candidate Quantity:" value={String(record.candidate_quantity ?? "")} />
          <Cell label="Location:" value={venueLabel || "To be confirmed"} />
          <Cell label="Special Notes" value={record.special_notes || "—"} bold />
        </tbody>
      </table>

      <ul className="list-disc pl-6 space-y-2 mb-6">
        <li>The appointment is scheduled to start at {formatTimeLabel(record.scheduled_time)}.</li>
        <li>
          The Examinee/s need to arrange his/her own transport to and from the facility, it is the
          examinee’s responsibility to ensure that he/she arrives for their allocated time slot.
        </li>
        <li>
          Late arrivals (within reason) and no shows will be billed according to the set out late
          cancelation clause, changes in appointment details need to be communicated two (2) working
          days prior to the scheduled appointment to ensure that alternative arrangements can be made.
        </li>
      </ul>

      <div className="border-t-[3px] border-[#c8102e] pt-3 text-center text-[11px]">
        <div className="flex justify-center gap-6 mb-2 text-[#c8102e]">
          <MapPin className="h-3.5 w-3.5" />
          <Phone className="h-3.5 w-3.5" />
          <Mail className="h-3.5 w-3.5" />
        </div>
        <table className="w-full border border-black border-collapse mb-2">
          <tbody>
            <tr>
              <td className="border border-black px-2 py-1 font-bold">{COMPANY_DETAILS.branchAddress}</td>
              <td className="border border-black px-2 py-1 font-bold">{COMPANY_DETAILS.phone}</td>
              <td className="border border-black px-2 py-1 font-bold">{COMPANY_DETAILS.email}</td>
            </tr>
          </tbody>
        </table>
        <p className="font-semibold">{COMPANY_DETAILS.name}</p>
        <p>{COMPANY_DETAILS.address}</p>
        <div className="grid grid-cols-3 gap-1 mt-2">
          {COMPANY_DETAILS.branches.map((b) => (
            <span key={b} className="flex items-center justify-center gap-1">
              <MapPin className="h-3 w-3 text-[#c8102e]" /> {b}
            </span>
          ))}
        </div>
      </div>
    </div>
  ),
);

BookingConfirmationDocument.displayName = "BookingConfirmationDocument";

export default BookingConfirmationDocument;

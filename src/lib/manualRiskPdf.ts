import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import preapplicheckLogo from "@/assets/preapplicheck-logo.png";

export interface ManualRiskCandidatePdf {
  id_number: string;
  surname: string;
  first_name: string;
  results?: Record<string, string | null | undefined>;
  notes?: Record<string, string | null | undefined>;
}

export interface ManualRiskReportInput {
  orderNumber: string;
  clientName?: string | null;
  clientContact?: string | null;
  clientEmail?: string | null;
  submissionType: "single" | "batch";
  candidates: ManualRiskCandidatePdf[];
  termsAndConditions: string;
  generatedByName?: string | null;
  requestedChecks: string[];
}

export const CHECK_META: Record<string, { label: string; short: string; options: { v: string; l: string }[] }> = {
  id_verification: {
    label: "ID Verification", short: "ID",
    options: [
      { v: "valid", l: "Valid" }, { v: "invalid", l: "Invalid" },
      { v: "deceased", l: "Deceased" }, { v: "pending", l: "Pending" },
    ],
  },
  credit: {
    label: "Credit Check", short: "Credit",
    options: [
      { v: "low", l: "Low Risk" }, { v: "medium", l: "Medium Risk" },
      { v: "high", l: "High Risk" }, { v: "very_high", l: "Very High Risk" },
      { v: "pending", l: "Pending" },
    ],
  },
  risk_assessment: {
    label: "Background Screening", short: "Background Screening",
    options: [
      { v: "no_risk", l: "No Risk Identified" },
      { v: "risk_identified", l: "Risk Identified" },
      { v: "pending", l: "Pending" },
    ],
  },
  drivers_license: {
    label: "Driver's License Verification", short: "DL",
    options: [
      { v: "valid", l: "Valid" }, { v: "invalid", l: "Invalid" },
      { v: "expired", l: "Expired" }, { v: "pending", l: "Pending" },
    ],
  },
  pdp: {
    label: "PDP Verification", short: "PDP",
    options: [
      { v: "valid", l: "Valid" }, { v: "invalid", l: "Invalid" },
      { v: "expired", l: "Expired" }, { v: "pending", l: "Pending" },
    ],
  },
  qualification: {
    label: "Qualification Verification", short: "Qual",
    options: [
      { v: "verified", l: "Verified" }, { v: "not_verified", l: "Not Verified" },
      { v: "pending", l: "Pending" },
    ],
  },
  criminal: {
    label: "Criminal Check", short: "Criminal",
    options: [
      { v: "clear", l: "Clear" }, { v: "record_found", l: "Record Found" },
      { v: "pending", l: "Pending" },
    ],
  },
};

// DB column mapping per check key
export const CHECK_COLUMNS: Record<string, { result: string; notes: string }> = {
  id_verification: { result: "id_verification_result", notes: "id_verification_notes" },
  credit: { result: "credit_result", notes: "credit_notes" },
  risk_assessment: { result: "risk_assessment_result", notes: "risk_assessment_notes" },
  drivers_license: { result: "drivers_license_result", notes: "drivers_license_notes" },
  pdp: { result: "pdp_result", notes: "pdp_notes" },
  qualification: { result: "qualification_result", notes: "qualification_notes" },
  criminal: { result: "criminal_result", notes: "criminal_notes" },
};

const RESULT_LABELS: Record<string, string> = {
  valid: "Valid",
  invalid: "Invalid",
  expired: "Expired",
  deceased: "Deceased",
  pending: "Pending",
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
  very_high: "Very High Risk",
  clear: "Clear",
  record_found: "Record Found",
  verified: "Verified",
  not_verified: "Not Verified",
  no_risk: "No Risk Identified",
  risk_identified: "Risk Identified",
};

const RESULT_COLORS: Record<string, [number, number, number]> = {
  valid: [22, 163, 74],
  clear: [22, 163, 74],
  low: [22, 163, 74],
  verified: [22, 163, 74],
  no_risk: [22, 163, 74],
  medium: [202, 138, 4],
  expired: [202, 138, 4],
  high: [234, 88, 12],
  very_high: [185, 28, 28],
  invalid: [185, 28, 28],
  record_found: [185, 28, 28],
  not_verified: [185, 28, 28],
  risk_identified: [185, 28, 28],
  deceased: [82, 82, 82],
  pending: [107, 114, 128],
};

const label = (v?: string | null) => (v ? RESULT_LABELS[v] ?? v : "—");

async function loadImageAsDataUrl(src: string): Promise<string> {
  const res = await fetch(src);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function generateManualRiskPdf(input: ManualRiskReportInput): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  // Modern centered header: logo in the middle, title beneath, subtle divider
  const headerTop = 40;
  const logoMaxWidth = 200;
  let logoH = logoMaxWidth * (600 / 900);
  try {
    const logoData = await loadImageAsDataUrl(preapplicheckLogo);
    const img = new Image();
    img.src = logoData;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
    });
    const aspect = img.naturalHeight / img.naturalWidth;
    logoH = logoMaxWidth * aspect;
    doc.addImage(logoData, "PNG", (pageWidth - logoMaxWidth) / 2, headerTop, logoMaxWidth, logoH);
  } catch {
    /* logo optional */
  }

  let y = headerTop + logoH + 22;
  doc.setTextColor(15, 15, 15);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Risk Assessment Report", pageWidth / 2, y, { align: "center" });
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const dateStr = new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
  doc.text(`${dateStr}   •   Order No: ${input.orderNumber}`, pageWidth / 2, y, { align: "center" });
  y += 18;
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 26;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Client", margin, y);
  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(1);
  doc.line(margin, y + 3, margin + 40, y + 3);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Client Name: ${input.clientName || "—"}`, margin, y); y += 14;
  if (input.clientContact) { doc.text(`Contact: ${input.clientContact}`, margin, y); y += 14; }
  if (input.clientEmail) { doc.text(`Email: ${input.clientEmail}`, margin, y); y += 14; }
  doc.text(`Submission Type: ${input.submissionType === "single" ? "Single Candidate" : "Batch"}`, margin, y);
  y += 14;
  doc.text(`Candidates on report: ${input.candidates.length}`, margin, y);
  y += 22;

  // Results section title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Check Results", margin, y);
  doc.setDrawColor(220, 38, 38);
  doc.line(margin, y + 3, margin + 75, y + 3);
  y += 12;

  // Table
  const checks = (input.requestedChecks?.length ? input.requestedChecks : ["id_verification"]).filter(
    (k) => CHECK_META[k],
  );
  const head = [["#", "Candidate", "ID Number", ...checks.map((k) => CHECK_META[k].short)]];
  const body = input.candidates.map((c, idx) => [
    String(idx + 1),
    `${c.surname}, ${c.first_name}`,
    c.id_number,
    ...checks.map((k) => label(c.results?.[k])),
  ]);

  autoTable(doc, {
    startY: y + 6,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 6, textColor: [30, 30, 30] },
    headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 22, halign: "center" },
      2: { cellWidth: 90 },
    },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index < 3) return;
      const cand = input.candidates[data.row.index];
      const key = cand.results?.[checks[data.column.index - 3]];
      if (key && RESULT_COLORS[key]) {
        data.cell.styles.textColor = RESULT_COLORS[key];
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: margin, right: margin },
  });

  // Auto-generated notes: currently only Risk Assessment "risk_identified" injects a note.
  const autoNoteFor = (k: string, result?: string | null): string | null => {
    if (k === "risk_assessment" && result === "risk_identified") {
      return "Probable Risk Identified — candidate should have their fingerprints submitted for clearance.";
    }
    return null;
  };
  const withNotes = input.candidates.filter((c) =>
    checks.some((k) => autoNoteFor(k, c.results?.[k])),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursorY = (doc as any).lastAutoTable?.finalY ?? y + 40;
  if (withNotes.length) {
    cursorY += 24;
    if (cursorY > pageHeight - 120) { doc.addPage(); cursorY = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("Notes", margin, cursorY);
    doc.setDrawColor(220, 38, 38);
    doc.line(margin, cursorY + 3, margin + 32, cursorY + 3);
    cursorY += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const c of withNotes) {
      const header = `${c.surname}, ${c.first_name} (${c.id_number})`;
      const lines: string[] = [];
      for (const k of checks) {
        const n = autoNoteFor(k, c.results?.[k]);
        if (n) lines.push(`• ${CHECK_META[k].label}: ${n}`);
      }
      const wrapped = lines.flatMap((l) => doc.splitTextToSize(l, pageWidth - margin * 2));
      const blockH = 16 + wrapped.length * 12 + 10;
      if (cursorY + blockH > pageHeight - 100) { doc.addPage(); cursorY = margin; }
      doc.setFont("helvetica", "bold");
      doc.text(header, margin, cursorY);
      cursorY += 14;
      doc.setFont("helvetica", "normal");
      doc.text(wrapped, margin + 8, cursorY);
      cursorY += wrapped.length * 12 + 8;
    }
  }

  // T&Cs (always on last page, may add new page)
  if (input.termsAndConditions?.trim()) {
    const terms = doc.splitTextToSize(input.termsAndConditions.trim(), pageWidth - margin * 2);
    const needed = 40 + terms.length * 10;
    if (cursorY + needed > pageHeight - 60) { doc.addPage(); cursorY = margin; }
    else cursorY += 30;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("Terms & Conditions", margin, cursorY);
    doc.setDrawColor(220, 38, 38);
    doc.line(margin, cursorY + 3, margin + 90, cursorY + 3);
    cursorY += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(70, 70, 70);
    doc.text(terms, margin, cursorY);
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  const footerAddress = "Office 3, First Floor, Right Side Wing, Refined Park, 11 Inanda Rd, Hillcrest, Durban, 3610";
  const footerCompany = "PreAppliCheck is a division of True Lie Detectors & Vetting, a South African background screening and vetting company.";
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Red separator line
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 64, pageWidth - margin, pageHeight - 64);

    // Address
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    const addrLines = doc.splitTextToSize(footerAddress, pageWidth - margin * 2);
    doc.text(addrLines, pageWidth / 2, pageHeight - 54, { align: "center" });

    // Company description
    const companyLines = doc.splitTextToSize(footerCompany, pageWidth - margin * 2);
    doc.text(companyLines, pageWidth / 2, pageHeight - 44, { align: "center" });

    // Bottom row
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("PreAppliCheck • Confidential Risk Assessment Report", margin, pageHeight - 24);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 24, { align: "right" });
    if (input.generatedByName) {
      doc.text(`Generated by: ${input.generatedByName}`, pageWidth / 2, pageHeight - 24, { align: "center" });
    }
  }

  return doc.output("blob");
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
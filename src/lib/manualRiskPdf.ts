import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import preapplicheckLogo from "@/assets/preapplicheck-logo.png";

export interface ManualRiskCandidatePdf {
  id_number: string;
  surname: string;
  first_name: string;
  id_verification_result?: string | null;
  id_verification_notes?: string | null;
  credit_result?: string | null;
  credit_notes?: string | null;
  criminal_result?: string | null;
  criminal_notes?: string | null;
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
}

const RESULT_LABELS: Record<string, string> = {
  valid: "Valid",
  invalid: "Invalid",
  deceased: "Deceased",
  pending: "Pending",
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
  very_high: "Very High Risk",
  clear: "Clear",
  record_found: "Record Found",
};

const RESULT_COLORS: Record<string, [number, number, number]> = {
  valid: [22, 163, 74],
  clear: [22, 163, 74],
  low: [22, 163, 74],
  medium: [202, 138, 4],
  high: [234, 88, 12],
  very_high: [185, 28, 28],
  invalid: [185, 28, 28],
  record_found: [185, 28, 28],
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

  // Header band
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, pageWidth, 90, "F");

  try {
    const logoData = await loadImageAsDataUrl(preapplicheckLogo);
    doc.addImage(logoData, "PNG", margin, 18, 54, 54);
  } catch {
    /* logo optional */
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("PreAppliCheck", margin + 68, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Risk Assessment Report", margin + 68, 60);

  doc.setFontSize(9);
  const dateStr = new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
  doc.text(dateStr, pageWidth - margin, 42, { align: "right" });
  doc.text(`Order No: ${input.orderNumber}`, pageWidth - margin, 58, { align: "right" });

  // Client block
  let y = 115;
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
  const body = input.candidates.map((c, idx) => [
    String(idx + 1),
    `${c.surname}, ${c.first_name}`,
    c.id_number,
    label(c.id_verification_result),
    label(c.credit_result),
    label(c.criminal_result),
  ]);

  autoTable(doc, {
    startY: y + 6,
    head: [["#", "Candidate", "ID Number", "ID Verification", "Credit / Risk", "Criminal"]],
    body,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 6, textColor: [30, 30, 30] },
    headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 22, halign: "center" },
      2: { cellWidth: 90 },
      3: { cellWidth: 82, halign: "center" },
      4: { cellWidth: 82, halign: "center" },
      5: { cellWidth: 82, halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index < 3) return;
      const cand = input.candidates[data.row.index];
      const key =
        data.column.index === 3 ? cand.id_verification_result :
        data.column.index === 4 ? cand.credit_result :
        cand.criminal_result;
      if (key && RESULT_COLORS[key]) {
        data.cell.styles.textColor = RESULT_COLORS[key];
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: margin, right: margin },
  });

  // Notes section (only when any note present)
  const withNotes = input.candidates.filter(
    (c) => c.id_verification_notes || c.credit_notes || c.criminal_notes
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
      if (c.id_verification_notes) lines.push(`• ID Verification: ${c.id_verification_notes}`);
      if (c.credit_notes) lines.push(`• Credit / Risk: ${c.credit_notes}`);
      if (c.criminal_notes) lines.push(`• Criminal: ${c.criminal_notes}`);
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
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
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
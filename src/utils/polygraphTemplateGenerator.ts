import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  CheckBox,
} from "docx";
import { saveAs } from "file-saver";

const createCheckboxRow = (label: string, indent: number = 0): Paragraph => {
  return new Paragraph({
    children: [
      new TextRun({ text: "☐ ", font: "Arial" }),
      new TextRun({ text: label, font: "Arial", size: 22 }),
    ],
    indent: { left: indent * 720 },
    spacing: { after: 100 },
  });
};

const createLabeledField = (label: string, width: string = "100%"): Paragraph => {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, font: "Arial", size: 22 }),
      new TextRun({ text: "_".repeat(50), font: "Arial", size: 22 }),
    ],
    spacing: { after: 200 },
  });
};

const createSectionHeader = (text: string): Paragraph => {
  return new Paragraph({
    children: [
      new TextRun({ text, bold: true, font: "Arial", size: 28, color: "C41E3A" }),
    ],
    spacing: { before: 400, after: 200 },
    heading: HeadingLevel.HEADING_2,
  });
};

const createSubHeader = (text: string): Paragraph => {
  return new Paragraph({
    children: [
      new TextRun({ text, bold: true, font: "Arial", size: 24 }),
    ],
    spacing: { before: 300, after: 150 },
  });
};

const createYesNoQuestion = (question: string, hasDetails: boolean = false): Paragraph[] => {
  const paragraphs = [
    new Paragraph({
      children: [
        new TextRun({ text: question, font: "Arial", size: 22 }),
        new TextRun({ text: "    ☐ Yes    ☐ No", font: "Arial", size: 22 }),
      ],
      spacing: { after: 100 },
    }),
  ];

  if (hasDetails) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: "If yes, details: ", font: "Arial", size: 22, italics: true }),
          new TextRun({ text: "_".repeat(40), font: "Arial", size: 22 }),
        ],
        indent: { left: 360 },
        spacing: { after: 200 },
      })
    );
  }

  return paragraphs;
};

const createAdmissionCategory = (
  category: string,
  description: string,
  subOptions: string[],
  hasValue: boolean = false,
  hasFrequency: boolean = false
): Paragraph[] => {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({ text: category, bold: true, font: "Arial", size: 24 }),
      ],
      spacing: { before: 300, after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: description, font: "Arial", size: 20, italics: true, color: "666666" }),
      ],
      spacing: { after: 150 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Candidate Response:    ☐ CONFIRMS    ☐ DENIES", font: "Arial", size: 22 }),
      ],
      spacing: { after: 150 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "If CONFIRMS, specify (tick all that apply):", font: "Arial", size: 22, italics: true }),
      ],
      spacing: { after: 100 },
    }),
  ];

  subOptions.forEach((option) => {
    paragraphs.push(createCheckboxRow(option, 1));
  });

  if (hasValue) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Estimated Value: ☐ Under R100  ☐ R100-R500  ☐ R500-R1,000  ☐ R1,000-R5,000  ☐ Over R5,000", font: "Arial", size: 20 }),
        ],
        indent: { left: 360 },
        spacing: { after: 100 },
      })
    );
  }

  if (hasFrequency) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Frequency: ☐ Once only  ☐ Occasional use  ☐ Regular use", font: "Arial", size: 20 }),
        ],
        indent: { left: 360 },
        spacing: { after: 100 },
      })
    );
  }

  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Time Window: ☐ Within 2 years  ☐ 2-5 years ago  ☐ 5+ years ago", font: "Arial", size: 20 }),
      ],
      indent: { left: 360 },
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Notes: ", font: "Arial", size: 20 }),
        new TextRun({ text: "_".repeat(60), font: "Arial", size: 20 }),
      ],
      indent: { left: 360 },
      spacing: { after: 200 },
    })
  );

  return paragraphs;
};

const createExamQuestionRow = (num: number): Paragraph[] => {
  return [
    new Paragraph({
      children: [
        new TextRun({ text: `Q${num}: `, bold: true, font: "Arial", size: 22 }),
        new TextRun({ text: "_".repeat(70), font: "Arial", size: 22 }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Response: ☐ Yes  ☐ No    |    Finding: ☐ SR  ☐ NSR  ☐ INC  ☐ PNC", font: "Arial", size: 20 }),
      ],
      indent: { left: 360 },
      spacing: { after: 200 },
    }),
  ];
};

export const generatePolygraphTemplate = async (): Promise<void> => {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Header
          new Paragraph({
            children: [
              new TextRun({ text: "TLDV POLYGRAPH EXAMINATION REPORT", bold: true, font: "Arial", size: 36, color: "C41E3A" }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "True Lie Detectors & Vetting", font: "Arial", size: 24, italics: true }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          // Section 1: Candidate Information
          createSectionHeader("SECTION 1: CANDIDATE INFORMATION"),
          createLabeledField("Store Name"),
          createLabeledField("Store Code"),
          createLabeledField("Examiner Name"),
          createLabeledField("Examination Date"),
          new Paragraph({ children: [], spacing: { after: 200 } }),
          createLabeledField("Candidate First Name"),
          createLabeledField("Candidate Last Name"),
          createLabeledField("ID Number (13 digits)"),
          createLabeledField("Contact Number"),
          createLabeledField("Email Address"),
          createLabeledField("Physical Address"),
          createLabeledField("Position Applying For"),

          // Section 2: Vetting Services
          createSectionHeader("SECTION 2: VETTING SERVICES REQUIRED"),
          new Paragraph({
            children: [
              new TextRun({ text: "(Tick all services performed)", font: "Arial", size: 20, italics: true }),
            ],
            spacing: { after: 200 },
          }),
          createCheckboxRow("Pre-Employment Polygraph"),
          createCheckboxRow("Periodic Polygraph"),
          createCheckboxRow("Specific Polygraph"),
          createCheckboxRow("Credit Check"),
          createCheckboxRow("ID Verification"),
          createCheckboxRow("DHA Check"),
          createCheckboxRow("Drug Screening"),
          createCheckboxRow("Criminal Check"),
          createCheckboxRow("Qualification Verification"),
          createCheckboxRow("Reference Check"),

          // Section 3: Suitability Questionnaire
          createSectionHeader("SECTION 3: PRE-EXAMINATION SUITABILITY"),
          new Paragraph({
            children: [
              new TextRun({ text: "General Health Status: ", bold: true, font: "Arial", size: 22 }),
              new TextRun({ text: "_".repeat(40), font: "Arial", size: 22 }),
            ],
            spacing: { after: 200 },
          }),
          ...createYesNoQuestion("Did you get enough sleep last night (6+ hours)?"),
          ...createYesNoQuestion("Have you been hospitalized in the last 6 months?", true),
          ...createYesNoQuestion("Are you currently taking any medication?", true),
          ...createYesNoQuestion("Do you have any heart conditions?"),
          ...createYesNoQuestion("Do you have breathing difficulties?"),
          ...createYesNoQuestion("Do you have any psychological disorders?"),
          ...createYesNoQuestion("Are you diabetic?"),
          ...createYesNoQuestion("Have you used drugs in the last 48 hours?", true),
          ...createYesNoQuestion("Have you consumed alcohol in the last 24 hours?", true),
          ...createYesNoQuestion("Do you smoke?", true),
          ...createYesNoQuestion("Are you pregnant?"),
          new Paragraph({ children: [], spacing: { after: 200 } }),
          new Paragraph({
            children: [
              new TextRun({ text: "SUITABILITY DETERMINATION:    ☐ SUITABLE    ☐ NOT SUITABLE", bold: true, font: "Arial", size: 24 }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Comments: ", font: "Arial", size: 22 }),
              new TextRun({ text: "_".repeat(50), font: "Arial", size: 22 }),
            ],
            spacing: { after: 400 },
          }),

          // Section 4: Admission Assessment
          createSectionHeader("SECTION 4: ADMISSION ASSESSMENT"),
          new Paragraph({
            children: [
              new TextRun({ text: "Pre-test interview admissions. For each category, indicate if the candidate CONFIRMS or DENIES involvement.", font: "Arial", size: 20, italics: true }),
            ],
            spacing: { after: 300 },
          }),

          ...createAdmissionCategory(
            "4.1 Drug/Substance Use",
            "Experimentation or use of illegal substances",
            ["Marijuana/Cannabis", "Cocaine", "Heroin", "Methamphetamine/Tik", "Khat", "Prescription Drug Abuse", "Other Substances"],
            false,
            true
          ),

          ...createAdmissionCategory(
            "4.2 Theft from Workplace",
            "Taking money, products, or items from employer",
            ["Cash/Money", "Products/Stock", "Equipment", "Supplies"],
            true
          ),

          ...createAdmissionCategory(
            "4.3 Fraud/Document Falsification",
            "Fraudulent activities or document manipulation",
            ["Document Fraud", "Identity Fraud", "Financial Fraud", "CV/Qualification Falsification"]
          ),

          ...createAdmissionCategory(
            "4.4 Bribery/Corruption",
            "Giving or accepting bribes",
            ["Accepted a Bribe", "Paid a Bribe", "Offered a Bribe"]
          ),

          ...createAdmissionCategory(
            "4.5 Criminal Syndicate Involvement",
            "Association with organized crime",
            ["Theft Ring", "Drug Dealing/Distribution", "Organized Crime", "Gang Involvement"]
          ),

          ...createAdmissionCategory(
            "4.6 Undetected Crimes",
            "Crimes committed that were never detected",
            ["Assault", "Theft (Outside Work)", "Vandalism", "Other Crime"]
          ),

          ...createAdmissionCategory(
            "4.7 Previous Dismissal",
            "Previous termination from employment",
            ["Dismissed for Theft", "Dismissed for Misconduct", "Dismissed for Poor Performance", "Other Reason"]
          ),

          ...createAdmissionCategory(
            "4.8 Gambling Issues",
            "Problem gambling that affects finances",
            ["Missed Payments Due to Gambling", "Gambling-Related Debt", "Gambling Affecting Work"]
          ),

          // Section 5: Examination Questions
          createSectionHeader("SECTION 5: EXAMINATION QUESTIONS"),
          new Paragraph({
            children: [
              new TextRun({ text: "Relevant Questions Asked During Examination", font: "Arial", size: 20, italics: true }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Findings Key: SR = Significant Response | NSR = No Significant Response | INC = Inconclusive | PNC = Problem Not Cleared", font: "Arial", size: 18, color: "666666" }),
            ],
            spacing: { after: 300 },
          }),
          ...createExamQuestionRow(1),
          ...createExamQuestionRow(2),
          ...createExamQuestionRow(3),
          ...createExamQuestionRow(4),
          ...createExamQuestionRow(5),
          ...createExamQuestionRow(6),
          ...createExamQuestionRow(7),
          ...createExamQuestionRow(8),
          ...createExamQuestionRow(9),
          ...createExamQuestionRow(10),

          // Section 6: Results
          createSectionHeader("SECTION 6: OVERALL RESULT & NOTES"),
          new Paragraph({
            children: [
              new TextRun({ text: "OVERALL EXAMINATION RESULT:", bold: true, font: "Arial", size: 24 }),
            ],
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "☐ PASSED    ☐ FAILED    ☐ INCONCLUSIVE", font: "Arial", size: 24 }),
            ],
            spacing: { after: 300 },
          }),
          createSubHeader("Examiner Notes & Observations:"),
          new Paragraph({
            children: [
              new TextRun({ text: "_".repeat(80), font: "Arial", size: 22 }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "_".repeat(80), font: "Arial", size: 22 }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "_".repeat(80), font: "Arial", size: 22 }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "_".repeat(80), font: "Arial", size: 22 }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "_".repeat(80), font: "Arial", size: 22 }),
            ],
            spacing: { after: 400 },
          }),

          // Signature Section
          createSectionHeader("SIGNATURES"),
          new Paragraph({
            children: [
              new TextRun({ text: "Examiner Signature: ________________________    Date: ______________", font: "Arial", size: 22 }),
            ],
            spacing: { after: 300 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Candidate Signature: ________________________    Date: ______________", font: "Arial", size: 22 }),
            ],
            spacing: { after: 200 },
          }),

          // Footer
          new Paragraph({ children: [], spacing: { after: 400 } }),
          new Paragraph({
            children: [
              new TextRun({ text: "TLDV - True Lie Detectors & Vetting | Confidential Document", font: "Arial", size: 18, color: "999999" }),
            ],
            alignment: AlignmentType.CENTER,
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `TLDV_Polygraph_Report_Template_${new Date().toISOString().split("T")[0]}.docx`);
};

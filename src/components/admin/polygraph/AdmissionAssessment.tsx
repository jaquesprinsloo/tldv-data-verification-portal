import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export interface Admission {
  category: string;
  confirmed: boolean;
  details: Record<string, any>;
  time_window: string | null;
  notes: string;
}

interface AdmissionAssessmentProps {
  admissions: Admission[];
  onChange: (admissions: Admission[]) => void;
}

const ADMISSION_CATEGORIES = [
  {
    id: "drug_use",
    label: "Drug/Substance Use",
    description: "Experimentation or use of illegal substances",
    subOptions: [
      { id: "marijuana", label: "Marijuana/Cannabis" },
      { id: "cocaine", label: "Cocaine" },
      { id: "heroin", label: "Heroin" },
      { id: "methamphetamine", label: "Methamphetamine/Tik" },
      { id: "khat", label: "Khat" },
      { id: "prescription_abuse", label: "Prescription Drug Abuse" },
      { id: "other_drugs", label: "Other Substances" },
    ],
    frequencyOptions: [
      { id: "once", label: "Once only" },
      { id: "occasional", label: "Occasional use" },
      { id: "regular", label: "Regular use" },
    ],
  },
  {
    id: "theft_from_work",
    label: "Theft from Workplace",
    description: "Taking money, products, or items from employer",
    subOptions: [
      { id: "cash", label: "Cash/Money" },
      { id: "products", label: "Products/Stock" },
      { id: "equipment", label: "Equipment" },
      { id: "supplies", label: "Supplies" },
    ],
    valueOptions: [
      { id: "under_r100", label: "Under R100" },
      { id: "r100_r500", label: "R100 - R500" },
      { id: "r500_r1000", label: "R500 - R1,000" },
      { id: "r1000_r5000", label: "R1,000 - R5,000" },
      { id: "over_r5000", label: "Over R5,000" },
    ],
  },
  {
    id: "fraud",
    label: "Fraud/Document Falsification",
    description: "Fraudulent activities or document manipulation",
    subOptions: [
      { id: "document_fraud", label: "Document Fraud" },
      { id: "identity_fraud", label: "Identity Fraud" },
      { id: "financial_fraud", label: "Financial Fraud" },
      { id: "cv_falsification", label: "CV/Qualification Falsification" },
    ],
  },
  {
    id: "bribery",
    label: "Bribery/Corruption",
    description: "Giving or accepting bribes",
    subOptions: [
      { id: "accepted_bribe", label: "Accepted a Bribe" },
      { id: "paid_bribe", label: "Paid a Bribe" },
      { id: "offered_bribe", label: "Offered a Bribe" },
    ],
  },
  {
    id: "criminal_syndicate",
    label: "Criminal Syndicate Involvement",
    description: "Association with organized crime",
    subOptions: [
      { id: "theft_ring", label: "Theft Ring" },
      { id: "drug_dealing", label: "Drug Dealing/Distribution" },
      { id: "organized_crime", label: "Organized Crime" },
      { id: "gang_involvement", label: "Gang Involvement" },
    ],
  },
  {
    id: "undetected_crimes",
    label: "Undetected Crimes",
    description: "Crimes committed that were never detected",
    subOptions: [
      { id: "assault", label: "Assault" },
      { id: "theft_outside_work", label: "Theft (Outside Work)" },
      { id: "vandalism", label: "Vandalism" },
      { id: "other_crime", label: "Other Crime" },
    ],
  },
  {
    id: "previous_dismissal",
    label: "Previous Dismissal",
    description: "Previous termination from employment",
    subOptions: [
      { id: "theft", label: "Dismissed for Theft" },
      { id: "misconduct", label: "Dismissed for Misconduct" },
      { id: "performance", label: "Dismissed for Poor Performance" },
      { id: "other_reason", label: "Other Reason" },
    ],
  },
  {
    id: "gambling_issues",
    label: "Gambling Issues",
    description: "Problem gambling that affects finances",
    subOptions: [
      { id: "missed_payments", label: "Missed Payments Due to Gambling" },
      { id: "debt_issues", label: "Gambling-Related Debt" },
      { id: "work_impact", label: "Gambling Affecting Work" },
    ],
  },
];

const TIME_WINDOWS = [
  { id: "within_2_years", label: "Within last 2 years" },
  { id: "2_5_years", label: "2-5 years ago" },
  { id: "5_plus_years", label: "5+ years ago" },
  { id: "never", label: "Never" },
];

const AdmissionAssessment = ({ admissions, onChange }: AdmissionAssessmentProps) => {
  // Initialize admissions for all categories if not present
  useEffect(() => {
    if (admissions.length === 0) {
      const initialAdmissions = ADMISSION_CATEGORIES.map((cat) => ({
        category: cat.id,
        confirmed: false,
        details: {},
        time_window: null,
        notes: "",
      }));
      onChange(initialAdmissions);
    }
  }, []);

  const getAdmission = (categoryId: string): Admission => {
    return (
      admissions.find((a) => a.category === categoryId) || {
        category: categoryId,
        confirmed: false,
        details: {},
        time_window: null,
        notes: "",
      }
    );
  };

  const updateAdmission = (categoryId: string, updates: Partial<Admission>) => {
    const newAdmissions = admissions.map((a) =>
      a.category === categoryId ? { ...a, ...updates } : a
    );
    // If the category doesn't exist, add it
    if (!admissions.find((a) => a.category === categoryId)) {
      newAdmissions.push({
        category: categoryId,
        confirmed: false,
        details: {},
        time_window: null,
        notes: "",
        ...updates,
      });
    }
    onChange(newAdmissions);
  };

  const toggleSubOption = (categoryId: string, optionId: string, checked: boolean) => {
    const admission = getAdmission(categoryId);
    const currentDetails = admission.details || {};
    const selectedItems = currentDetails.selectedItems || [];
    
    const newSelectedItems = checked
      ? [...selectedItems, optionId]
      : selectedItems.filter((id: string) => id !== optionId);
    
    updateAdmission(categoryId, {
      details: { ...currentDetails, selectedItems: newSelectedItems },
    });
  };

  const confirmedCount = admissions.filter((a) => a.confirmed).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Admission Assessment</h3>
          <p className="text-sm text-muted-foreground">
            Click-based assessment of candidate admissions during pre-test interview
          </p>
        </div>
        <Badge variant={confirmedCount > 0 ? "destructive" : "default"}>
          {confirmedCount} Admission{confirmedCount !== 1 ? "s" : ""} Confirmed
        </Badge>
      </div>

      <div className="space-y-4">
        {ADMISSION_CATEGORIES.map((category) => {
          const admission = getAdmission(category.id);
          const isConfirmed = admission.confirmed;

          return (
            <Card
              key={category.id}
              className={isConfirmed ? "border-destructive/50 bg-destructive/5" : ""}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {isConfirmed ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                      )}
                      {category.label}
                    </CardTitle>
                    <CardDescription>{category.description}</CardDescription>
                  </div>
                  <RadioGroup
                    value={isConfirmed ? "confirms" : "denies"}
                    onValueChange={(value) =>
                      updateAdmission(category.id, {
                        confirmed: value === "confirms",
                        details: value === "denies" ? {} : admission.details,
                        time_window: value === "denies" ? null : admission.time_window,
                      })
                    }
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="confirms" id={`${category.id}-confirms`} />
                      <Label
                        htmlFor={`${category.id}-confirms`}
                        className="text-sm font-medium text-destructive cursor-pointer"
                      >
                        Confirms
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="denies" id={`${category.id}-denies`} />
                      <Label
                        htmlFor={`${category.id}-denies`}
                        className="text-sm font-medium cursor-pointer"
                      >
                        Denies
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </CardHeader>

              {isConfirmed && (
                <CardContent className="space-y-4 pt-0">
                  {/* Sub-options */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Specify (select all that apply):</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {category.subOptions.map((option) => {
                        const selectedItems = admission.details?.selectedItems || [];
                        const isChecked = selectedItems.includes(option.id);
                        return (
                          <div key={option.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`${category.id}-${option.id}`}
                              checked={isChecked}
                              onCheckedChange={(checked) =>
                                toggleSubOption(category.id, option.id, checked as boolean)
                              }
                            />
                            <Label
                              htmlFor={`${category.id}-${option.id}`}
                              className="text-sm cursor-pointer"
                            >
                              {option.label}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Value options (for theft) */}
                  {category.valueOptions && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Estimated Value:</Label>
                      <Select
                        value={admission.details?.value || ""}
                        onValueChange={(value) =>
                          updateAdmission(category.id, {
                            details: { ...admission.details, value },
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select value range" />
                        </SelectTrigger>
                        <SelectContent>
                          {category.valueOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Frequency options (for drugs) */}
                  {category.frequencyOptions && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Frequency:</Label>
                      <Select
                        value={admission.details?.frequency || ""}
                        onValueChange={(value) =>
                          updateAdmission(category.id, {
                            details: { ...admission.details, frequency: value },
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          {category.frequencyOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Time window */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">When did this occur?</Label>
                    <Select
                      value={admission.time_window || ""}
                      onValueChange={(value) =>
                        updateAdmission(category.id, { time_window: value })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select time window" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_WINDOWS.filter((tw) => tw.id !== "never").map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Examiner Notes:</Label>
                    <Textarea
                      placeholder="Additional details or observations..."
                      value={admission.notes}
                      onChange={(e) =>
                        updateAdmission(category.id, { notes: e.target.value })
                      }
                      rows={2}
                    />
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AdmissionAssessment;

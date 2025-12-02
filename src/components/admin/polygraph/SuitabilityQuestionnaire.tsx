import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export interface SuitabilityData {
  health_status: string;
  enough_sleep: boolean | null;
  hospitalized_recently: boolean | null;
  hospitalized_details: string;
  medication_taken: boolean | null;
  medication_details: string;
  heart_conditions: boolean | null;
  breathing_trouble: boolean | null;
  psychological_disorders: boolean | null;
  diabetic: boolean | null;
  recent_drug_use: boolean | null;
  drug_use_details: string;
  recent_alcohol_use: boolean | null;
  alcohol_details: string;
  smoker: boolean | null;
  smoking_details: string;
  pregnant: boolean | null;
  suitable_for_exam: boolean | null;
  suitability_comment: string;
}

interface SuitabilityQuestionnaireProps {
  suitability: SuitabilityData;
  onChange: (data: SuitabilityData) => void;
}

const QUESTIONS = [
  { id: "enough_sleep", question: "Did you have enough sleep last night (minimum 6 hours)?", hasDetails: false },
  { id: "hospitalized_recently", question: "Have you been hospitalized in the last 6 months?", hasDetails: true, detailsField: "hospitalized_details" },
  { id: "medication_taken", question: "Are you currently taking any medication?", hasDetails: true, detailsField: "medication_details" },
  { id: "heart_conditions", question: "Do you have any heart conditions or problems?", hasDetails: false },
  { id: "breathing_trouble", question: "Do you have any trouble breathing or respiratory conditions?", hasDetails: false },
  { id: "psychological_disorders", question: "Have you ever been diagnosed with any psychological disorders?", hasDetails: false },
  { id: "diabetic", question: "Are you diabetic?", hasDetails: false },
  { id: "recent_drug_use", question: "Have you used any illegal drugs in the last 72 hours?", hasDetails: true, detailsField: "drug_use_details" },
  { id: "recent_alcohol_use", question: "Have you consumed alcohol in the last 24 hours?", hasDetails: true, detailsField: "alcohol_details" },
  { id: "smoker", question: "Do you smoke? If yes, when did you last smoke?", hasDetails: true, detailsField: "smoking_details" },
  { id: "pregnant", question: "Are you pregnant?", hasDetails: false },
];

const SuitabilityQuestionnaire = ({ suitability, onChange }: SuitabilityQuestionnaireProps) => {
  const updateField = (field: keyof SuitabilityData, value: any) => {
    onChange({ ...suitability, [field]: value });
  };

  const getYesNoValue = (value: boolean | null) => {
    if (value === null) return "";
    return value ? "yes" : "no";
  };

  // Calculate suitability concerns
  const concerns = [
    suitability.hospitalized_recently,
    suitability.heart_conditions,
    suitability.breathing_trouble,
    suitability.psychological_disorders,
    suitability.recent_drug_use,
    suitability.recent_alcohol_use,
    !suitability.enough_sleep,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Suitability Questionnaire</h3>
          <p className="text-sm text-muted-foreground">
            Pre-examination health and condition assessment
          </p>
        </div>
        {concerns > 0 && (
          <Card className="border-yellow-500 bg-yellow-50">
            <CardContent className="py-2 px-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-700">
                {concerns} potential concern{concerns !== 1 ? "s" : ""}
              </span>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>General Health Status</Label>
          <Textarea
            value={suitability.health_status}
            onChange={(e) => updateField("health_status", e.target.value)}
            placeholder="Describe the candidate's general health condition and appearance..."
            rows={2}
          />
        </div>

        {QUESTIONS.map((q) => {
          const value = suitability[q.id as keyof SuitabilityData] as boolean | null;
          const isYes = value === true;

          return (
            <Card key={q.id} className={isYes && q.hasDetails ? "border-yellow-500/50" : ""}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <Label className="flex-1">{q.question}</Label>
                  <RadioGroup
                    value={getYesNoValue(value)}
                    onValueChange={(v) => updateField(q.id as keyof SuitabilityData, v === "yes")}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="yes" id={`${q.id}-yes`} />
                      <Label htmlFor={`${q.id}-yes`} className="cursor-pointer">Yes</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id={`${q.id}-no`} />
                      <Label htmlFor={`${q.id}-no`} className="cursor-pointer">No</Label>
                    </div>
                  </RadioGroup>
                </div>
                {q.hasDetails && isYes && q.detailsField && (
                  <div className="mt-3">
                    <Textarea
                      value={suitability[q.detailsField as keyof SuitabilityData] as string}
                      onChange={(e) => updateField(q.detailsField as keyof SuitabilityData, e.target.value)}
                      placeholder="Please provide details..."
                      rows={2}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Suitability Determination */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="text-base">Suitability Determination</CardTitle>
          <CardDescription>
            Based on the questionnaire, is the candidate suitable for polygraph examination?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={getYesNoValue(suitability.suitable_for_exam)}
            onValueChange={(v) => updateField("suitable_for_exam", v === "yes")}
            className="flex gap-6"
          >
            <div className={`flex items-center space-x-2 p-4 rounded-lg border-2 flex-1 ${
              suitability.suitable_for_exam === true ? "border-green-500 bg-green-50" : "border-muted"
            }`}>
              <RadioGroupItem value="yes" id="suitable-yes" />
              <CheckCircle2 className={`h-4 w-4 ${suitability.suitable_for_exam === true ? "text-green-600" : "text-muted-foreground"}`} />
              <Label htmlFor="suitable-yes" className="cursor-pointer font-medium">
                Suitable for Examination
              </Label>
            </div>
            <div className={`flex items-center space-x-2 p-4 rounded-lg border-2 flex-1 ${
              suitability.suitable_for_exam === false ? "border-red-500 bg-red-50" : "border-muted"
            }`}>
              <RadioGroupItem value="no" id="suitable-no" />
              <AlertTriangle className={`h-4 w-4 ${suitability.suitable_for_exam === false ? "text-red-600" : "text-muted-foreground"}`} />
              <Label htmlFor="suitable-no" className="cursor-pointer font-medium">
                Not Suitable
              </Label>
            </div>
          </RadioGroup>

          <div className="space-y-2">
            <Label>Comments / Reasons</Label>
            <Textarea
              value={suitability.suitability_comment}
              onChange={(e) => updateField("suitability_comment", e.target.value)}
              placeholder="Add any comments about suitability determination..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SuitabilityQuestionnaire;

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, GripVertical } from "lucide-react";

export interface ExamQuestion {
  question_number: number;
  question_text: string;
  response: boolean | null;
  finding: string | null;
}

interface ExamQuestionsFormProps {
  questions: ExamQuestion[];
  onChange: (questions: ExamQuestion[]) => void;
}

const FINDINGS = [
  { id: "SR", label: "SR - Significant Reaction", color: "text-red-600" },
  { id: "NSR", label: "NSR - No Significant Reaction", color: "text-green-600" },
  { id: "INC", label: "INC - Inconclusive", color: "text-yellow-600" },
  { id: "PNC", label: "PNC - Pre/Post Not Confirmed", color: "text-gray-600" },
];

const COMMON_QUESTIONS = [
  "Did you steal any money from [Company Name]?",
  "Did you steal any products from [Company Name]?",
  "Have you been involved in any theft ring or syndicate?",
  "Did you receive any stolen goods knowing they were stolen?",
  "Have you accepted any bribes while working at [Company Name]?",
  "Did you assist anyone in stealing from [Company Name]?",
  "Have you falsified any documents at [Company Name]?",
  "Did you give unauthorized discounts to friends or family?",
  "Have you used illegal drugs in the last 6 months?",
  "Did you lie about anything on your employment application?",
];

const ExamQuestionsForm = ({ questions, onChange }: ExamQuestionsFormProps) => {
  const addQuestion = (text: string = "") => {
    const newQuestion: ExamQuestion = {
      question_number: questions.length + 1,
      question_text: text,
      response: null,
      finding: null,
    };
    onChange([...questions, newQuestion]);
  };

  const updateQuestion = (index: number, updates: Partial<ExamQuestion>) => {
    const newQuestions = questions.map((q, i) =>
      i === index ? { ...q, ...updates } : q
    );
    onChange(newQuestions);
  };

  const removeQuestion = (index: number) => {
    const newQuestions = questions.filter((_, i) => i !== index);
    // Re-number questions
    const renumbered = newQuestions.map((q, i) => ({
      ...q,
      question_number: i + 1,
    }));
    onChange(renumbered);
  };

  const getResponseValue = (response: boolean | null) => {
    if (response === null) return "";
    return response ? "yes" : "no";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Examination Questions</h3>
          <p className="text-sm text-muted-foreground">
            Add relevant questions asked during the polygraph examination
          </p>
        </div>
        <Button onClick={() => addQuestion()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Question
        </Button>
      </div>

      {/* Common Questions Suggestions */}
      <Card>
        <CardContent className="pt-4">
          <Label className="text-sm font-medium">Quick Add Common Questions:</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {COMMON_QUESTIONS.slice(0, 5).map((q, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => addQuestion(q)}
                className="text-xs"
              >
                + {q.substring(0, 30)}...
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Questions List */}
      {questions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-4">No questions added yet</p>
            <Button onClick={() => addQuestion()}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Question
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {questions.map((question, index) => (
            <Card key={index}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-4">
                  <div className="flex items-center gap-2 text-muted-foreground pt-2">
                    <GripVertical className="h-4 w-4" />
                    <span className="font-mono text-sm">Q{question.question_number}</span>
                  </div>

                  <div className="flex-1 space-y-4">
                    <div className="space-y-2">
                      <Label>Question Text</Label>
                      <Input
                        value={question.question_text}
                        onChange={(e) =>
                          updateQuestion(index, { question_text: e.target.value })
                        }
                        placeholder="Enter the relevant question..."
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Candidate Response</Label>
                        <RadioGroup
                          value={getResponseValue(question.response)}
                          onValueChange={(v) =>
                            updateQuestion(index, { response: v === "yes" })
                          }
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="yes" id={`q${index}-yes`} />
                            <Label htmlFor={`q${index}-yes`} className="cursor-pointer">
                              Yes
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="no" id={`q${index}-no`} />
                            <Label htmlFor={`q${index}-no`} className="cursor-pointer">
                              No
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div className="space-y-2">
                        <Label>Finding</Label>
                        <Select
                          value={question.finding || ""}
                          onValueChange={(v) => updateQuestion(index, { finding: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select finding" />
                          </SelectTrigger>
                          <SelectContent>
                            {FINDINGS.map((finding) => (
                              <SelectItem key={finding.id} value={finding.id}>
                                <span className={finding.color}>{finding.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeQuestion(index)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary */}
      {questions.length > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between text-sm">
              <span>Total Questions: {questions.length}</span>
              <div className="flex gap-4">
                <span className="text-red-600">
                  SR: {questions.filter((q) => q.finding === "SR").length}
                </span>
                <span className="text-green-600">
                  NSR: {questions.filter((q) => q.finding === "NSR").length}
                </span>
                <span className="text-yellow-600">
                  INC: {questions.filter((q) => q.finding === "INC").length}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ExamQuestionsForm;

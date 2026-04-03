import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, FileText, ChevronDown, ChevronRight } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface Section {
  id: string;
  template_id: string;
  title: string;
  sort_order: number;
}

interface Question {
  id: string;
  section_id: string;
  question_text: string;
  question_type: string;
  options: any;
  is_required: boolean;
  sort_order: number;
}

const CandexBuilder = () => {
  const queryClient = useQueryClient();
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [showAddQuestion, setShowAddQuestion] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState({ text: "", type: "text", options: "" });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["candex-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candex_questionnaire_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Template[];
    },
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["candex-sections", selectedTemplate?.id],
    enabled: !!selectedTemplate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candex_template_sections")
        .select("*")
        .eq("template_id", selectedTemplate!.id)
        .order("sort_order");
      if (error) throw error;
      return data as Section[];
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["candex-questions", selectedTemplate?.id],
    enabled: !!selectedTemplate && sections.length > 0,
    queryFn: async () => {
      const sectionIds = sections.map((s) => s.id);
      const { data, error } = await supabase
        .from("candex_template_questions")
        .select("*")
        .in("section_id", sectionIds)
        .order("sort_order");
      if (error) throw error;
      return data as Question[];
    },
  });

  const createTemplate = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.from("candex_questionnaire_templates").insert({
        name: newTemplateName,
        description: newTemplateDesc || null,
        created_by: session?.user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-templates"] });
      setShowNewTemplate(false);
      setNewTemplateName("");
      setNewTemplateDesc("");
      toast.success("Template created");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("candex_questionnaire_templates")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-templates"] });
      toast.success("Template updated");
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("candex_questionnaire_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-templates"] });
      setSelectedTemplate(null);
      toast.success("Template deleted");
    },
  });

  const addSection = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("candex_template_sections").insert({
        template_id: selectedTemplate!.id,
        title: newSectionTitle,
        sort_order: sections.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-sections"] });
      setShowAddSection(false);
      setNewSectionTitle("");
      toast.success("Section added");
    },
  });

  const deleteSection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("candex_template_sections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-sections", "candex-questions"] });
      toast.success("Section deleted");
    },
  });

  const addQuestionMutation = useMutation({
    mutationFn: async (sectionId: string) => {
      const sectionQuestions = questions.filter((q) => q.section_id === sectionId);
      const optionsArray = newQuestion.type === "select" || newQuestion.type === "multi_select"
        ? newQuestion.options.split(",").map((o) => o.trim()).filter(Boolean)
        : [];
      const { error } = await supabase.from("candex_template_questions").insert({
        section_id: sectionId,
        question_text: newQuestion.text,
        question_type: newQuestion.type,
        options: optionsArray,
        sort_order: sectionQuestions.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-questions"] });
      setShowAddQuestion(null);
      setNewQuestion({ text: "", type: "text", options: "" });
      toast.success("Question added");
    },
  });

  const deleteQuestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("candex_template_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-questions"] });
      toast.success("Question deleted");
    },
  });

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (selectedTemplate) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" onClick={() => setSelectedTemplate(null)} className="mb-2">
              ← Back to Templates
            </Button>
            <h2 className="text-xl font-bold">{selectedTemplate.name}</h2>
            {selectedTemplate.description && (
              <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
            )}
          </div>
          <Button onClick={() => setShowAddSection(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Section
          </Button>
        </div>

        {sections.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No sections yet. Add a section to start building the questionnaire.
            </CardContent>
          </Card>
        )}

        {sections.map((section) => {
          const sectionQuestions = questions.filter((q) => q.section_id === section.id);
          const isExpanded = expandedSections.has(section.id);

          return (
            <Card key={section.id}>
              <CardHeader
                className="cursor-pointer flex flex-row items-center justify-between"
                onClick={() => toggleSection(section.id)}
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <CardTitle className="text-base">{section.title}</CardTitle>
                  <Badge variant="secondary">{sectionQuestions.length} questions</Badge>
                </div>
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => setShowAddQuestion(section.id)}>
                    <Plus className="h-3 w-3 mr-1" /> Question
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteSection.mutate(section.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              {isExpanded && (
                <CardContent className="space-y-2">
                  {sectionQuestions.map((q, idx) => (
                    <div key={q.id} className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground font-mono">{idx + 1}.</span>
                        <div>
                          <p className="text-sm">{q.question_text}</p>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">{q.question_type}</Badge>
                            {q.is_required && <Badge variant="outline" className="text-xs">Required</Badge>}
                          </div>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => deleteQuestion.mutate(q.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {sectionQuestions.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No questions in this section.</p>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}

        {/* Add Section Dialog */}
        <Dialog open={showAddSection} onOpenChange={setShowAddSection}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Section</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Section Title</Label>
                <Input value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)} placeholder="e.g. Personal Information" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddSection(false)}>Cancel</Button>
              <Button onClick={() => addSection.mutate()} disabled={!newSectionTitle.trim()}>Add Section</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Question Dialog */}
        <Dialog open={!!showAddQuestion} onOpenChange={() => setShowAddQuestion(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Question</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Question Text</Label>
                <Textarea value={newQuestion.text} onChange={(e) => setNewQuestion((p) => ({ ...p, text: e.target.value }))} placeholder="Enter the question..." />
              </div>
              <div>
                <Label>Question Type</Label>
                <Select value={newQuestion.type} onValueChange={(v) => setNewQuestion((p) => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="boolean">Yes / No</SelectItem>
                    <SelectItem value="select">Dropdown (Single)</SelectItem>
                    <SelectItem value="multi_select">Multi Select</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(newQuestion.type === "select" || newQuestion.type === "multi_select") && (
                <div>
                  <Label>Options (comma separated)</Label>
                  <Input value={newQuestion.options} onChange={(e) => setNewQuestion((p) => ({ ...p, options: e.target.value }))} placeholder="Option 1, Option 2, Option 3" />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddQuestion(null)}>Cancel</Button>
              <Button onClick={() => addQuestionMutation.mutate(showAddQuestion!)} disabled={!newQuestion.text.trim()}>Add Question</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Questionnaire Templates</h2>
          <p className="text-sm text-muted-foreground">Build and manage pre-screening questionnaires</p>
        </div>
        <Button onClick={() => setShowNewTemplate(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse"><CardContent className="py-8"><div className="h-4 bg-muted rounded w-1/3" /></CardContent></Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">No Templates Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first questionnaire template to get started.</p>
            <Button onClick={() => setShowNewTemplate(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {templates.map((template) => (
            <Card key={template.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedTemplate(template)}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  {template.description && <CardDescription>{template.description}</CardDescription>}
                </div>
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Active</Label>
                    <Switch
                      checked={template.is_active}
                      onCheckedChange={(checked) => toggleActive.mutate({ id: template.id, is_active: checked })}
                    />
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => deleteTemplate.mutate(template.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNewTemplate} onOpenChange={setShowNewTemplate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create New Template</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} placeholder="e.g. Standard Pre-Screening" />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea value={newTemplateDesc} onChange={(e) => setNewTemplateDesc(e.target.value)} placeholder="Describe the purpose of this template..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTemplate(false)}>Cancel</Button>
            <Button onClick={() => createTemplate.mutate()} disabled={!newTemplateName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CandexBuilder;

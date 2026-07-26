import React, { useState, useRef, useCallback } from "react";
import { extractStoragePath } from "@/lib/storageUtils";
import QuestionnaireScreen from "@/components/candex-application/QuestionnaireScreen";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Trash2, FileText, ChevronDown, ChevronRight, Copy, Table as TableIcon, Eye, Video, PlayCircle, Upload, X, Info, Pencil, List, Volume2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Template {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  intro_video_url: string | null;
  brief_video_url: string | null;
}

interface Section {
  id: string;
  template_id: string;
  title: string;
  sort_order: number;
  video_url: string | null;
  is_pre_screening?: boolean;
  visible_if?: VisibilityRule | null;
}

interface VisibilityRule {
  question_id: string;
  equals: "Yes" | "No";
}

interface GateQuestion {
  id: string;
  section_id: string;
  question_text: string;
  question_type: string;
  is_required: boolean;
  sort_order: number;
  prefill_target: { table_id: string; row_index: number } | null;
}

interface RowInputType {
  type: "text" | "yes_no" | "select" | "multi_select" | "dynamic_select" | "currency" | "date_picker";
  options?: string[];
  source_table_id?: string;
  source_row_index?: number;
  require_explanation?: boolean;
}

interface SectionTable {
  id: string;
  section_id: string;
  table_title: string;
  column_headers: string[];
  row_labels: string[];
  row_input_types: RowInputType[];
  is_repeatable: boolean;
  sort_order: number;
  video_url: string | null;
  column_widths: number[] | null;
  row_video_urls: (string | null)[];
  visible_if?: VisibilityRule | null;
}

// Notification bubble component for candidate preview
const VideoHelpBubble = ({ videoUrl, label }: { videoUrl: string; label: string }) => {
  const [showVideo, setShowVideo] = useState(false);
  const [showPulse, setShowPulse] = useState(true);

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => { setShowVideo(true); setShowPulse(false); }}
              className="relative inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
            >
              <PlayCircle className="h-5 w-5" />
              {showPulse && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px]">
            <p className="text-xs">Click to play a short explainer for this section</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={showVideo} onOpenChange={setShowVideo}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" /> {label}
            </DialogTitle>
          </DialogHeader>
          {/\.(mp3|wav|ogg|aac|m4a|flac|wma)/i.test(videoUrl) ? (
            <div className="py-4">
              <audio src={videoUrl} controls autoPlay className="w-full" />
            </div>
          ) : (
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <video src={videoUrl} controls autoPlay className="w-full h-full" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

// Upload video button component for admin
const VideoUploadButton = ({
  currentUrl,
  onUploaded,
  onRemoved,
  label,
}: {
  currentUrl: string | null;
  onUploaded: (url: string) => void;
  onRemoved: () => void;
  label: string;
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) {
      toast.error("Please select a video or audio file");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File must be under 50MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "mp4";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("candex-videos").upload(path, file);
      if (error) throw error;

      const { data: signedData } = await supabase.storage.from("candex-videos").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signedData?.signedUrl) {
        onUploaded(signedData.signedUrl);
        toast.success(file.type.startsWith("audio/") ? "Audio uploaded" : "Video uploaded");
      }
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (currentUrl) {
        const storagePath = extractStoragePath(currentUrl, "candex-videos");
        if (storagePath) {
          await supabase.storage.from("candex-videos").remove([storagePath]);
        }
      }
      onRemoved();
      toast.success("Media deleted");
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = "";
        }}
      />
      {confirmDelete ? (
        <div className="flex items-center gap-1 bg-destructive/10 border border-destructive/30 rounded-md px-2 py-1">
          <span className="text-[10px] text-destructive font-medium">Delete {label} media?</span>
          <Button size="sm" variant="destructive" className="h-5 px-2 text-[10px]" onClick={handleDelete} disabled={deleting}>
            {deleting ? "..." : "Yes"}
          </Button>
          <Button size="sm" variant="ghost" className="h-5 px-2 text-[10px]" onClick={() => setConfirmDelete(false)}>
            No
          </Button>
        </div>
      ) : currentUrl ? (
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="gap-1 text-xs">
            <Video className="h-3 w-3" /> {label} media
          </Badge>
          <Button size="sm" variant="outline" className="h-6 px-1.5 gap-1 text-[10px]" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-3 w-3" /> {uploading ? "..." : "Replace"}
          </Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setConfirmDelete(true)}>
            <X className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 gap-1"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-3 w-3" />
          {uploading ? "Uploading..." : `${label} Media`}
        </Button>
      )}
    </div>
  );
};
// Row input type labels
const INPUT_TYPE_LABELS: Record<string, string> = {
  text: "Free Text",
  yes_no: "Yes / No",
  select: "Single Select",
  multi_select: "Multi Select",
  dynamic_select: "Dynamic Select",
  currency: "Currency (R)",
  date_picker: "Date Picker",
};

// Helper to get or default a row input type
const getRowInputType = (types: RowInputType[], index: number): RowInputType => {
  return types[index] || { type: "text" };
};

// Row input type configurator for add/edit dialogs
const RowInputTypeConfigurator = ({
  rowLabels,
  inputTypes,
  onChange,
  allTables,
  allSections,
  rowVideoUrls,
  onVideoUrlsChange,
}: {
  rowLabels: string[];
  inputTypes: RowInputType[];
  onChange: (types: RowInputType[]) => void;
  allTables?: SectionTable[];
  allSections?: Section[];
  rowVideoUrls?: (string | null)[];
  onVideoUrlsChange?: (urls: (string | null)[]) => void;
}) => {
  const [editingSource, setEditingSource] = useState<number | null>(null);
  const [bulkOptions, setBulkOptions] = useState<number | null>(null);
  const [bulkText, setBulkText] = useState("");

  const updateType = (index: number, type: RowInputType["type"]) => {
    const updated = [...inputTypes];
    while (updated.length <= index) updated.push({ type: "text" });
    updated[index] = {
      type,
      options: (type === "select" || type === "multi_select") ? (updated[index]?.options || []) : undefined,
      source_table_id: type === "dynamic_select" ? (updated[index]?.source_table_id) : undefined,
      source_row_index: type === "dynamic_select" ? (updated[index]?.source_row_index ?? 0) : undefined,
      require_explanation: updated[index]?.require_explanation ?? false,
    };
    onChange(updated);
  };

  const setRow = (index: number, patch: Partial<RowInputType>) => {
    const updated = [...inputTypes];
    while (updated.length <= index) updated.push({ type: "text" });
    updated[index] = { ...updated[index], ...patch };
    onChange(updated);
  };

  const setOptions = (index: number, opts: string[]) => setRow(index, { options: opts });

  const openBulk = (index: number) => {
    setBulkText((getRowInputType(inputTypes, index).options || []).join("\n"));
    setBulkOptions(index);
  };

  const saveBulk = () => {
    if (bulkOptions === null) return;
    setOptions(bulkOptions, bulkText.split("\n").map((o) => o.trim()).filter(Boolean));
    setBulkOptions(null);
  };

  const updateSource = (index: number, tableId: string, rowIdx: number) => {
    const updated = [...inputTypes];
    while (updated.length <= index) updated.push({ type: "text" });
    updated[index] = { ...updated[index], source_table_id: tableId, source_row_index: rowIdx };
    onChange(updated);
  };

  if (rowLabels.length === 0) return null;

  // Build a lookup for source table names
  const tableMap = new Map((allTables || []).map(t => [t.id, t]));
  const sectionMap = new Map((allSections || []).map(s => [s.id, s]));

  const getSourceLabel = (rit: RowInputType) => {
    if (!rit.source_table_id) return "Not linked";
    const tbl = tableMap.get(rit.source_table_id);
    if (!tbl) return "Not linked";
    const rowLabel = tbl.row_labels[rit.source_row_index ?? 0] || "Row 1";
    return `${tbl.table_title} → ${rowLabel}`;
  };

  const TYPE_LABELS: Record<string, string> = {
    text: "Free Text",
    yes_no: "Yes / No",
    select: "Single Select",
    multi_select: "Multi Select",
    dynamic_select: "Dynamic Select",
    currency: "Currency (R)",
    date_picker: "Date Picker",
  };

  const PRESETS: { label: string; opts: string[] }[] = [
    { label: "Yes / No / Unsure", opts: ["Yes", "No", "Unsure"] },
    { label: "Frequency", opts: ["Never", "Occasionally", "Often", "Daily"] },
    { label: "Rating", opts: ["Poor", "Fair", "Good", "Excellent"] },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label className="block">Answering Options per Row</Label>
        <span className="text-[11px] text-muted-foreground">{rowLabels.length} row{rowLabels.length === 1 ? "" : "s"}</span>
      </div>
      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
        {rowLabels.map((label, i) => {
          const rit = getRowInputType(inputTypes, i);
          const needsOptions = rit.type === "select" || rit.type === "multi_select";
          const opts = rit.options || [];
          return (
            <div key={i} className="rounded-md border bg-card">
              {/* Row header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-xs font-medium">{label}</span>
                <Badge variant="secondary" className="text-[10px]">{TYPE_LABELS[rit.type] || rit.type}</Badge>
                {onVideoUrlsChange && (
                  <VideoUploadButton
                    currentUrl={rowVideoUrls?.[i] || null}
                    onUploaded={(url) => {
                      const updated = [...(rowVideoUrls || [])];
                      while (updated.length <= i) updated.push(null);
                      updated[i] = url;
                      onVideoUrlsChange(updated);
                    }}
                    onRemoved={() => {
                      const updated = [...(rowVideoUrls || [])];
                      while (updated.length <= i) updated.push(null);
                      updated[i] = null;
                      onVideoUrlsChange(updated);
                    }}
                    label="Field"
                  />
                )}
              </div>

              {/* Row body */}
              <div className="px-3 py-2.5 space-y-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Answer type</span>
                    <select
                      className="h-8 text-xs rounded-md border border-input bg-background px-2"
                      value={rit.type}
                      onChange={(e) => updateType(i, e.target.value as RowInputType["type"])}
                    >
                      {Object.entries(TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id={`details-${i}`}
                      checked={rit.require_explanation === true}
                      onCheckedChange={(checked) => setRow(i, { require_explanation: !!checked })}
                    />
                    <label htmlFor={`details-${i}`} className="text-[11px] text-muted-foreground cursor-pointer select-none">
                      Ask for extra details
                    </label>
                  </div>
                </div>

                {rit.type === "dynamic_select" && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Source</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 max-w-[240px] truncate" onClick={() => setEditingSource(i)}>
                      <List className="h-3 w-3" /> {getSourceLabel(rit)}
                    </Button>
                  </div>
                )}

                {needsOptions && (
                  <div className="rounded-md border border-dashed p-2 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium">Choices ({opts.length})</span>
                      <Button size="sm" variant="ghost" className="h-6 text-[11px] gap-1" onClick={() => openBulk(i)}>
                        <Pencil className="h-3 w-3" /> Bulk edit
                      </Button>
                    </div>
                    {opts.length === 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {PRESETS.map((p) => (
                          <Button key={p.label} size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setOptions(i, p.opts)}>
                            {p.label}
                          </Button>
                        ))}
                      </div>
                    )}
                    {opts.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground w-4 text-right">{oi + 1}.</span>
                        <Input
                          value={opt}
                          onChange={(e) => setOptions(i, opts.map((o, x) => (x === oi ? e.target.value : o)))}
                          className="h-7 text-xs"
                          placeholder={`Option ${oi + 1}`}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => setOptions(i, opts.filter((_, x) => x !== oi))}
                        >
                          <X className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => setOptions(i, [...opts, ""])}>
                      <Plus className="h-3 w-3" /> Add choice
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Choose how candidates answer each row. "Dynamic Select" auto-populates choices from another table's data (e.g. company names from employment history).
      </p>

      {/* Bulk options editor */}
      <Dialog open={bulkOptions !== null} onOpenChange={(open) => { if (!open) setBulkOptions(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Bulk Edit Choices: {bulkOptions !== null ? rowLabels[bulkOptions] : ""}
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs">One choice per line</Label>
            <Textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              placeholder={"Option A\nOption B\nOption C"}
            />
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setBulkOptions(null)}>Cancel</Button>
            <Button size="sm" onClick={saveBulk}>Save Choices</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dynamic source picker dialog */}
      <Dialog open={editingSource !== null} onOpenChange={(open) => { if (!open) setEditingSource(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Link to Source Data: {editingSource !== null ? rowLabels[editingSource] : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Select which table and row field should auto-populate the dropdown options. For example, link to the "Company Name" row from the Employment History table.
            </p>
            {(allTables || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No tables available to link to. Create other tables first.</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {(allSections || []).map(sec => {
                  const secTables = (allTables || []).filter(t => t.section_id === sec.id);
                  if (secTables.length === 0) return null;
                  return (
                    <div key={sec.id} className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{sec.title}</p>
                      {secTables.map(tbl => (
                        <div key={tbl.id} className="ml-2 space-y-0.5">
                          <p className="text-xs font-medium">{tbl.table_title}</p>
                          {tbl.row_labels.map((rl, ri) => {
                            const currentRit = editingSource !== null ? getRowInputType(inputTypes, editingSource) : null;
                            const isSelected = currentRit?.source_table_id === tbl.id && currentRit?.source_row_index === ri;
                            return (
                              <button
                                key={ri}
                                className={`ml-2 w-full text-left text-xs px-2 py-1.5 rounded border transition-colors ${
                                  isSelected
                                    ? "border-primary bg-primary/10 text-primary font-medium"
                                    : "border-transparent hover:bg-muted"
                                }`}
                                onClick={() => {
                                  if (editingSource !== null) {
                                    updateSource(editingSource, tbl.id, ri);
                                  }
                                }}
                              >
                                → {rl}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setEditingSource(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/** Picker that links a section/table to a pre-screening Yes/No answer. */
const VisibilityPicker = ({
  rule,
  gateQuestions,
  onChange,
  label = "Only show if",
}: {
  rule?: VisibilityRule | null;
  gateQuestions: GateQuestion[];
  onChange: (rule: VisibilityRule | null) => void;
  label?: string;
}) => {
  if (gateQuestions.length === 0) return null;
  const current = rule?.question_id ? rule : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={current?.question_id || ""}
        onChange={(e) =>
          onChange(e.target.value ? { question_id: e.target.value, equals: current?.equals || "Yes" } : null)
        }
        className="h-8 rounded-md border bg-background px-2 text-xs max-w-[260px]"
      >
        <option value="">Always shown</option>
        {gateQuestions.map((q) => (
          <option key={q.id} value={q.id}>{q.question_text}</option>
        ))}
      </select>
      {current && (
        <select
          value={current.equals}
          onChange={(e) => onChange({ question_id: current.question_id, equals: e.target.value as "Yes" | "No" })}
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          <option value="Yes">= Yes</option>
          <option value="No">= No</option>
        </select>
      )}
    </div>
  );
};

const CandexBuilder = () => {
  const queryClient = useQueryClient();
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showAddSection, setShowAddSection] = useState(false);
  const [builderTab, setBuilderTab] = useState("structure");
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionIsPre, setNewSectionIsPre] = useState(false);
  const [newGateText, setNewGateText] = useState<Record<string, string>>({});
  const [showAddTable, setShowAddTable] = useState<string | null>(null);
  const [newTable, setNewTable] = useState({
    title: "",
    columns: "Field, Details",
    rows: "",
    is_repeatable: false,
  });
  const [newTableInputTypes, setNewTableInputTypes] = useState<RowInputType[]>([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [editingTable, setEditingTable] = useState<SectionTable | null>(null);
  const [editTable, setEditTable] = useState({
    title: "",
    columns: "",
    rows: "",
    is_repeatable: false,
  });
  const [editTableInputTypes, setEditTableInputTypes] = useState<RowInputType[]>([]);
  const [editTableColumnWidths, setEditTableColumnWidths] = useState<number[]>([]);
  const [editTableRowVideoUrls, setEditTableRowVideoUrls] = useState<(string | null)[]>([]);
  const [newTableRowVideoUrls, setNewTableRowVideoUrls] = useState<(string | null)[]>([]);
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
      return (data || []) as unknown as Section[];
    },
  });

  // Gate (pre-screening) questions for this template
  const { data: gateQuestions = [] } = useQuery({
    queryKey: ["candex-gate-questions", selectedTemplate?.id],
    enabled: !!selectedTemplate && sections.length > 0,
    queryFn: async () => {
      const preIds = sections.filter((s) => s.is_pre_screening).map((s) => s.id);
      if (preIds.length === 0) return [] as GateQuestion[];
      const { data, error } = await supabase
        .from("candex_template_questions")
        .select("*")
        .in("section_id", preIds)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as GateQuestion[];
    },
  });

  const { data: sectionTables = [] } = useQuery({
    queryKey: ["candex-section-tables", selectedTemplate?.id],
    enabled: !!selectedTemplate && sections.length > 0,
    queryFn: async () => {
      const sectionIds = sections.map((s) => s.id);
      const { data, error } = await supabase
        .from("candex_section_tables")
        .select("*")
        .in("section_id", sectionIds)
        .order("sort_order");
      if (error) throw error;
      return (data || []).map((t: any) => ({
        ...t,
        column_headers: Array.isArray(t.column_headers) ? t.column_headers : JSON.parse(t.column_headers || "[]"),
        row_labels: Array.isArray(t.row_labels) ? t.row_labels : JSON.parse(t.row_labels || "[]"),
        row_input_types: Array.isArray(t.row_input_types) ? t.row_input_types : JSON.parse(t.row_input_types || "[]"),
        row_video_urls: Array.isArray(t.row_video_urls) ? t.row_video_urls : [],
      })) as SectionTable[];
    },
  });

  // --- Mutations ---
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

  const updateTemplateVideo = useMutation({
    mutationFn: async ({ id, field, url }: { id: string; field: "intro_video_url" | "brief_video_url"; url: string | null }) => {
      const { error } = await supabase
        .from("candex_questionnaire_templates")
        .update({ [field]: url, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-templates"] });
      toast.success("Video updated");
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
        is_pre_screening: newSectionIsPre,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-sections"] });
      setShowAddSection(false);
      setNewSectionTitle("");
      setNewSectionIsPre(false);
      toast.success("Section added");
    },
  });

  // --- Pre-screening gate question mutations ---
  const addGateQuestion = useMutation({
    mutationFn: async ({ sectionId, text }: { sectionId: string; text: string }) => {
      const existing = gateQuestions.filter((q) => q.section_id === sectionId);
      const { error } = await supabase.from("candex_template_questions").insert({
        section_id: sectionId,
        question_text: text,
        question_type: "yes_no",
        is_required: true,
        sort_order: existing.length,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-gate-questions"] });
      toast.success("Pre-screening question added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteGateQuestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("candex_template_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-gate-questions"] });
      queryClient.invalidateQueries({ queryKey: ["candex-sections"] });
      queryClient.invalidateQueries({ queryKey: ["candex-section-tables"] });
      toast.success("Question removed");
    },
  });

  const updateGatePrefill = useMutation({
    mutationFn: async ({ id, target }: { id: string; target: { table_id: string; row_index: number } | null }) => {
      const { error } = await supabase
        .from("candex_template_questions")
        .update({ prefill_target: target } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["candex-gate-questions"] }),
  });

  const updateVisibility = useMutation({
    mutationFn: async ({ kind, id, rule }: { kind: "section" | "table"; id: string; rule: VisibilityRule | null }) => {
      const { error } = await supabase
        .from(kind === "section" ? "candex_template_sections" : "candex_section_tables")
        .update({ visible_if: rule } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({
        queryKey: [vars.kind === "section" ? "candex-sections" : "candex-section-tables"],
      });
      toast.success("Conditional rule saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("candex_template_sections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-sections", "candex-section-tables"] });
      toast.success("Section deleted");
    },
  });

  const addTableMutation = useMutation({
    mutationFn: async (sectionId: string) => {
      const existing = sectionTables.filter((t) => t.section_id === sectionId);
      const colHeaders = newTable.columns.split(",").map((c) => c.trim()).filter(Boolean);
      const rowLabels = newTable.rows.split("\n").map((r) => r.trim()).filter(Boolean);
      const { error } = await supabase.from("candex_section_tables").insert({
        section_id: sectionId,
        table_title: newTable.title,
        column_headers: colHeaders as any,
        row_labels: rowLabels as any,
        row_input_types: newTableInputTypes.slice(0, rowLabels.length) as any,
        row_video_urls: newTableRowVideoUrls.slice(0, rowLabels.length) as any,
        is_repeatable: newTable.is_repeatable,
        sort_order: existing.length,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-section-tables"] });
      setShowAddTable(null);
      setNewTable({ title: "", columns: "Field, Details", rows: "", is_repeatable: false });
      setNewTableInputTypes([]);
      setNewTableRowVideoUrls([]);
      toast.success("Table added");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTableMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("candex_section_tables").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-section-tables"] });
      toast.success("Table removed");
    },
  });

  const updateTableMutation = useMutation({
    mutationFn: async () => {
      if (!editingTable) return;
      const colHeaders = editTable.columns.split(",").map((c) => c.trim()).filter(Boolean);
      const rowLabels = editTable.rows.split("\n").map((r) => r.trim()).filter(Boolean);
      const widths = editTableColumnWidths.length === colHeaders.length ? editTableColumnWidths : colHeaders.map(() => Math.floor(100 / colHeaders.length));
      const videoUrls = editTableRowVideoUrls.slice(0, rowLabels.length);
      const { error } = await supabase
        .from("candex_section_tables")
        .update({
          table_title: editTable.title,
          column_headers: colHeaders as any,
          row_labels: rowLabels as any,
          row_input_types: editTableInputTypes.slice(0, rowLabels.length) as any,
          is_repeatable: editTable.is_repeatable,
          column_widths: widths as any,
          row_video_urls: videoUrls as any,
        } as any)
        .eq("id", editingTable.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-section-tables"] });
      setEditingTable(null);
      toast.success("Table updated");
    },
    onError: (e) => toast.error(e.message),
  });

  // Save column widths from drag-resize in preview
  const saveColumnWidths = useMutation({
    mutationFn: async ({ tableId, widths }: { tableId: string; widths: number[] }) => {
      const { error } = await supabase
        .from("candex_section_tables")
        .update({ column_widths: widths as any } as any)
        .eq("id", tableId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-section-tables"] });
    },
  });

  // Drag-to-resize column handler
  const resizeRef = useRef<{ tableId: string; colIndex: number; startX: number; startWidths: number[]; tableEl: HTMLTableElement; currentWidths?: number[] } | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent, tableId: string, colIndex: number, colCount: number, currentWidths: number[] | null, tableEl: HTMLTableElement) => {
    e.preventDefault();
    const widths = currentWidths && currentWidths.length === colCount
      ? [...currentWidths]
      : Array.from({ length: colCount }, () => Math.floor(100 / colCount));
    resizeRef.current = { tableId, colIndex, startX: e.clientX, startWidths: widths, tableEl };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const { colIndex: ci, startX, startWidths: sw, tableEl: tEl } = resizeRef.current;
      const tableWidth = tEl.getBoundingClientRect().width;
      const deltaPct = ((ev.clientX - startX) / tableWidth) * 100;
      const newWidths = [...sw];
      const nextCi = ci + 1;
      if (nextCi >= newWidths.length) return;
      newWidths[ci] = Math.max(5, Math.round(sw[ci] + deltaPct));
      newWidths[nextCi] = Math.max(5, Math.round(sw[nextCi] - deltaPct));
      const ths = tEl.querySelectorAll("thead th");
      ths.forEach((th, idx) => {
        if (newWidths[idx]) (th as HTMLElement).style.width = `${newWidths[idx]}%`;
      });
      resizeRef.current.currentWidths = newWidths;
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      const finalWidths = resizeRef.current?.currentWidths || resizeRef.current?.startWidths;
      if (finalWidths && resizeRef.current) {
        saveColumnWidths.mutate({ tableId: resizeRef.current.tableId, widths: finalWidths });
      }
      resizeRef.current = null;
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [saveColumnWidths]);

  const toggleRepeatable = useMutation({
    mutationFn: async ({ id, is_repeatable }: { id: string; is_repeatable: boolean }) => {
      const { error } = await supabase
        .from("candex_section_tables")
        .update({ is_repeatable })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-section-tables"] });
      toast.success("Updated");
    },
  });

  const openEditTable = (tbl: SectionTable) => {
    setEditTable({
      title: tbl.table_title,
      columns: tbl.column_headers.join(", "),
      rows: tbl.row_labels.join("\n"),
      is_repeatable: tbl.is_repeatable,
    });
    setEditTableInputTypes(tbl.row_input_types.length > 0 ? [...tbl.row_input_types] : tbl.row_labels.map(() => ({ type: "text" as const })));
    const defaultWidths = tbl.column_headers.map(() => Math.floor(100 / tbl.column_headers.length));
    setEditTableColumnWidths(tbl.column_widths || defaultWidths);
    setEditTableRowVideoUrls(tbl.row_video_urls || tbl.row_labels.map(() => null));
    setEditingTable(tbl);
  };

  const updateSectionVideo = useMutation({
    mutationFn: async ({ id, video_url }: { id: string; video_url: string | null }) => {
      const { error } = await supabase
        .from("candex_template_sections")
        .update({ video_url })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-sections"] });
    },
  });

  const updateTableVideo = useMutation({
    mutationFn: async ({ id, video_url }: { id: string; video_url: string | null }) => {
      const { error } = await supabase
        .from("candex_section_tables")
        .update({ video_url })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-section-tables"] });
    },
  });

  const updateRowVideoUrl = useMutation({
    mutationFn: async ({ tableId, rowIndex, url, currentUrls }: { tableId: string; rowIndex: number; url: string | null; currentUrls: (string | null)[] }) => {
      const updated = [...currentUrls];
      updated[rowIndex] = url;
      const { error } = await supabase
        .from("candex_section_tables")
        .update({ row_video_urls: updated as any })
        .eq("id", tableId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candex-section-tables"] });
    },
  });

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // --- Template editor view ---
  if (selectedTemplate) {
    const preScreeningSections = sections.filter((s) => s.is_pre_screening);
    const mainSections = sections.filter((s) => !s.is_pre_screening);
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <Button variant="ghost" onClick={() => { setSelectedTemplate(null); setPreviewMode(false); }} className="mb-2">
              ← Back to Templates
            </Button>
            <h2 className="text-xl font-bold">{selectedTemplate.name}</h2>
            {selectedTemplate.description && (
              <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setPreviewMode(!previewMode)}>
              <Eye className="h-4 w-4 mr-2" /> {previewMode ? "Edit Mode" : "Quick Preview"}
            </Button>
            <Button variant="default" onClick={() => setShowLivePreview(true)} className="bg-red-600 hover:bg-red-700 text-white">
              <Eye className="h-4 w-4 mr-2" /> Live Applicant Preview
            </Button>
          </div>
        </div>

        <Tabs value={builderTab} onValueChange={setBuilderTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 max-w-xl">
            <TabsTrigger value="structure" className="text-xs sm:text-sm">
              <TableIcon className="h-3.5 w-3.5 mr-1.5" /> Structure
            </TabsTrigger>
            <TabsTrigger value="media" className="text-xs sm:text-sm">
              <Volume2 className="h-3.5 w-3.5 mr-1.5" /> Videos &amp; Audio
            </TabsTrigger>
            <TabsTrigger value="pre-screening" className="text-xs sm:text-sm">
              <List className="h-3.5 w-3.5 mr-1.5" /> Pre-Screening
            </TabsTrigger>
          </TabsList>

          {/* ══════════ MEDIA TAB ══════════ */}
          <TabsContent value="media" className="space-y-4">
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Video className="h-4 w-4" /> Template Videos
              </CardTitle>
              <CardDescription className="text-xs">
                Upload the introduction and brief videos that applicants will see before starting the questionnaire.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Introduction Video</Label>
                <p className="text-[10px] text-muted-foreground">Shown after the splash screen — explains the PreAppliCheck process.</p>
                <VideoUploadButton
                  currentUrl={(selectedTemplate as any).intro_video_url || null}
                  onUploaded={(url) => {
                    updateTemplateVideo.mutate({ id: selectedTemplate.id, field: "intro_video_url", url });
                    setSelectedTemplate({ ...selectedTemplate, intro_video_url: url } as any);
                  }}
                  onRemoved={() => {
                    updateTemplateVideo.mutate({ id: selectedTemplate.id, field: "intro_video_url", url: null });
                    setSelectedTemplate({ ...selectedTemplate, intro_video_url: null } as any);
                  }}
                  label="Intro"
                />
                {(selectedTemplate as any).intro_video_url && (
                  <video src={(selectedTemplate as any).intro_video_url} controls className="w-full rounded-md border max-h-32" />
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Brief / Instructions Video</Label>
                <p className="text-[10px] text-muted-foreground">Shown before the questionnaire begins — instructs candidates on how to complete it.</p>
                <VideoUploadButton
                  currentUrl={(selectedTemplate as any).brief_video_url || null}
                  onUploaded={(url) => {
                    updateTemplateVideo.mutate({ id: selectedTemplate.id, field: "brief_video_url", url });
                    setSelectedTemplate({ ...selectedTemplate, brief_video_url: url } as any);
                  }}
                  onRemoved={() => {
                    updateTemplateVideo.mutate({ id: selectedTemplate.id, field: "brief_video_url", url: null });
                    setSelectedTemplate({ ...selectedTemplate, brief_video_url: null } as any);
                  }}
                  label="Brief"
                />
                {(selectedTemplate as any).brief_video_url && (
                  <video src={(selectedTemplate as any).brief_video_url} controls className="w-full rounded-md border max-h-32" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Explainer library — one clear place for every section / table / row explainer */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Volume2 className="h-4 w-4" /> Explainer Library
              </CardTitle>
              <CardDescription className="text-xs">
                Audio or video explainers played inside the questionnaire. Candidates must start the section
                explainer before they can fill in that section.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mainSections.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Add a section in the Structure tab first.
                </p>
              )}
              {mainSections.map((section) => {
                const secTables = sectionTables.filter((t) => t.section_id === section.id);
                return (
                  <div key={section.id} className="rounded-lg border">
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-muted/40 border-b">
                      <span className="text-sm font-semibold">{section.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground hidden sm:inline">Section explainer</span>
                        <VideoUploadButton
                          currentUrl={section.video_url}
                          onUploaded={(url) => updateSectionVideo.mutate({ id: section.id, video_url: url })}
                          onRemoved={() => updateSectionVideo.mutate({ id: section.id, video_url: null })}
                          label="Section"
                        />
                      </div>
                    </div>
                    <div className="divide-y">
                      {secTables.length === 0 && (
                        <p className="px-4 py-3 text-xs text-muted-foreground">No tables in this section yet.</p>
                      )}
                      {secTables.map((tbl) => (
                        <div key={tbl.id} className="px-4 py-3 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium flex items-center gap-1.5">
                              <TableIcon className="h-3.5 w-3.5 text-muted-foreground" /> {tbl.table_title}
                            </span>
                            <VideoUploadButton
                              currentUrl={tbl.video_url}
                              onUploaded={(url) => updateTableVideo.mutate({ id: tbl.id, video_url: url })}
                              onRemoved={() => updateTableVideo.mutate({ id: tbl.id, video_url: null })}
                              label="Table"
                            />
                          </div>
                          <div className="pl-5 space-y-1.5">
                            {tbl.row_labels.map((rl, ri) => (
                              <div key={ri} className="flex items-center justify-between gap-3">
                                <span className="text-[11px] text-muted-foreground truncate">{rl}</span>
                                <VideoUploadButton
                                  currentUrl={tbl.row_video_urls?.[ri] || null}
                                  onUploaded={(url) => updateRowVideoUrl.mutate({ tableId: tbl.id, rowIndex: ri, url, currentUrls: tbl.row_video_urls || [] })}
                                  onRemoved={() => updateRowVideoUrl.mutate({ tableId: tbl.id, rowIndex: ri, url: null, currentUrls: tbl.row_video_urls || [] })}
                                  label="Row"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          </TabsContent>

          {/* ══════════ PRE-SCREENING TAB ══════════ */}
          <TabsContent value="pre-screening" className="space-y-4">
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="py-3 flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  Pre-screening Yes/No questions are asked right after the candidate confirms their personal
                  details. Their answers decide which sections and tables of the main questionnaire appear.
                  Set those rules per section or table in the <span className="font-medium text-foreground">Structure</span> tab.
                </p>
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button onClick={() => { setNewSectionIsPre(true); setShowAddSection(true); }}>
                <Plus className="h-4 w-4 mr-2" /> Add Pre-Screening Section
              </Button>
            </div>
            {preScreeningSections.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground text-sm">
                  No pre-screening sections yet.
                </CardContent>
              </Card>
            )}
            {preScreeningSections.map((section) => (
              <Card key={section.id}>
                <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{section.title}</CardTitle>
                  <Button size="sm" variant="ghost" onClick={() => deleteSection.mutate(section.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {gateQuestions.filter((q) => q.section_id === section.id).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      No pre-screening questions yet.
                    </p>
                  )}
                  {gateQuestions
                    .filter((q) => q.section_id === section.id)
                    .map((q) => (
                      <div key={q.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{q.question_text}</span>
                          <Button size="sm" variant="ghost" onClick={() => deleteGateQuestion.mutate(q.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Also fill this answer into</span>
                          <select
                            value={q.prefill_target ? `${q.prefill_target.table_id}::${q.prefill_target.row_index}` : ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              updateGatePrefill.mutate({
                                id: q.id,
                                target: v
                                  ? { table_id: v.split("::")[0], row_index: Number(v.split("::")[1]) }
                                  : null,
                              });
                            }}
                            className="h-8 rounded-md border bg-background px-2 text-xs max-w-[340px]"
                          >
                            <option value="">Nothing (store answer only)</option>
                            {sectionTables
                              .filter((t) => mainSections.some((s) => s.id === t.section_id))
                              .flatMap((t) =>
                                t.row_labels.map((rl, ri) => (
                                  <option key={`${t.id}-${ri}`} value={`${t.id}::${ri}`}>
                                    {t.table_title} → {rl}
                                  </option>
                                ))
                              )}
                          </select>
                        </div>
                      </div>
                    ))}
                  <div className="flex gap-2">
                    <Input
                      value={newGateText[section.id] || ""}
                      onChange={(e) => setNewGateText((p) => ({ ...p, [section.id]: e.target.value }))}
                      placeholder="e.g. Do you have a driver's licence?"
                    />
                    <Button
                      onClick={() => {
                        const text = (newGateText[section.id] || "").trim();
                        if (!text) return;
                        addGateQuestion.mutate({ sectionId: section.id, text });
                        setNewGateText((p) => ({ ...p, [section.id]: "" }));
                      }}
                      disabled={!(newGateText[section.id] || "").trim()}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ══════════ STRUCTURE TAB ══════════ */}
          <TabsContent value="structure" className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => { setNewSectionIsPre(false); setShowAddSection(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Section
          </Button>
        </div>

        {previewMode && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-3 flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-primary shrink-0" />
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Candidate View:</span> Items with a{" "}
                <PlayCircle className="h-4 w-4 inline text-primary" /> icon have an explainer video.
                A notification bubble will alert the candidate to watch it.
              </p>
            </CardContent>
          </Card>
        )}

        {mainSections.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No sections yet. Add a section (topic heading) to start building the questionnaire.
            </CardContent>
          </Card>
        )}

        {mainSections.map((section) => {
          const tables = sectionTables.filter((t) => t.section_id === section.id);
          const isExpanded = expandedSections.has(section.id);

          // Count all media items for this section
          const sectionMediaCount = (section.video_url ? 1 : 0)
            + tables.filter(t => t.video_url).length
            + tables.reduce((sum, t) => sum + (t.row_video_urls?.filter(Boolean).length || 0), 0);

          return (
            <Card key={section.id}>
              <CardHeader
                className="cursor-pointer flex flex-col gap-2"
                onClick={() => toggleSection(section.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <CardTitle className="text-base">{section.title}</CardTitle>
                    <Badge variant="secondary">{tables.length} table{tables.length !== 1 ? "s" : ""}</Badge>
                    {sectionMediaCount > 0 && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Volume2 className="h-3 w-3" /> {sectionMediaCount} explainer{sectionMediaCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    {previewMode && section.video_url && (
                      <VideoHelpBubble videoUrl={section.video_url} label={`How to: ${section.title}`} />
                    )}
                    {section.is_pre_screening && (
                      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/40 text-xs">
                        Pre-Screening
                      </Badge>
                    )}
                  </div>
                  {!previewMode && (
                    <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                      {!section.is_pre_screening && (
                        <Button size="sm" variant="outline" onClick={() => setShowAddTable(section.id)}>
                          <Plus className="h-3 w-3 mr-1" /> <TableIcon className="h-3 w-3 mr-1" /> Table
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => deleteSection.mutate(section.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
                {/* Conditional visibility for the whole section */}
                {!previewMode && !section.is_pre_screening && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <VisibilityPicker
                      rule={section.visible_if}
                      gateQuestions={gateQuestions}
                      onChange={(rule) => updateVisibility.mutate({ kind: "section", id: section.id, rule })}
                      label="Show this section only if"
                    />
                  </div>
                )}
              </CardHeader>
              {isExpanded && (
                <CardContent className="space-y-4">
                  {!section.is_pre_screening && tables.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No tables in this section yet. Add a table to define the data fields.
                    </p>
                  )}
                  {tables.map((tbl) => (
                    <div key={tbl.id} className="border rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b">
                        <div className="flex items-center gap-2">
                          <TableIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{tbl.table_title}</span>
                          {tbl.is_repeatable && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Copy className="h-3 w-3" /> Candidate can add more
                            </Badge>
                          )}
                          {tbl.video_url && !previewMode && (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Video className="h-3 w-3" /> Video
                            </Badge>
                          )}
                          {previewMode && tbl.video_url && (
                            <VideoHelpBubble videoUrl={tbl.video_url} label={`How to: ${tbl.table_title}`} />
                          )}
                        </div>
                        {!previewMode && (
                          <div className="flex items-center gap-3">
                            <VideoUploadButton
                              currentUrl={tbl.video_url}
                              onUploaded={(url) => updateTableVideo.mutate({ id: tbl.id, video_url: url })}
                              onRemoved={() => updateTableVideo.mutate({ id: tbl.id, video_url: null })}
                              label="Table"
                            />
                            <div className="flex items-center gap-1.5">
                              <Label className="text-xs text-muted-foreground">Repeatable</Label>
                              <Switch
                                checked={tbl.is_repeatable}
                                onCheckedChange={(v) => toggleRepeatable.mutate({ id: tbl.id, is_repeatable: v })}
                              />
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => openEditTable(tbl)}>
                              <Pencil className="h-3 w-3 text-muted-foreground" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteTableMutation.mutate(tbl.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {!previewMode && (
                        <div className="px-4 py-2 border-b bg-background">
                          <VisibilityPicker
                            rule={tbl.visible_if}
                            gateQuestions={gateQuestions}
                            onChange={(rule) => updateVisibility.mutate({ kind: "table", id: tbl.id, rule })}
                            label="Show this table only if"
                          />
                        </div>
                      )}
                      <Table className="table-fixed" ref={(el) => { if (el) el.dataset.tableId = tbl.id; }}>
                        <TableHeader>
                          <TableRow>
                            {tbl.column_headers.map((col, i) => (
                              <TableHead
                                key={i}
                                style={tbl.column_widths?.[i] ? { width: `${tbl.column_widths[i]}%` } : undefined}
                                className="relative select-none"
                              >
                                {col}
                                {!previewMode && i < tbl.column_headers.length - 1 && (
                                  <div
                                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/30 z-10"
                                    onMouseDown={(e) => {
                                      const tableEl = (e.target as HTMLElement).closest("table") as HTMLTableElement;
                                      if (tableEl) handleResizeStart(e, tbl.id, i, tbl.column_headers.length, tbl.column_widths, tableEl);
                                    }}
                                  />
                                )}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tbl.row_labels.map((row, i) => {
                            const rit = getRowInputType(tbl.row_input_types, i);
                            return (
                              <TableRow key={i}>
                                <TableCell className="font-medium text-sm">
                                  <div className="flex items-center gap-2">
                                    {row}
                                    {previewMode && tbl.row_video_urls?.[i] && (
                                      <VideoHelpBubble videoUrl={tbl.row_video_urls[i]!} label={`How to: ${row}`} />
                                    )}
                                    {!previewMode && rit.type !== "text" && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                        {INPUT_TYPE_LABELS[rit.type]}
                                      </Badge>
                                    )}
                                    {!previewMode && tbl.row_video_urls?.[i] && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                                        <Video className="h-2.5 w-2.5" /> Video
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                {tbl.column_headers.slice(1).map((_, ci) => (
                                  <TableCell key={ci}>
                                    {previewMode ? (
                                      rit.type === "yes_no" ? (
                                         <div className="space-y-1.5">
                                          <select disabled className="h-8 text-xs rounded border border-input bg-background px-2 w-full">
                                            <option>Select...</option>
                                            <option>Yes</option>
                                            <option>No</option>
                                          </select>
                                          {rit.require_explanation === true && (
                                            <Input placeholder="Explain your answer..." disabled className="h-7 text-xs" />
                                          )}
                                        </div>
                                      ) : rit.type === "select" ? (
                                        <div className="space-y-1.5">
                                          <select disabled className="h-8 text-xs rounded border border-input bg-background px-2 w-full">
                                            <option>Select...</option>
                                            {(rit.options || []).map((opt, oi) => (
                                              <option key={oi}>{opt}</option>
                                            ))}
                                          </select>
                                          {rit.require_explanation === true && (
                                            <Input placeholder="Explain your answer..." disabled className="h-7 text-xs" />
                                          )}
                                        </div>
                                      ) : rit.type === "multi_select" ? (
                                        <div className="space-y-1.5">
                                          <div className="flex flex-wrap gap-1">
                                            {(rit.options || []).map((opt, oi) => (
                                              <Badge key={oi} variant="outline" className="text-xs cursor-pointer hover:bg-primary/10">
                                                {opt}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      ) : rit.type === "dynamic_select" ? (
                                        <div className="space-y-2">
                                          <p className="text-[10px] text-muted-foreground italic">
                                            Options auto-populated from: {(() => {
                                              const srcTbl = sectionTables.find(t => t.id === rit.source_table_id);
                                              if (!srcTbl) return "linked table";
                                              const srcRow = srcTbl.row_labels[rit.source_row_index ?? 0] || "data";
                                              return `${srcTbl.table_title} → ${srcRow}`;
                                            })()}
                                          </p>
                                          {["Company A", "Company B"].map((example, ei) => (
                                            <div key={ei} className="flex items-start gap-2 p-2 rounded border border-dashed border-muted-foreground/30 bg-muted/20">
                                              <Badge variant="secondary" className="text-xs shrink-0 mt-0.5">{example}</Badge>
                                              <Input placeholder={`Explain for ${example}...`} disabled className="h-7 text-xs flex-1" />
                                            </div>
                                          ))}
                                          <p className="text-[10px] text-muted-foreground">Each selection gets its own explanation field</p>
                                        </div>
                                      ) : rit.type === "currency" ? (
                                        <div className="relative">
                                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">R</span>
                                          <Input placeholder="0.00" disabled className="h-8 text-xs pl-7" type="text" />
                                        </div>
                                      ) : rit.type === "date_picker" ? (
                                        <Button variant="outline" disabled className="h-8 text-xs w-full justify-start font-normal text-muted-foreground gap-2">
                                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                                          Select date...
                                        </Button>
                                      ) : (
                                        <Input placeholder={`Enter ${row.toLowerCase()}...`} disabled className="h-8 text-xs" />
                                      )
                                    ) : (
                                      <span className="text-xs text-muted-foreground italic">
                                        {rit.type === "text" ? "Free text" : rit.type === "yes_no" ? `Yes/No${rit.require_explanation === true ? " + details" : ""}` : rit.type === "select" ? `Select${rit.require_explanation === true ? " + details" : ""} (${(rit.options || []).length} opts)` : rit.type === "dynamic_select" ? `Dynamic (${(() => {
                                          const srcTbl = sectionTables.find(t => t.id === rit.source_table_id);
                                          if (!srcTbl) return "not linked";
                                          return `${srcTbl.table_title} → ${srcTbl.row_labels[rit.source_row_index ?? 0] || "Row 1"}`;
                                        })()})` : rit.type === "currency" ? "Currency (R)" : rit.type === "date_picker" ? "Date picker" : `Multi (${(rit.options || []).length} opts)`}
                                      </span>
                                    )}
                                  </TableCell>
                                ))}
                              </TableRow>
                            );
                          })}
                          {tbl.row_labels.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={tbl.column_headers.length} className="text-center text-sm text-muted-foreground py-4">
                                No rows defined
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                        {/* Auto total row for currency columns */}
                        {(() => {
                          const hasCurrency = tbl.row_input_types?.some(rit => rit?.type === "currency");
                          if (!hasCurrency) return null;
                          const currencyColIndices: number[] = [];
                          tbl.row_input_types?.forEach((rit, idx) => {
                            if (rit?.type === "currency") currencyColIndices.push(idx);
                          });
                          return (
                            <TableFooter className="sticky bottom-0 bg-muted/80 backdrop-blur-sm border-t-2 border-primary/20">
                              <TableRow>
                                <TableCell className="font-bold text-xs py-2">Total</TableCell>
                                {tbl.column_headers.slice(1).map((_, colIdx) => {
                                  const rowIdx = colIdx; // maps to row_input_types index
                                  const isCurrencyCol = currencyColIndices.includes(rowIdx);
                                  return (
                                    <TableCell key={colIdx} className="py-2">
                                      {isCurrencyCol ? (
                                        <div className="relative">
                                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-primary">R</span>
                                          <div className="h-8 flex items-center pl-7 text-xs font-bold text-primary">
                                            {previewMode ? "0.00" : "Auto-sum"}
                                          </div>
                                        </div>
                                      ) : null}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            </TableFooter>
                          );
                        })()}
                      </Table>
                      {previewMode && tbl.is_repeatable && (
                        <div className="px-4 py-2 border-t bg-muted/20">
                          <Button size="sm" variant="outline" disabled className="text-xs">
                            <Plus className="h-3 w-3 mr-1" /> Add Another {tbl.table_title}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          );
        })}
          </TabsContent>
        </Tabs>

        {/* Add Section Dialog */}
        <Dialog open={showAddSection} onOpenChange={setShowAddSection}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Topic Section</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Topic / Heading</Label>
                <Input
                  value={newSectionTitle}
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  placeholder="e.g. Family & Friend Contact Trace"
                />
              </div>
              <div className="flex items-start gap-2 rounded-md border p-3">
                <Checkbox
                  id="new-section-pre"
                  checked={newSectionIsPre}
                  onCheckedChange={(v) => setNewSectionIsPre(!!v)}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="new-section-pre" className="text-sm">Pre-screening section</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Asked first, straight after personal details. Holds Yes/No questions that decide which
                    parts of the main questionnaire the candidate sees.
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddSection(false)}>Cancel</Button>
              <Button onClick={() => addSection.mutate()} disabled={!newSectionTitle.trim()}>Add Section</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Table Dialog */}
        <Dialog open={!!showAddTable} onOpenChange={() => setShowAddTable(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Table</DialogTitle>
              <p className="text-xs text-muted-foreground">Step 1 name it, step 2 define the rows, step 3 choose how each row is answered.</p>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1. Table basics</p>
                <div>
                <Label>Table Title</Label>
                <Input
                  value={newTable.title}
                  onChange={(e) => setNewTable((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Father's Details"
                />
                </div>
              <div>
                <Label>Column Headers (comma separated)</Label>
                <Input
                  value={newTable.columns}
                  onChange={(e) => setNewTable((p) => ({ ...p, columns: e.target.value }))}
                  placeholder="Field, Details"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  First column is typically the field label, remaining columns are for candidate input.
                </p>
              </div>
              </div>
              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2. Rows / questions</p>
                <div>
                <Label>Row Labels (one per line)</Label>
                <Textarea
                  value={newTable.rows}
                  onChange={(e) => setNewTable((p) => ({ ...p, rows: e.target.value }))}
                  placeholder={"Name & Surname\nID Number\nContact Number\nResidential Address\nOccupation"}
                  rows={6}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Each line becomes a row. The label appears in the first column.
                </p>
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3. Answering options</p>
                <RowInputTypeConfigurator
                rowLabels={newTable.rows.split("\n").map(r => r.trim()).filter(Boolean)}
                inputTypes={newTableInputTypes}
                onChange={setNewTableInputTypes}
                allTables={sectionTables}
                allSections={sections}
                rowVideoUrls={newTableRowVideoUrls}
                onVideoUrlsChange={setNewTableRowVideoUrls}
                />
                {newTable.rows.trim() === "" && (
                  <p className="text-xs text-muted-foreground">Add row labels above to configure answering options.</p>
                )}
              </div>
              <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/30">
                <Switch
                  checked={newTable.is_repeatable}
                  onCheckedChange={(v) => setNewTable((p) => ({ ...p, is_repeatable: v }))}
                />
                <div>
                  <Label className="text-sm font-medium">Allow candidate to add more</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable this if the candidate should be able to duplicate this table (e.g. add more brothers/sisters).
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddTable(null)}>Cancel</Button>
              <Button
                onClick={() => addTableMutation.mutate(showAddTable!)}
                disabled={!newTable.title.trim() || !newTable.rows.trim()}
              >
                Add Table
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Table Dialog */}
        <Dialog open={!!editingTable} onOpenChange={(open) => { if (!open) setEditingTable(null); }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Table</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Table Title</Label>
                <Input
                  value={editTable.title}
                  onChange={(e) => setEditTable((p) => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div>
                <Label>Column Headers (comma separated)</Label>
                <Input
                  value={editTable.columns}
                  onChange={(e) => setEditTable((p) => ({ ...p, columns: e.target.value }))}
                />
              </div>
              <div>
                <Label>Row Labels (one per line)</Label>
                <Textarea
                  value={editTable.rows}
                  onChange={(e) => setEditTable((p) => ({ ...p, rows: e.target.value }))}
                  rows={6}
                />
              </div>
              <RowInputTypeConfigurator
                rowLabels={editTable.rows.split("\n").map(r => r.trim()).filter(Boolean)}
                inputTypes={editTableInputTypes}
                onChange={setEditTableInputTypes}
                allTables={sectionTables}
                allSections={sections}
                rowVideoUrls={editTableRowVideoUrls}
                onVideoUrlsChange={setEditTableRowVideoUrls}
              />
              {/* Column widths are now adjusted by dragging column borders in the preview table */}
              <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/30">
                <Switch
                  checked={editTable.is_repeatable}
                  onCheckedChange={(v) => setEditTable((p) => ({ ...p, is_repeatable: v }))}
                />
                <div>
                  <Label className="text-sm font-medium">Allow candidate to add more</Label>
                  <p className="text-xs text-muted-foreground">Enable if the candidate can duplicate this table.</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingTable(null)}>Cancel</Button>
              <Button
                onClick={() => updateTableMutation.mutate()}
                disabled={!editTable.title.trim() || !editTable.rows.trim()}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Live Applicant Preview Dialog */}
        <Dialog open={showLivePreview} onOpenChange={setShowLivePreview}>
          <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-full p-0 overflow-hidden">
            <DialogHeader className="px-4 py-2 border-b bg-muted/50 flex flex-row items-center justify-between">
              <DialogTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4" /> Live Applicant Preview — {selectedTemplate.name}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">This is exactly what the applicant will see when filling in the questionnaire.</p>
            </DialogHeader>
            <div className="overflow-auto h-full">
              <QuestionnaireScreen
                templateId={selectedTemplate.id}
                onComplete={async () => {
                  toast.info("Preview mode — submissions are not saved.");
                  setShowLivePreview(false);
                  return true;
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // --- Template list view ---
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
            <Card key={i} className="animate-pulse">
              <CardContent className="py-8"><div className="h-4 bg-muted rounded w-1/3" /></CardContent>
            </Card>
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

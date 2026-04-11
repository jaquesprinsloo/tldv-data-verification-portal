import { useState, useRef, useCallback } from "react";
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
  const [editingOptions, setEditingOptions] = useState<number | null>(null);
  const [optionsText, setOptionsText] = useState("");
  const [editingSource, setEditingSource] = useState<number | null>(null);

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

  const openOptionsEditor = (index: number) => {
    const current = getRowInputType(inputTypes, index);
    setOptionsText((current.options || []).join("\n"));
    setEditingOptions(index);
  };

  const saveOptions = () => {
    if (editingOptions === null) return;
    const opts = optionsText.split("\n").map(o => o.trim()).filter(Boolean);
    const updated = [...inputTypes];
    while (updated.length <= editingOptions) updated.push({ type: "text" });
    updated[editingOptions] = { ...updated[editingOptions], options: opts };
    onChange(updated);
    setEditingOptions(null);
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

  return (
    <div>
      <Label className="mb-2 block">Answer Types per Row</Label>
      <div className="border rounded-md divide-y max-h-[200px] overflow-y-auto">
        {rowLabels.map((label, i) => {
          const rit = getRowInputType(inputTypes, i);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1 truncate font-medium text-xs">{label}</span>
              <select
                className="h-7 text-xs rounded border border-input bg-background px-2"
                value={rit.type}
                onChange={(e) => updateType(i, e.target.value as RowInputType["type"])}
              >
                <option value="text">Free Text</option>
                <option value="yes_no">Yes / No</option>
                <option value="select">Single Select</option>
                <option value="multi_select">Multi Select</option>
                <option value="dynamic_select">Dynamic Select</option>
                <option value="currency">Currency (R)</option>
                <option value="date_picker">Date Picker</option>
              </select>
              {(rit.type === "select" || rit.type === "multi_select") && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openOptionsEditor(i)}>
                  <List className="h-3 w-3" /> {(rit.options || []).length} opts
                </Button>
              )}
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id={`details-${i}`}
                  checked={rit.require_explanation === true}
                  onCheckedChange={(checked) => {
                    const updated = [...inputTypes];
                    while (updated.length <= i) updated.push({ type: "text" });
                    updated[i] = { ...updated[i], require_explanation: !!checked };
                    onChange(updated);
                  }}
                />
                <label htmlFor={`details-${i}`} className="text-[10px] text-muted-foreground cursor-pointer select-none">
                  Details
                </label>
              </div>
              {rit.type === "dynamic_select" && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 max-w-[160px] truncate" onClick={() => setEditingSource(i)}>
                  <List className="h-3 w-3" /> {getSourceLabel(rit)}
                </Button>
              )}
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
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Choose how candidates answer each row. "Dynamic Select" auto-populates options from another table's data (e.g. company names from employment history).
      </p>

      {/* Options editor mini-dialog */}
      <Dialog open={editingOptions !== null} onOpenChange={(open) => { if (!open) setEditingOptions(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Edit Options: {editingOptions !== null ? rowLabels[editingOptions] : ""}
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs">Options (one per line)</Label>
            <Textarea
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={5}
              placeholder={"Option A\nOption B\nOption C"}
            />
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setEditingOptions(null)}>Cancel</Button>
            <Button size="sm" onClick={saveOptions}>Save Options</Button>
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

const CandexBuilder = () => {
  const queryClient = useQueryClient();
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
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
      return data as Section[];
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

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // --- Template editor view ---
  if (selectedTemplate) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <Button variant="ghost" onClick={() => { setSelectedTemplate(null); setPreviewMode(false); }} className="mb-2">
              ← Back to Templates
            </Button>
            <h2 className="text-xl font-bold">{selectedTemplate.name}</h2>
            {selectedTemplate.description && (
              <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPreviewMode(!previewMode)}>
              <Eye className="h-4 w-4 mr-2" /> {previewMode ? "Edit Mode" : "Quick Preview"}
            </Button>
            <Button variant="default" onClick={() => setShowLivePreview(true)} className="bg-red-600 hover:bg-red-700 text-white">
              <Eye className="h-4 w-4 mr-2" /> Live Applicant Preview
            </Button>
            <Button onClick={() => setShowAddSection(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Section
            </Button>
        </div>

        {/* Template Video Uploads */}
        {!previewMode && (
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
        )}
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

        {sections.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No sections yet. Add a section (topic heading) to start building the questionnaire.
            </CardContent>
          </Card>
        )}

        {sections.map((section) => {
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
                  </div>
                  {!previewMode && (
                    <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" onClick={() => setShowAddTable(section.id)}>
                        <Plus className="h-3 w-3 mr-1" /> <TableIcon className="h-3 w-3 mr-1" /> Table
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteSection.mutate(section.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
                {/* Dedicated Section Audio/Video Explainer Upload Area */}
                {!previewMode && isExpanded && (
                  <div
                    className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 space-y-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs font-medium text-primary flex items-center gap-1.5">
                      <Volume2 className="h-3.5 w-3.5" /> Section Audio/Video Explainers
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Upload audio or video explainers that will appear in a dedicated bar at the top of this section in the applicant's view. These help candidates understand how to complete each part.
                    </p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <VideoUploadButton
                        currentUrl={section.video_url}
                        onUploaded={(url) => updateSectionVideo.mutate({ id: section.id, video_url: url })}
                        onRemoved={() => updateSectionVideo.mutate({ id: section.id, video_url: null })}
                        label="Section Overview"
                      />
                      {tables.map((tbl) => (
                        <VideoUploadButton
                          key={`tbl-${tbl.id}`}
                          currentUrl={tbl.video_url}
                          onUploaded={(url) => updateTableVideo.mutate({ id: tbl.id, video_url: url })}
                          onRemoved={() => updateTableVideo.mutate({ id: tbl.id, video_url: null })}
                          label={tbl.table_title}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </CardHeader>
              {isExpanded && (
                <CardContent className="space-y-4">
                  {tables.length === 0 && (
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddSection(false)}>Cancel</Button>
              <Button onClick={() => addSection.mutate()} disabled={!newSectionTitle.trim()}>Add Section</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Table Dialog */}
        <Dialog open={!!showAddTable} onOpenChange={() => setShowAddTable(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Table</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
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
              <RowInputTypeConfigurator
                rowLabels={newTable.rows.split("\n").map(r => r.trim()).filter(Boolean)}
                inputTypes={newTableInputTypes}
                onChange={setNewTableInputTypes}
                allTables={sectionTables}
                allSections={sections}
                rowVideoUrls={newTableRowVideoUrls}
                onVideoUrlsChange={setNewTableRowVideoUrls}
              />
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
                onComplete={() => {
                  toast.info("Preview mode — submissions are not saved.");
                  setShowLivePreview(false);
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

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, CheckCircle, Plus, Trash2, CalendarIcon, PlayCircle, Video, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import preapplicheckLogo from "@/assets/preapplicheck-logo.jpg";
import type { Json } from "@/integrations/supabase/types";

// Shared state for sticky audio player in header
let setGlobalAudio: ((audio: { url: string; label: string } | null) => void) | null = null;

const VideoPlayButton = ({ videoUrl, label }: { videoUrl: string; label: string }) => {
  const [open, setOpen] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
  const isAudio = /\.(mp3|wav|ogg|aac|m4a|flac|wma)/i.test(videoUrl);

  const handleClick = () => {
    setShowPulse(false);
    if (isAudio && setGlobalAudio) {
      setGlobalAudio({ url: videoUrl, label });
    } else {
      setOpen(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="relative inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-600/20 border border-red-600/40 text-red-400 hover:bg-red-600/30 hover:text-red-300 transition-colors text-xs font-medium"
      >
        <PlayCircle className="h-4 w-4" />
        <span>{isAudio ? "Listen" : "Watch Video"}</span>
        {showPulse && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
        )}
      </button>

      {!isAudio && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Video className="h-5 w-5 text-red-500" /> {label}
              </DialogTitle>
            </DialogHeader>
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <video src={videoUrl} controls autoPlay className="w-full h-full" />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};


const DateDropdowns = ({ value, onChange, fromYear = 1950 }: { value?: Date; fromYear?: number; onChange: (d: Date) => void }) => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - fromYear + 1 }, (_, i) => currentYear - i);
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const selYear = value ? String(value.getFullYear()) : "";
  const selMonth = value ? String(value.getMonth()) : "";
  const selDay = value ? String(value.getDate()) : "";

  const daysInMonth = selYear && selMonth !== "" ? new Date(Number(selYear), Number(selMonth) + 1, 0).getDate() : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const buildDate = (y: string, m: string, d: string) => {
    if (y && m !== "" && d) {
      onChange(new Date(Number(y), Number(m), Number(d)));
    }
  };

  return (
    <div className="flex gap-1.5 w-full">
      <Select value={selYear} onValueChange={(v) => buildDate(v, selMonth || "0", selDay || "1")}>
        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 flex-1 min-w-0">
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent className="max-h-[200px]">
          {years.map(y => <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={selMonth} onValueChange={(v) => buildDate(selYear || String(currentYear), v, selDay || "1")}>
        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 flex-1 min-w-0">
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent className="max-h-[200px]">
          {months.map((m, i) => <SelectItem key={i} value={String(i)} className="text-xs">{m}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={selDay} onValueChange={(v) => buildDate(selYear || String(currentYear), selMonth || "0", v)}>
        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 w-[70px] flex-shrink-0">
          <SelectValue placeholder="Day" />
        </SelectTrigger>
        <SelectContent className="max-h-[200px]">
          {days.map(d => <SelectItem key={d} value={String(d)} className="text-xs">{d}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
};

interface QuestionnaireScreenProps {
  templateId: string;
  onComplete: (answers: Record<string, any>) => void;
}

interface Section {
  id: string;
  title: string;
  sort_order: number;
  video_url: string | null;
}

interface RowInputType {
  type: string;
  require_explanation?: boolean;
  options?: string[];
  source_table_id?: string;
  source_row_index?: number;
}

interface SectionTable {
  id: string;
  section_id: string;
  table_title: string;
  sort_order: number;
  column_headers: string[];
  row_labels: string[];
  row_input_types: (RowInputType | null)[] | null;
  is_repeatable: boolean;
  video_url: string | null;
  column_widths: number[] | null;
  row_video_urls: (string | null)[];
}

interface Question {
  id: string;
  section_id: string;
  question_text: string;
  question_type: string;
  is_required: boolean;
  sort_order: number;
  options: string[] | null;
}

export default function QuestionnaireScreen({ templateId, onComplete }: QuestionnaireScreenProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [tables, setTables] = useState<SectionTable[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [tableData, setTableData] = useState<Record<string, string[][][]>>({});
  const [currentSection, setCurrentSection] = useState(0);
  const [stickyAudio, setStickyAudio] = useState<{ url: string; label: string } | null>(null);

  // Wire up the global audio setter so VideoPlayButton can trigger it
  useEffect(() => {
    setGlobalAudio = setStickyAudio;
    return () => { setGlobalAudio = null; };
  }, []);

  useEffect(() => {
    const load = async () => {
      const [secRes, tblRes, qRes] = await Promise.all([
        supabase.from("candex_template_sections").select("*").eq("template_id", templateId).order("sort_order"),
        supabase.from("candex_section_tables").select("*").order("sort_order"),
        supabase.from("candex_template_questions").select("*").order("sort_order"),
      ]);

      const secs = (secRes.data || []) as Section[];
      setSections(secs);

      const secIds = secs.map((s) => s.id);
      const allTables = ((tblRes.data || []) as any[]).filter((t: any) => secIds.includes(t.section_id));
      const parsedTables: SectionTable[] = allTables.map((t: any) => ({
        ...t,
        column_headers: Array.isArray(t.column_headers) ? t.column_headers : [],
        row_labels: Array.isArray(t.row_labels) ? t.row_labels : [],
        row_input_types: Array.isArray(t.row_input_types) ? t.row_input_types : null,
        column_widths: Array.isArray(t.column_widths) ? t.column_widths : null,
        row_video_urls: Array.isArray(t.row_video_urls) ? t.row_video_urls : [],
      }));
      setTables(parsedTables);

      const allQuestions = ((qRes.data || []) as any[]).filter((q: any) => secIds.includes(q.section_id));
      const parsedQuestions: Question[] = allQuestions.map((q: any) => ({
        ...q,
        options: Array.isArray(q.options) ? q.options : null,
      }));
      setQuestions(parsedQuestions);

      // Init table data
      const initData: Record<string, string[][][]> = {};
      for (const tbl of parsedTables) {
        const cols = tbl.column_headers.length || 1;
        const rows = tbl.row_labels.length || 1;
        initData[tbl.id] = [Array.from({ length: rows }, () => Array(cols).fill(""))];
      }
      setTableData(initData);

      setLoading(false);
    };
    load();
  }, [templateId]);

  const setAnswer = useCallback((key: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setCellValue = (tableId: string, entryIdx: number, rowIdx: number, colIdx: number, value: string) => {
    setTableData((prev) => {
      const next = { ...prev };
      const entries = [...(next[tableId] || [])];
      const entry = entries[entryIdx]?.map((r) => [...r]) || [];
      if (entry[rowIdx]) entry[rowIdx][colIdx] = value;
      entries[entryIdx] = entry;
      next[tableId] = entries;
      return next;
    });
  };

  const addRepeatEntry = (tableId: string, table: SectionTable) => {
    setTableData((prev) => {
      const next = { ...prev };
      const cols = table.column_headers.length || 1;
      const rows = table.row_labels.length || 1;
      next[tableId] = [...(next[tableId] || []), Array.from({ length: rows }, () => Array(cols).fill(""))];
      return next;
    });
  };

  const removeRepeatEntry = (tableId: string, idx: number) => {
    setTableData((prev) => {
      const next = { ...prev };
      next[tableId] = (next[tableId] || []).filter((_, i) => i !== idx);
      return next;
    });
  };

  const getRowInputConfig = (table: SectionTable, rowIdx: number): RowInputType => {
    if (table.row_input_types && table.row_input_types[rowIdx]) {
      const rit = table.row_input_types[rowIdx]!;
      if (typeof rit === 'string') return { type: rit };
      return rit;
    }
    return { type: "text" };
  };

  const getInputType = (table: SectionTable, rowIdx: number): string => {
    return getRowInputConfig(table, rowIdx).type;
  };

  // Helper: get all dynamic select source values from tableData for a given source_table_id and source_row_index
  const getDynamicSelectOptions = (sourceTableId: string, sourceRowIndex: number): string[] => {
    const entries = tableData[sourceTableId] || [];
    const options: string[] = [];
    for (const entry of entries) {
      // Collect from all columns for the given row, but typically col 0 is the value
      const val = entry[sourceRowIndex]?.[0];
      if (val && val.trim()) options.push(val.trim());
    }
    return options;
  };

  const renderCellInput = (
    table: SectionTable,
    tableId: string,
    entryIdx: number,
    rowIdx: number,
    colIdx: number,
    value: string
  ) => {
    const rowConfig = getRowInputConfig(table, rowIdx);
    const inputType = rowConfig.type;
    const rowLabel = String(table.row_labels[rowIdx] || "").toLowerCase().trim();

    // === SPECIAL ROW LABEL HANDLERS (must come before generic type handlers) ===

    // "employer & location" → two equal fields
    if (rowLabel.includes("employer") && rowLabel.includes("location")) {
      const splitKey = `split_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`;
      const splitVal = answers[splitKey] || "";
      return (
        <div className="flex gap-2 w-full">
          <div className="flex-1 min-w-0">
            <Label className="text-[10px] text-zinc-500 mb-0.5 block">Employer Name</Label>
            <Input
              value={value}
              onChange={(e) => setCellValue(tableId, entryIdx, rowIdx, colIdx, e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 w-full"
              placeholder="Employer name"
            />
          </div>
          <div className="flex-1 min-w-0">
            <Label className="text-[10px] text-zinc-500 mb-0.5 block">Location</Label>
            <Input
              value={splitVal}
              onChange={(e) => setAnswer(splitKey, e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 w-full"
              placeholder="Location"
            />
          </div>
        </div>
      );
    }

    // "first issue" or "date of issue" → date picker
    if (rowLabel.includes("first issue") || rowLabel.includes("date of issue") || rowLabel.includes("issue date") || rowLabel.includes("date issued")) {
      const dateVal = value ? new Date(value) : undefined;
      return (
        <DateDropdowns
          value={dateVal}
          onChange={(d) => setCellValue(tableId, entryIdx, rowIdx, colIdx, d.toISOString())}
        />
      );
    }

    // "estimated duration" → start/end date pickers + calculated duration
    if (rowLabel.includes("duration")) {
      const startKey = `duration_start_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`;
      const endKey = `duration_end_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`;
      const startDate = answers[startKey] ? new Date(answers[startKey]) : undefined;
      const endDate = answers[endKey] ? new Date(answers[endKey]) : undefined;

      let durationText = "";
      if (startDate && endDate && endDate >= startDate) {
        const totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
        const years = Math.floor(totalMonths / 12);
        const months = totalMonths % 12;
        durationText = years > 0 ? `${years}yr ${months}mo` : `${months}mo`;
        if (value !== durationText) setCellValue(tableId, entryIdx, rowIdx, colIdx, durationText);
      }

      return (
        <div className="flex items-center gap-1.5 w-full">
          <div className="flex-[2] min-w-0">
            <Label className="text-[10px] text-zinc-500 mb-0.5 block">Start</Label>
            <DateDropdowns value={startDate} onChange={(d) => setAnswer(startKey, d.toISOString())} />
          </div>
          <span className="text-zinc-500 text-xs mt-4">–</span>
          <div className="flex-[2] min-w-0">
            <Label className="text-[10px] text-zinc-500 mb-0.5 block">End</Label>
            <DateDropdowns value={endDate} onChange={(d) => setAnswer(endKey, d.toISOString())} />
          </div>
          <div className="min-w-[60px] mt-4 bg-zinc-900 border border-zinc-700 rounded-md h-8 flex items-center justify-center">
            <span className="text-xs text-emerald-400 font-medium">{durationText || "—"}</span>
          </div>
        </div>
      );
    }

    // "job description" → full-width textarea
    if (rowLabel.includes("job") && rowLabel.includes("description") || rowLabel.includes("job description")) {
      return (
        <Textarea
          value={value}
          onChange={(e) => setCellValue(tableId, entryIdx, rowIdx, colIdx, e.target.value)}
          className="bg-zinc-900 border-zinc-700 text-white text-xs min-h-[72px] resize-none w-full"
          rows={3}
          placeholder="Describe your role and responsibilities..."
        />
      );
    }

    // "reason for leaving" → compact dropdown + details field
    if (rowLabel.includes("reason") && rowLabel.includes("leaving")) {
      const detailReasonKey = `reason_details_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`;
      const reasonDetails = answers[detailReasonKey] || "";
      const options = (rowConfig.options && rowConfig.options.length > 0)
        ? rowConfig.options
        : ["Contract term completed", "Resigned", "Retrenched", "Dismissed", "Still employed", "Other"];
      return (
        <div className="flex gap-2 w-full">
          <div className="w-[190px] flex-shrink-0">
            <Select value={value || ""} onValueChange={(v) => setCellValue(tableId, entryIdx, rowIdx, colIdx, v)}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs h-8">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-0">
            <Input
              value={reasonDetails}
              onChange={(e) => setAnswer(detailReasonKey, e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 w-full"
              placeholder="Please provide details..."
            />
          </div>
        </div>
      );
    }

    // "name" & "surname" row → two fields side by side, full width
    if ((rowLabel.includes("name") && rowLabel.includes("surname")) || rowLabel.includes("name & surname") || rowLabel.includes("name and surname")) {
      const surnameKey = `surname_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`;
      const surnameVal = answers[surnameKey] || "";
      return (
        <div className="flex gap-2 w-full">
          <div className="flex-1 min-w-0">
            <Label className="text-[10px] text-zinc-500 mb-0.5 block">Name</Label>
            <Input
              value={value}
              onChange={(e) => setCellValue(tableId, entryIdx, rowIdx, colIdx, e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 w-full"
              placeholder="First name"
            />
          </div>
          <div className="flex-1 min-w-0">
            <Label className="text-[10px] text-zinc-500 mb-0.5 block">Surname</Label>
            <Input
              value={surnameVal}
              onChange={(e) => setAnswer(surnameKey, e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 w-full"
              placeholder="Surname"
            />
          </div>
        </div>
      );
    }

    // "residence" or standalone "location" row → full width input
    if (rowLabel.includes("residence") || (rowLabel.includes("location") && !rowLabel.includes("employer"))) {
      return (
        <Input
          value={value}
          onChange={(e) => setCellValue(tableId, entryIdx, rowIdx, colIdx, e.target.value)}
          className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 w-full"
          placeholder="Enter location / address..."
        />
      );
    }

    // "employment status" → dropdown
    if (rowLabel.includes("employment status")) {
      const empOptions = (rowConfig.options && rowConfig.options.length > 0)
        ? rowConfig.options
        : ["Employed", "Unemployed", "Retired"];
      return (
        <Select value={value || ""} onValueChange={(v) => setCellValue(tableId, entryIdx, rowIdx, colIdx, v)}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 w-full">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {empOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // "employer" & "position" row → two equal fields, conditional on employment status
    if (rowLabel.includes("employer") && rowLabel.includes("position")) {
      // Find employment status value for this table entry
      const empStatusRowIdx = table.row_labels.findIndex((l) => String(l).toLowerCase().includes("employment status"));
      const empStatus = empStatusRowIdx >= 0 ? (tableData[tableId]?.[entryIdx]?.[empStatusRowIdx]?.[0] || "").toLowerCase() : "";

      if (empStatus === "unemployed") {
        return null;
      }

      const positionKey = `position_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`;
      const positionVal = answers[positionKey] || "";

      return (
        <div className="space-y-1 w-full">
          {empStatus === "retired" && (
            <p className="text-[10px] text-yellow-500 italic">Please enter last employer and position held</p>
          )}
          <div className="flex gap-2 w-full">
            <div className="flex-1 min-w-0">
              <Label className="text-[10px] text-zinc-500 mb-0.5 block">Employer Name</Label>
              <Input
                value={value}
                onChange={(e) => setCellValue(tableId, entryIdx, rowIdx, colIdx, e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 w-full"
                placeholder="Employer name"
              />
            </div>
            <div className="flex-1 min-w-0">
              <Label className="text-[10px] text-zinc-500 mb-0.5 block">Position</Label>
              <Input
                value={positionVal}
                onChange={(e) => setAnswer(positionKey, e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 w-full"
                placeholder="Position / Job title"
              />
            </div>
          </div>
        </div>
      );
    }

    // "criminal history" → dropdown + conditional details
    if (rowLabel.includes("criminal") && rowLabel.includes("history")) {
      const crimDetailKey = `criminal_details_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`;
      const crimDetails = answers[crimDetailKey] || "";
      const crimOptions = (rowConfig.options && rowConfig.options.length > 0)
        ? rowConfig.options
        : ["Has no criminal history", "Has criminal history"];
      const showDetails = (value || "").toLowerCase().includes("has criminal history") && !(value || "").toLowerCase().includes("no criminal");
      return (
        <div className="flex gap-2 w-full">
          <div className="w-[200px] flex-shrink-0">
            <Select value={value || ""} onValueChange={(v) => {
              setCellValue(tableId, entryIdx, rowIdx, colIdx, v);
              if (v.toLowerCase().includes("no criminal")) setAnswer(crimDetailKey, "");
            }}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs h-8">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {crimOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {showDetails && (
            <div className="flex-1 min-w-0">
              <Input
                value={crimDetails}
                onChange={(e) => setAnswer(crimDetailKey, e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 w-full"
                placeholder="Please provide details..."
              />
            </div>
          )}
        </div>
      );
    }

    // === GENERIC INPUT TYPE HANDLERS ===

    if (inputType === "yes_no") {
      return (
        <Select value={value || ""} onValueChange={(v) => setCellValue(tableId, entryIdx, rowIdx, colIdx, v)}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs h-8">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Yes">Yes</SelectItem>
            <SelectItem value="No">No</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (inputType === "currency") {
      return (
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500">R</span>
          <Input
            type="number"
            value={value}
            onChange={(e) => setCellValue(tableId, entryIdx, rowIdx, colIdx, e.target.value)}
            className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 pl-6"
            step="0.01"
          />
        </div>
      );
    }

    if (inputType === "date" || inputType === "date_picker") {
      const dateVal = value ? new Date(value) : undefined;
      return (
        <DateDropdowns
          value={dateVal}
          onChange={(d) => setCellValue(tableId, entryIdx, rowIdx, colIdx, d.toISOString())}
        />
      );
    }

    if ((inputType === "single_select" || inputType === "select") && rowConfig.options && rowConfig.options.length > 0) {
      return (
        <Select value={value || ""} onValueChange={(v) => setCellValue(tableId, entryIdx, rowIdx, colIdx, v)}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs h-8">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            {rowConfig.options.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (inputType === "multi_select" && rowConfig.options && rowConfig.options.length > 0) {
      const selectedItems: string[] = value ? (typeof value === 'string' ? (value.startsWith('[') ? JSON.parse(value) : value.split(',').filter(Boolean)) : []) : [];
      return (
        <div className="space-y-1">
          {rowConfig.options.map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <Checkbox
                checked={selectedItems.includes(opt)}
                onCheckedChange={(checked) => {
                  const next = checked ? [...selectedItems, opt] : selectedItems.filter((s) => s !== opt);
                  setCellValue(tableId, entryIdx, rowIdx, colIdx, JSON.stringify(next));
                }}
                className="border-zinc-600 data-[state=checked]:bg-red-600 h-3 w-3"
              />
              <span className="text-xs text-zinc-300">{opt}</span>
            </div>
          ))}
        </div>
      );
    }

    if (inputType === "dynamic_select") {
      const sourceTableId = rowConfig.source_table_id || "";
      const sourceRowIndex = rowConfig.source_row_index ?? 0;
      const dynamicOptions = getDynamicSelectOptions(sourceTableId, sourceRowIndex);
      // Dynamic select is multi-select: each selected item gets its own details
      const dynamicKey = `dynamic_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`;
      const selectedWithDetails: { name: string; details: string }[] = answers[dynamicKey] || [];

      return (
        <div className="space-y-2">
          {dynamicOptions.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">No options available yet — fill in the source table first.</p>
          ) : (
            dynamicOptions.map((opt) => {
              const existing = selectedWithDetails.find((s) => s.name === opt);
              const isChecked = !!existing;
              return (
                <div key={opt} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        let next: { name: string; details: string }[];
                        if (checked) {
                          next = [...selectedWithDetails, { name: opt, details: "" }];
                        } else {
                          next = selectedWithDetails.filter((s) => s.name !== opt);
                        }
                        setAnswer(dynamicKey, next);
                      }}
                      className="border-zinc-600 data-[state=checked]:bg-red-600 h-3 w-3"
                    />
                    <span className="text-xs text-zinc-300">{opt}</span>
                  </div>
                  {isChecked && (
                    <Input
                      value={existing?.details || ""}
                      onChange={(e) => {
                        const next = selectedWithDetails.map((s) =>
                          s.name === opt ? { ...s, details: e.target.value } : s
                        );
                        setAnswer(dynamicKey, next);
                      }}
                      className="bg-zinc-900 border-zinc-700 text-white text-xs h-7 w-full"
                      placeholder={`Details for ${opt}...`}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      );
    }

    return (
      <Input
        value={value}
        onChange={(e) => setCellValue(tableId, entryIdx, rowIdx, colIdx, e.target.value)}
        className="bg-zinc-900 border-zinc-700 text-white text-xs h-8"
        placeholder="Enter..."
      />
    );
  };

  const renderTable = (table: SectionTable) => {
    const entries = tableData[table.id] || [];
    const isCurrency = table.row_input_types?.some((t) => {
      if (typeof t === 'string') return t === "currency";
      return t?.type === "currency";
    });

    // Filter out "Details" column header if no rows need explanation
    const anyRowNeedsDetails = table.row_labels.some((_, rowIdx) => {
      const config = getRowInputConfig(table, rowIdx);
      return config.require_explanation === true;
    });

    const visibleColIndices: number[] = [];
    const visibleColHeaders: string[] = [];
    table.column_headers.forEach((h, i) => {
      const headerStr = String(h).toLowerCase().trim();
      if (headerStr === "details" && !anyRowNeedsDetails) return;
      visibleColIndices.push(i);
      visibleColHeaders.push(String(h));
    });

    const isDisciplinaryTable = table.table_title.toLowerCase().includes("disciplinary");
    const isBankServiceProvider = table.table_title.toLowerCase().includes("bank") && table.table_title.toLowerCase().includes("service provider");

    // Special rendering for BANK SERVICE PROVIDER table
    if (isBankServiceProvider) {
      const bankKey = `bank_selections_${table.id}`;
      const bankSelections: Record<string, string[]> = answers[bankKey] || {};
      const bankDropdownOpen = !!answers[`${bankKey}_dropdown`];
      const setBankDropdownOpen = (v: boolean) => setAnswer(`${bankKey}_dropdown`, v);
      
      const bankRowConfig = getRowInputConfig(table, 0);
      const bankOptions = (bankRowConfig.options && bankRowConfig.options.length > 0)
        ? bankRowConfig.options.map(o => o.replace(/\.\s*$/, '').trim())
        : ["ABSA Bank", "First National Bank", "Standard Bank", "Capitec Bank", "Discovery Bank", "TymeBank", "African Bank", "Nedbank", "Investec", "Old Mutual"];
      const accountTypes = ["Cheque", "Savings", "Current", "Credit", "Business", "Fixed Saving", "Investment"];

      const syncCellValues = (selections: Record<string, string[]>) => {
        const parts = Object.entries(selections)
          .filter(([_, types]) => types.length > 0)
          .map(([bank, types]) => `${bank}: ${types.join(", ")}`);
        setCellValue(table.id, 0, 0, 0, parts.map(p => p.split(":")[0]).join(", "));
        if (table.row_labels.length > 1) {
          setCellValue(table.id, 0, 1, 0, parts.map(p => p.split(": ")[1]).join(" | "));
        }
      };

      const selectedBanks = Object.keys(bankSelections);
      const bankSummary = selectedBanks.length > 0 ? selectedBanks.join(", ") : "";

      return (
        <div key={table.id} className="space-y-3">
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 border-b border-zinc-800 p-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-semibold text-zinc-300">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-3 space-y-3">
              {/* Bank multi-select dropdown */}
              <div className="space-y-1">
                <Label className="text-[10px] text-zinc-500">Select your bank(s)</Label>
                <Popover open={bankDropdownOpen} onOpenChange={setBankDropdownOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="bg-zinc-900 border-zinc-700 text-white text-xs h-9 w-full justify-between">
                      <span className="truncate text-left">
                        {bankSummary || "Select banks..."}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-50 ml-2 flex-shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2 max-h-[250px] overflow-y-auto" align="start">
                    {bankOptions.map((bank) => {
                      const isSelected = !!bankSelections[bank];
                      return (
                        <div
                          key={bank}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800 cursor-pointer"
                          onClick={() => {
                            const next = { ...bankSelections };
                            if (isSelected) {
                              delete next[bank];
                            } else {
                              next[bank] = [];
                            }
                            setAnswer(bankKey, next);
                            syncCellValues(next);
                          }}
                        >
                          <Checkbox
                            checked={isSelected}
                            className="border-zinc-600 data-[state=checked]:bg-red-600 h-3.5 w-3.5 pointer-events-none"
                          />
                          <span className="text-xs text-zinc-300">{bank}</span>
                        </div>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Account type selectors per selected bank */}
              {selectedBanks.map((bank) => {
                const selectedTypes = bankSelections[bank] || [];
                const accDropdownKey = `${bankKey}_${bank}_acc_dropdown`;
                const accDropdownOpen = !!answers[accDropdownKey];
                const setAccDropdownOpen = (v: boolean) => setAnswer(accDropdownKey, v);
                const accSummary = selectedTypes.length > 0 ? selectedTypes.join(", ") : "";
                return (
                  <div key={bank} className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">{bank} — Account type(s)</Label>
                    <Popover open={accDropdownOpen} onOpenChange={setAccDropdownOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="bg-zinc-900 border-zinc-700 text-white text-xs h-9 w-full justify-between">
                          <span className="truncate text-left">
                            {accSummary || "Select account types..."}
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 opacity-50 ml-2 flex-shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
                        {accountTypes.map((accType) => {
                          const isChecked = selectedTypes.includes(accType);
                          return (
                            <div
                              key={accType}
                              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800 cursor-pointer"
                              onClick={() => {
                                const nextTypes = isChecked
                                  ? selectedTypes.filter((t) => t !== accType)
                                  : [...selectedTypes, accType];
                                const next = { ...bankSelections, [bank]: nextTypes };
                                setAnswer(bankKey, next);
                                syncCellValues(next);
                              }}
                            >
                              <Checkbox
                                checked={isChecked}
                                className="border-zinc-600 data-[state=checked]:bg-red-600 h-3 w-3 pointer-events-none"
                              />
                              <span className="text-xs text-zinc-300">{accType}</span>
                            </div>
                          );
                        })}
                      </PopoverContent>
                    </Popover>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // Special rendering for MONTHLY ACCOUNTS – PAID UP TO DATE table
    const isMonthlyAccounts = table.table_title.toLowerCase().includes("monthly account") && table.table_title.toLowerCase().includes("paid");
    const isHistoricalUnpaid = !isMonthlyAccounts && table.table_title.toLowerCase().includes("historical") && table.table_title.toLowerCase().includes("unpaid");
    if (isMonthlyAccounts) {
      const maKey = `monthly_accounts_${table.id}`;
      const maSelections: Record<string, { amount: string; lastPayment: string }> = answers[maKey] || {};
      const maDropdownOpen = !!answers[`${maKey}_dropdown`];
      const setMaDropdownOpen = (v: boolean) => setAnswer(`${maKey}_dropdown`, v);

      const maRowConfig = getRowInputConfig(table, 0);
      const accountOptions = (maRowConfig.options && maRowConfig.options.length > 0)
        ? maRowConfig.options.map(o => o.replace(/\.\s*$/, '').trim())
        : ["Rent / Bond", "Vehicle Finance", "Clothing Account", "Furniture Account", "Cell Phone Contract", "Insurance", "Medical Aid", "Gym Membership", "DSTV / Streaming", "Student Loan", "Personal Loan", "Credit Card", "Store Card", "Other"];

      const syncMaCellValues = (selections: Record<string, { amount: string; lastPayment: string }>) => {
        const parts = Object.entries(selections)
          .filter(([_, v]) => v.amount || v.lastPayment)
          .map(([acc, v]) => {
            const datePart = v.lastPayment ? format(new Date(v.lastPayment), "dd/MM/yyyy") : "";
            return `${acc}: R${v.amount || "0"}${datePart ? ` (${datePart})` : ""}`;
          });
        setCellValue(table.id, 0, 0, 0, parts.join(" | "));
      };

      const selectedAccounts = Object.keys(maSelections);
      const maSummary = selectedAccounts.length > 0 ? `${selectedAccounts.length} account(s) selected` : "";
      const totalMonthly = selectedAccounts.reduce((sum, acc) => sum + (parseFloat(maSelections[acc]?.amount || "0") || 0), 0);

      return (
        <div key={table.id} className="space-y-3">
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 border-b border-zinc-800 p-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-semibold text-zinc-300">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-3 space-y-3">
              {/* Account multi-select dropdown */}
              <div className="space-y-1">
                <Label className="text-[10px] text-zinc-500">Select your account(s)</Label>
                <Popover open={maDropdownOpen} onOpenChange={setMaDropdownOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="bg-zinc-900 border-zinc-700 text-white text-xs h-9 w-full justify-between">
                      <span className="truncate text-left">
                        {maSummary || "Select accounts..."}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-50 ml-2 flex-shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2 max-h-[250px] overflow-y-auto" align="start">
                    {accountOptions.map((acc) => {
                      const isSelected = !!maSelections[acc];
                      return (
                        <div
                          key={acc}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800 cursor-pointer"
                          onClick={() => {
                            const next = { ...maSelections };
                            if (isSelected) {
                              delete next[acc];
                            } else {
                              next[acc] = { amount: "", lastPayment: "" };
                            }
                            setAnswer(maKey, next);
                            syncMaCellValues(next);
                          }}
                        >
                          <Checkbox
                            checked={isSelected}
                            className="border-zinc-600 data-[state=checked]:bg-red-600 h-3.5 w-3.5 pointer-events-none"
                          />
                          <span className="text-xs text-zinc-300">{acc}</span>
                        </div>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Amount and last payment per selected account */}
              {selectedAccounts.map((acc) => {
                const entry = maSelections[acc] || { amount: "", lastPayment: "" };
                const dateVal = entry.lastPayment ? new Date(entry.lastPayment) : undefined;
                return (
                  <div key={acc} className="space-y-1.5 border border-zinc-800 rounded-md p-2.5 bg-zinc-900/50">
                    <span className="text-xs font-medium text-zinc-300">{acc}</span>
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-0.5">
                        <Label className="text-[10px] text-zinc-500">Monthly Amount (R)</Label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">R</span>
                          <Input
                            type="number"
                            value={entry.amount}
                            onChange={(e) => {
                              const next = { ...maSelections, [acc]: { ...entry, amount: e.target.value } };
                              setAnswer(maKey, next);
                              syncMaCellValues(next);
                            }}
                            className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 pl-6"
                            placeholder="0.00"
                            step="0.01"
                          />
                        </div>
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <Label className="text-[10px] text-zinc-500">Last Payment Date</Label>
                        <DateDropdowns
                          value={dateVal}
                          fromYear={2000}
                          onChange={(d) => {
                            const next = { ...maSelections, [acc]: { ...entry, lastPayment: d.toISOString() } };
                            setAnswer(maKey, next);
                            syncMaCellValues(next);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Total monthly display */}
              {selectedAccounts.length > 0 && (
                <div className="flex justify-between items-center px-2 py-1.5 bg-zinc-800/50 rounded-md border border-zinc-700">
                  <span className="text-xs font-medium text-zinc-400">Total Monthly Payments</span>
                  <span className="text-sm font-bold text-white">R {totalMonthly.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Special rendering for HISTORICAL UNPAID ACCOUNTS table
    if (isHistoricalUnpaid) {
      const huKey = `historical_unpaid_${table.id}`;
      const huSelections: Record<string, { amount: string; lastPayment: string }> = answers[huKey] || {};
      const huDropdownOpen = !!answers[`${huKey}_dropdown`];
      const setHuDropdownOpen = (v: boolean) => setAnswer(`${huKey}_dropdown`, v);

      const huRowConfig = getRowInputConfig(table, 0);
      const accountOptions = (huRowConfig.options && huRowConfig.options.length > 0)
        ? huRowConfig.options.map(o => o.replace(/\.\s*$/, '').trim())
        : ["Rent / Bond", "Vehicle Finance", "Clothing Account", "Furniture Account", "Cell Phone Contract", "Insurance", "Medical Aid", "Gym Membership", "DSTV / Streaming", "Student Loan", "Personal Loan", "Credit Card", "Store Card", "Other"];

      const syncHuCellValues = (selections: Record<string, { amount: string; lastPayment: string }>) => {
        const parts = Object.entries(selections)
          .filter(([_, v]) => v.amount || v.lastPayment)
          .map(([acc, v]) => {
            const datePart = v.lastPayment ? format(new Date(v.lastPayment), "dd/MM/yyyy") : "";
            return `${acc}: R${v.amount || "0"}${datePart ? ` (${datePart})` : ""}`;
          });
        setCellValue(table.id, 0, 0, 0, parts.join(" | "));
      };

      const selectedAccounts = Object.keys(huSelections);
      const huSummary = selectedAccounts.length > 0 ? `${selectedAccounts.length} account(s) selected` : "";
      const totalUnpaid = selectedAccounts.reduce((sum, acc) => sum + (parseFloat(huSelections[acc]?.amount || "0") || 0), 0);

      return (
        <div key={table.id} className="space-y-3">
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 border-b border-zinc-800 p-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-semibold text-zinc-300">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-3 space-y-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-zinc-500">Select unpaid account(s)</Label>
                <Popover open={huDropdownOpen} onOpenChange={setHuDropdownOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="bg-zinc-900 border-zinc-700 text-white text-xs h-9 w-full justify-between">
                      <span className="truncate text-left">{huSummary || "Select accounts..."}</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-50 ml-2 flex-shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2 max-h-[250px] overflow-y-auto" align="start">
                    {accountOptions.map((acc) => {
                      const isSelected = !!huSelections[acc];
                      return (
                        <div key={acc} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800 cursor-pointer"
                          onClick={() => {
                            const next = { ...huSelections };
                            if (isSelected) delete next[acc]; else next[acc] = { amount: "", lastPayment: "" };
                            setAnswer(huKey, next);
                            syncHuCellValues(next);
                          }}>
                          <Checkbox checked={isSelected} className="border-zinc-600 data-[state=checked]:bg-red-600 h-3.5 w-3.5 pointer-events-none" />
                          <span className="text-xs text-zinc-300">{acc}</span>
                        </div>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              </div>

              {selectedAccounts.map((acc) => {
                const entry = huSelections[acc] || { amount: "", lastPayment: "" };
                const dateVal = entry.lastPayment ? new Date(entry.lastPayment) : undefined;
                return (
                  <div key={acc} className="space-y-1.5 border border-zinc-800 rounded-md p-2.5 bg-zinc-900/50">
                    <span className="text-xs font-medium text-zinc-300">{acc}</span>
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-0.5">
                        <Label className="text-[10px] text-zinc-500">Outstanding Amount (R)</Label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">R</span>
                          <Input type="number" value={entry.amount}
                            onChange={(e) => {
                              const next = { ...huSelections, [acc]: { ...entry, amount: e.target.value } };
                              setAnswer(huKey, next);
                              syncHuCellValues(next);
                            }}
                            className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 pl-6" placeholder="0.00" step="0.01" />
                        </div>
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <Label className="text-[10px] text-zinc-500">Last Payment Date</Label>
                        <DateDropdowns
                          value={dateVal}
                          fromYear={2000}
                          onChange={(d) => {
                            const next = { ...huSelections, [acc]: { ...entry, lastPayment: d.toISOString() } };
                            setAnswer(huKey, next);
                            syncHuCellValues(next);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {selectedAccounts.length > 0 && (
                <div className="flex justify-between items-center px-2 py-1.5 bg-zinc-800/50 rounded-md border border-zinc-700">
                  <span className="text-xs font-medium text-zinc-400">Total Outstanding Debt</span>
                  <span className="text-sm font-bold text-white">R {totalUnpaid.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={table.id} className="space-y-3">
        {entries.map((entry, entryIdx) => (
          <div key={entryIdx} className="border border-zinc-800 rounded-lg overflow-hidden">
            {table.is_repeatable && entries.length > 1 && (
              <div className="flex justify-between items-center px-3 py-1.5 bg-zinc-900/50 border-b border-zinc-800">
                <span className="text-xs text-zinc-500">Entry {entryIdx + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRepeatEntry(table.id, entryIdx)}
                  className="h-6 text-xs text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Remove
                </Button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className={`w-full text-sm ${isDisciplinaryTable ? "table-fixed" : ""}`}>
                <thead>
                  <tr className="bg-zinc-900 border-b border-zinc-800">
                    <th colSpan={visibleColHeaders.length + 1} className="p-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-sm font-semibold text-zinc-300">{table.table_title}</span>
                        {table.video_url && (
                          <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {table.row_labels.map((label, rowIdx) => {
                    const rowConfig = getRowInputConfig(table, rowIdx);
                    const needsDetails = rowConfig.require_explanation === true;
                    const inputType = rowConfig.type;
                    const detailKey = `detail_${table.id}_${entryIdx}_${rowIdx}`;
                    const showSeparateDetails = needsDetails && inputType !== "dynamic_select";
                    const rl = String(label).toLowerCase().trim();
                    const isFullWidthRow = (rl.includes("employer") && rl.includes("location"))
                      || (rl.includes("job") && rl.includes("description"))
                      || rl.includes("job description")
                      || rl.includes("duration")
                      || (rl.includes("reason") && rl.includes("leaving"))
                      || (rl.includes("name") && rl.includes("surname"))
                      || (rl.includes("residence") || (rl.includes("location") && !rl.includes("employer")))
                      || rl.includes("employment status")
                      || (rl.includes("employer") && rl.includes("position"))
                      || (rl.includes("criminal") && rl.includes("history"));

                    // Hide "employer & position" row when employment status is "unemployed"
                    if (rl.includes("employer") && rl.includes("position")) {
                      const empStatusRowIdx = table.row_labels.findIndex((l) => String(l).toLowerCase().includes("employment status"));
                      const empStatus = empStatusRowIdx >= 0 ? (tableData[table.id]?.[entryIdx]?.[empStatusRowIdx]?.[0] || "").toLowerCase() : "";
                      if (empStatus === "unemployed") return null;
                    }

                    return (
                      <tr key={rowIdx} className="border-b border-zinc-800/50">
                        <td className="p-2 text-xs text-zinc-400 font-medium whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {label as string}
                            {table.row_video_urls?.[rowIdx] && (
                              <VideoPlayButton videoUrl={table.row_video_urls[rowIdx]!} label={label as string} />
                            )}
                          </div>
                        </td>
                        {isFullWidthRow ? (
                          <td className="p-2" colSpan={visibleColHeaders.length}>
                            {renderCellInput(table, table.id, entryIdx, rowIdx, 0, entry[rowIdx]?.[0] || "")}
                          </td>
                        ) : (
                          visibleColIndices.map((colIdx, vi) => {
                            const colHeader = String(table.column_headers[colIdx] || "").toLowerCase().trim();
                            if (colHeader === "details") {
                              return (
                                <td key={vi} className="p-2">
                                  {needsDetails ? (
                                    <Input
                                      value={answers[detailKey] || ""}
                                      onChange={(e) => setAnswer(detailKey, e.target.value)}
                                      className="bg-zinc-900 border-zinc-700 text-white text-xs h-8"
                                      placeholder="Please provide details..."
                                    />
                                  ) : null}
                                </td>
                              );
                            }
                            return (
                              <td key={vi} className="p-2">
                                <div className="space-y-1">
                                  {renderCellInput(table, table.id, entryIdx, rowIdx, colIdx, entry[rowIdx]?.[colIdx] || "")}
                                  {showSeparateDetails && vi === 0 && !visibleColHeaders.some(h => h.toLowerCase().trim() === "details") && (
                                    <Input
                                      value={answers[detailKey] || ""}
                                      onChange={(e) => setAnswer(detailKey, e.target.value)}
                                      className="bg-zinc-900 border-zinc-700 text-white text-xs h-7"
                                      placeholder="Please provide details..."
                                    />
                                  )}
                                </div>
                              </td>
                            );
                          })
                        )}
                      </tr>
                    );
                  })}
                  {/* Currency total row */}
                  {isCurrency && (
                    <tr className="bg-zinc-900/80 sticky bottom-0">
                      <td className="p-2 text-xs font-bold text-red-400">Total</td>
                      {visibleColIndices.map((colIdx, vi) => {
                        const total = entries[0]?.reduce((sum, row, rIdx) => {
                          if (getInputType(table, rIdx) === "currency") {
                            return sum + (parseFloat(row[colIdx]) || 0);
                          }
                          return sum;
                        }, 0) || 0;
                        return (
                          <td key={vi} className="p-2 text-xs font-bold text-red-400">
                            R {total.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {table.is_repeatable && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => addRepeatEntry(table.id, table)}
            className="border-zinc-700 text-zinc-400 hover:text-white"
          >
            <Plus className="h-3 w-3 mr-1" /> Add Entry
          </Button>
        )}
      </div>
    );
  };

  const renderQuestion = (q: Question) => {
    const key = q.id;
    const val = answers[key] || "";

    if (q.question_type === "yes_no") {
      return (
        <div key={key} className="space-y-1.5">
          <Label className="text-zinc-300 text-sm">{q.question_text} {q.is_required && <span className="text-red-500">*</span>}</Label>
          <Select value={val} onValueChange={(v) => setAnswer(key, v)}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="No">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (q.question_type === "single_select" && q.options) {
      return (
        <div key={key} className="space-y-1.5">
          <Label className="text-zinc-300 text-sm">{q.question_text} {q.is_required && <span className="text-red-500">*</span>}</Label>
          <Select value={val} onValueChange={(v) => setAnswer(key, v)}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {q.options.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (q.question_type === "multi_select" && q.options) {
      const selected: string[] = val ? (Array.isArray(val) ? val : []) : [];
      return (
        <div key={key} className="space-y-2">
          <Label className="text-zinc-300 text-sm">{q.question_text} {q.is_required && <span className="text-red-500">*</span>}</Label>
          {q.options.map((opt) => (
            <div key={opt} className="flex items-center gap-2">
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={(checked) => {
                  const next = checked ? [...selected, opt] : selected.filter((s) => s !== opt);
                  setAnswer(key, next);
                }}
                className="border-zinc-600 data-[state=checked]:bg-red-600"
              />
              <span className="text-sm text-zinc-300">{opt}</span>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div key={key} className="space-y-1.5">
        <Label className="text-zinc-300 text-sm">{q.question_text} {q.is_required && <span className="text-red-500">*</span>}</Label>
        <Textarea
          value={val}
          onChange={(e) => setAnswer(key, e.target.value)}
          className="bg-zinc-900 border-zinc-700 text-white"
          placeholder="Enter your answer..."
        />
      </div>
    );
  };

  const handleSubmit = () => {
    setSubmitting(true);
    const allAnswers = { questions: answers, tables: tableData };
    onComplete(allAnswers);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <Card className="bg-zinc-950 border-zinc-800 text-white max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <p className="text-zinc-400">No questionnaire template has been assigned. Please contact the administrator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentSec = sections[currentSection];
  const sectionTables = tables.filter((t) => t.section_id === currentSec.id);
  const sectionQuestions = questions.filter((q) => q.section_id === currentSec.id);

  return (
    <div className="min-h-screen bg-black">
      <div className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <img src={preapplicheckLogo} alt="PreAppliCheck" className="h-8" />
          <span className="text-xs text-zinc-500">
            Section {currentSection + 1} of {sections.length}
          </span>
        </div>
        {stickyAudio && (
          <div className="border-t border-zinc-800 bg-zinc-900/80 px-4 py-2">
            <div className="container mx-auto flex items-center gap-3 max-w-3xl">
              <div className="flex items-center gap-2 shrink-0">
                <PlayCircle className="h-4 w-4 text-red-500" />
                <span className="text-xs text-zinc-300 font-medium truncate max-w-[140px]">{stickyAudio.label}</span>
              </div>
              <audio
                src={stickyAudio.url}
                controls
                autoPlay
                className="flex-1 h-8 min-w-0"
                style={{ colorScheme: "dark" }}
              />
              <button
                onClick={() => setStickyAudio(null)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-zinc-900">
        <div
          className="h-full bg-red-600 transition-all duration-300"
          style={{ width: `${((currentSection + 1) / sections.length) * 100}%` }}
        />
      </div>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <Card className="bg-zinc-950 border-zinc-800 text-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-white">{currentSec.title}</CardTitle>
              {currentSec.video_url && (
                <VideoPlayButton videoUrl={currentSec.video_url} label={currentSec.title} />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Tables */}
            {sectionTables.map(renderTable)}

            {/* Questions */}
            {sectionQuestions.map(renderQuestion)}

            {/* Navigation */}
            <div className="flex gap-3 pt-4">
              {currentSection > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setCurrentSection((p) => p - 1)}
                  className="border-zinc-700 text-zinc-400 hover:text-white"
                >
                  Previous
                </Button>
              )}
              <div className="flex-1" />
              {currentSection < sections.length - 1 ? (
                <Button
                  onClick={() => setCurrentSection((p) => p + 1)}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Next Section
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {submitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                  ) : (
                    <><CheckCircle className="mr-2 h-4 w-4" /> Complete PreAppliCheck Process</>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section navigation dots */}
        <div className="flex justify-center gap-2 mt-6">
          {sections.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSection(idx)}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                idx === currentSection ? "bg-red-600" : idx < currentSection ? "bg-red-900" : "bg-zinc-700"
              }`}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

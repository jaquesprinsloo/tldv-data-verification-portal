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
import { Loader2, CheckCircle, Plus, Trash2, CalendarIcon, PlayCircle, Video, X } from "lucide-react";
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
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 w-full justify-start">
              <CalendarIcon className="mr-1 h-3 w-3" />
              {dateVal ? format(dateVal, "dd/MM/yyyy") : "Select date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={dateVal}
              onSelect={(d) => d && setCellValue(tableId, entryIdx, rowIdx, colIdx, d.toISOString())}
            />
          </PopoverContent>
        </Popover>
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
                      className="bg-zinc-900 border-zinc-700 text-white text-xs h-7 ml-5"
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

    // Special handling: "employer" rows get split into two equal fields spanning full width
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

    // Special handling: "estimated duration" → date range picker with auto-calculated duration
    if (rowLabel.includes("estimated duration") || rowLabel.includes("duration")) {
      const startKey = `duration_start_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`;
      const endKey = `duration_end_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`;
      const startDate = answers[startKey] ? new Date(answers[startKey]) : undefined;
      const endDate = answers[endKey] ? new Date(answers[endKey]) : undefined;

      let durationText = "";
      if (startDate && endDate && endDate >= startDate) {
        const totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
        const years = Math.floor(totalMonths / 12);
        const months = totalMonths % 12;
        durationText = years > 0 ? `${years} yr${years !== 1 ? "s" : ""} ${months} mo${months !== 1 ? "s" : ""}` : `${months} mo${months !== 1 ? "s" : ""}`;
        // Store computed value in the cell
        if (value !== durationText) setCellValue(tableId, entryIdx, rowIdx, colIdx, durationText);
      }

      return (
        <div className="flex items-center gap-2 w-full">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 flex-1 justify-start">
                <CalendarIcon className="mr-1 h-3 w-3" />
                {startDate ? format(startDate, "dd/MM/yyyy") : "Start date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(d) => d && setAnswer(startKey, d.toISOString())}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <span className="text-zinc-500 text-xs">to</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="bg-zinc-900 border-zinc-700 text-white text-xs h-8 flex-1 justify-start">
                <CalendarIcon className="mr-1 h-3 w-3" />
                {endDate ? format(endDate, "dd/MM/yyyy") : "End date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(d) => d && setAnswer(endKey, d.toISOString())}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          {durationText && (
            <span className="text-xs text-emerald-400 font-medium whitespace-nowrap">{durationText}</span>
          )}
        </div>
      );
    }

    // Special handling: "job description" rows get a full-width textarea
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

    // Special handling: "reason for leaving" → dropdown + details
    if (rowLabel.includes("reason") && rowLabel.includes("leaving")) {
      const detailReasonKey = `reason_details_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`;
      const reasonDetails = answers[detailReasonKey] || "";
      return (
        <div className="flex gap-2 w-full">
          <div className="w-[190px] flex-shrink-0">
            <Select value={value || ""} onValueChange={(v) => setCellValue(tableId, entryIdx, rowIdx, colIdx, v)}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs h-8">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Contract term completed">Contract term completed</SelectItem>
                <SelectItem value="Resigned">Resigned</SelectItem>
                <SelectItem value="Retrenched">Retrenched</SelectItem>
                <SelectItem value="Dismissed">Dismissed</SelectItem>
                <SelectItem value="Still employed">Still employed</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
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

    return (
      <div key={table.id} className="space-y-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-zinc-300">{table.table_title}</h4>
          {table.video_url && (
            <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />
          )}
        </div>

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
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-900">
                    <th className="text-left p-2 text-xs text-zinc-500 font-medium border-b border-zinc-800 min-w-[120px]" />
                    {visibleColHeaders.map((h, i) => {
                      const origColIdx = visibleColIndices[i];
                      const widthStyle = table.column_widths?.[origColIdx] ? { width: `${table.column_widths[origColIdx]}%` } : undefined;
                      return (
                        <th key={i} className="text-left p-2 text-xs text-zinc-400 font-medium border-b border-zinc-800 min-w-[80px]" style={widthStyle}>
                          {h}
                        </th>
                      );
                    })}
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
                      || (rl.includes("reason") && rl.includes("leaving"));

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

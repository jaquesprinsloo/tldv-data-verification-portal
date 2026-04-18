import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, CheckCircle, Plus, Trash2, CalendarIcon, PlayCircle, Video, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import preapplicheckLogo from "@/assets/preapplicheck-logo.jpg";
import type { Json } from "@/integrations/supabase/types";

// Global registry: each VideoPlayButton registers its stop function
const activeStopFns = new Set<() => void>();
let stopAllAudio = () => { activeStopFns.forEach(fn => fn()); };

const VideoPlayButton = ({ videoUrl, label }: { videoUrl: string; label: string }) => {
  const [open, setOpen] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isAudio = /\.(mp3|wav|ogg|aac|m4a|flac|wma)/i.test(videoUrl);

  const stopSelf = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setIsPlaying(false);
    setProgress(0);
  }, []);

  // Register/unregister stop function
  useEffect(() => {
    activeStopFns.add(stopSelf);
    return () => { stopSelf(); activeStopFns.delete(stopSelf); };
  }, [stopSelf]);

  const handleClick = () => {
    setShowPulse(false);
    if (isAudio) {
      if (isPlaying) {
        stopSelf();
        return;
      }
      // Stop ALL other playing audio/video first
      stopAllAudio();

      const audio = new Audio(videoUrl);
      audioRef.current = audio;
      setIsPlaying(true);

      audio.addEventListener("timeupdate", () => {
        if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
      });
      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        setProgress(0);
        audioRef.current = null;
      });
      audio.play();
    } else {
      // Stop any playing audio before opening video dialog
      stopAllAudio();
      setOpen(true);
    }
  };

  // SVG circle progress
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleClick}
        className="relative inline-flex items-center justify-center flex-shrink-0 w-8 h-8"
      >
        <svg className="absolute inset-0 w-8 h-8 -rotate-90" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r={radius} fill="none" stroke="rgb(63, 63, 70)" strokeWidth="2" />
          {isPlaying && (
            <circle
              cx="16" cy="16" r={radius}
              fill="none"
              stroke="rgb(220, 38, 38)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-[stroke-dashoffset] duration-200"
            />
          )}
        </svg>
        {isPlaying ? (
          <span className="relative z-10 w-2.5 h-2.5 bg-red-600 rounded-sm" />
        ) : (
          <PlayCircle className="relative z-10 h-5 w-5 text-red-400 hover:text-red-300 transition-colors" />
        )}
        {showPulse && !isPlaying && (
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
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


const StepDatePicker = ({ value, onChange, fromYear = 1950, onDone }: { value?: Date; fromYear?: number; onChange: (d: Date) => void; onDone?: () => void }) => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - fromYear + 1 }, (_, i) => currentYear - i);
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [step, setStep] = useState<"year" | "month" | "day">("year");
  const [pickedYear, setPickedYear] = useState<number | null>(value ? value.getFullYear() : null);
  const [pickedMonth, setPickedMonth] = useState<number | null>(value ? value.getMonth() : null);

  useEffect(() => {
    if (value) {
      setPickedYear(value.getFullYear());
      setPickedMonth(value.getMonth());
    }
  }, [value]);

  const handleYearSelect = (y: number) => { setPickedYear(y); setStep("month"); };
  const handleMonthSelect = (m: number) => { setPickedMonth(m); setStep("day"); };
  const handleDaySelect = (d: number) => {
    const newDate = new Date(pickedYear!, pickedMonth!, d);
    onChange(newDate);
    onDone?.();
    setStep("year");
  };

  const daysInMonth = pickedYear != null && pickedMonth != null ? new Date(pickedYear, pickedMonth + 1, 0).getDate() : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="p-2 w-[260px]">
      {step === "year" && (
        <div>
          <p className="text-xs text-zinc-400 font-medium text-center mb-2">Select Year</p>
          <div className="grid grid-cols-4 gap-1 max-h-[200px] overflow-y-auto">
            {years.map(y => (
              <button key={y} onClick={() => handleYearSelect(y)}
                className={`text-xs py-1.5 rounded ${pickedYear === y ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
                {y}
              </button>
            ))}
          </div>
        </div>
      )}
      {step === "month" && (
        <div>
          <p className="text-xs text-zinc-400 font-medium text-center mb-2">{pickedYear} — Select Month</p>
          <div className="grid grid-cols-3 gap-1.5">
            {monthNames.map((m, i) => (
              <button key={i} onClick={() => handleMonthSelect(i)}
                className={`text-xs py-2 rounded ${pickedMonth === i ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
      {step === "day" && (
        <div>
          <p className="text-xs text-zinc-400 font-medium text-center mb-2">{monthNames[pickedMonth!]} {pickedYear} — Select Day</p>
          <div className="grid grid-cols-7 gap-1">
            {days.map(d => {
              const isSelected = value && value.getFullYear() === pickedYear && value.getMonth() === pickedMonth && value.getDate() === d;
              return (
                <button key={d} onClick={() => handleDaySelect(d)}
                  className={`text-xs py-1.5 rounded ${isSelected ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const DateDropdowns = ({ value, onChange, fromYear = 1950, placeholder = "Select date" }: { value?: Date; fromYear?: number; onChange: (d: Date) => void; placeholder?: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`bg-zinc-900 border-zinc-700 text-sm placeholder:text-xs h-9 w-full justify-start ${value ? "text-white" : "text-zinc-500"}`}>
          <CalendarIcon className="mr-1 h-3 w-3" />
          {value ? format(value, "dd/MM/yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
        <StepDatePicker value={value} fromYear={fromYear} onChange={onChange} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
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
    value: string,
    mobilePlaceholder?: string
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
            <Input
              value={value}
              onChange={(e) => setCellValue(tableId, entryIdx, rowIdx, colIdx, e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full"
              placeholder="Employer"
            />
          </div>
          <div className="flex-1 min-w-0">
            <Input
              value={splitVal}
              onChange={(e) => setAnswer(splitKey, e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full"
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
        <div className="space-y-1 w-full">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 w-full">
            <div className="flex-1 min-w-0">
              <Label className="text-[10px] text-zinc-500 mb-0.5 block">Start</Label>
              <DateDropdowns value={startDate} onChange={(d) => setAnswer(startKey, d.toISOString())} />
            </div>
            <span className="text-zinc-500 text-xs text-center hidden sm:block mt-4">–</span>
            <div className="flex-1 min-w-0">
              <Label className="text-[10px] text-zinc-500 mb-0.5 block">End</Label>
              <DateDropdowns value={endDate} onChange={(d) => setAnswer(endKey, d.toISOString())} />
            </div>
            <div className="flex-1 min-w-[80px] bg-zinc-900 border border-zinc-700 rounded-md h-8 flex items-center justify-center sm:mt-4">
              <span className="text-xs text-emerald-400 font-medium">{durationText || "—"}</span>
            </div>
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
          className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs min-h-[72px] resize-none w-full"
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
        <div className="flex flex-col gap-1.5 w-full">
          <Select value={value || ""} onValueChange={(v) => setCellValue(tableId, entryIdx, rowIdx, colIdx, v)}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full">
              <SelectValue placeholder="Employment Status" />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={reasonDetails}
            onChange={(e) => setAnswer(detailReasonKey, e.target.value)}
            className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full"
            placeholder="Employment status explanation"
          />
        </div>
      );
    }

    // "name" & "surname" row → two fields side by side, full width
    if ((rowLabel.includes("name") && rowLabel.includes("surname")) || rowLabel.includes("name & surname") || rowLabel.includes("name and surname")) {
      const surnameKey = `surname_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`;
      const surnameVal = answers[surnameKey] || "";
      const tt = (table.table_title || "").toLowerCase();
      const isContactTrace = tt.includes("contact trace") || tt.includes("close friend") || tt.includes("next of kin")
        || tt.includes("father") || tt.includes("mother") || tt.includes("sibling") || tt.includes("brother") || tt.includes("sister");
      return (
        <div className="flex gap-2 w-full">
          <div className="flex-1 min-w-0">
            {!isContactTrace && <Label className="text-[10px] text-zinc-500 mb-0.5 block">Name</Label>}
            <Input
              value={value}
              onChange={(e) => setCellValue(tableId, entryIdx, rowIdx, colIdx, e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full"
              placeholder="First name"
            />
          </div>
          <div className="flex-1 min-w-0">
            {!isContactTrace && <Label className="text-[10px] text-zinc-500 mb-0.5 block">Surname</Label>}
            <Input
              value={surnameVal}
              onChange={(e) => setAnswer(surnameKey, e.target.value)}
              className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full"
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
          className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full"
          placeholder="Address"
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
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full">
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

      const tt = (table.table_title || "").toLowerCase();
      const isContactTrace = tt.includes("contact trace") || tt.includes("close friend") || tt.includes("next of kin")
        || tt.includes("father") || tt.includes("mother") || tt.includes("sibling") || tt.includes("brother") || tt.includes("sister");

      return (
        <div className="space-y-1 w-full">
          {empStatus === "retired" && (
            <p className="text-[10px] text-yellow-500 italic">Please enter last employer and position held</p>
          )}
          <div className="flex gap-2 w-full">
            <div className="flex-1 min-w-0">
              {!isContactTrace && <Label className="text-[10px] text-zinc-500 mb-0.5 block">Employer Name</Label>}
              <Input
                value={value}
                onChange={(e) => setCellValue(tableId, entryIdx, rowIdx, colIdx, e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full"
                placeholder="Employer"
              />
            </div>
            <div className="flex-1 min-w-0">
              {!isContactTrace && <Label className="text-[10px] text-zinc-500 mb-0.5 block">Position</Label>}
              <Input
                value={positionVal}
                onChange={(e) => setAnswer(positionKey, e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full"
                placeholder="Position"
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
          <div className="w-full sm:w-[200px] flex-shrink-0">
            <Select value={value || ""} onValueChange={(v) => {
              setCellValue(tableId, entryIdx, rowIdx, colIdx, v);
              if (v.toLowerCase().includes("no criminal")) setAnswer(crimDetailKey, "");
            }}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs placeholder:text-xs h-auto min-h-9 py-2 whitespace-normal w-full [&>span]:line-clamp-none [&>span]:whitespace-normal text-left">
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
                className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full"
                placeholder="Please provide details..."
              />
            </div>
          )}
        </div>
      );
    }

    // "arrested/detained" → dropdown with conditional hide of subsequent rows
    if (rowLabel.includes("arrested") || rowLabel.includes("detained")) {
      const arrestedOptions = [
        "Has been arrested / detained by law enforcement",
        "Has never been arrested or detained by law enforcement"
      ];
      const frequencyKey = `arrest_frequency_${tableId}_${entryIdx}`;
      const incidentCountKey = `arrest_incident_count_${tableId}_${entryIdx}`;
      const currentFrequency = answers[frequencyKey] || "";
      const currentIncidentCount = parseInt(answers[incidentCountKey] || "1", 10);

      const clearDependentRows = () => {
        table.row_labels.forEach((label, rIdx) => {
          const rl = String(label).toLowerCase().trim();
          if (rl.includes("reason") || rl.includes("charged") || rl.includes("convicted") || rl.includes("term") || rl.includes("court")) {
            setCellValue(tableId, entryIdx, rIdx, 0, "");
            setAnswer(`arrest_reason_${tableId}_${entryIdx}_${rIdx}_0`, "");
            setAnswer(`arrest_date_${tableId}_${entryIdx}_${rIdx}_0`, "");
          }
        });
        // Clear multi-incident data
        for (let i = 0; i < 10; i++) {
          setAnswer(`arrest_reason_incident_${tableId}_${entryIdx}_${i}`, "");
          setAnswer(`arrest_date_incident_${tableId}_${entryIdx}_${i}`, "");
        }
        setAnswer(frequencyKey, "");
        setAnswer(incidentCountKey, "");
      };

      return (
        <div className="flex flex-col gap-2 w-full">
          <Select value={value || ""} onValueChange={(v) => {
            setCellValue(tableId, entryIdx, rowIdx, colIdx, v);
            if (v.includes("never")) {
              clearDependentRows();
            } else {
              // Default to single
              if (!answers[frequencyKey]) {
                setAnswer(frequencyKey, "single");
                setAnswer(incidentCountKey, "1");
              }
            }
          }}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs placeholder:text-xs h-auto min-h-9 py-2 whitespace-normal w-full [&>span]:line-clamp-none [&>span]:whitespace-normal text-left">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {arrestedOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {value && value.includes("Has been") && (
            <div className="flex gap-2 items-end">
              <div>
                <Select value={currentFrequency || "single"} onValueChange={(v) => {
                  setAnswer(frequencyKey, v);
                  if (v === "single") {
                    setAnswer(incidentCountKey, "1");
                    // Clear extra incident data
                    for (let i = 1; i < 10; i++) {
                      setAnswer(`arrest_reason_incident_${tableId}_${entryIdx}_${i}`, "");
                      setAnswer(`arrest_date_incident_${tableId}_${entryIdx}_${i}`, "");
                    }
                  } else {
                    if (!answers[incidentCountKey] || answers[incidentCountKey] === "1") {
                      setAnswer(incidentCountKey, "2");
                    }
                  }
                }}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-[160px]">
                    <SelectValue placeholder="Frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single incident</SelectItem>
                    <SelectItem value="multiple">Multiple incidents</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(currentFrequency === "multiple") && (
                <div>
                  <Label className="text-[10px] text-zinc-500 mb-0.5 block">Number of incidents</Label>
                  <Select value={String(currentIncidentCount)} onValueChange={(v) => {
                    setAnswer(incidentCountKey, v);
                    // Clear data beyond new count
                    const newCount = parseInt(v, 10);
                    for (let i = newCount; i < 10; i++) {
                      setAnswer(`arrest_reason_incident_${tableId}_${entryIdx}_${i}`, "");
                      setAnswer(`arrest_date_incident_${tableId}_${entryIdx}_${i}`, "");
                    }
                  }}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // Helper: check if arrested/detained row has "has been arrested" selected
    const getArrestedStatus = () => {
      const arrestedRowIdx = table.row_labels.findIndex((l) => {
        const ll = String(l).toLowerCase().trim();
        return ll.includes("arrested") || ll.includes("detained");
      });
      if (arrestedRowIdx < 0) return "unknown";
      const arrestedVal = (tableData[tableId]?.[entryIdx]?.[arrestedRowIdx]?.[0] || "").toLowerCase();
      if (arrestedVal.includes("never")) return "never";
      if (arrestedVal.includes("has been")) return "arrested";
      return "unknown";
    };

    // "reason & date" or "reason" with "date" → hidden if never arrested, else calendar + reason input
    if ((rowLabel.includes("reason") && rowLabel.includes("date")) && !rowLabel.includes("leaving")) {
      const arrestedStatus = getArrestedStatus();
      if (arrestedStatus === "never") return null;

      const frequencyKey = `arrest_frequency_${tableId}_${entryIdx}`;
      const incidentCountKey = `arrest_incident_count_${tableId}_${entryIdx}`;
      const frequency = answers[frequencyKey] || "single";
      const incidentCount = frequency === "multiple" ? parseInt(answers[incidentCountKey] || "2", 10) : 1;

      const arrestReasonOptions = [
        "Driving Under the Influence", "Assault", "Gender Based Violence", "Unpaid Fines",
        "Murder", "Attempted Murder", "Rape", "Fraud/Corruption", "Theft",
        "Possession of Stolen Goods", "Drug Dealing", "Drug Fabrication", "Drug Possession",
        "Extortion", "Hijacking", "Armed Robbery", "Human Trafficking", "Other"
      ];

      const renderIncidentLine = (idx: number) => {
        const reasonKey = idx === 0 
          ? `arrest_reason_${tableId}_${entryIdx}_${rowIdx}_${colIdx}` 
          : `arrest_reason_incident_${tableId}_${entryIdx}_${idx}`;
        const dateKey = idx === 0 
          ? `arrest_date_${tableId}_${entryIdx}_${rowIdx}_${colIdx}` 
          : `arrest_date_incident_${tableId}_${entryIdx}_${idx}`;
        const reasonVal = answers[reasonKey] || "";
        const dateVal = answers[dateKey] ? new Date(answers[dateKey]) : undefined;

        return (
          <div key={idx} className="flex flex-col sm:flex-row gap-2 w-full sm:items-end">
            {incidentCount > 1 && (
              <span className="text-[10px] text-zinc-500 mb-0 sm:mb-2 flex-shrink-0 w-4">{idx + 1}.</span>
            )}
            <div className="w-full sm:w-auto sm:flex-shrink-0">
              <DateDropdowns
                value={dateVal}
                placeholder="Date"
                onChange={(d) => {
                  setAnswer(dateKey, d.toISOString());
                  const combined = `${format(d, "dd/MM/yyyy")} - ${reasonVal}`;
                  if (idx === 0) setCellValue(tableId, entryIdx, rowIdx, colIdx, combined);
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <Select value={reasonVal} onValueChange={(v) => {
                setAnswer(reasonKey, v);
                const dateStr = dateVal ? format(dateVal, "dd/MM/yyyy") : "";
                const combined = `${dateStr} - ${v}`;
                if (idx === 0) setCellValue(tableId, entryIdx, rowIdx, colIdx, combined);
              }}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs placeholder:text-xs h-auto min-h-9 py-2 whitespace-normal w-full [&>span]:line-clamp-none [&>span]:whitespace-normal text-left">
                  <SelectValue placeholder="Reason" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {arrestReasonOptions.map(opt => (
                    <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      };

      return (
        <div className="flex flex-col gap-2 w-full">
          {Array.from({ length: incidentCount }, (_, i) => renderIncidentLine(i))}
        </div>
      );
    }

    // Helper: get all charged values across incidents
    const getAllChargedValues = () => {
      const frequencyKey = `arrest_frequency_${tableId}_${entryIdx}`;
      const incidentCountKey = `arrest_incident_count_${tableId}_${entryIdx}`;
      const frequency = answers[frequencyKey] || "single";
      const ic = frequency === "multiple" ? parseInt(answers[incidentCountKey] || "2", 10) : 1;
      const vals: { idx: number; value: string; reason: string }[] = [];
      const reasonRowIdx = table.row_labels.findIndex((l) => {
        const ll = String(l).toLowerCase().trim();
        return ll.includes("reason") && ll.includes("date") && !ll.includes("leaving");
      });
      for (let i = 0; i < ic; i++) {
        const ck = i === 0
          ? `charged_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`
          : `charged_incident_${tableId}_${entryIdx}_${i}`;
        const rk = i === 0
          ? `arrest_reason_${tableId}_${entryIdx}_${reasonRowIdx >= 0 ? reasonRowIdx : rowIdx}_0`
          : `arrest_reason_incident_${tableId}_${entryIdx}_${i}`;
        const cv = i === 0 ? (tableData[tableId]?.[entryIdx]?.[rowIdx]?.[colIdx] || "") : (answers[ck] || "");
        vals.push({ idx: i, value: cv, reason: answers[rk] || "" });
      }
      return vals;
    };

    // Helper: check if any incident has "formally charged"
    const hasAnyFormallyCharged = () => {
      // Find the charged row index
      const chargedRowIdx = table.row_labels.findIndex((l) => {
        const ll = String(l).toLowerCase().trim();
        return ll.includes("charged") && !ll.includes("court");
      });
      if (chargedRowIdx < 0) return false;
      const frequencyKey = `arrest_frequency_${tableId}_${entryIdx}`;
      const incidentCountKey = `arrest_incident_count_${tableId}_${entryIdx}`;
      const frequency = answers[frequencyKey] || "single";
      const ic = frequency === "multiple" ? parseInt(answers[incidentCountKey] || "2", 10) : 1;
      const reasonRowIdx = table.row_labels.findIndex((l) => {
        const ll = String(l).toLowerCase().trim();
        return ll.includes("reason") && ll.includes("date") && !ll.includes("leaving");
      });
      for (let i = 0; i < ic; i++) {
        const ck = i === 0
          ? `charged_${tableId}_${entryIdx}_${chargedRowIdx}_0`
          : `charged_incident_${tableId}_${entryIdx}_${i}`;
        const cv = i === 0 ? (tableData[tableId]?.[entryIdx]?.[chargedRowIdx]?.[0] || "") : (answers[ck] || "");
        if (cv === "Formally charged and attended court") return true;
      }
      return false;
    };

    // Helper: get reasons where formally charged
    const getFormallyChargedReasons = () => {
      const chargedRowIdx = table.row_labels.findIndex((l) => {
        const ll = String(l).toLowerCase().trim();
        return ll.includes("charged") && !ll.includes("court");
      });
      if (chargedRowIdx < 0) return [];
      const frequencyKey = `arrest_frequency_${tableId}_${entryIdx}`;
      const incidentCountKey = `arrest_incident_count_${tableId}_${entryIdx}`;
      const frequency = answers[frequencyKey] || "single";
      const ic = frequency === "multiple" ? parseInt(answers[incidentCountKey] || "2", 10) : 1;
      const reasonRowIdx = table.row_labels.findIndex((l) => {
        const ll = String(l).toLowerCase().trim();
        return ll.includes("reason") && ll.includes("date") && !ll.includes("leaving");
      });
      const reasons: string[] = [];
      for (let i = 0; i < ic; i++) {
        const ck = i === 0
          ? `charged_${tableId}_${entryIdx}_${chargedRowIdx}_0`
          : `charged_incident_${tableId}_${entryIdx}_${i}`;
        const cv = i === 0 ? (tableData[tableId]?.[entryIdx]?.[chargedRowIdx]?.[0] || "") : (answers[ck] || "");
        const rk = i === 0
          ? `arrest_reason_${tableId}_${entryIdx}_${reasonRowIdx >= 0 ? reasonRowIdx : 0}_0`
          : `arrest_reason_incident_${tableId}_${entryIdx}_${i}`;
        if (cv === "Formally charged and attended court" && answers[rk]) {
          reasons.push(answers[rk]);
        }
      }
      return reasons;
    };

    // "charged" → hidden if never arrested, else dropdown with charge options (supports multiple incidents)
    if (rowLabel.includes("charged") && !rowLabel.includes("court")) {
      const arrestedStatus = getArrestedStatus();
      if (arrestedStatus === "never") return null;

      const frequencyKey = `arrest_frequency_${tableId}_${entryIdx}`;
      const incidentCountKey = `arrest_incident_count_${tableId}_${entryIdx}`;
      const frequency = answers[frequencyKey] || "single";
      const incidentCount = frequency === "multiple" ? parseInt(answers[incidentCountKey] || "2", 10) : 1;

      const chargedOptions = [
        "Formally charged and attended court",
        "Charges dropped and let go on a warning",
        "Charges withdrawn",
        "Paid a bribe to not get charged"
      ];

      // Find the reason row index to look up each incident's selected reason
      const reasonRowIdx = table.row_labels.findIndex((l) => {
        const ll = String(l).toLowerCase().trim();
        return ll.includes("reason") && ll.includes("date") && !ll.includes("leaving");
      });

      const renderChargedLine = (idx: number) => {
        const chargedKey = idx === 0
          ? `charged_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`
          : `charged_incident_${tableId}_${entryIdx}_${idx}`;
        const chargedVal = idx === 0 ? (value || "") : (answers[chargedKey] || "");

        // Get the reason selected for this incident
        const reasonKey = idx === 0
          ? `arrest_reason_${tableId}_${entryIdx}_${reasonRowIdx >= 0 ? reasonRowIdx : rowIdx}_0`
          : `arrest_reason_incident_${tableId}_${entryIdx}_${idx}`;
        const incidentReason = answers[reasonKey] || "";

        return (
          <div key={idx} className="flex gap-2 w-full items-center">
            {incidentCount > 1 && (
              <span className="text-[10px] text-zinc-500 flex-shrink-0 w-4">{idx + 1}.</span>
            )}
            {incidentCount > 1 && incidentReason && (
              <span className="text-[10px] text-zinc-400 flex-shrink-0 font-medium">{incidentReason}:</span>
            )}
            <Select value={chargedVal} onValueChange={(v) => {
              if (idx === 0) {
                setCellValue(tableId, entryIdx, rowIdx, colIdx, v);
              } else {
                setAnswer(chargedKey, v);
              }
              // Auto-set court attendance with the reason if formally charged
              if (v === "Formally charged and attended court") {
                const courtRowIdx = table.row_labels.findIndex((l) => {
                  const ll = String(l).toLowerCase().trim();
                  return ll.includes("court");
                });
                if (courtRowIdx >= 0) {
                  // Build court attendance summary from all formally charged incidents
                  setTimeout(() => {
                    const chargedRowIdx2 = table.row_labels.findIndex((l) => {
                      const ll2 = String(l).toLowerCase().trim();
                      return ll2.includes("charged") && !ll2.includes("court");
                    });
                    const reasons: string[] = [];
                    for (let i = 0; i < incidentCount; i++) {
                      const ck2 = i === 0
                        ? `charged_${tableId}_${entryIdx}_${chargedRowIdx2}_${colIdx}`
                        : `charged_incident_${tableId}_${entryIdx}_${i}`;
                      const cv2 = i === idx ? v : (i === 0 ? (tableData[tableId]?.[entryIdx]?.[chargedRowIdx2]?.[0] || "") : (answers[ck2] || ""));
                      const rk2 = i === 0
                        ? `arrest_reason_${tableId}_${entryIdx}_${reasonRowIdx >= 0 ? reasonRowIdx : 0}_0`
                        : `arrest_reason_incident_${tableId}_${entryIdx}_${i}`;
                      if (cv2 === "Formally charged and attended court" && answers[rk2]) {
                        reasons.push(answers[rk2]);
                      }
                    }
                    const courtText = reasons.length > 0
                      ? `Has gone to court for: ${reasons.join(", ")}`
                      : "Has gone to court for being charged";
                    setCellValue(tableId, entryIdx, courtRowIdx, 0, courtText);
                  }, 0);
                }
              }
            }}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs placeholder:text-xs h-auto min-h-9 py-2 whitespace-normal w-full [&>span]:line-clamp-none [&>span]:whitespace-normal text-left">
                <SelectValue placeholder="Select charge outcome" />
              </SelectTrigger>
              <SelectContent>
                {chargedOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      };

      return (
        <div className="flex flex-col gap-2 w-full">
          {Array.from({ length: incidentCount }, (_, i) => renderChargedLine(i))}
        </div>
      );
    }

    // "convicted" → only show if at least one incident is "formally charged"
    if (rowLabel.includes("convicted")) {
      const arrestedStatus = getArrestedStatus();
      if (arrestedStatus === "never") return null;
      if (!hasAnyFormallyCharged()) return null;

      const convictedKey = `convicted_${tableId}_${entryIdx}_${rowIdx}_${colIdx}`;
      const convictedVal = value || answers[convictedKey] || "";
      const formalReasons = getFormallyChargedReasons();
      const convictedOptions = [
        ...formalReasons,
        "Has never been convicted of any criminal offence"
      ];

      return (
        <Select value={convictedVal} onValueChange={(v) => {
          setCellValue(tableId, entryIdx, rowIdx, colIdx, v);
          setAnswer(convictedKey, v);
          // Clear term served if "never convicted"
          if (v === "Has never been convicted of any criminal offence") {
            const termRowIdx = table.row_labels.findIndex((l) => {
              const ll = String(l).toLowerCase().trim();
              return ll.includes("term") && ll.includes("served");
            });
            if (termRowIdx >= 0) {
              setCellValue(tableId, entryIdx, termRowIdx, 0, "");
              setAnswer(`term_start_${tableId}_${entryIdx}`, "");
              setAnswer(`term_end_${tableId}_${entryIdx}`, "");
            }
          }
        }}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs placeholder:text-xs h-auto min-h-9 py-2 whitespace-normal w-full [&>span]:line-clamp-none [&>span]:whitespace-normal text-left">
            <SelectValue placeholder="Select conviction status" />
          </SelectTrigger>
          <SelectContent>
            {convictedOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // "term served" → only show if convicted with an actual offence (not "never convicted")
    if (rowLabel.includes("term") && rowLabel.includes("served")) {
      const arrestedStatus = getArrestedStatus();
      if (arrestedStatus === "never") return null;
      if (!hasAnyFormallyCharged()) return null;

      const convictedRowIdx = table.row_labels.findIndex((l) => String(l).toLowerCase().includes("convicted"));
      const convictedVal = convictedRowIdx >= 0 ? (tableData[tableId]?.[entryIdx]?.[convictedRowIdx]?.[0] || "") : "";
      if (!convictedVal || convictedVal === "Has never been convicted of any criminal offence") return null;

      const termStartKey = `term_start_${tableId}_${entryIdx}`;
      const termEndKey = `term_end_${tableId}_${entryIdx}`;
      const startVal = answers[termStartKey] ? new Date(answers[termStartKey]) : undefined;
      const endVal = answers[termEndKey] ? new Date(answers[termEndKey]) : undefined;

      return (
        <div className="space-y-1 w-full">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 w-full">
            <div className="flex-1 min-w-0">
              <DateDropdowns value={startVal} placeholder="From" onChange={(d) => {
                setAnswer(termStartKey, d.toISOString());
                const endStr = endVal ? format(endVal, "dd/MM/yyyy") : "";
                setCellValue(tableId, entryIdx, rowIdx, colIdx, `${format(d, "dd/MM/yyyy")} - ${endStr}`);
              }} />
            </div>
            <span className="text-zinc-500 text-xs text-center hidden sm:block">–</span>
            <div className="flex-1 min-w-0">
              <DateDropdowns value={endVal} placeholder="To" onChange={(d) => {
                setAnswer(termEndKey, d.toISOString());
                const startStr = startVal ? format(startVal, "dd/MM/yyyy") : "";
                setCellValue(tableId, entryIdx, rowIdx, colIdx, `${startStr} - ${format(d, "dd/MM/yyyy")}`);
              }} />
            </div>
          </div>
        </div>
      );
    }

    // "pending court cases" → dropdown with conditional case details + date
    if (rowLabel.includes("pending") && rowLabel.includes("court")) {
      const pendingKey = `pending_court_${tableId}_${entryIdx}_${rowIdx}`;
      const pendingVal = value || answers[pendingKey] || "";
      const pendingCaseKey = `pending_court_case_${tableId}_${entryIdx}_${rowIdx}`;
      const pendingDateKey = `pending_court_date_${tableId}_${entryIdx}_${rowIdx}`;
      const pendingCase = answers[pendingCaseKey] || "";
      const pendingDate = answers[pendingDateKey] ? new Date(answers[pendingDateKey]) : undefined;

      return (
        <div className="flex flex-col gap-2 w-full">
          <Select value={pendingVal} onValueChange={(v) => {
            setCellValue(tableId, entryIdx, rowIdx, colIdx, v);
            setAnswer(pendingKey, v);
            if (v === "I am not aware of any pending court cases") {
              setAnswer(pendingCaseKey, "");
              setAnswer(pendingDateKey, "");
            }
          }}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs placeholder:text-xs h-auto min-h-9 py-2 whitespace-normal w-full [&>span]:line-clamp-none [&>span]:whitespace-normal text-left">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="I am not aware of any pending court cases">I am not aware of any pending court cases</SelectItem>
              <SelectItem value="I have pending court cases">I have pending court cases</SelectItem>
            </SelectContent>
          </Select>
          {pendingVal === "I have pending court cases" && (
            <div className="space-y-2">
              <Textarea
                value={pendingCase}
                onChange={(e) => setAnswer(pendingCaseKey, e.target.value)}
                className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs min-h-[80px]"
                placeholder="Describe the case..."
              />
              <DateDropdowns
                value={pendingDate}
                onChange={(d) => setAnswer(pendingDateKey, d.toISOString())}
                placeholder="Court Date"
              />
            </div>
          )}
        </div>
      );
    }

    // "court attendance" or "court" → auto-populated from charged selections (exclude "pending court")
    if (rowLabel.includes("court") && !rowLabel.includes("pending")) {
      const arrestedStatus = getArrestedStatus();
      if (arrestedStatus === "never") return null;
      if (!hasAnyFormallyCharged()) return null;
      return (
        <div className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-xs text-zinc-300 min-h-[32px] flex items-center">
          {value || "Auto-populated from charge selections"}
        </div>
      );
    }

    // "criminal record check" → dropdown
    if (rowLabel.includes("criminal") && rowLabel.includes("record") && rowLabel.includes("check")) {
      return (
        <Select value={value || ""} onValueChange={(v) => setCellValue(tableId, entryIdx, rowIdx, colIdx, v)}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs placeholder:text-xs h-auto min-h-9 py-2 whitespace-normal w-full [&>span]:line-clamp-none [&>span]:whitespace-normal text-left">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Criminal Record Check Completed">Criminal Record Check Completed</SelectItem>
            <SelectItem value="Criminal Record Check Not Completed">Criminal Record Check Not Completed</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    // "criminal record expunged" → dropdown with conditional reason + date
    if (rowLabel.includes("criminal") && rowLabel.includes("expung")) {
      const expungedKey = `expunged_status_${tableId}_${entryIdx}_${rowIdx}`;
      const expungedVal = value || answers[expungedKey] || "";
      const expungedReasonKey = `expunged_reason_${tableId}_${entryIdx}_${rowIdx}`;
      const expungedDateKey = `expunged_date_${tableId}_${entryIdx}_${rowIdx}`;
      const expungedReason = answers[expungedReasonKey] || "";
      const expungedDate = answers[expungedDateKey] ? new Date(answers[expungedDateKey]) : undefined;

      const arrestReasonOptions = [
        "Driving Under the Influence", "Assault", "Gender Based Violence", "Unpaid Fines",
        "Murder", "Attempted Murder", "Rape", "Fraud/Corruption", "Theft",
        "Possession of Stolen Goods", "Drug Dealing", "Drug Fabrication", "Drug Possession",
        "Extortion", "Hijacking", "Armed Robbery", "Human Trafficking", "Other"
      ];

      return (
        <div className="flex flex-col gap-2 w-full">
          <Select value={expungedVal} onValueChange={(v) => {
            setCellValue(tableId, entryIdx, rowIdx, colIdx, v);
            setAnswer(expungedKey, v);
            if (v === "I have had no Criminal Records Expunged") {
              setAnswer(expungedReasonKey, "");
              setAnswer(expungedDateKey, "");
            }
          }}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs placeholder:text-xs h-auto min-h-9 py-2 whitespace-normal w-full [&>span]:line-clamp-none [&>span]:whitespace-normal text-left">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="I have had no Criminal Records Expunged">I have had no Criminal Records Expunged</SelectItem>
              <SelectItem value="I have had a Criminal Record Expunged">I have had a Criminal Record Expunged</SelectItem>
            </SelectContent>
          </Select>
          {expungedVal === "I have had a Criminal Record Expunged" && (
            <div className="flex gap-2 items-end">
              <div className="flex-1 min-w-0">
                <Label className="text-[10px] text-zinc-500 mb-0.5 block">Reason</Label>
                <Select value={expungedReason} onValueChange={(v) => setAnswer(expungedReasonKey, v)}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs placeholder:text-xs h-auto min-h-9 py-2 whitespace-normal w-full [&>span]:line-clamp-none [&>span]:whitespace-normal text-left">
                    <SelectValue placeholder="Select reason..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {arrestReasonOptions.map(opt => (
                      <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-shrink-0">
                <Label className="text-[10px] text-zinc-500 mb-0.5 block">Date of Offence</Label>
                <DateDropdowns value={expungedDate} onChange={(d) => setAnswer(expungedDateKey, d.toISOString())} />
              </div>
            </div>
          )}
        </div>
      );
    }

    // === GENERIC INPUT TYPE HANDLERS ===

    if (inputType === "yes_no") {
      return (
        <Select value={value || ""} onValueChange={(v) => setCellValue(tableId, entryIdx, rowIdx, colIdx, v)}>
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9">
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
            className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 pl-6"
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
          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9">
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
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
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
                      className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8 w-full"
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
        className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9"
        placeholder={mobilePlaceholder || "Enter..."}
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
    const isEducationTable = table.table_title.toLowerCase().includes("education") || table.table_title.toLowerCase().includes("school");
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
                <span className="text-sm font-semibold text-primary">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-3 space-y-3">
              {/* Bank multi-select dropdown */}
              <div className="space-y-1">
                
                <Popover open={bankDropdownOpen} onOpenChange={setBankDropdownOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full justify-between">
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
                        <Button variant="outline" className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full justify-between">
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
                <span className="text-sm font-semibold text-primary">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-3 space-y-3">
              {/* Account multi-select dropdown */}
              <div className="space-y-1">
                
                <Popover open={maDropdownOpen} onOpenChange={setMaDropdownOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full justify-between">
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
                        <Label className="text-[10px] text-zinc-500">Monthly Amount</Label>
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
                            className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 pl-6"
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
                <span className="text-sm font-semibold text-primary">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-3 space-y-3">
              <div className="space-y-1">
                
                <Popover open={huDropdownOpen} onOpenChange={setHuDropdownOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full justify-between">
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
                        <Label className="text-[10px] text-zinc-500">Amount Owed</Label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">R</span>
                          <Input type="number" value={entry.amount}
                            onChange={(e) => {
                              const next = { ...huSelections, [acc]: { ...entry, amount: e.target.value } };
                              setAnswer(huKey, next);
                              syncHuCellValues(next);
                            }}
                            className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 pl-6" placeholder="0.00" step="0.01" />
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

    // Special rendering for FAMILY & FRIENDS LAW ENCOUNTERS table
    const ttLower = table.table_title.toLowerCase();
    const isFamilyFriendsLaw = (ttLower.includes("family") || ttLower.includes("friend"))
      && (ttLower.includes("law") || ttLower.includes("criminal") || ttLower.includes("encounter")
        || (ttLower === "family / friends") || (ttLower === "family/friends") || (ttLower === "family & friends"))
      && !ttLower.includes("contact trace");

    if (isFamilyFriendsLaw) {
      const ffKey = `family_friends_law_${table.id}`;
      
      // Collect flagged people from contact trace tables (Family & Friend Contact Trace, Close Friend, Next of Kin, parents/siblings)
      const getFlaggedPeople = (): { name: string; surname: string; relationship: string; sourceKey: string }[] => {
        const flagged: { name: string; surname: string; relationship: string; sourceKey: string }[] = [];
        const contactTraceTables = tables.filter(t => {
          const tt = t.table_title.toLowerCase();
          return (tt.includes("contact trace") || tt.includes("close friend") || tt.includes("next of kin")
            || tt.includes("father") || tt.includes("mother") || tt.includes("sibling") || tt.includes("brother") || tt.includes("sister"))
            && t.id !== table.id;
        });
        
        for (const ct of contactTraceTables) {
          const ctEntries = tableData[ct.id] || [];
          for (let entryIdx = 0; entryIdx < ctEntries.length; entryIdx++) {
            const ctEntry = ctEntries[entryIdx];
            // Find criminal history row
            const crimRowIdx = ct.row_labels.findIndex(l => {
              const ll = String(l).toLowerCase().replace(/[:\s]+$/, '');
              return ll.includes("criminal") && ll.includes("history");
            });
            if (crimRowIdx < 0) continue;
            const crimVal = (ctEntry[crimRowIdx]?.[0] || "").toLowerCase();
            if (!crimVal.includes("has criminal history") || crimVal.includes("no criminal")) continue;
            
            // Find name row
            const nameRowIdx = ct.row_labels.findIndex(l => {
              const ll = String(l).toLowerCase().replace(/[:\s]+$/, '');
              return ll.includes("name") && ll.includes("surname");
            });
            const nameVal = nameRowIdx >= 0 ? (ctEntry[nameRowIdx]?.[0] || "") : "";
            const surnameKey = `surname_${ct.id}_${entryIdx}_${nameRowIdx}_0`;
            const surnameVal = nameRowIdx >= 0 ? (answers[surnameKey] || "") : "";
            
            // Get relationship from a "Relationship" row, else fall back to a friendly form of the table title
            let relationship = ct.table_title
              .toLowerCase()
              .split(' ')
              .map(w => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ');
            const relRowIdx = ct.row_labels.findIndex(l => {
              const ll = String(l).toLowerCase().replace(/[:\s]+$/, '');
              return ll === "relationship";
            });
            if (relRowIdx >= 0) {
              const relVal = ctEntry[relRowIdx]?.[0] || "";
              if (relVal) relationship = relVal;
            }
            
            // Always include flagged people, even if name not yet entered (so they appear immediately when ticked)
            flagged.push({
              name: nameVal,
              surname: surnameVal,
              relationship,
              sourceKey: `${ct.id}_${entryIdx}`,
            });
          }
        }
        return flagged;
      };

      interface FFPerson {
        name: string;
        surname: string;
        relationship: string;
        source: 'flagged' | 'manual';
        sourceKey?: string;
        arrested: string;
        frequency: string;
        incidentCount: number;
        incidents: { reason: string; date: string; charged: string }[];
        courtAttendance: string;
        convicted: string;
        termStart: string;
        termEnd: string;
        criminalRecordCheck: string;
        expungedStatus: string;
        expungedReason: string;
        expungedDate: string;
        pendingCourt: string;
        pendingCase: string;
        pendingDate: string;
      }

      const ffPersons: FFPerson[] = answers[ffKey] || [];
      
      // Auto-sync flagged people: contact trace tables are the source of truth.
      // Match existing flagged entries by stable sourceKey to preserve arrest details
      // when names/relationships are edited, and auto-remove if no longer flagged.
      const flaggedPeople = getFlaggedPeople();
      const existingManual = ffPersons.filter(p => p.source === 'manual');
      const existingFlagged = ffPersons.filter(p => p.source === 'flagged');
      const newFlagged: FFPerson[] = flaggedPeople.map(fp => {
        // Prefer match by stable sourceKey; fall back to legacy match by name/surname/relationship
        const existing = existingFlagged.find(ef => ef.sourceKey && ef.sourceKey === fp.sourceKey)
          || existingFlagged.find(ef => !ef.sourceKey && ef.name === fp.name && ef.surname === fp.surname && ef.relationship === fp.relationship);
        if (existing) {
          return { ...existing, name: fp.name, surname: fp.surname, relationship: fp.relationship, sourceKey: fp.sourceKey, source: 'flagged' as const };
        }
        return {
          name: fp.name, surname: fp.surname, relationship: fp.relationship, source: 'flagged' as const, sourceKey: fp.sourceKey,
          arrested: 'Has been arrested / detained by law enforcement', frequency: '', incidentCount: 1, incidents: [{ reason: '', date: '', charged: '' }],
          courtAttendance: '', convicted: '', termStart: '', termEnd: '',
          criminalRecordCheck: '', expungedStatus: '', expungedReason: '', expungedDate: '',
          pendingCourt: '', pendingCase: '', pendingDate: ''
        };
      });
      const merged = [...newFlagged, ...existingManual];
      // Only write if the flagged set changed (avoid render loops)
      const flaggedFingerprint = (arr: FFPerson[]) => arr.filter(p => p.source === 'flagged').map(p => `${p.sourceKey || ''}|${p.name}|${p.surname}|${p.relationship}`).join('||');
      if (flaggedFingerprint(merged) !== flaggedFingerprint(ffPersons) || merged.length !== ffPersons.length) {
        setTimeout(() => setAnswer(ffKey, merged), 0);
      }

      const updatePerson = (idx: number, updates: Partial<FFPerson>) => {
        const next = [...(answers[ffKey] || [])];
        next[idx] = { ...next[idx], ...updates };
        setAnswer(ffKey, next);
      };

      const addManualPerson = () => {
        const next = [...(answers[ffKey] || []), {
          name: '', surname: '', relationship: '', source: 'manual' as const,
          arrested: '', frequency: '', incidentCount: 1, incidents: [{ reason: '', date: '', charged: '' }],
          courtAttendance: '', convicted: '', termStart: '', termEnd: '',
          criminalRecordCheck: '', expungedStatus: '', expungedReason: '', expungedDate: '',
          pendingCourt: '', pendingCase: '', pendingDate: ''
        }];
        setAnswer(ffKey, next);
      };

      const removePerson = (idx: number) => {
        const next = (answers[ffKey] || []).filter((_: any, i: number) => i !== idx);
        setAnswer(ffKey, next);
      };

      const arrestReasonOptions = [
        "Driving Under the Influence", "Assault", "Gender Based Violence", "Unpaid Fines",
        "Murder", "Attempted Murder", "Rape", "Fraud/Corruption", "Theft",
        "Possession of Stolen Goods", "Drug Dealing", "Drug Fabrication", "Drug Possession",
        "Extortion", "Hijacking", "Armed Robbery", "Human Trafficking", "Other"
      ];

      const chargedOptions = [
        "Formally charged and attended court",
        "Charges dropped and let go on a warning",
        "Charges withdrawn",
        "Paid a bribe to not get charged"
      ];

      const renderFFPerson = (person: FFPerson, pIdx: number) => {
        const isArrested = person.arrested.includes("Has been");
        const isNeverArrested = person.arrested.includes("never");
        const incidentCount = person.frequency === "multiple" ? person.incidentCount : 1;
        const hasFormallyCharged = person.incidents.some(inc => inc.charged === "Formally charged and attended court");
        const formalReasons = person.incidents.filter(inc => inc.charged === "Formally charged and attended court").map(inc => inc.reason).filter(Boolean);
        const isNeverConvicted = person.convicted === "Has never been convicted of any criminal offence";

        return (
          <div key={pIdx} className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="flex justify-between items-center px-3 py-2 bg-zinc-900 border-b border-zinc-800">
              <span className="text-xs font-medium text-zinc-300">
                {person.source === 'flagged' ? (
                  <>{person.name} {person.surname} <span className="text-zinc-500">({person.relationship})</span></>
                ) : (
                  `Additional Person ${pIdx + 1}`
                )}
              </span>
              {person.source === 'manual' && (
                <Button variant="ghost" size="sm" onClick={() => removePerson(pIdx)} className="h-6 text-xs text-red-400 hover:text-red-300">
                  <Trash2 className="h-3 w-3 mr-1" /> Remove
                </Button>
              )}
            </div>
            <div className="p-3 space-y-3">
              {/* Manual person: name/surname/relationship */}
              {person.source === 'manual' && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-[10px] text-zinc-500 mb-0.5 block">Name</Label>
                    <Input value={person.name} onChange={(e) => updatePerson(pIdx, { name: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9" placeholder="First name" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-[10px] text-zinc-500 mb-0.5 block">Surname</Label>
                    <Input value={person.surname} onChange={(e) => updatePerson(pIdx, { surname: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9" placeholder="Surname" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-[10px] text-zinc-500 mb-0.5 block">Relationship</Label>
                    <Input value={person.relationship} onChange={(e) => updatePerson(pIdx, { relationship: e.target.value })} className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9" placeholder="e.g. Uncle, Cousin" />
                  </div>
                </div>
              )}

              {/* Arrested/Detained */}
              <div className="space-y-1">
                <Label className="text-[10px] text-zinc-500">Arrested / Detained</Label>
                <Select value={person.arrested} onValueChange={(v) => {
                  const updates: Partial<FFPerson> = { arrested: v };
                  if (v.includes("never")) {
                    updates.frequency = '';
                    updates.incidentCount = 1;
                    updates.incidents = [{ reason: '', date: '', charged: '' }];
                    updates.courtAttendance = '';
                    updates.convicted = '';
                    updates.termStart = '';
                    updates.termEnd = '';
                  } else if (!person.frequency) {
                    updates.frequency = 'single';
                    updates.incidentCount = 1;
                  }
                  updatePerson(pIdx, updates);
                }}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs placeholder:text-xs h-auto min-h-9 py-2 whitespace-normal w-full [&>span]:line-clamp-none [&>span]:whitespace-normal text-left">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Has been arrested / detained by law enforcement">Has been arrested / detained by law enforcement</SelectItem>
                    <SelectItem value="Has never been arrested or detained by law enforcement">Has never been arrested or detained by law enforcement</SelectItem>
                  </SelectContent>
                </Select>
                {isArrested && (
                  <div className="flex gap-2 items-end mt-1">
                    <div>
                      <Select value={person.frequency || "single"} onValueChange={(v) => {
                        const newCount = v === "single" ? 1 : Math.max(person.incidentCount, 2);
                        const incidents = [...person.incidents];
                        while (incidents.length < newCount) incidents.push({ reason: '', date: '', charged: '' });
                        if (v === "single") incidents.length = 1;
                        updatePerson(pIdx, { frequency: v, incidentCount: newCount, incidents });
                      }}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-[160px]"><SelectValue placeholder="Frequency" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Single incident</SelectItem>
                          <SelectItem value="multiple">Multiple incidents</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {person.frequency === "multiple" && (
                      <div>
                        <Select value={String(person.incidentCount)} onValueChange={(v) => {
                          const n = parseInt(v, 10);
                          const incidents = [...person.incidents];
                          while (incidents.length < n) incidents.push({ reason: '', date: '', charged: '' });
                          incidents.length = n;
                          updatePerson(pIdx, { incidentCount: n, incidents });
                        }}>
                          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-[90px]"><SelectValue placeholder="Number" /></SelectTrigger>
                          <SelectContent>
                            {[2,3,4,5,6,7,8,9,10].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Reason & Date per incident */}
              {isArrested && (
                <div className="space-y-1">
                  {Array.from({ length: incidentCount }, (_, idx) => {
                    const inc = person.incidents[idx] || { reason: '', date: '', charged: '' };
                    const dateVal = inc.date ? new Date(inc.date) : undefined;
                    return (
                      <div key={idx} className="flex gap-2 items-end">
                        {incidentCount > 1 && <span className="text-[10px] text-zinc-500 mb-2 w-4">{idx + 1}.</span>}
                        <div className="flex-shrink-0">
                          <DateDropdowns value={dateVal} placeholder="Date" onChange={(d) => {
                            const incidents = [...person.incidents];
                            incidents[idx] = { ...incidents[idx], date: d.toISOString() };
                            updatePerson(pIdx, { incidents });
                          }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <Select value={inc.reason} onValueChange={(v) => {
                            const incidents = [...person.incidents];
                            incidents[idx] = { ...incidents[idx], reason: v };
                            updatePerson(pIdx, { incidents });
                          }}>
                            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs placeholder:text-xs h-auto min-h-9 py-2 whitespace-normal"><SelectValue placeholder="Reason" /></SelectTrigger>
                            <SelectContent className="max-h-[200px]">
                              {arrestReasonOptions.map(opt => <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Charged per incident */}
              {isArrested && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-zinc-500">Charged</Label>
                  {Array.from({ length: incidentCount }, (_, idx) => {
                    const inc = person.incidents[idx] || { reason: '', date: '', charged: '' };
                    return (
                      <div key={idx} className="flex gap-2 items-center">
                        {incidentCount > 1 && <span className="text-[10px] text-zinc-500 w-4">{idx + 1}.</span>}
                        {incidentCount > 1 && inc.reason && <span className="text-[10px] text-zinc-400 font-medium flex-shrink-0">{inc.reason}:</span>}
                        <Select value={inc.charged} onValueChange={(v) => {
                          const incidents = [...person.incidents];
                          incidents[idx] = { ...incidents[idx], charged: v };
                          // Auto-update court attendance
                          const updatedIncidents = [...incidents];
                          const courtReasons = updatedIncidents.filter(i => i.charged === "Formally charged and attended court" && i.reason).map(i => i.reason);
                          const courtText = courtReasons.length > 0 ? `Has gone to court for: ${courtReasons.join(", ")}` : "";
                          updatePerson(pIdx, { incidents: updatedIncidents, courtAttendance: courtText });
                        }}>
                          <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs placeholder:text-xs h-auto min-h-9 py-2 whitespace-normal w-full"><SelectValue placeholder="Select charge outcome" /></SelectTrigger>
                          <SelectContent>
                            {chargedOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Convicted */}
              {isArrested && hasFormallyCharged && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-zinc-500">Convicted</Label>
                  <Select value={person.convicted} onValueChange={(v) => {
                    updatePerson(pIdx, { convicted: v });
                  }}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-xs placeholder:text-xs h-auto min-h-9 py-2 whitespace-normal"><SelectValue placeholder="Select conviction status" /></SelectTrigger>
                    <SelectContent>
                      {formalReasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      <SelectItem value="Has never been convicted of any criminal offence">Has never been convicted of any criminal offence</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        );
      };

      const persons: FFPerson[] = answers[ffKey] || [];

      return (
        <div key={table.id} className="space-y-3">
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 border-b border-zinc-800 p-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-semibold text-primary">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-3 space-y-3">
              {persons.length === 0 && (
                <p className="text-xs text-zinc-500 italic text-center py-2">
                  No family members or friends with criminal history flagged. You can add people manually below.
                </p>
              )}
              {persons.map((p, i) => renderFFPerson(p, i))}
              <Button variant="outline" size="sm" onClick={addManualPerson} className="border-zinc-700 text-zinc-400 hover:text-white w-full">
                <Plus className="h-3 w-3 mr-1" /> Add Person
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Special rendering for THEFT AT WORK table
    const isTheftAtWork = ttLower.includes("theft") && ttLower.includes("work");
    if (isTheftAtWork) {
      const theftKey = `theft_at_work_${table.id}`;
      const theftData = answers[theftKey] || {
        stolen: '',
        stolenEmployers: {} as Record<string, { description: string; value: string }>,
        witnessed: '',
        witnessedEmployers: {} as Record<string, { reason: string; personType: string }>,
        benefited: '',
        helped: '',
        helpedEmployers: {} as Record<string, { helpedWho: string }>,
        approached: '',
      };

      const updateTheft = (updates: Partial<typeof theftData>) => {
        setAnswer(theftKey, { ...theftData, ...updates });
      };

      // Get employer names from employment history tables
      const getEmployerNames = (): string[] => {
        const employers: string[] = [];
        for (const t of tables) {
          const tt = t.table_title.toLowerCase();
          if (!tt.includes("employ") || tt.includes("status")) continue;
          const empRowIdx = t.row_labels.findIndex(l => {
            const ll = String(l).toLowerCase();
            return (ll.includes("employer") && ll.includes("location")) || (ll.includes("employer") && !ll.includes("position"));
          });
          if (empRowIdx < 0) continue;
          const tEntries = tableData[t.id] || [];
          for (const entry of tEntries) {
            const val = entry[empRowIdx]?.[0]?.trim();
            if (val && !employers.includes(val)) employers.push(val);
          }
        }
        return employers;
      };

      const employerNames = getEmployerNames();

      // Helper for multi-employer select with checkbox popover
      const EmployerMultiSelect = ({ selectedEmployers, onToggle, label }: { selectedEmployers: string[]; onToggle: (emp: string) => void; label: string }) => {
        const dropKey = `${theftKey}_${label}_dropdown`;
        const isOpen = !!answers[dropKey];
        const summary = selectedEmployers.length > 0 ? selectedEmployers.join(", ") : "";
        return (
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-500">Select employer(s)</Label>
            <Popover open={isOpen} onOpenChange={(v) => setAnswer(dropKey, v)}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 w-full justify-between">
                  <span className="truncate text-left">{summary || "Select employers..."}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-50 ml-2 flex-shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2 max-h-[250px] overflow-y-auto" align="start">
                {employerNames.length === 0 && <p className="text-xs text-zinc-500 p-2">No employers found. Please complete Employment History first.</p>}
                {employerNames.map((emp) => (
                  <div key={emp} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800 cursor-pointer" onClick={() => onToggle(emp)}>
                    <Checkbox checked={selectedEmployers.includes(emp)} className="border-zinc-600 data-[state=checked]:bg-red-600 h-3.5 w-3.5 pointer-events-none" />
                    <span className="text-xs text-zinc-300">{emp}</span>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        );
      };

      const stolenEmployers: Record<string, { description: string; value: string }> = theftData.stolenEmployers || {};
      const witnessedEmployers: Record<string, { reason: string; personType: string }> = theftData.witnessedEmployers || {};
      const helpedEmployers: Record<string, { helpedWho: string }> = theftData.helpedEmployers || {};

      return (
        <div key={table.id} className="space-y-3">
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 border-b border-zinc-800 p-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-semibold text-primary">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-3 space-y-4">

              {/* 1. Stolen from work */}
              <div className="space-y-2 border border-zinc-800 rounded-lg p-3">
                <Select value={theftData.stolen || ''} onValueChange={(v) => {
                  const updates: any = { stolen: v };
                  if (v.includes("never")) {
                    updates.stolenEmployers = {};
                  } else if (v === "Has stolen from work before") {
                    updates.benefited = "Has benefited from theft at work";
                  }
                  updateTheft(updates);
                }}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-auto min-h-9 py-2 w-full [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:text-left"><SelectValue placeholder="Stolen from work before" /></SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    <SelectItem value="Has never stolen from work before" className="whitespace-normal"><span className="block whitespace-normal">Has never stolen from work before</span></SelectItem>
                    <SelectItem value="Has stolen from work before" className="whitespace-normal"><span className="block whitespace-normal">Has stolen from work before</span></SelectItem>
                  </SelectContent>
                </Select>

                {theftData.stolen === "Has stolen from work before" && (
                  <>
                    <EmployerMultiSelect
                      selectedEmployers={Object.keys(stolenEmployers)}
                      onToggle={(emp) => {
                        const next = { ...stolenEmployers };
                        if (next[emp]) delete next[emp]; else next[emp] = { description: '', value: '' };
                        updateTheft({ stolenEmployers: next });
                      }}
                      label="stolen"
                    />
                    {Object.keys(stolenEmployers).map((emp) => {
                      const entry = stolenEmployers[emp] || { description: '', value: '' };
                      return (
                        <div key={emp} className="flex items-start gap-2 border border-zinc-800 rounded-md p-2 bg-zinc-900/50">
                          <span className="text-xs font-medium text-zinc-300 whitespace-nowrap pt-1.5 min-w-[80px]">{emp}</span>
                          <div className="flex-1">
                            <Input value={entry.description} onChange={(e) => {
                              const next = { ...stolenEmployers, [emp]: { ...entry, description: e.target.value } };
                              updateTheft({ stolenEmployers: next });
                            }} className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9" placeholder="What was taken..." />
                          </div>
                          <div className="w-[120px]">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">R</span>
                              <Input type="number" value={entry.value} onChange={(e) => {
                                const next = { ...stolenEmployers, [emp]: { ...entry, value: e.target.value } };
                                updateTheft({ stolenEmployers: next, benefited: "Has benefited from theft at work" });
                              }} className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9 pl-6" placeholder="0.00" step="0.01" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {/* 2. Witnessed theft at work */}
              <div className="space-y-2 border border-zinc-800 rounded-lg p-3">
                <Select value={theftData.witnessed || ''} onValueChange={(v) => {
                  const updates: any = { witnessed: v };
                  if (v.includes("never")) updates.witnessedEmployers = {};
                  updateTheft(updates);
                }}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-auto min-h-9 py-2 w-full [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:text-left"><SelectValue placeholder="Witnessed theft at work" /></SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    <SelectItem value="Has never witnessed anyone stealing at work" className="whitespace-normal"><span className="block whitespace-normal">Has never witnessed anyone stealing at work</span></SelectItem>
                    <SelectItem value="Has witnessed someone stealing from work but did not report them" className="whitespace-normal"><span className="block whitespace-normal">Has witnessed someone stealing from work but did not report them</span></SelectItem>
                    <SelectItem value="Has witnessed someone stealing from work and reported them" className="whitespace-normal"><span className="block whitespace-normal">Has witnessed someone stealing from work and reported them</span></SelectItem>
                  </SelectContent>
                </Select>

                {(theftData.witnessed === "Has witnessed someone stealing from work but did not report them" || theftData.witnessed === "Has witnessed someone stealing from work and reported them") && (
                  <>
                    <EmployerMultiSelect
                      selectedEmployers={Object.keys(witnessedEmployers)}
                      onToggle={(emp) => {
                        const next = { ...witnessedEmployers };
                        if (next[emp]) delete next[emp]; else next[emp] = { reason: '', personType: '' };
                        updateTheft({ witnessedEmployers: next });
                      }}
                      label="witnessed"
                    />
                    {Object.keys(witnessedEmployers).map((emp) => {
                      const entry = witnessedEmployers[emp] || { reason: '', personType: '' };
                      const didNotReport = theftData.witnessed?.includes("did not report");
                      return (
                        <div key={emp} className="flex items-start gap-2 border border-zinc-800 rounded-md p-2 bg-zinc-900/50">
                          <span className="text-xs font-medium text-zinc-300 whitespace-nowrap pt-1.5 min-w-[80px]">{emp}</span>
                          <div className="w-[140px]">
                            <Select value={entry.personType} onValueChange={(v) => {
                              const next = { ...witnessedEmployers, [emp]: { ...entry, personType: v } };
                              updateTheft({ witnessedEmployers: next });
                            }}>
                              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9"><SelectValue placeholder="Staff/Customer" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Staff member">Staff member</SelectItem>
                                <SelectItem value="Customer">Customer</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {didNotReport && (
                            <div className="flex-1">
                              <Input value={entry.reason} onChange={(e) => {
                                const next = { ...witnessedEmployers, [emp]: { ...entry, reason: e.target.value } };
                                updateTheft({ witnessedEmployers: next });
                              }} className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9" placeholder="Why was it not reported..." />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {/* 3. Benefited from theft at work */}
              <div className="space-y-2 border border-zinc-800 rounded-lg p-3">
                <Select value={theftData.benefited || ''} onValueChange={(v) => updateTheft({ benefited: v })}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-auto min-h-9 py-2 w-full [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:text-left"><SelectValue placeholder="Benefited from theft at work" /></SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    <SelectItem value="Has never benefited from any theft at work" className="whitespace-normal"><span className="block whitespace-normal">Has never benefited from any theft at work</span></SelectItem>
                    <SelectItem value="Has benefited from theft at work" className="whitespace-normal"><span className="block whitespace-normal">Has benefited from theft at work</span></SelectItem>
                  </SelectContent>
                </Select>
                {theftData.stolen === "Has stolen from work before" && theftData.benefited === "Has benefited from theft at work" && (
                  <p className="text-[10px] text-amber-400 italic">Auto-populated: You indicated you have stolen from work, which means you benefited from theft.</p>
                )}
              </div>

              {/* 4. Helped someone to steal from work */}
              <div className="space-y-2 border border-zinc-800 rounded-lg p-3">
                <Select value={theftData.helped || ''} onValueChange={(v) => {
                  const updates: any = { helped: v };
                  if (v.includes("never")) updates.helpedEmployers = {};
                  updateTheft(updates);
                }}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-auto min-h-9 py-2 w-full [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:text-left"><SelectValue placeholder="Helped someone to steal from work" /></SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    <SelectItem value="Has never helped anyone to steal from work" className="whitespace-normal"><span className="block whitespace-normal">Has never helped anyone to steal from work</span></SelectItem>
                    <SelectItem value="Has helped someone steal from work" className="whitespace-normal"><span className="block whitespace-normal">Has helped someone steal from work</span></SelectItem>
                  </SelectContent>
                </Select>

                {theftData.helped === "Has helped someone steal from work" && (
                  <>
                    <EmployerMultiSelect
                      selectedEmployers={Object.keys(helpedEmployers)}
                      onToggle={(emp) => {
                        const next = { ...helpedEmployers };
                        if (next[emp]) delete next[emp]; else next[emp] = { helpedWho: '' };
                        updateTheft({ helpedEmployers: next });
                      }}
                      label="helped"
                    />
                    {Object.keys(helpedEmployers).map((emp) => {
                      const entry = helpedEmployers[emp] || { helpedWho: '' };
                      return (
                        <div key={emp} className="flex items-start gap-2 border border-zinc-800 rounded-md p-2 bg-zinc-900/50">
                          <span className="text-xs font-medium text-zinc-300 whitespace-nowrap pt-1.5 min-w-[80px]">{emp}</span>
                          <div className="w-[180px]">
                            <Select value={entry.helpedWho} onValueChange={(v) => {
                              const next = { ...helpedEmployers, [emp]: { ...entry, helpedWho: v } };
                              updateTheft({ helpedEmployers: next });
                            }}>
                              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9"><SelectValue placeholder="Who did you help?" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Customer">Customer</SelectItem>
                                <SelectItem value="Colleague">Colleague</SelectItem>
                                <SelectItem value="Friend">Friend</SelectItem>
                                <SelectItem value="Family member">Family member</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {/* 5. Approached to steal from work */}
              <div className="space-y-2 border border-zinc-800 rounded-lg p-3">
                <Select value={theftData.approached || ''} onValueChange={(v) => updateTheft({ approached: v })}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-auto min-h-9 py-2 w-full [&>span]:line-clamp-none [&>span]:whitespace-normal [&>span]:text-left"><SelectValue placeholder="Approached to steal from work" /></SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    <SelectItem value="Has never been approached to get involved with theft at work" className="whitespace-normal"><span className="block whitespace-normal">Has never been approached to get involved with theft at work</span></SelectItem>
                    <SelectItem value="Has been approached to steal at work but declined to get involved" className="whitespace-normal"><span className="block whitespace-normal">Has been approached to steal at work but declined to get involved</span></SelectItem>
                    <SelectItem value="Has been approached to get involved with stealing at work and accepted to get involved" className="whitespace-normal"><span className="block whitespace-normal">Has been approached to get involved with stealing at work and accepted to get involved</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>

            </div>
          </div>
        </div>
      );
    }

    // Special rendering for FRAUD table
    const isFraudTable = ttLower.includes("fraud");
    if (isFraudTable) {
      const fraudKey = `fraud_${table.id}`;
      const fraudData = answers[fraudKey] || {};
      const updateFraud = (updates: Record<string, any>) => {
        setAnswer(fraudKey, { ...fraudData, ...updates });
      };

      const fraudCategories = [
        {
          key: "refund_return",
          title: "Refund & Return",
          items: [
            { key: "fake_refunds", label: "Process fake refunds" },
            { key: "manipulate_returns", label: "Manipulate return transactions" },
            { key: "duplicate_receipts", label: "Duplicate receipts" },
          ]
        },
        {
          key: "cash_skimming",
          title: "Cash Skimming",
          items: [
            { key: "not_ringing_sales", label: "Not ringing up sales" },
            { key: "pocketing_cash", label: "Pocketing cash payments" },
            { key: "force_balancing", label: "Force balancing tills & saves" },
          ]
        },
        {
          key: "asset_misappropriation",
          title: "Asset Misappropriation",
          items: [
            { key: "under_scan", label: "Under-scan or fail to scan items" },
            { key: "inflate_stock", label: "Inflate stock counts" },
          ]
        },
        {
          key: "supplier_delivery",
          title: "Supplier & Delivery Fraud",
          items: [
            { key: "collusion_drivers", label: "Collusion with drivers or suppliers" },
            { key: "falsifying_grn", label: "Falsifying goods received notes" },
            { key: "kickbacks", label: "Kickbacks from suppliers" },
            { key: "fake_vendors", label: "Creating fake vendors" },
            { key: "favouring_supplier", label: "Favouring a supplier for personal gain" },
          ]
        },
        {
          key: "information_misuse",
          title: "Information/Data Misuse",
          items: [
            { key: "selling_info", label: "Selling confidential information" },
            { key: "manipulating_docs", label: "Manipulating documents" },
          ]
        },
        {
          key: "personal_information",
          title: "Personal Information",
          items: [
            { key: "fraudulent_qualifications", label: "Fraudulent Qualifications" },
            { key: "fabricated_cv", label: "Fabricated information on CV" },
          ]
        },
      ];

      return (
        <div key={table.id} className="space-y-3">
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 border-b border-zinc-800 p-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-semibold text-primary">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-0">
              {fraudCategories.map((cat) => (
                <div key={cat.key} className="border-b border-zinc-800/50 last:border-b-0">
                  <div className="bg-zinc-900/60 px-3 py-2 text-xs font-semibold text-primary uppercase tracking-wide text-center">
                    {cat.title}
                  </div>
                  <div>
                    {cat.items.map((item) => {
                      const itemKey = `${cat.key}_${item.key}`;
                      const val = fraudData[itemKey] || '';
                      const details = fraudData[`${itemKey}_details`] || '';
                      const isYes = val === 'Yes';
                      const setVal = (v: string) => {
                        const updates: Record<string, any> = { [itemKey]: v };
                        if (v === 'No') updates[`${itemKey}_details`] = '';
                        updateFraud(updates);
                      };
                      return (
                        <div key={itemKey} className="px-3 py-2 border-t border-zinc-800/40 space-y-2">
                          <div className="flex items-start gap-2">
                            <span className="flex-1 min-w-0 text-xs text-zinc-300 break-words">{item.label}</span>
                            <div className="flex gap-1 shrink-0">
                              <button type="button" onClick={() => setVal('Yes')} className={`h-8 w-12 rounded text-xs font-medium border transition-colors ${val === 'Yes' ? 'bg-primary text-primary-foreground border-primary' : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800'}`}>Yes</button>
                              <button type="button" onClick={() => setVal('No')} className={`h-8 w-12 rounded text-xs font-medium border transition-colors ${val === 'No' ? 'bg-primary text-primary-foreground border-primary' : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800'}`}>No</button>
                            </div>
                          </div>
                          {isYes && (
                            <Input
                              value={details}
                              onChange={(e) => updateFraud({ [`${itemKey}_details`]: e.target.value })}
                              className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8"
                              placeholder="Provide details..."
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Special rendering for BRIBERY table
    const isBriberyTable = ttLower.includes("bribery");
    if (isBriberyTable) {
      const briberyKey = `bribery_${table.id}`;
      const briberyData = answers[briberyKey] || {};
      const updateBribery = (updates: Record<string, any>) => {
        setAnswer(briberyKey, { ...briberyData, ...updates });
      };

      const briberyCategories = [
        {
          key: "law_enforcement",
          title: "Law Enforcement",
          items: [
            { key: "paid_drivers_license", label: "Paid – Drivers License" },
            { key: "paid_traffic_violations", label: "Paid – Traffic Violations" },
            { key: "paid_not_report_crimes", label: "Paid – To not report crimes (theft, fraud, rape etc.)" },
          ]
        },
        {
          key: "work_colleagues",
          title: "Work Colleagues",
          items: [
            { key: "paid_not_report_illegal", label: "Paid – to not report illegal activity" },
            { key: "received_not_report_illegal", label: "Received – to not report illegal activity" },
            { key: "witnessed_cover_up", label: "Witnessed – to cover up illegal activity" },
          ]
        },
        {
          key: "employment",
          title: "Employment",
          items: [
            { key: "paid_secure_position", label: "Paid – to secure a position at a company" },
            { key: "received_secure_position", label: "Received – to secure a position at a company" },
          ]
        },
      ];

      return (
        <div key={table.id} className="space-y-3">
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 border-b border-zinc-800 p-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-semibold text-primary">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-0">
              {briberyCategories.map((cat) => (
                <div key={cat.key} className="border-b border-zinc-800/50 last:border-b-0">
                  <div className="bg-zinc-900/60 px-3 py-2 text-xs font-semibold text-primary uppercase tracking-wide text-center">
                    {cat.title}
                  </div>
                  <div>
                    {cat.items.map((item) => {
                      const itemKey = `${cat.key}_${item.key}`;
                      const val = briberyData[itemKey] || '';
                      const details = briberyData[`${itemKey}_details`] || '';
                      const isYes = val === 'Yes';
                      const setVal = (v: string) => {
                        const updates: Record<string, any> = { [itemKey]: v };
                        if (v === 'No') updates[`${itemKey}_details`] = '';
                        updateBribery(updates);
                      };
                      return (
                        <div key={itemKey} className="px-3 py-2 border-t border-zinc-800/40 space-y-2">
                          <div className="flex items-start gap-2">
                            <span className="flex-1 min-w-0 text-xs text-zinc-300 break-words">{item.label}</span>
                            <div className="flex gap-1 shrink-0">
                              <button type="button" onClick={() => setVal('Yes')} className={`h-8 w-12 rounded text-xs font-medium border transition-colors ${val === 'Yes' ? 'bg-primary text-primary-foreground border-primary' : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800'}`}>Yes</button>
                              <button type="button" onClick={() => setVal('No')} className={`h-8 w-12 rounded text-xs font-medium border transition-colors ${val === 'No' ? 'bg-primary text-primary-foreground border-primary' : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:bg-zinc-800'}`}>No</button>
                            </div>
                          </div>
                          {isYes && (
                            <Input
                              value={details}
                              onChange={(e) => updateBribery({ [`${itemKey}_details`]: e.target.value })}
                              className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8"
                              placeholder="Provide details..."
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    const isOrganizedCrimesTable = ttLower.includes("organized") || ttLower.includes("organised");
    if (isOrganizedCrimesTable) {
      const ocKey = `organized_crimes_${table.id}`;
      const ocData = answers[ocKey] || {};
      const updateOC = (updates: Record<string, any>) => {
        setAnswer(ocKey, { ...ocData, ...updates });
      };

      const organizedCrimesCategories = [
        {
          key: "theft_hijacking_robbery",
          title: "Theft, Hijacking, and Robbery Syndicates",
          items: [
            { key: "colluded_steal_work", label: "Colluded to steal at work" },
            { key: "planned_robberies_hijackings", label: "Planned store robberies or vehicle hijackings" },
            { key: "robbed_pedestrians_houses", label: "Robbed pedestrians & houses" },
          ]
        },
        {
          key: "financial_economic",
          title: "Financial and Economic",
          items: [
            { key: "fraudulent_transactions", label: "Fraudulent transactions" },
            { key: "identity_theft", label: "Identity theft" },
            { key: "government_programmes", label: "Government programmes (SASSA, NSFAS etc.)" },
            { key: "tenders", label: "Tenders" },
          ]
        },
        {
          key: "extortion",
          title: "Extortion",
          items: [
            { key: "blackmailing", label: "Blackmailing" },
            { key: "information_ransomed", label: "Information ransomed (IT)" },
            { key: "forcing_protection", label: "Forcing people to pay for \"protection\"" },
          ]
        },
        {
          key: "drug_trafficking",
          title: "Drug Trafficking",
          items: [
            { key: "smuggle_drugs", label: "Smuggle Illegal drugs" },
            { key: "sold_large_scale", label: "Sold large scale drugs to runners" },
            { key: "manufacturing_drugs", label: "Manufacturing drugs" },
          ]
        },
      ];

      return (
        <div key={table.id} className="space-y-3">
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 border-b border-zinc-800 p-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-semibold text-primary">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-0">
              {organizedCrimesCategories.map((cat) => (
                <div key={cat.key} className="border-b border-zinc-800/50 last:border-b-0">
                  <div className="bg-zinc-900/60 px-3 py-2 text-xs font-semibold text-primary uppercase tracking-wide text-center">
                    {cat.title}
                  </div>
                  <div>
                    {cat.items.map((item) => {
                      const itemKey = `${cat.key}_${item.key}`;
                      const val = ocData[itemKey] || '';
                      const details = ocData[`${itemKey}_details`] || '';
                      const isYes = val === 'Yes';
                      return (
                        <div key={itemKey} className="flex items-start gap-2 px-3 py-2 border-t border-zinc-800/40">
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-zinc-300 break-words">{item.label}</span>
                            {isYes && (
                              <Input
                                value={details}
                                onChange={(e) => updateOC({ [`${itemKey}_details`]: e.target.value })}
                                className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8 mt-1"
                                placeholder="Provide details..."
                              />
                            )}
                          </div>
                          <Select value={val} onValueChange={(v) => {
                            const updates: Record<string, any> = { [itemKey]: v };
                            if (v === 'No') updates[`${itemKey}_details`] = '';
                            updateOC(updates);
                          }}>
                            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8 w-[80px] shrink-0">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="No">No</SelectItem>
                              <SelectItem value="Yes">Yes</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    const isUndetectedCrimesTable = ttLower.includes("undetected");
    if (isUndetectedCrimesTable) {
      const ucKey = `undetected_crimes_${table.id}`;
      const ucData = answers[ucKey] || {};
      const updateUC = (updates: Record<string, any>) => {
        setAnswer(ucKey, { ...ucData, ...updates });
      };

      const undetectedCrimesCategories = [
        {
          key: "financial_white_collar",
          title: "Financial & White-Collar Crimes",
          items: [
            { key: "employee_theft", label: "Employee theft" },
            { key: "fraud", label: "Fraud" },
          ]
        },
        {
          key: "corruption_abuse",
          title: "Corruption & Abuse of Power",
          items: [
            { key: "bribery_gifts_favours", label: "Bribery disguised as \"gifts\" or favours" },
            { key: "bid_rigging", label: "Bid rigging" },
            { key: "regulatory_capture", label: "Regulatory capture (officials favouring certain businesses)" },
          ]
        },
        {
          key: "retail_commercial",
          title: "Retail & Commercial Crimes",
          items: [
            { key: "sweethearting", label: "Sweethearting (cashiers giving discounts to friends/family)" },
            { key: "false_damage_claims", label: "False damage claims" },
            { key: "stock_shrinkage", label: "Stock shrinkage manipulation" },
          ]
        },
        {
          key: "cyber_digital",
          title: "Cyber & Digital Crimes",
          items: [
            { key: "insider_data_theft", label: "Insider data theft" },
            { key: "malware_spyware", label: "Silent malware / spyware installations" },
            { key: "unauthorized_access", label: "Unauthorized system access using valid credentials" },
          ]
        },
        {
          key: "violent_serious",
          title: "Violent & Serious Crimes",
          items: [
            { key: "gang_coercion", label: "Gang-related coercion" },
            { key: "domestic_violence", label: "Domestic violence" },
            { key: "threats_intimidation", label: "Threats and intimidation" },
          ]
        },
        {
          key: "insurance_claims_fraud",
          title: "Insurance & Claims Fraud",
          items: [
            { key: "staged_accidents", label: "Staged accidents" },
            { key: "inflated_loss_claims", label: "Inflated loss claims" },
          ]
        },
      ];

      return (
        <div key={table.id} className="space-y-3">
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 border-b border-zinc-800 p-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-semibold text-primary">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-0">
              {undetectedCrimesCategories.map((cat) => (
                <div key={cat.key} className="border-b border-zinc-800/50 last:border-b-0">
                  <div className="bg-zinc-900/60 px-3 py-2 text-xs font-semibold text-primary uppercase tracking-wide text-center">
                    {cat.title}
                  </div>
                  <div>
                    {cat.items.map((item) => {
                      const itemKey = `${cat.key}_${item.key}`;
                      const val = ucData[itemKey] || '';
                      const details = ucData[`${itemKey}_details`] || '';
                      const isYes = val === 'Yes';
                      return (
                        <div key={itemKey} className="flex items-start gap-2 px-3 py-2 border-t border-zinc-800/40">
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-zinc-300 break-words">{item.label}</span>
                            {isYes && (
                              <Input
                                value={details}
                                onChange={(e) => updateUC({ [`${itemKey}_details`]: e.target.value })}
                                className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8 mt-1"
                                placeholder="Provide details..."
                              />
                            )}
                          </div>
                          <Select value={val} onValueChange={(v) => {
                            const updates: Record<string, any> = { [itemKey]: v };
                            if (v === 'No') updates[`${itemKey}_details`] = '';
                            updateUC(updates);
                          }}>
                            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8 w-[80px] shrink-0">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="No">No</SelectItem>
                              <SelectItem value="Yes">Yes</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    const isDrugTable = ttLower.includes("illegal drug") || ttLower.includes("drug invol");
    if (isDrugTable) {
      const drugKey = `illegal_drugs_${table.id}`;
      const drugData = answers[drugKey] || {};
      const updateDrug = (updates: Record<string, any>) => {
        setAnswer(drugKey, { ...drugData, ...updates });
      };

      const drugSubstances = [
        { key: "marijuana", label: "Marijuana/Weed/Dagga/Zol/Pot/Ganja" },
        { key: "mandrax", label: "Mandrax/Buttons/White Pipe/MX" },
        { key: "nyaope", label: "Nyaope, Whoonga, Unga, Sugars" },
        { key: "crystal_meth", label: "Crystal Meth/Tik/Ice/Speed" },
        { key: "cocaine", label: "Cocaine/Blow/Charlie/Snow/Klippe" },
        { key: "ecstasy", label: "Ecstasy/MDMA/E/Molly" },
        { key: "heroin", label: "Heroin/H/Smack" },
        { key: "lsd", label: "LSD/Acid" },
        { key: "mushrooms", label: "Magic Mushrooms/Shrooms" },
      ];

      const drugCategories = [
        {
          key: "sold_drugs",
          title: "Sold Drugs",
          items: [
            { key: "commercially", label: "Commercially" },
            { key: "side_hustle", label: "Side Hustle" },
          ]
        },
        {
          key: "manufactured_drugs",
          title: "Manufactured Drugs",
          items: [
            { key: "own_production", label: "Own means of production" },
            { key: "smuggling_raw_materials", label: "Smuggling in raw materials used for manufacturing" },
          ]
        },
        {
          key: "transportation_drugs",
          title: "Transportation of Drugs",
          items: [
            { key: "arrange_transport", label: "Arrange Transportation" },
            { key: "provide_transport", label: "Provide Transportation" },
            { key: "personally_transported", label: "Personally Transported" },
          ]
        },
        {
          key: "drug_use_lifetime",
          title: "Drug use during lifetime",
          items: drugSubstances.map(s => ({ key: `lifetime_${s.key}`, label: s.label })),
        },
        {
          key: "drug_use_past_2_years",
          title: "Drug use during the past two (2) years",
          items: drugSubstances.map(s => ({ key: `past2y_${s.key}`, label: s.label })),
        },
      ];

      return (
        <div key={table.id} className="space-y-3">
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 border-b border-zinc-800 p-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-semibold text-primary">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-0">
              {drugCategories.map((cat) => (
                <div key={cat.key} className="border-b border-zinc-800/50 last:border-b-0">
                  <div className="bg-zinc-900/60 px-3 py-2 text-xs font-semibold text-primary uppercase tracking-wide text-center">
                    {cat.title}
                  </div>
                  <div>
                    {cat.items.map((item) => {
                      const itemKey = `${cat.key}_${item.key}`;
                      const val = drugData[itemKey] || '';
                      const details = drugData[`${itemKey}_details`] || '';
                      const isYes = val === 'Yes';
                      return (
                        <div key={itemKey} className="flex items-start gap-2 px-3 py-2 border-t border-zinc-800/40">
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-zinc-300 break-words">{item.label}</span>
                            {isYes && (
                              <Input
                                value={details}
                                onChange={(e) => updateDrug({ [`${itemKey}_details`]: e.target.value })}
                                className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8 mt-1"
                                placeholder="Provide details..."
                              />
                            )}
                          </div>
                          <Select value={val} onValueChange={(v) => {
                            const updates: Record<string, any> = { [itemKey]: v };
                            if (v === 'No') updates[`${itemKey}_details`] = '';
                            updateDrug(updates);
                          }}>
                            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8 w-[80px] shrink-0">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="No">No</SelectItem>
                              <SelectItem value="Yes">Yes</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Special rendering for GENERAL OVERVIEW table
    const isGeneralOverview = ttLower.includes("general");
    if (isGeneralOverview) {
      const genKey = `general_overview_${table.id}`;
      const genData: Record<string, any> = answers[genKey] || {};
      const updateGen = (updates: Record<string, any>) => {
        setAnswer(genKey, { ...genData, ...updates });
      };

      // Pull account options from Monthly Accounts table for gambling missing payment
      const allAccountOptions: string[] = (() => {
        const maTable = tables.find(t => {
          const tl = t.table_title.toLowerCase();
          return tl.includes("monthly account") && tl.includes("paid");
        });
        if (maTable) {
          const maKey = `monthly_accounts_${maTable.id}`;
          const maSelections: Record<string, any> = answers[maKey] || {};
          return Object.keys(maSelections);
        }
        return [];
      })();

      const rehabOptions = ["Drug use", "Alcohol use", "Gambling", "Other"];
      const gamblingOptions = [
        "I do not gamble at all",
        "I gamble occasionally for entertainment",
        "I gamble to support my living expenses & lifestyle",
      ];

      const rehabAnswer = genData.rehabilitation || "";
      const rehabTypes: string[] = genData.rehabilitation_types || [];
      const liedOnCv = genData.lied_on_cv || "";
      const liedDetails = genData.lied_on_cv_details || "";
      const gamblingAnswer = genData.gambling || "";
      const gamblingMissedPayment = genData.gambling_missed_payment || "";
      const gamblingAccounts: string[] = genData.gambling_missed_accounts || [];

      const generalRows = [
        {
          key: "rehabilitation",
          label: "Attended a rehabilitation program",
          render: () => (
            <div className="space-y-2">
              <Select value={rehabAnswer} onValueChange={(v) => {
                const updates: Record<string, any> = { rehabilitation: v };
                if (v === "No") { updates.rehabilitation_types = []; }
                updateGen(updates);
              }}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8 w-[90px]">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="No">No</SelectItem>
                  <SelectItem value="Yes">Yes</SelectItem>
                </SelectContent>
              </Select>
              {rehabAnswer === "Yes" && (
                <div className="space-y-1.5 mt-2 border border-zinc-800 rounded-md p-2.5 bg-zinc-900/50">
                  <Label className="text-[10px] text-zinc-500">Select type(s) of rehabilitation</Label>
                  {rehabOptions.map((opt) => (
                    <div key={opt} className="flex items-center gap-2">
                      <Checkbox
                        checked={rehabTypes.includes(opt)}
                        onCheckedChange={(checked) => {
                          const next = checked ? [...rehabTypes, opt] : rehabTypes.filter(t => t !== opt);
                          updateGen({ rehabilitation_types: next });
                        }}
                        className="border-zinc-600 data-[state=checked]:bg-red-600 h-3.5 w-3.5"
                      />
                      <span className="text-xs text-zinc-300">{opt}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ),
        },
        {
          key: "lied_on_cv",
          label: "Lied on CV",
          render: () => (
            <div className="space-y-2">
              <Select value={liedOnCv} onValueChange={(v) => {
                const updates: Record<string, any> = { lied_on_cv: v };
                if (v === "No") updates.lied_on_cv_details = "";
                updateGen(updates);
              }}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8 w-[90px]">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="No">No</SelectItem>
                  <SelectItem value="Yes">Yes</SelectItem>
                </SelectContent>
              </Select>
              {liedOnCv === "Yes" && (
                <Input
                  value={liedDetails}
                  onChange={(e) => updateGen({ lied_on_cv_details: e.target.value })}
                  className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8 mt-1"
                  placeholder="What did you lie about on your CV?"
                />
              )}
            </div>
          ),
        },
        {
          key: "gambling",
          label: "Gambling",
          render: () => (
            <Select value={gamblingAnswer} onValueChange={(v) => updateGen({ gambling: v })}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8 w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {gamblingOptions.map((opt) => (
                  <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ),
        },
        {
          key: "gambling_missed_payment",
          label: "Missing payment on account due to money spent on gambling",
          render: () => (
            <div className="space-y-2">
              <Select value={gamblingMissedPayment} onValueChange={(v) => {
                const updates: Record<string, any> = { gambling_missed_payment: v };
                if (v === "No") updates.gambling_missed_accounts = [];
                updateGen(updates);
              }}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8 w-[90px]">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="No">No</SelectItem>
                  <SelectItem value="Yes">Yes</SelectItem>
                </SelectContent>
              </Select>
              {gamblingMissedPayment === "Yes" && allAccountOptions.length > 0 && (
                <div className="space-y-1.5 mt-2 border border-zinc-800 rounded-md p-2.5 bg-zinc-900/50">
                  <Label className="text-[10px] text-zinc-500">Select affected account(s)</Label>
                  {allAccountOptions.map((acc) => (
                    <div key={acc} className="flex items-center gap-2">
                      <Checkbox
                        checked={gamblingAccounts.includes(acc)}
                        onCheckedChange={(checked) => {
                          const next = checked ? [...gamblingAccounts, acc] : gamblingAccounts.filter(a => a !== acc);
                          updateGen({ gambling_missed_accounts: next });
                        }}
                        className="border-zinc-600 data-[state=checked]:bg-red-600 h-3.5 w-3.5"
                      />
                      <span className="text-xs text-zinc-300">{acc}</span>
                    </div>
                  ))}
                </div>
              )}
              {gamblingMissedPayment === "Yes" && allAccountOptions.length === 0 && (
                <p className="text-[10px] text-zinc-500 italic mt-1">No accounts listed. Please complete the Monthly Accounts section first.</p>
              )}
            </div>
          ),
        },
      ];

      return (
        <div key={table.id} className="space-y-3">
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 border-b border-zinc-800 p-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-semibold text-primary">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-900 border-b border-zinc-800">
                    <th className="p-2 text-left text-xs font-semibold text-zinc-400 w-[200px]">Topic</th>
                    <th className="p-2 text-left text-xs font-semibold text-zinc-400">Answer</th>
                  </tr>
                </thead>
                <tbody>
                  {generalRows.map((row) => (
                    <tr key={row.key} className="border-b border-zinc-800/50">
                      <td className="p-2 text-xs text-zinc-300 font-medium align-top">{row.label}</td>
                      <td className="p-2">{row.render()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    // Special handling for TERTIARY EDUCATION table
    const isTertiaryEducation = ttLower.includes("tertiary") && ttLower.includes("education");
    if (isTertiaryEducation) {
      const tertiaryKey = `tertiary_no_education_${table.id}`;
      const hasNoTertiary = answers[tertiaryKey] === "yes";

      return (
        <div key={table.id} className="space-y-3">
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 border-b border-zinc-800 p-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm font-semibold text-primary">{table.table_title}</span>
                {table.video_url && <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />}
              </div>
            </div>
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-3 py-2">
                <Checkbox
                  id={tertiaryKey}
                  checked={hasNoTertiary}
                  onCheckedChange={(checked) => setAnswer(tertiaryKey, checked ? "yes" : "no")}
                  className="border-zinc-600 data-[state=checked]:bg-red-600"
                />
                <label htmlFor={tertiaryKey} className="text-sm text-zinc-300 cursor-pointer select-none">
                  I have not completed any tertiary education
                </label>
              </div>
              {!hasNoTertiary && (
                <div className="space-y-3">
                  {entries.map((entry, entryIdx) => (
                    <div key={entryIdx} className="border border-zinc-800/60 rounded-lg overflow-hidden">
                      {table.is_repeatable && entries.length > 1 && (
                        <div className="flex justify-between items-center px-3 py-1.5 bg-zinc-900/50 border-b border-zinc-800">
                          <span className="text-xs text-zinc-500">Entry {entryIdx + 1}</span>
                          <Button variant="ghost" size="sm" onClick={() => removeRepeatEntry(table.id, entryIdx)} className="h-6 text-xs text-red-400 hover:text-red-300">
                            <Trash2 className="h-3 w-3 mr-1" /> Remove
                          </Button>
                        </div>
                      )}
                      <table className="w-full text-sm">
                        <tbody>
                          {table.row_labels.map((label, rowIdx) => (
                            <tr key={rowIdx} className="border-b border-zinc-800/50">
                              <td className="hidden sm:table-cell p-1.5 sm:p-2 text-xs text-zinc-400 font-medium sm:w-[180px]">
                                <div className="flex items-center gap-1">
                                  {table.row_video_urls?.[rowIdx] && (
                                    <VideoPlayButton videoUrl={table.row_video_urls[rowIdx]!} label={label as string} />
                                  )}
                                  <span className="break-words leading-tight">{label as string}</span>
                                </div>
                              </td>
                              <td className="p-1.5 sm:p-2" colSpan={2}>
                                <div className="flex items-center gap-1.5 sm:block">
                                  <div className="sm:hidden flex-shrink-0">
                                    {table.row_video_urls?.[rowIdx] && (
                                      <VideoPlayButton videoUrl={table.row_video_urls[rowIdx]!} label={label as string} />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <Input
                                      value={entry[rowIdx]?.[0] || ""}
                                      onChange={(e) => setCellValue(table.id, entryIdx, rowIdx, 0, e.target.value)}
                                      className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-10 sm:h-8 w-full"
                                      placeholder={String(label).replace(/:$/, '')}
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  {table.is_repeatable && (
                    <div className="space-y-1">
                      <Button variant="outline" size="sm" onClick={() => addRepeatEntry(table.id, table)} className="border-zinc-700 text-zinc-400 hover:text-white">
                        <Plus className="h-3 w-3 mr-1" /> Add Qualification
                      </Button>
                      {entries.length === 1 && entries[0]?.some((row) => row.some((cell) => cell.trim() !== "")) && (
                        <p className="text-[11px] text-amber-400/80 pl-1 animate-pulse">
                          ☝ Click "Add Qualification" above to add another qualification
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Detect Employment History table
    const isEmploymentHistory = ttLower.includes("employment") && (ttLower.includes("history") || ttLower.includes("record"));
    const neverWorkedKey = `never_worked_${table.id}`;
    const hasNeverWorked = answers[neverWorkedKey] === "yes";

    // Check if "never worked" is checked on ANY employment table in the same section
    const sectionEmploymentTables = tables.filter((t) => {
      const tl = t.table_title.toLowerCase();
      return t.section_id === table.section_id && tl.includes("employment") && (tl.includes("history") || tl.includes("record"));
    });
    const anyNeverWorked = sectionEmploymentTables.some((t) => answers[`never_worked_${t.id}`] === "yes");

    // Detect Disciplinary table — hide entirely if "never worked" is checked
    if (isDisciplinaryTable && anyNeverWorked) {
      return null;
    }

    // Disciplinary: "no disciplinary actions" checkbox and row selection
    const noDisciplinaryKey = `no_disciplinary_${table.id}`;
    const hasNoDisciplinary = answers[noDisciplinaryKey] === "yes";
    const disciplinaryRowSelectKey = `disciplinary_rows_${table.id}`;
    const selectedDisciplinaryRows: string[] = isDisciplinaryTable ? (answers[disciplinaryRowSelectKey] || []) : [];

    // Check if first entry has any data filled in (for the "add another" hint)
    const firstEntryHasData = entries.length > 0 && entries[0]?.some((row) => row.some((cell) => cell.trim() !== ""));

    return (
      <div key={table.id} className="space-y-3">
        {/* "Never employed" checkbox is rendered inside the employment history table header below */}

        {isDisciplinaryTable && (
          <div className="space-y-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 overflow-hidden">
              <div className="bg-zinc-900 px-3 py-2 text-center">
                <h3 className="text-sm font-bold text-red-500 uppercase tracking-wide">Disciplinary Conduct</h3>
              </div>
              <div className="p-3 flex items-center gap-2">
                <Checkbox
                  id={noDisciplinaryKey}
                  checked={hasNoDisciplinary}
                  onCheckedChange={(checked) => {
                    setAnswer(noDisciplinaryKey, checked ? "yes" : "no");
                    if (checked) setAnswer(disciplinaryRowSelectKey, []);
                  }}
                  className="border-zinc-600 data-[state=checked]:bg-red-600"
                />
                <label htmlFor={noDisciplinaryKey} className="text-xs text-zinc-300 cursor-pointer">
                  I have never had any disciplinary actions taken against me at a place of employment
                </label>
              </div>
            </div>

            {!hasNoDisciplinary && (
              <div className="p-3 bg-zinc-900/30 border border-zinc-800 rounded-lg space-y-2">
                <p className="text-[10px] text-zinc-500 text-center mb-1">Select the disciplinary actions that apply to you:</p>
                {table.row_labels.map((label, rowIdx) => {
                  const rowKey = String(label);
                  const isSelected = selectedDisciplinaryRows.includes(rowKey);
                  const rowMediaUrl = table.row_video_urls?.[rowIdx];
                  return (
                    <div key={rowIdx} className="flex items-center gap-2">
                      <div className="flex-shrink-0">
                        {rowMediaUrl ? (
                          <VideoPlayButton videoUrl={rowMediaUrl} label={rowKey} />
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 ml-1" style={{ minWidth: '180px' }}>
                        <label htmlFor={`disc_row_${table.id}_${rowIdx}`} className="text-xs text-zinc-300 cursor-pointer w-[150px]">
                          {rowKey}
                        </label>
                        <Checkbox
                          id={`disc_row_${table.id}_${rowIdx}`}
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...selectedDisciplinaryRows, rowKey]
                              : selectedDisciplinaryRows.filter((r) => r !== rowKey);
                            setAnswer(disciplinaryRowSelectKey, next);
                          }}
                          className="border-zinc-600 data-[state=checked]:bg-red-600 flex-shrink-0"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {isDisciplinaryTable && !hasNoDisciplinary && selectedDisciplinaryRows.length > 0 && (() => {
          // Gather employer names from employment history tables in this section
          const getDiscEmployerNames = (): string[] => {
            const employers: string[] = [];
            for (const t of tables) {
              const tt = t.table_title.toLowerCase();
              if (!tt.includes("employment") && !tt.includes("work history")) continue;
              const tEntries = tableData[t.id] || [t.row_labels.map(() => t.column_headers.map(() => ""))];
              const empRowIdx = t.row_labels.findIndex(l => {
                const ll = String(l).toLowerCase();
                return (ll.includes("employer") && ll.includes("location")) || (ll.includes("employer") && !ll.includes("position")) || (ll.includes("employer") && ll.includes("position"));
              });
              if (empRowIdx < 0) continue;
              for (const entry of tEntries) {
                const val = entry[empRowIdx]?.[0]?.trim();
                if (val && !employers.includes(val)) employers.push(val);
              }
            }
            return employers;
          };
          const discEmployerNames = getDiscEmployerNames();

          return (
            <div className="border border-zinc-800 rounded-lg overflow-hidden p-3 bg-zinc-900/30 space-y-3">
              <p className="text-sm font-semibold text-primary text-center mb-1">Workplace & Context</p>
              {selectedDisciplinaryRows.map((rowKey) => {
                const entriesKey = `disciplinary_entries_${table.id}_${rowKey}`;
                const currentEntries: Array<{ employer: string; context: string }> = answers[entriesKey] || [{ employer: "", context: "" }];

                const updateEntries = (newEntries: Array<{ employer: string; context: string }>) => {
                  setAnswer(entriesKey, newEntries);
                };

                return (
                  <div key={rowKey} className="space-y-2 border border-zinc-800 rounded-lg p-2">
                    <p className="text-xs text-zinc-300 font-semibold">{rowKey}</p>
                    {currentEntries.map((entry, eIdx) => (
                      <div key={eIdx} className="space-y-1 bg-zinc-950/50 border border-zinc-800 rounded p-2">
                        {currentEntries.length > 1 && (
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] text-zinc-500">Workplace {eIdx + 1}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateEntries(currentEntries.filter((_, i) => i !== eIdx))}
                              className="h-5 w-5 p-0 text-red-500 hover:text-red-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        <div>
                          <Label className="text-[10px] text-zinc-500 mb-0.5 block">Specify workplace</Label>
                          <Select
                            value={entry.employer}
                            onValueChange={(val) => {
                              const updated = [...currentEntries];
                              updated[eIdx] = { ...updated[eIdx], employer: val };
                              updateEntries(updated);
                            }}
                          >
                            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white text-sm h-9 w-full">
                              <SelectValue placeholder="Select employer" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-700">
                              {discEmployerNames.map((emp) => (
                                <SelectItem key={emp} value={emp} className="text-white text-sm">
                                  {emp}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[10px] text-zinc-500 mb-0.5 block">Context</Label>
                          <Textarea
                            rows={2}
                            placeholder="Describe the context of this disciplinary conduct"
                            value={entry.context}
                            onChange={(e) => {
                              const updated = [...currentEntries];
                              updated[eIdx] = { ...updated[eIdx], context: e.target.value };
                              updateEntries(updated);
                            }}
                            className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs w-full"
                          />
                        </div>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateEntries([...currentEntries, { employer: "", context: "" }])}
                      className="w-full border-dashed border-zinc-700 text-zinc-400 hover:text-white text-xs h-8 gap-1"
                    >
                      <Plus className="h-3 w-3" /> Add another workplace
                    </Button>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {isEmploymentHistory && hasNeverWorked && (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <div className="bg-zinc-900 border-b border-zinc-800 p-2 text-center">
              <span className="text-sm font-semibold text-primary">{table.table_title}</span>
            </div>
            <div className="bg-zinc-900/40 p-2 flex items-center justify-center gap-2">
              <Checkbox
                id={neverWorkedKey}
                checked={hasNeverWorked}
                onCheckedChange={(checked) => setAnswer(neverWorkedKey, checked ? "yes" : "no")}
                className="border-zinc-600 data-[state=checked]:bg-red-600"
              />
              <label htmlFor={neverWorkedKey} className="text-xs text-zinc-300 cursor-pointer font-normal">
                I have never been employed since leaving school
              </label>
            </div>
          </div>
        )}

        {!(isEmploymentHistory && hasNeverWorked) && !isDisciplinaryTable && (
          <>
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
                {(() => {
                  const ttl = (table.table_title || "").toLowerCase();
                  const isContactTraceTbl = ttl.includes("contact trace") || ttl.includes("close friend") || ttl.includes("next of kin")
                    || ttl.includes("father") || ttl.includes("mother") || ttl.includes("sibling") || ttl.includes("brother") || ttl.includes("sister");
                  return (
                    <div className={isContactTraceTbl ? "" : "overflow-x-auto"}>
                  <table className={`w-full text-sm ${isDisciplinaryTable ? "table-fixed" : ""}`} data-table-title={table.table_title}>
                    <thead>
                      <tr className="bg-zinc-900 border-b border-zinc-800">
                        <th colSpan={visibleColHeaders.length + 1 + (isEducationTable ? 1 : 0)} className="p-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-sm font-semibold text-primary">{table.table_title}</span>
                            {table.video_url && (
                              <VideoPlayButton videoUrl={table.video_url} label={table.table_title} />
                            )}
                          </div>
                        </th>
                      </tr>
                      {isEmploymentHistory && entryIdx === 0 && (
                        <tr className="border-b border-zinc-800 bg-zinc-900/40">
                          <th colSpan={visibleColHeaders.length + 1 + (isEducationTable ? 1 : 0)} className="p-2">
                            <div className="flex items-center justify-center gap-2">
                              <Checkbox
                                id={neverWorkedKey}
                                checked={hasNeverWorked}
                                onCheckedChange={(checked) => setAnswer(neverWorkedKey, checked ? "yes" : "no")}
                                className="border-zinc-600 data-[state=checked]:bg-red-600"
                              />
                              <label htmlFor={neverWorkedKey} className="text-xs text-zinc-300 cursor-pointer font-normal">
                                I have never been employed since leaving school
                              </label>
                            </div>
                          </th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {table.row_labels.map((label, rowIdx) => {
                        // For disciplinary tables, only show selected rows
                        if (isDisciplinaryTable && selectedDisciplinaryRows.length > 0 && !selectedDisciplinaryRows.includes(String(label))) {
                          return null;
                        }
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
                          || (rl.includes("criminal") && rl.includes("history"))
                          || rl.includes("arrested") || rl.includes("detained")
                          || (rl.includes("reason") && rl.includes("date") && !rl.includes("leaving"))
                          || (rl.includes("charged") && !rl.includes("court"))
                          || rl.includes("convicted")
                          || (rl.includes("term") && rl.includes("served"))
                          || rl.includes("court")
                          || (rl.includes("criminal") && rl.includes("record") && rl.includes("check"))
                          || (rl.includes("criminal") && rl.includes("expung"))
                          || (rl.includes("pending") && rl.includes("court"));

                        // Hide "employer & position" row when employment status is "unemployed"
                        if (rl.includes("employer") && rl.includes("position")) {
                          const empStatusRowIdx = table.row_labels.findIndex((l) => String(l).toLowerCase().includes("employment status"));
                          const empStatus = empStatusRowIdx >= 0 ? (tableData[table.id]?.[entryIdx]?.[empStatusRowIdx]?.[0] || "").toLowerCase() : "";
                          if (empStatus === "unemployed") return null;
                        }

                        // Hide arrested-dependent rows when "never arrested" is selected
                        const isArrestDependentRow = (rl.includes("reason") && rl.includes("date") && !rl.includes("leaving"))
                          || (rl.includes("charged") && !rl.includes("court"))
                          || rl.includes("convicted")
                          || (rl.includes("term") && rl.includes("served"))
                          || rl.includes("court");
                        if (isArrestDependentRow) {
                          const arrestedRowIdx = table.row_labels.findIndex((l) => {
                            const ll = String(l).toLowerCase().trim();
                            return ll.includes("arrested") || ll.includes("detained");
                          });
                          if (arrestedRowIdx >= 0) {
                            const arrestedVal = (tableData[table.id]?.[entryIdx]?.[arrestedRowIdx]?.[0] || "").toLowerCase();
                            if (arrestedVal.includes("never") || !arrestedVal.includes("has been")) return null;
                          }
                        }

                        // Hide driver's-license-dependent rows when "N/A - Does not have a Driver's License" is selected
                        const isLicenseDependentRow = rl.includes("testing ground")
                          || rl.includes("first issue")
                          || rl === "pdp"
                          || rl.includes("pdp");
                        if (isLicenseDependentRow) {
                          const licenseRowIdx = table.row_labels.findIndex((l) => {
                            const ll = String(l).toLowerCase().trim();
                            return (ll.includes("driver") && (ll.includes("license") || ll.includes("licence")))
                              && !ll.includes("testing") && !ll.includes("first") && !ll.includes("pdp");
                          });
                          if (licenseRowIdx >= 0) {
                            const licenseVal = (tableData[table.id]?.[entryIdx]?.[licenseRowIdx]?.[0] || "").toLowerCase();
                            if (licenseVal.includes("n/a") || licenseVal.includes("does not have")) return null;
                          }
                        }

                        return (
                          <tr key={rowIdx} className="border-b border-zinc-800/50">
                            {(isEducationTable || isEmploymentHistory) ? (
                              <>
                                <td className="hidden sm:table-cell p-1.5 sm:p-2 text-xs text-zinc-400 font-medium align-top" style={{ minWidth: '60px', maxWidth: '120px' }}>
                                  <div className="flex items-start gap-1 flex-wrap">
                                    {table.row_video_urls?.[rowIdx] && (
                                      <VideoPlayButton videoUrl={table.row_video_urls[rowIdx]!} label={label as string} />
                                    )}
                                    <span className="break-words leading-tight">{label as string}</span>
                                  </div>
                                </td>
                                <td className="p-1.5 sm:p-2" colSpan={visibleColHeaders.length + 1}>
                                  <div className="flex items-center gap-1.5 sm:block">
                                    <div className="sm:hidden flex-shrink-0">
                                      {table.row_video_urls?.[rowIdx] && (
                                        <VideoPlayButton videoUrl={table.row_video_urls[rowIdx]!} label={label as string} />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      {renderCellInput(table, table.id, entryIdx, rowIdx, 0, entry[rowIdx]?.[0] || "", String(label).replace(/:$/, ''))}
                                    </div>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="p-1.5 sm:p-2 text-xs text-zinc-400 font-medium align-top" style={{ minWidth: '60px', maxWidth: '120px' }}>
                                  <div className="flex items-start gap-1 flex-wrap">
                                    {!isDisciplinaryTable && table.row_video_urls?.[rowIdx] && (
                                      <VideoPlayButton videoUrl={table.row_video_urls[rowIdx]!} label={label as string} />
                                    )}
                                    <span className="break-words leading-tight">{(label as string).replace("Arrested/Detained:", "Arrested:").replace("Criminal Record Check:", "C/R Check:").replace("Criminal Record Expunge:", "C/R Expunge:")}</span>
                                  </div>
                                </td>
                                {isFullWidthRow ? (
                                  <td className="p-2" colSpan={visibleColHeaders.length}>
                                    {renderCellInput(table, table.id, entryIdx, rowIdx, 0, entry[rowIdx]?.[0] || "")}
                                  </td>
                                ) : (
                                  <>
                                    {visibleColIndices.map((colIdx, vi) => {
                                      const colHeader = String(table.column_headers[colIdx] || "").toLowerCase().trim();
                                      if (colHeader === "details") {
                                        return (
                                          <td key={vi} className="p-2">
                                            {needsDetails ? (
                                              <Input
                                                value={answers[detailKey] || ""}
                                                onChange={(e) => setAnswer(detailKey, e.target.value)}
                                                className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-9"
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
                                                className="bg-zinc-900 border-zinc-700 text-white text-sm placeholder:text-xs h-8"
                                                placeholder="Please provide details..."
                                              />
                                            )}
                                          </div>
                                        </td>
                                      );
                                    })}
                                  </>
                                )}
                              </>
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
                  );
                })()}
              </div>
            ))}

            {table.is_repeatable && (
              <div className="space-y-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addRepeatEntry(table.id, table)}
                  className="border-zinc-700 text-zinc-400 hover:text-white"
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Entry
                </Button>
                {firstEntryHasData && entries.length === 1 && (
                  <p className="text-[11px] text-amber-400/80 pl-1 animate-pulse">
                    ☝ Click "Add Entry" above to add another place of employment
                  </p>
                )}
              </div>
            )}
          </>
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

  const validateCurrentSection = (): boolean => {
    const currentSec = sections[currentSection];
    const sectionTbls = tables.filter((t) => t.section_id === currentSec.id);

    for (const table of sectionTbls) {
      const ttLower = table.table_title.toLowerCase();
      const entries = tableData[table.id] || [];

      // Tertiary Education: skip validation if "no tertiary education" is checked
      const isTertiaryEducation = ttLower.includes("tertiary") && ttLower.includes("education");
      if (isTertiaryEducation) {
        const tertiaryKey = `tertiary_no_education_${table.id}`;
        if (answers[tertiaryKey] === "yes") continue;
        // Validate all entries have all fields filled
        for (let eIdx = 0; eIdx < entries.length; eIdx++) {
          for (let rIdx = 0; rIdx < table.row_labels.length; rIdx++) {
            const cellVal = entries[eIdx]?.[rIdx]?.[0] || "";
            if (!cellVal.trim()) {
              toast.error(`Please fill in "${table.row_labels[rIdx]}" in ${table.table_title}${entries.length > 1 ? ` (Entry ${eIdx + 1})` : ""}`);
              return false;
            }
          }
        }
        continue;
      }

      // Employment History: skip validation if "never worked" is checked
      const isEmploymentHistory = ttLower.includes("employment") && (ttLower.includes("history") || ttLower.includes("record"));
      if (isEmploymentHistory) {
        const neverWorkedKey = `never_worked_${table.id}`;
        if (answers[neverWorkedKey] === "yes") continue;
        // Validate all entries have all fields filled
        for (let eIdx = 0; eIdx < entries.length; eIdx++) {
          for (let rIdx = 0; rIdx < table.row_labels.length; rIdx++) {
            const cellVal = entries[eIdx]?.[rIdx]?.[0] || "";
            if (!cellVal.trim()) {
              toast.error(`Please fill in "${table.row_labels[rIdx]}" in ${table.table_title}${entries.length > 1 ? ` (Entry ${eIdx + 1})` : ""}`);
              return false;
            }
          }
        }
        continue;
      }

      // Disciplinary: skip if "never worked" on employment table in same section, or "no disciplinary" checked
      const isDisciplinaryVal = ttLower.includes("disciplinary");
      if (isDisciplinaryVal) {
        const sectionEmpTables = tables.filter((t) => {
          const tl = t.table_title.toLowerCase();
          return t.section_id === table.section_id && tl.includes("employment") && (tl.includes("history") || tl.includes("record"));
        });
        const anyNeverWorkedVal = sectionEmpTables.some((t) => answers[`never_worked_${t.id}`] === "yes");
        if (anyNeverWorkedVal) continue;

        const noDisciplinaryKey = `no_disciplinary_${table.id}`;
        if (answers[noDisciplinaryKey] === "yes") continue;

        // Validate only selected rows
        const selectedRows: string[] = answers[`disciplinary_rows_${table.id}`] || [];
        if (selectedRows.length === 0) {
          toast.error("Please select the disciplinary actions that apply to you, or indicate you have never had any.");
          return false;
        }
        for (let eIdx = 0; eIdx < entries.length; eIdx++) {
          for (let rIdx = 0; rIdx < table.row_labels.length; rIdx++) {
            if (!selectedRows.includes(String(table.row_labels[rIdx]))) continue;
            const cellVal = entries[eIdx]?.[rIdx]?.[0] || "";
            if (!cellVal.trim()) {
              toast.error(`Please fill in "${table.row_labels[rIdx]}" in ${table.table_title}${entries.length > 1 ? ` (Entry ${eIdx + 1})` : ""}`);
              return false;
            }
          }
        }
        continue;
      }
    }

    // Also validate required questions
    const sectionQs = questions.filter((q) => q.section_id === currentSec.id);
    for (const q of sectionQs) {
      if (q.is_required && (!answers[q.id] || !String(answers[q.id]).trim())) {
        toast.error(`Please answer: "${q.question_text}"`);
        return false;
      }
    }

    return true;
  };

  const handleNext = () => {
    if (!validateCurrentSection()) return;
    setCurrentSection((p) => p + 1);
  };

  const handleSubmit = () => {
    if (!validateCurrentSection()) return;
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
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-zinc-900">
        <div
          className="h-full bg-red-600 transition-all duration-300"
          style={{ width: `${((currentSection + 1) / sections.length) * 100}%` }}
        />
      </div>

      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-6 max-w-3xl">
        <Card className="bg-zinc-950 border-zinc-800 text-white overflow-hidden">
          <CardHeader className="space-y-2">
            <CardTitle className="text-white text-center">{currentSec.title}</CardTitle>
            {/* Section-level audio explainer inline under heading */}
            {currentSec.video_url && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <span className="text-[11px] text-red-400 font-medium hidden sm:inline">🎧 Audio Explainer — Listen before completing this section</span>
                <span className="text-[11px] text-red-400 font-medium sm:hidden">🎧 Listen first</span>
                <VideoPlayButton videoUrl={currentSec.video_url} label={`Section Overview: ${currentSec.title}`} />
              </div>
            )}
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
                  onClick={handleNext}
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

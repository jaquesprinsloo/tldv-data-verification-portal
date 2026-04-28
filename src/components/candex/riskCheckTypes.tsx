import { CheckCircle, AlertTriangle, Clock, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type RiskCheckKey =
  | "id_verification"
  | "pre_crim"
  | "credit"
  | "pdp"
  | "drivers_license"
  | "tertiary"
  | "matric"
  | "poly";

export type RiskCheckStatus = "pending" | "clear" | "flagged";

export interface RiskCheckResult {
  status: RiskCheckStatus;
  url?: string | null;
  notes?: string | null;
  processed_at?: string | null;
}

export const RISK_CHECKS: { key: RiskCheckKey; label: string; short: string }[] = [
  { key: "id_verification", label: "ID Verification", short: "ID" },
  { key: "pre_crim", label: "Pre-Crim Check", short: "PreCrim" },
  { key: "credit", label: "Credit Check", short: "Credit" },
  { key: "pdp", label: "PDP Verification", short: "PDP" },
  { key: "drivers_license", label: "Drivers License Verification", short: "DL" },
  { key: "tertiary", label: "Tertiary Qualification Verification", short: "Tertiary" },
  { key: "matric", label: "Matric Verification", short: "Matric" },
  { key: "poly", label: "Polygraph Examination", short: "Poly" },
];

export const DEFAULT_REQUESTED_CHECKS: RiskCheckKey[] = ["id_verification", "pre_crim"];

interface CellProps {
  requested: boolean;
  result?: RiskCheckResult;
  label: string;
}

/**
 * Compact status icon for a single check column.
 * Gray dash = not requested, amber clock = pending, green check = clear, red alert = flagged.
 */
export const RiskCheckCell = ({ requested, result, label }: CellProps) => {
  let icon = <Minus className="h-4 w-4 text-muted-foreground/50" />;
  let tip = `${label}: not requested`;
  let cls = "bg-muted/40 border border-border";

  if (requested) {
    const status = result?.status ?? "pending";
    if (status === "clear") {
      icon = <CheckCircle className="h-4 w-4 text-white" />;
      cls = "bg-green-600 border border-green-700";
      tip = `${label}: Clear`;
    } else if (status === "flagged") {
      icon = <AlertTriangle className="h-4 w-4 text-white" />;
      cls = "bg-destructive border border-destructive";
      tip = `${label}: Flagged`;
    } else {
      icon = <Clock className="h-4 w-4 text-amber-700" />;
      cls = "bg-amber-100 border border-amber-300";
      tip = `${label}: Pending`;
    }
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`inline-flex items-center justify-center h-7 w-7 rounded-md ${cls}`}
            aria-label={tip}
          >
            {icon}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{tip}</p>
          {result?.notes && <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px]">{result.notes}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * Small status badge used in the master-side process dialog.
 */
export const RiskCheckStatusBadge = ({ status }: { status?: RiskCheckStatus }) => {
  if (status === "clear") {
    return (
      <Badge className="text-[10px] bg-green-600 text-white gap-1">
        <CheckCircle className="h-3 w-3" /> Clear
      </Badge>
    );
  }
  if (status === "flagged") {
    return (
      <Badge variant="destructive" className="text-[10px] gap-1">
        <AlertTriangle className="h-3 w-3" /> Flagged
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800 border-amber-200 gap-1">
      <Clock className="h-3 w-3" /> Pending
    </Badge>
  );
};

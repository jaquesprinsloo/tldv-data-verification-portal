import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, Download, FileCheck2, FileText, FolderOpen, Layers, ShieldCheck } from "lucide-react";
import { isAccountsDemoModalOpen, type AccountsDemoAction, type AccountsGuideTarget } from "./accountsGuideSteps";

const DEMO_ROWS = [
  {
    id: "demo-1",
    orderNumber: "ORD-2026-0412",
    kind: "single" as const,
    submitted: "2026/11/18",
    sent: "2026/11/19",
    candidate: "Mokoena, Thabo",
    idNumber: "9004125182083",
    risk: "Clear" as const,
  },
  {
    id: "demo-2",
    orderNumber: "ORD-2026-0418-B",
    kind: "batch" as const,
    submitted: "2026/11/21",
    sent: "2026/11/22",
    candidate: "Dlamini, Lerato",
    idNumber: "9308190441087",
    risk: "Clear" as const,
  },
  {
    id: "demo-3",
    orderNumber: "ORD-2026-0418-B",
    kind: "batch" as const,
    submitted: "2026/11/21",
    sent: "2026/11/22",
    candidate: "Ndlovu, Sipho",
    idNumber: "8811045219081",
    risk: "Risk identified" as const,
  },
];

export function AccountsGuideDemoModal({
  guideOpen,
  guideTarget,
  demoAction,
  onCloseGuide,
}: {
  guideOpen: boolean;
  guideTarget: AccountsGuideTarget | null;
  demoAction: AccountsDemoAction | null;
  onCloseGuide: () => void;
}) {
  const open = guideOpen && isAccountsDemoModalOpen(demoAction, guideTarget);
  if (!open) return null;

  const showBulkChecked = demoAction === "highlight-bulk-select" || demoAction === "click-bulk-download";
  const showBulkZip = demoAction === "click-bulk-download";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCloseGuide(); }}>
      <DialogContent
        className="w-[calc(100vw-1.5rem)] max-w-5xl max-h-[82vh] overflow-y-auto overflow-x-hidden mb-16"
        onInteractOutside={(e) => {
          if ((e.target as HTMLElement | null)?.closest?.('[data-guide-player="true"]')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Sandton Flagship — Demo Account</DialogTitle>
            <Badge variant="outline" className="border-primary/40 text-primary text-[10px]">
              Walkthrough example
            </Badge>
          </div>
          <DialogDescription>
            3 check(s) shown • current submissions {showBulkChecked ? "• 2 candidate(s) selected" : ""}
          </DialogDescription>
        </DialogHeader>

        <div
          className={`flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-muted/30 p-3 ${
            demoAction === "highlight-bulk-select" || demoAction === "click-bulk-download" ? "guide-spotlight" : ""
          }`}
        >
          <div className="inline-flex rounded-md border bg-background p-1 w-fit">
            <span className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white">Current submissions</span>
            <span className="px-2.5 py-1 text-xs text-muted-foreground">Historical archive (12 orders)</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`rounded-md border bg-background px-3 py-1.5 text-xs font-medium ${
                demoAction === "highlight-bulk-select" ? "ring-2 ring-primary" : ""
              }`}
            >
              Download: Report and indemnities
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={showBulkZip ? "guide-demo-click" : ""}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download selected ({showBulkChecked ? 2 : 0})
            </Button>
            <Button
              type="button"
              size="sm"
              className={`bg-red-600 hover:bg-red-700 ${showBulkZip ? "guide-demo-click" : ""}`}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download all shown
            </Button>
          </div>
        </div>

        {demoAction === "show-mock-report" && (
          <div className="rounded-lg border-2 border-blue-500/60 bg-background p-4 shadow-md guide-spotlight">
            <div className="flex items-center justify-between border-b pb-2 mb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-sm">Released Risk Assessment Report — ORD-2026-0412</span>
              </div>
              <Badge className="bg-emerald-600 text-[10px]">CLEAR</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded border p-2"><p className="text-muted-foreground">ID Verification</p><p className="font-medium text-emerald-700">Valid SA ID</p></div>
              <div className="rounded border p-2"><p className="text-muted-foreground">Criminal Check</p><p className="font-medium text-emerald-700">No record found</p></div>
              <div className="rounded border p-2"><p className="text-muted-foreground">Credit Bureau</p><p className="font-medium text-emerald-700">Clear standing</p></div>
              <div className="rounded border p-2"><p className="text-muted-foreground">Qualification</p><p className="font-medium text-emerald-700">Verified</p></div>
            </div>
          </div>
        )}

        {demoAction === "show-mock-indemnity" && (
          <div className="rounded-lg border-2 border-amber-500/60 bg-background p-4 shadow-md guide-spotlight">
            <div className="flex items-center justify-between border-b pb-2 mb-3">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-amber-600" />
                <span className="font-semibold text-sm">Signed Indemnity &amp; POPIA Consent — Thabo Mokoena</span>
              </div>
              <Badge variant="outline" className="border-amber-500 text-amber-700 text-[10px]">POPIA Verified</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              File: <span className="font-mono text-foreground">Thabo_Mokoena_Indemnity.pdf</span> • Signed electronically on 2026/11/18 • Identity &amp; consent verified for background screening.
            </p>
          </div>
        )}

        {demoAction === "click-download-icon" && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            Downloading individual candidate package: <span className="font-mono font-medium">ORD-2026-0412_Mokoena_Thabo.zip</span>
          </div>
        )}

        {demoAction === "highlight-single-row" && (
          <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
            <span className="font-semibold">Single submission (ORD-2026-0412):</span> Unique order number with its own personal indemnity file (<span className="font-mono">Thabo_Mokoena_Indemnity.pdf</span>).
          </div>
        )}

        {demoAction === "highlight-batch-rows" && (
          <div className="flex items-start gap-2 rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-xs">
            <Layers className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <div>
              <span className="font-semibold">Batch submission (ORD-2026-0418-B):</span> Both candidates share the same batch order reference, consolidated report, and linked batch indemnity (<span className="font-mono">Batch_0418_Indemnities.pdf</span>).
            </div>
          </div>
        )}

        {showBulkZip && (
          <div className="rounded-md border border-primary/40 bg-muted/40 px-3 py-2 text-xs">
            <span className="font-semibold">ZIP package contents:</span>{" "}
            <span className="font-mono">Order Summary.xlsx</span> • <span className="font-mono">Reports/</span> • <span className="font-mono">Indemnities/</span>
          </div>
        )}

        <div className="min-w-0 w-full overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>ID Number</TableHead>
                <TableHead>ID Valid</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEMO_ROWS.map((r, idx) => {
                const isFirst = idx === 0;
                const isBatch = r.kind === "batch";
                const rowHighlight =
                  (demoAction === "highlight-single-row" && isFirst) ||
                  (demoAction === "highlight-batch-rows" && isBatch);
                const checked = showBulkChecked && idx < 2;
                return (
                  <TableRow key={r.id} className={rowHighlight ? "bg-primary/10 ring-1 ring-inset ring-primary" : undefined}>
                    <TableCell><Checkbox checked={checked} tabIndex={-1} className="pointer-events-none" aria-label={`Select ${r.candidate}`} /></TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <span>{r.orderNumber}</span>
                        <Badge variant="outline" className={`text-[10px] ${isBatch ? "border-primary/50 text-primary" : ""}`}>
                          {isBatch ? "Batch" : "Single"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{r.submitted}</TableCell>
                    <TableCell className="text-xs">{r.sent}</TableCell>
                    <TableCell className="text-xs font-medium">{r.candidate}</TableCell>
                    <TableCell className="font-mono text-xs">{r.idNumber}</TableCell>
                    <TableCell><Badge className="bg-emerald-600 text-[10px]">Valid</Badge></TableCell>
                    <TableCell>
                      {r.risk === "Clear"
                        ? <Badge className="bg-emerald-600 text-[10px]">Clear</Badge>
                        : <Badge className="bg-red-600 text-[10px]">Risk identified</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div
                        className={`inline-flex items-center gap-0.5 rounded-md p-0.5 ${
                          isFirst && demoAction === "highlight-row-actions" ? "guide-spotlight" : ""
                        }`}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Preview report"
                          className={`h-8 w-8 ${isFirst && demoAction === "click-report-icon" ? "guide-demo-click ring-2 ring-blue-500" : ""}`}
                        >
                          <FileText className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="View indemnity"
                          className={`h-8 w-8 ${isFirst && demoAction === "click-indemnity-icon" ? "guide-demo-click ring-2 ring-amber-500" : ""}`}
                        >
                          <FolderOpen className="h-4 w-4 text-amber-600" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Download documents"
                          className={`h-8 w-8 ${isFirst && demoAction === "click-download-icon" ? "guide-demo-click ring-2 ring-emerald-500" : ""}`}
                        >
                          <Download className="h-4 w-4 text-emerald-700" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div
          className={`flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground ${
            demoAction === "highlight-audit-note" ? "guide-spotlight text-foreground" : ""
          }`}
        >
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          POPIA Governance: Every search, report preview, indemnity view, and document download is permanently logged in your audit trail.
        </div>
      </DialogContent>
    </Dialog>
  );
}
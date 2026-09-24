import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Plus, UserPlus, Wifi, WifiOff, CheckCircle, Loader2, AlertTriangle,
  Trash2, Pencil, RefreshCw, UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteReport,
  deleteSession,
  listReports,
  listSessions,
  setCachedLists,
  type OfflineReport,
  type OfflineSession,
} from "@/lib/offlineExaminerDb";
import { syncOfflineReports } from "@/components/examiner/offline/syncOfflineReports";
import SessionSetupDialog from "@/components/examiner/offline/SessionSetupDialog";
import ReportFormDialog from "@/components/examiner/offline/ReportFormDialog";

interface Props {
  examinerUserId: string;
}

export default function OfflineReportsView({ examinerUserId }: Props) {
  const [sessions, setSessions] = useState<OfflineSession[]>([]);
  const [reportsBySession, setReportsBySession] = useState<Record<string, OfflineReport[]>>({});
  const [online, setOnline] = useState(navigator.onLine);
  const [setupOpen, setSetupOpen] = useState(false);
  const [formSession, setFormSession] = useState<OfflineSession | null>(null);
  const [formReport, setFormReport] = useState<OfflineReport | null>(null);
  const [formWalkIn, setFormWalkIn] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState("");

  const reload = useCallback(async () => {
    const ss = await listSessions(examinerUserId);
    setSessions(ss);
    const map: Record<string, OfflineReport[]> = {};
    for (const s of ss) map[s.id] = await listReports(s.id);
    setReportsBySession(map);
  }, [examinerUserId]);

  // Cache client/venue lists while online so setup works offline
  useEffect(() => {
    (async () => {
      try {
        const [{ data: companies }, { data: venues }] = await Promise.all([
          supabase.from("booking_list_options" as any).select("label").eq("list_type", "company").eq("is_active", true),
          supabase.from("polygraph_venues" as any).select("venue_name, city").eq("is_active", true),
        ]);
        setCachedLists({
          companies: (companies || []).map((c: any) => c.label),
          venues: (venues || []).map((v: any) => (v.city ? `${v.venue_name} (${v.city})` : v.venue_name)),
          cachedAt: new Date().toISOString(),
        });
      } catch {
        /* offline — cached lists remain */
      }
    })();
  }, []);

  const doSync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const { uploaded, failed } = await syncOfflineReports(examinerUserId, setProgress);
      if (uploaded > 0) toast.success(`${uploaded} report${uploaded > 1 ? "s" : ""} uploaded`);
      if (failed > 0) toast.error(`${failed} report${failed > 1 ? "s" : ""} failed — will retry automatically`);
    } finally {
      setSyncing(false);
      setProgress("");
      reload();
    }
  }, [examinerUserId, reload]);

  useEffect(() => {
    reload();
    const onOnline = () => { setOnline(true); doSync(); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", doSync);
    const interval = setInterval(doSync, 60000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", doSync);
      clearInterval(interval);
    };
  }, [reload, doSync]);

  const statusBadge = (r: OfflineReport) => {
    switch (r.status) {
      case "uploaded":
        return (
          <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
            <CheckCircle className="h-4 w-4" /> Uploaded
          </span>
        );
      case "published_waiting":
        return <Badge className="bg-amber-500 text-white text-xs">Published (waiting to upload)</Badge>;
      case "uploading":
        return <Badge className="bg-blue-500 text-white text-xs"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Uploading…</Badge>;
      case "error":
        return <Badge variant="destructive" className="text-xs" title={r.lastError}>Will retry</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">Draft</Badge>;
    }
  };

  const pendingCount = Object.values(reportsBySession).flat().filter((r) => r.status !== "uploaded" && r.status !== "draft").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Offline Reports
              {online ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 font-normal"><Wifi className="h-3.5 w-3.5" /> Online</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-normal"><WifiOff className="h-3.5 w-3.5" /> Offline — work saves on this device</span>
              )}
            </CardTitle>
            <CardDescription>
              Complete reports on site with no signal. They publish as "waiting to upload" and upload by themselves when signal returns.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {pendingCount > 0 && (
              <Button variant="outline" size="sm" onClick={doSync} disabled={syncing || !online}>
                {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-1" />}
                Upload now ({pendingCount})
              </Button>
            )}
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setSetupOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New report
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {progress && <p className="text-xs text-muted-foreground mb-3">{progress}</p>}
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No offline reports yet. Tap "New report" to start — choose a single submission or a batch.
            </p>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {sessions.map((s) => {
                const reports = reportsBySession[s.id] || [];
                const uploadedCount = reports.filter((r) => r.status === "uploaded").length;
                return (
                  <AccordionItem key={s.id} value={s.id} className="border rounded-lg px-3">
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex flex-wrap items-center gap-2 text-left">
                        <Badge variant="outline" className="text-xs">{s.mode === "batch" ? "Batch" : "Single"}</Badge>
                        <span className="font-medium text-sm">{s.clientName}</span>
                        <span className="text-xs text-muted-foreground">{s.appointmentDate} · {s.venueLabel} · {s.testType}</span>
                        {s.status === "released" ? (
                          <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle className="h-4 w-4" /> Released</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{uploadedCount}/{reports.length} uploaded</span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <div className="flex gap-2 mb-3">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => { setFormSession(s); setFormReport(null); setFormWalkIn(false); }}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Add candidate
                        </Button>
                        <Button
                          variant="outline" size="sm"
                          onClick={() => { setFormSession(s); setFormReport(null); setFormWalkIn(true); }}
                        >
                          <UserPlus className="h-4 w-4 mr-1" /> Add walk-in candidate
                        </Button>
                        {reports.length === 0 && (
                          <Button
                            variant="ghost" size="sm" className="text-destructive"
                            onClick={async () => { await deleteSession(s.id); reload(); }}
                          >
                            <Trash2 className="h-4 w-4 mr-1" /> Remove
                          </Button>
                        )}
                      </div>
                      {reports.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No candidates yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {reports.map((r) => (
                            <li key={r.id} className="flex flex-wrap items-center gap-2 border rounded-md p-2">
                              <span className="font-medium text-sm">{r.firstName} {r.surname}</span>
                              {r.isWalkIn && <Badge className="bg-amber-500 text-white text-xs">Unplanned</Badge>}
                              <Badge variant="outline" className="text-xs">{r.testType}</Badge>
                              {r.idNumber && <span className="text-xs text-muted-foreground font-mono">{r.idNumber}</span>}
                              <span className="ml-auto flex items-center gap-1">
                                {statusBadge(r)}
                                {r.status !== "uploaded" && (
                                  <>
                                    <Button
                                      variant="ghost" size="sm" title="Edit"
                                      onClick={() => { setFormSession(s); setFormReport(r); setFormWalkIn(r.isWalkIn); }}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost" size="sm" title="Delete"
                                      onClick={async () => {
                                        if (confirm(`Delete the report for ${r.firstName} ${r.surname} from this device?`)) {
                                          await deleteReport(r.id);
                                          reload();
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
          {pendingCount > 0 && (
            <p className="text-xs text-amber-700 mt-4 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Do not clear this app's data before everything is uploaded.
            </p>
          )}
        </CardContent>
      </Card>

      <SessionSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        examinerUserId={examinerUserId}
        onCreated={(s) => {
          reload();
          setFormSession(s);
          setFormReport(null);
          setFormWalkIn(false);
          toast.success(s.mode === "batch" ? "Batch created — add candidates as you go" : "Report created");
        }}
      />
      {formSession && (
        <ReportFormDialog
          open={!!formSession}
          onOpenChange={(o) => { if (!o) { setFormSession(null); setFormReport(null); } }}
          session={formSession}
          report={formReport}
          isWalkIn={formWalkIn}
          onSaved={reload}
        />
      )}
      {sessions.length > 0 && !online && (
        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={reload}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      )}
    </div>
  );
}

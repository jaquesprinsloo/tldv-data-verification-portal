import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Hourglass,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Clock,
  CalendarDays,
} from "lucide-react";

/* ------------------------------------------------------------------
   Premium PreAppliCheck dashboard
   - Hero band with gradient (deep blue → red)
   - KPI stat cards
   - Pipeline funnel
   - Risk-tier distribution chart
   - Live disclosure-insights ticker (rotates every 5s)
   - Recent activity timeline
   ------------------------------------------------------------------ */

type AppRow = any;

interface Props {
  clientName?: string | null;
  invitations: AppRow[] | undefined;
  applications: AppRow[] | undefined;
  appointments: AppRow[] | undefined;
}

const RISK_COLORS: Record<string, string> = {
  LOW: "bg-emerald-500",
  MEDIUM: "bg-amber-500",
  HIGH: "bg-orange-500",
  "VERY HIGH RISK": "bg-rose-600",
  INCONCLUSIVE: "bg-zinc-500",
};

const RISK_TEXT: Record<string, string> = {
  LOW: "text-emerald-600",
  MEDIUM: "text-amber-600",
  HIGH: "text-orange-600",
  "VERY HIGH RISK": "text-rose-600",
  INCONCLUSIVE: "text-zinc-600",
};

/* ── Disclosure category extraction ────────────────────────────── */

interface DisclosureCategory {
  key: string;
  label: string;
  description: string;
  /** Returns true if this application disclosed something in this category. */
  test: (app: AppRow) => boolean;
}

const DISCLOSURE_CATEGORIES: DisclosureCategory[] = [
  {
    key: "theft_at_work",
    label: "stole from work",
    description: "disclosed theft at the workplace",
    test: (app) => (app?.answers?.preRiskProfile?.breakdown?.personal?.score ?? 0) > 0,
  },
  {
    key: "fraud",
    label: "disclosed fraud-related conduct",
    description: "disclosed fraud-related involvement",
    test: (app) => (app?.answers?.preRiskProfile?.breakdown?.fraud?.score ?? 0) > 0,
  },
  {
    key: "bribery",
    label: "disclosed bribery involvement",
    description: "disclosed bribery exposure",
    test: (app) => (app?.answers?.preRiskProfile?.breakdown?.bribery?.score ?? 0) > 0,
  },
  {
    key: "organized",
    label: "disclosed organized-crime exposure",
    description: "disclosed organized-crime exposure",
    test: (app) => (app?.answers?.preRiskProfile?.breakdown?.organized?.score ?? 0) > 0,
  },
  {
    key: "undetected",
    label: "disclosed undetected criminal conduct",
    description: "disclosed undetected criminal conduct",
    test: (app) => (app?.answers?.preRiskProfile?.breakdown?.undetected?.score ?? 0) > 0,
  },
  {
    key: "drugs",
    label: "disclosed illegal drug involvement",
    description: "disclosed illegal drug involvement",
    test: (app) => (app?.answers?.preRiskProfile?.breakdown?.drugs?.score ?? 0) > 0,
  },
  {
    key: "financial_pressure",
    label: "show financial pressure indicators",
    description: "raised financial-pressure indicators",
    test: (app) => (app?.answers?.preRiskProfile?.financial?.score ?? 0) > 0,
  },
  {
    key: "employment",
    label: "raised employment-history concerns",
    description: "raised employment-history concerns",
    test: (app) => (app?.answers?.preRiskProfile?.employment?.score ?? 0) > 0,
  },
  {
    key: "legal",
    label: "disclosed legal-encounter concerns",
    description: "raised legal-encounter concerns",
    test: (app) => (app?.answers?.preRiskProfile?.legal?.score ?? 0) > 0,
  },
];

const CandexPortalDashboard = ({
  clientName,
  invitations,
  applications,
  appointments,
}: Props) => {
  const apps = applications || [];
  const invs = invitations || [];
  const appts = appointments || [];

  /* ── Live countdown tick (refreshes every minute) ─────────────── */
  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  /* ── Scheduled appointments (have a real date) ────────────────── */
  const scheduledAppts = useMemo(() => {
    return appts
      .filter((a: any) => !!a?.scheduled_date)
      .map((a: any) => {
        const dateStr = a.scheduled_date as string;
        const timeStr = (a.scheduled_time as string) || "09:00:00";
        const when = new Date(`${dateStr}T${timeStr}`);
        return { ...a, _when: when };
      })
      .sort((a: any, b: any) => a._when.getTime() - b._when.getTime());
  }, [appts]);

  const upcomingScheduled = useMemo(
    () => scheduledAppts.filter((a: any) => a._when.getTime() >= now.getTime() - 60 * 60 * 1000),
    [scheduledAppts, now],
  );

  const nextAppt = upcomingScheduled[0];
  const countdown = useMemo(() => {
    if (!nextAppt) return null;
    const diffMs = nextAppt._when.getTime() - now.getTime();
    const within48h = diffMs > 0 && diffMs <= 48 * 60 * 60 * 1000;
    if (!within48h) return null;
    const totalMin = Math.floor(diffMs / 60_000);
    const days = Math.floor(totalMin / (60 * 24));
    const hours = Math.floor((totalMin - days * 60 * 24) / 60);
    const minutes = totalMin - days * 60 * 24 - hours * 60;
    return { days, hours, minutes };
  }, [nextAppt, now]);

  const apptDateSet = useMemo(() => {
    const s = new Set<string>();
    scheduledAppts.forEach((a: any) => s.add(a.scheduled_date));
    return s;
  }, [scheduledAppts]);

  /* ── Pipeline counts ─────────────────────────────────────────── */
  const pipeline = useMemo(() => {
    const submitted = apps.filter((a) => a.status === "submitted").length;
    const inProgress = apps.filter((a) => a.status === "in_progress").length;
    const approved = apps.filter((a) => a.status === "approved" || a.status === "candexed").length;
    const candexed = apps.filter((a) => a.status === "candexed").length;
    const rejected = apps.filter((a) => a.status === "rejected").length;
    return {
      invitations: invs.length,
      submitted: submitted + inProgress,
      reviewed: approved,
      candexed,
      rejected,
    };
  }, [apps, invs]);

  /* ── Risk distribution (uses preRiskProfile.riskLevel as fallback) ─ */
  const riskDistribution = useMemo(() => {
    const counts: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, "VERY HIGH RISK": 0 };
    let total = 0;
    for (const a of apps) {
      const level =
        a?.answers?.preRiskProfile?.riskLevel ||
        a?.risk_level;
      if (!level) continue;
      const norm = String(level).toUpperCase();
      if (counts[norm] === undefined) continue;
      counts[norm] += 1;
      total += 1;
    }
    return { counts, total };
  }, [apps]);

  /* ── Disclosure stats ─────────────────────────────────────────── */
  const profiledApps = useMemo(
    () => apps.filter((a) => a?.answers?.preRiskProfile),
    [apps],
  );

  const disclosureStats = useMemo(() => {
    const total = profiledApps.length;
    if (total === 0) return [];
    return DISCLOSURE_CATEGORIES.map((cat) => {
      const hit = profiledApps.filter(cat.test).length;
      return {
        ...cat,
        count: hit,
        total,
        percent: total > 0 ? Math.round((hit / total) * 100) : 0,
      };
    })
      .filter((s) => s.count > 0)
      .sort((a, b) => b.percent - a.percent);
  }, [profiledApps]);

  /* ── Ticker rotation ──────────────────────────────────────────── */
  const [tickerIdx, setTickerIdx] = useState(0);
  useEffect(() => {
    if (disclosureStats.length === 0) return;
    const id = setInterval(
      () => setTickerIdx((i) => (i + 1) % disclosureStats.length),
      5000,
    );
    return () => clearInterval(id);
  }, [disclosureStats.length]);
  const currentTicker = disclosureStats[tickerIdx];

  /* ── Activity timeline ────────────────────────────────────────── */
  const activity = useMemo(() => {
    type Item = { kind: string; label: string; when: string; icon: any; color: string };
    const items: Item[] = [];
    for (const inv of invs.slice(0, 10)) {
      items.push({
        kind: "invitation",
        label: `Invitation sent to ${inv.candidate_name}`,
        when: inv.sent_at || inv.created_at,
        icon: Send,
        color: "text-blue-600",
      });
    }
    for (const app of apps.slice(0, 10)) {
      if (app.status === "submitted") {
        items.push({
          kind: "submitted",
          label: `${app.candidate_name || "Candidate"} submitted application`,
          when: app.submitted_at || app.updated_at,
          icon: ClipboardList,
          color: "text-orange-600",
        });
      } else if (app.status === "approved" || app.status === "candexed") {
        items.push({
          kind: "approved",
          label: `${app.candidate_name || "Candidate"} approved`,
          when: app.updated_at,
          icon: CheckCircle2,
          color: "text-emerald-600",
        });
      }
    }
    return items
      .filter((i) => i.when)
      .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
      .slice(0, 6);
  }, [invs, apps]);

  /* ── KPI cards ────────────────────────────────────────────────── */
  const kpis = [
    {
      label: "Invitations Sent",
      value: pipeline.invitations,
      icon: Send,
      tint: "from-zinc-900/10 to-zinc-900/0",
      iconColor: "text-zinc-900",
    },
    {
      label: "Awaiting Review",
      value: apps.filter((a) => a.status === "submitted").length,
      icon: Hourglass,
      tint: "from-zinc-700/10 to-zinc-700/0",
      iconColor: "text-zinc-700",
    },
    {
      label: "Risk Assessments",
      value: pipeline.candexed,
      icon: ShieldCheck,
      tint: "from-red-700/10 to-red-700/0",
      iconColor: "text-red-700",
    },
  ];

  /* ── Funnel render helper ─────────────────────────────────────── */
  // TLDV / PreAppliCheck palette: black → zinc → red
  const funnelStages = [
    { label: "Invitations", value: pipeline.invitations, color: "from-zinc-900 to-zinc-700" },
    { label: "Submitted", value: pipeline.submitted, color: "from-zinc-800 to-zinc-600" },
    { label: "Reviewed", value: pipeline.reviewed, color: "from-zinc-700 via-zinc-600 to-red-700" },
    { label: "Risk Assessed", value: pipeline.candexed, color: "from-red-800 to-red-600" },
  ];
  const funnelMax = Math.max(1, ...funnelStages.map((s) => s.value));

  return (
    <div className="space-y-6">
      {/* ── Hero band ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-red-900/40 bg-gradient-to-br from-black via-zinc-900 to-[#7f1d1d] text-white shadow-2xl">
        <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_top_right,#ef4444_0%,transparent_55%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative px-6 py-6 md:px-10 md:py-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-red-300/90">
                {clientName ? `Welcome back, ${clientName}` : "Welcome back"}
              </p>
              <h1 className="mt-1 text-2xl md:text-3xl font-bold tracking-tight">
                PreAppliCheck Command Centre
              </h1>
              <p className="mt-1 text-white/70 max-w-xl text-xs md:text-sm">
                Live overview of every candidate moving through pre-employment
                vetting — from invitation to final risk report.
              </p>
            </div>
          </div>

          {/* Live ticker pill */}
          <div className="rounded-xl bg-white/10 backdrop-blur border border-red-300/20 px-4 py-3 min-w-[280px] max-w-md">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-red-200/90 mb-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live Disclosure Insights
            </div>
            {currentTicker ? (
              <div key={currentTicker.key} className="animate-in fade-in slide-in-from-bottom-1 duration-500">
                <p className="text-sm md:text-base font-medium leading-snug">
                  <span className="text-white font-bold">{currentTicker.percent}%</span> of applicants{" "}
                  {currentTicker.label}
                </p>
                <p className="text-[11px] text-white/70 mt-0.5">
                  {currentTicker.count} of {currentTicker.total} applicants{" "}
                  {currentTicker.description}
                </p>
              </div>
            ) : (
              <p className="text-xs text-white/70">
                Insights will appear here as candidates complete pre-risk assessments.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card
            key={k.label}
            className={`relative overflow-hidden border-border/60 bg-gradient-to-br ${k.tint}`}
          >
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {k.label}
                </p>
                <p className="mt-1 text-3xl font-bold tracking-tight">
                  {k.value}
                </p>
              </div>
              <div className={`rounded-xl bg-background/80 p-3 ${k.iconColor}`}>
                <k.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* ── Pipeline funnel ────────────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Workflow Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {funnelStages.map((s) => {
              const pct = Math.round((s.value / funnelMax) * 100);
              return (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-foreground">{s.label}</span>
                    <span className="text-muted-foreground tabular-nums">{s.value}</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${s.color} transition-all duration-700`}
                      style={{ width: `${Math.max(pct, s.value > 0 ? 6 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {pipeline.rejected > 0 && (
              <div className="pt-2 border-t flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-rose-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> Rejected
                </span>
                <span className="font-medium tabular-nums">{pipeline.rejected}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Risk distribution ──────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Risk Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {riskDistribution.total === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No risk-scored applications yet.
              </p>
            ) : (
              <div className="space-y-3">
                {Object.entries(riskDistribution.counts).map(([level, count]) => {
                  const pct = Math.round((count / riskDistribution.total) * 100);
                  return (
                    <div key={level}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className={`font-medium ${RISK_TEXT[level]}`}>{level}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {count} · {pct}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${RISK_COLORS[level]} transition-all duration-700`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <p className="pt-2 text-[11px] text-muted-foreground text-center">
                  Based on {riskDistribution.total} scored application
                  {riskDistribution.total === 1 ? "" : "s"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* ── Disclosure breakdown ───────────────────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Disclosure Insights
              {profiledApps.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {profiledApps.length} applicant{profiledApps.length === 1 ? "" : "s"}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {disclosureStats.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Disclosure stats will populate as candidates complete the pre-risk
                assessment.
              </p>
            ) : (
              <div className="space-y-2.5">
                {disclosureStats.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors"
                  >
                    <div className="w-12 text-right">
                      <span className="text-lg font-bold text-rose-600 tabular-nums">
                        {s.percent}%
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm capitalize-first">
                        {s.label}
                      </p>
                      <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-rose-600 to-orange-500"
                          style={{ width: `${s.percent}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
                      {s.count}/{s.total}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Activity feed ──────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No recent activity.
              </p>
            ) : (
              <ol className="space-y-3">
                {activity.map((it, i) => {
                  const Icon = it.icon;
                  return (
                    <li key={i} className="flex gap-3">
                      <div className={`mt-0.5 ${it.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs leading-snug truncate">{it.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(it.when).toLocaleString()}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Appointments + Live Calendar ───────────────────────────── */}
      {appts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck2 className="h-4 w-4 text-primary" />
              Upcoming Polygraph Appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* 48-hour countdown banner */}
            {countdown && nextAppt && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-gradient-to-r from-rose-50 to-orange-50 dark:from-rose-950/30 dark:to-orange-950/30 p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock className="h-5 w-5 text-rose-600 flex-shrink-0 animate-pulse" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wide">
                        Next Appointment In
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {nextAppt._when.toLocaleString(undefined, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 tabular-nums">
                    {[
                      { label: "DAYS", value: countdown.days },
                      { label: "HRS", value: countdown.hours },
                      { label: "MIN", value: countdown.minutes },
                    ].map((u) => (
                      <div
                        key={u.label}
                        className="bg-white dark:bg-zinc-900 border border-rose-200 dark:border-rose-900 rounded-md px-3 py-1.5 text-center min-w-[56px] shadow-sm"
                      >
                        <p className="text-lg font-bold text-rose-600 leading-none">
                          {String(u.value).padStart(2, "0")}
                        </p>
                        <p className="text-[9px] text-muted-foreground font-medium mt-0.5">
                          {u.label}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="grid lg:grid-cols-[1fr_auto] gap-6">
              {/* Upcoming list */}
              <div className="space-y-2 min-w-0">
                {upcomingScheduled.length === 0 && appts.length > 0 && (
                  <p className="text-xs text-muted-foreground py-4">
                    No scheduled appointments yet — awaiting confirmation from the master profile.
                  </p>
                )}
                {upcomingScheduled.slice(0, 6).map((a: any) => {
                  const isNext = a.id === nextAppt?.id;
                  return (
                    <div
                      key={a.id}
                      className={`rounded-lg border p-3 transition ${
                        isNext
                          ? "border-rose-300 bg-rose-50/50 dark:bg-rose-950/20"
                          : "border-border/60 bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {a._when.toLocaleDateString(undefined, {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                            {a.scheduled_time && (
                              <span className="text-muted-foreground font-normal ml-2">
                                @ {a.scheduled_time.slice(0, 5)}
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground capitalize mt-0.5">
                            {a.status?.replace(/_/g, " ") || "scheduled"} ·{" "}
                            {a.polygraph_appointment_candidates?.length || 0} candidate
                            {(a.polygraph_appointment_candidates?.length || 0) === 1 ? "" : "s"}
                            {a.venue_address ? ` · ${a.venue_address}` : ""}
                          </p>
                        </div>
                        {isNext && (
                          <Badge className="bg-rose-600 hover:bg-rose-600 text-white text-[10px]">
                            NEXT
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Live calendar */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-2 self-start">
                <div className="flex items-center gap-2 px-2 pt-1 pb-2">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Schedule
                  </span>
                </div>
                <Calendar
                  mode="single"
                  selected={nextAppt?._when}
                  modifiers={{
                    booked: (date) => {
                      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                      return apptDateSet.has(iso);
                    },
                  }}
                  modifiersClassNames={{
                    booked:
                      "bg-rose-600 text-white font-bold hover:bg-rose-700 hover:text-white focus:bg-rose-600 focus:text-white rounded-md",
                  }}
                  className="p-2 pointer-events-auto"
                />
                <div className="px-2 pb-2 pt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-sm bg-rose-600" />
                  <span>Scheduled appointment</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CandexPortalDashboard;
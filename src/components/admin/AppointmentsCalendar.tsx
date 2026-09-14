import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Users } from "lucide-react";
import { formatTimeLabel, listOrNA } from "@/lib/bookingConfirmation";

interface CalendarEvent {
  id: string;
  date: string;
  time: string;
  title: string;
  reference: string;
  examiners: string[];
  service: string;
  quantity: number;
  location: string;
  notes?: string | null;
  status: string;
  sent: boolean;
}

const AppointmentsCalendar = () => {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date | null>(new Date());

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["appointments-calendar"],
    queryFn: async () => {
      const [{ data: confirmations }, { data: venues }] = await Promise.all([
        supabase
          .from("booking_confirmations" as any)
          .select("*")
          .order("scheduled_date"),
        supabase.from("polygraph_venues" as any).select("id, venue_name, city"),
      ]);
      const venueMap = new Map((venues || []).map((v: any) => [v.id, v]));
      return ((confirmations || []) as any[]).map((c: any): CalendarEvent => {
        const v = c.venue_id ? venueMap.get(c.venue_id) : null;
        return {
          id: c.id,
          date: c.scheduled_date,
          time: String(c.scheduled_time || "").slice(0, 5),
          title: c.company_name,
          reference: c.booking_reference,
          examiners: c.examiners || [],
          service: c.service_required,
          quantity: c.candidate_quantity,
          location: v
            ? `${(v as any).venue_name}${(v as any).city ? `, ${(v as any).city}` : ""}`
            : c.location_label || "To be confirmed",
          notes: c.special_notes,
          status: c.status,
          sent: c.status === "sent",
        };
      });
    },
  });

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const eventsOn = (day: Date) =>
    events.filter((e) => e.date && isSameDay(parseISO(e.date), day));

  const selectedEvents = selected ? eventsOn(selected) : [];
  const monthEvents = events.filter((e) => e.date && isSameMonth(parseISO(e.date), month));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-5 w-5 text-primary" /> {format(month, "MMMM yyyy")}
              </CardTitle>
              <CardDescription className="text-xs">
                {monthEvents.length} booking{monthEvents.length === 1 ? "" : "s"} this month ·{" "}
                {monthEvents.filter((e) => e.sent).length} confirmed by email
              </CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setMonth(subMonths(month, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1 text-center">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="text-[11px] font-semibold text-muted-foreground py-1">
                  {d}
                </div>
              ))}
              {days.map((day) => {
                const dayEvents = eventsOn(day);
                const isCurrentMonth = isSameMonth(day, month);
                const isSelected = selected && isSameDay(day, selected);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => setSelected(day)}
                    className={`min-h-[64px] sm:min-h-[84px] rounded-md border p-1 text-left transition-colors
                      ${isCurrentMonth ? "bg-card" : "bg-muted/40 text-muted-foreground"}
                      ${isSelected ? "ring-2 ring-primary" : "hover:bg-accent"}`}
                  >
                    <span
                      className={`text-xs font-semibold ${
                        isToday(day) ? "text-primary" : ""
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    <div className="mt-1 space-y-1">
                      {dayEvents.slice(0, 2).map((e) => (
                        <span
                          key={e.id}
                          className={`block truncate rounded px-1 py-0.5 text-[10px] ${
                            e.sent
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground border border-dashed"
                          }`}
                        >
                          {formatTimeLabel(e.time)} {e.title}
                        </span>
                      ))}
                      {dayEvents.length > 2 && (
                        <span className="block text-[10px] text-muted-foreground">
                          +{dayEvents.length - 2} more
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {selected ? format(selected, "EEEE, dd MMMM yyyy") : "Select a day"}
          </CardTitle>
          <CardDescription className="text-xs">
            {selectedEvents.length} appointment{selectedEvents.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {selectedEvents.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">Nothing booked for this day.</p>
          )}
          {selectedEvents.map((e) => (
            <div key={e.id} className="border rounded-lg p-3 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{e.title}</p>
                {e.sent ? (
                  <Badge className="bg-green-600 text-white text-[10px]">Confirmation sent</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Draft</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono">{e.reference}</p>
              <div className="grid sm:grid-cols-2 gap-1 text-xs text-muted-foreground pt-1">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Starts {formatTimeLabel(e.time)}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> {e.quantity} candidate{e.quantity === 1 ? "" : "s"} ·{" "}
                  {listOrNA(e.examiners)}
                </span>
                <span className="flex items-center gap-1 sm:col-span-2">
                  <MapPin className="h-3 w-3" /> {e.location}
                </span>
              </div>
              <p className="text-xs">{e.service}</p>
              {e.notes && <p className="text-xs text-muted-foreground">Notes: {e.notes}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default AppointmentsCalendar;

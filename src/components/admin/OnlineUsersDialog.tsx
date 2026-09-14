import { useEffect, useState } from "react";
import { PresenceMeta, getPresenceSnapshot, subscribePresence } from "@/components/shared/PresenceTracker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const ROUTE_LABELS: Record<string, string> = {
  "/admin/portal": "Portal Selection",
  "/admin/login": "Sign-in page",
  "/admin/polygraph-vetting": "Appointments",
  "/admin/reports-accounts": "Reports & Accounts",
  "/admin/profile-management": "Profile Management",
  "/admin/pending-polygraph-review": "Pending Report Review",
  "/admin/candex-pre-screening": "PreAppliCheck",
  "/admin/manual-risk-assessments": "Risk Assessments",
  "/examiner": "Examiner Portal",
};

const ROLE_LABELS: Record<string, string> = {
  master_admin: "Master Admin",
  admin: "Admin",
  client_facing: "Client Facing",
  examiner: "Examiner",
};

const roleColour = (role: string) =>
  role === "master_admin"
    ? "bg-red-600 text-white"
    : role === "client_facing"
      ? "bg-blue-600 text-white"
      : role === "examiner"
        ? "bg-amber-600 text-white"
        : "bg-gray-700 text-white";

const sinceLabel = (iso: string) => {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: PresenceMeta[];
}

export const useOnlineUsers = (enabled: boolean) => {
  const [users, setUsers] = useState<PresenceMeta[]>(getPresenceSnapshot());

  useEffect(() => {
    if (!enabled) return;
    // Read from the single app-wide presence channel (PresenceTracker). Opening a
    // second channel on the same topic returns empty presence state.
    return subscribePresence(setUsers);
  }, [enabled]);

  return users;
};

const OnlineUsersDialog = ({ open, onOpenChange, users }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-black border-2 border-red-600 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Currently online</DialogTitle>
          <DialogDescription className="text-gray-400">
            Live view of everyone signed in right now, and the page they are on.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-2">
          {users.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Nobody else is online right now.</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.user_id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-gray-800 bg-gray-900/60 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.9)]" />
                      <p className="truncate font-medium">{u.name}</p>
                    </div>
                    <p className="truncate text-xs text-gray-400">{u.email}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {ROUTE_LABELS[u.route] || u.route} · signed in {sinceLabel(u.online_at)}
                    </p>
                  </div>
                  <Badge className={`${roleColour(u.role)} shrink-0 text-xs`}>
                    {ROLE_LABELS[u.role] || u.role}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default OnlineUsersDialog;

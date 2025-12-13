import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, User, Heart, AlertTriangle, CheckCircle, HelpCircle, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FamilyMember {
  Name: string;
  Relationship: string;
  CriminalHistory: string;
}

interface FamilyTreeDisplayProps {
  familyMembers: FamilyMember[];
  candidateName: string;
}

const getRelationshipIcon = (relationship: string, size: string = "h-4 w-4") => {
  const rel = relationship.toLowerCase();
  if (rel.includes("father") || rel.includes("mother") || rel.includes("parent")) {
    return <Heart className={size} />;
  }
  if (rel.includes("brother") || rel.includes("sister") || rel.includes("sibling")) {
    return <Users className={size} />;
  }
  return <User className={size} />;
};

const getCriminalStatusInfo = (history: string) => {
  const lower = history.toLowerCase();
  if (lower.includes("not aware") || lower.includes("no criminal") || lower.includes("never")) {
    return { status: "clear", icon: CheckCircle, color: "text-green-500", bgColor: "bg-green-500/10 border-green-500/30" };
  }
  if (lower.includes("arrested") || lower.includes("convicted") || lower.includes("criminal")) {
    return { status: "flagged", icon: AlertTriangle, color: "text-orange-500", bgColor: "bg-orange-500/10 border-orange-500/30" };
  }
  return { status: "unknown", icon: HelpCircle, color: "text-muted-foreground", bgColor: "bg-muted/50 border-muted" };
};

const getRelationshipLevel = (relationship: string): number => {
  const rel = relationship.toLowerCase();
  if (rel.includes("father") || rel.includes("mother")) return 1;
  if (rel.includes("stepfather") || rel.includes("stepmother")) return 1;
  if (rel.includes("brother") || rel.includes("sister")) return 2;
  if (rel.includes("stepbrother") || rel.includes("stepsister")) return 2;
  if (rel.includes("spouse") || rel.includes("wife") || rel.includes("husband")) return 2;
  if (rel.includes("child") || rel.includes("son") || rel.includes("daughter")) return 3;
  return 2;
};

// Detailed view node
const FamilyMemberNode = ({ member }: { member: FamilyMember }) => {
  const statusInfo = getCriminalStatusInfo(member.CriminalHistory);
  const StatusIcon = statusInfo.icon;

  return (
    <div className={cn(
      "relative p-4 rounded-xl border-2 transition-all hover:shadow-lg",
      statusInfo.bgColor
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "p-2 rounded-full",
          statusInfo.status === "clear" ? "bg-green-500/20" :
          statusInfo.status === "flagged" ? "bg-orange-500/20" : "bg-muted"
        )}>
          {getRelationshipIcon(member.Relationship)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-xs break-words">{member.Name}</p>
          <Badge variant="outline" className="text-xs mt-1">
            {member.Relationship}
          </Badge>
        </div>
        <StatusIcon className={cn("h-5 w-5 flex-shrink-0", statusInfo.color)} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground line-clamp-3">
        {member.CriminalHistory}
      </p>
    </div>
  );
};

// Compact view node
const CompactMemberNode = ({ member }: { member: FamilyMember }) => {
  const statusInfo = getCriminalStatusInfo(member.CriminalHistory);
  const StatusIcon = statusInfo.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all hover:shadow-md cursor-pointer",
            statusInfo.bgColor
          )}>
            <div className={cn(
              "p-1.5 rounded-full",
              statusInfo.status === "clear" ? "bg-green-500/20" :
              statusInfo.status === "flagged" ? "bg-orange-500/20" : "bg-muted"
            )}>
              {getRelationshipIcon(member.Relationship, "h-3 w-3")}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[11px] truncate">{member.Name}</p>
              <p className="text-[10px] text-muted-foreground">{member.Relationship}</p>
            </div>
            <StatusIcon className={cn("h-4 w-4 flex-shrink-0", statusInfo.color)} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-semibold text-sm">{member.Name}</p>
          <p className="text-xs text-muted-foreground mt-1">{member.CriminalHistory}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const FamilyTreeDisplay = ({ familyMembers, candidateName }: FamilyTreeDisplayProps) => {
  const [isCompact, setIsCompact] = useState(false);

  if (!familyMembers || familyMembers.length === 0) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="py-8 text-center text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No family information available</p>
        </CardContent>
      </Card>
    );
  }

  // Group family members by relationship level
  const parents = familyMembers.filter(m => getRelationshipLevel(m.Relationship) === 1);
  const siblings = familyMembers.filter(m => getRelationshipLevel(m.Relationship) === 2);
  const children = familyMembers.filter(m => getRelationshipLevel(m.Relationship) === 3);

  const MemberNode = isCompact ? CompactMemberNode : FamilyMemberNode;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 border-b py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-primary" />
            Family Background
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCompact(!isCompact)}
            className="h-8 px-2 text-xs gap-1.5"
          >
            {isCompact ? (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                Detailed
              </>
            ) : (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                Compact
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className={cn("transition-all", isCompact ? "p-4" : "p-6")}>
        <div className="relative">
          {/* Tree Structure */}
          <div className={cn("space-y-4", isCompact && "space-y-3")}>
            {/* Parents Row */}
            {parents.length > 0 && (
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-gradient-to-r from-primary/20 to-transparent" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Parents</span>
                  <div className="h-px flex-1 bg-gradient-to-l from-primary/20 to-transparent" />
                </div>
                <div className={cn(
                  "grid gap-3",
                  isCompact ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2"
                )}>
                  {parents.map((member, idx) => (
                    <MemberNode key={idx} member={member} />
                  ))}
                </div>
              </div>
            )}

            {/* Connecting Line to Candidate */}
            {parents.length > 0 && (
              <div className="flex justify-center">
                <div className={cn(
                  "w-0.5 bg-gradient-to-b from-primary/30 to-primary/10",
                  isCompact ? "h-4" : "h-8"
                )} />
              </div>
            )}

            {/* Candidate Node (Center) */}
            <div className="flex justify-center">
              <div className={cn(
                "relative rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg",
                isCompact ? "px-4 py-2" : "px-8 py-4"
              )}>
                <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                  <div className="px-2 py-0.5 bg-background text-foreground text-[10px] font-bold uppercase tracking-wider rounded-full border shadow-sm">
                    Candidate
                  </div>
                </div>
                <div className={cn("flex items-center gap-2 mt-2", isCompact && "mt-1")}>
                  <div className={cn(
                    "rounded-full bg-primary-foreground/20",
                    isCompact ? "p-1" : "p-2"
                  )}>
                    <User className={isCompact ? "h-3 w-3" : "h-5 w-5"} />
                  </div>
                  <div>
                    <p className={cn("font-bold", isCompact ? "text-sm" : "text-lg")}>{candidateName}</p>
                    {!isCompact && <p className="text-xs opacity-80">Subject of Examination</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Connecting Line to Siblings */}
            {siblings.length > 0 && (
              <div className="flex justify-center">
                <div className={cn(
                  "w-0.5 bg-gradient-to-b from-primary/10 to-primary/30",
                  isCompact ? "h-4" : "h-8"
                )} />
              </div>
            )}

            {/* Siblings/Spouse Row */}
            {siblings.length > 0 && (
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-gradient-to-r from-primary/20 to-transparent" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Siblings & Spouse</span>
                  <div className="h-px flex-1 bg-gradient-to-l from-primary/20 to-transparent" />
                </div>
                <div className={cn(
                  "grid gap-3",
                  isCompact ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                )}>
                  {siblings.map((member, idx) => (
                    <MemberNode key={idx} member={member} />
                  ))}
                </div>
              </div>
            )}

            {/* Children Row */}
            {children.length > 0 && (
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-gradient-to-r from-primary/20 to-transparent" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Children</span>
                  <div className="h-px flex-1 bg-gradient-to-l from-primary/20 to-transparent" />
                </div>
                <div className={cn(
                  "grid gap-3",
                  isCompact ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                )}>
                  {children.map((member, idx) => (
                    <MemberNode key={idx} member={member} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Legend - only in detailed view */}
          {!isCompact && (
            <div className="mt-6 pt-4 border-t flex flex-wrap items-center justify-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">No Known Criminal History</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <span className="text-muted-foreground">Criminal History Noted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Status Unknown</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default FamilyTreeDisplay;

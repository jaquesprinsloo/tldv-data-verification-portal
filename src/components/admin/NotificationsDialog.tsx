import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Bell, Clock, MailOpen, CheckCircle, Send } from "lucide-react";

interface Request {
  id: string;
  request_type: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
}

interface Reply {
  id: string;
  request_id: string;
  user_id: string;
  message: string;
  created_at: string;
}

export const NotificationsDialog = () => {
  const [open, setOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const queryClient = useQueryClient();

  const { data: requests } = useQuery({
    queryKey: ['my-requests'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return [];

      setCurrentUserId(userData.user.id);

      const { data, error } = await supabase
        .from('profile_requests')
        .select('*')
        .eq('sender_user_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Request[];
    },
    enabled: open
  });

  const { data: replies } = useQuery({
    queryKey: ['request-replies', selectedRequest?.id],
    queryFn: async () => {
      if (!selectedRequest) return [];

      const { data, error } = await supabase
        .from('request_replies')
        .select('*')
        .eq('request_id', selectedRequest.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as Reply[];
    },
    enabled: !!selectedRequest
  });

  const sendReplyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequest || !replyMessage.trim()) return;

      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from('request_replies')
        .insert({
          request_id: selectedRequest.id,
          user_id: userData.user.id,
          message: replyMessage.trim()
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reply sent successfully!");
      setReplyMessage("");
      queryClient.invalidateQueries({ queryKey: ['request-replies'] });
    },
    onError: (error: any) => {
      console.error("Error sending reply:", error);
      toast.error(error.message || "Failed to send reply");
    }
  });

  const unreadCount = requests?.filter(r => r.status === 'replied').length || 0;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      pending: { variant: "destructive", icon: Clock, label: "Pending" },
      in_progress: { variant: "default", icon: Clock, label: "In Progress" },
      replied: { variant: "secondary", icon: MailOpen, label: "Replied" },
      closed: { variant: "outline", icon: CheckCircle, label: "Closed" }
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const formatRequestType = (type: string) => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="relative px-6 py-3 bg-red-600/20 border-2 border-red-600 text-white rounded-lg hover:bg-red-600/40 hover:shadow-[0_0_20px_rgba(239,68,68,0.6)] transition-all duration-300"
        >
          <Bell className="h-5 w-5 mr-2" />
          Notifications
          {unreadCount > 0 && (
            <Badge className="absolute -top-2 -right-2 bg-red-600 text-white px-2 py-1 text-xs">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] bg-black border-2 border-red-600">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">
            My Requests & Notifications
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto max-h-[60vh]">
          {/* Requests List */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-white sticky top-0 bg-black pb-2">All Requests</h3>
            {requests?.length === 0 ? (
              <p className="text-gray-400 text-sm">No requests sent yet</p>
            ) : (
              requests?.map((request) => (
                <Card
                  key={request.id}
                  onClick={() => setSelectedRequest(request)}
                  className={`p-4 cursor-pointer transition-all ${
                    selectedRequest?.id === request.id
                      ? 'bg-red-600/20 border-2 border-red-600'
                      : 'bg-black border border-red-600/30 hover:bg-red-600/10'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-white font-semibold text-sm">{request.subject}</span>
                    {getStatusBadge(request.status)}
                  </div>
                  <p className="text-gray-400 text-xs mb-2">
                    {formatRequestType(request.request_type)}
                  </p>
                  <p className="text-gray-500 text-xs">
                    {new Date(request.created_at).toLocaleDateString()}
                  </p>
                </Card>
              ))
            )}
          </div>

          {/* Request Detail */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white sticky top-0 bg-black pb-2">Details</h3>
            {selectedRequest ? (
              <div className="space-y-4">
                <Card className="p-4 bg-red-600/10 border border-red-600/30">
                  <h4 className="text-white font-semibold mb-2">{selectedRequest.subject}</h4>
                  <p className="text-gray-400 text-sm mb-2">
                    {formatRequestType(selectedRequest.request_type)}
                  </p>
                  <p className="text-white text-sm whitespace-pre-wrap">{selectedRequest.message}</p>
                  <p className="text-gray-500 text-xs mt-2">
                    Sent: {new Date(selectedRequest.created_at).toLocaleString()}
                  </p>
                </Card>

                {/* Replies */}
                {replies && replies.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-white font-semibold">Conversation</h4>
                    {replies.map((reply) => {
                      const isFromUser = reply.user_id === currentUserId;
                      return (
                        <Card 
                          key={reply.id} 
                          className={`p-4 ${
                            isFromUser 
                              ? 'bg-blue-600/10 border border-blue-600/30' 
                              : 'bg-green-600/10 border border-green-600/30'
                          }`}
                        >
                          <p className="text-gray-400 text-xs mb-2">
                            {isFromUser ? 'You' : 'Master Profile'} • {new Date(reply.created_at).toLocaleString()}
                          </p>
                          <p className="text-white text-sm whitespace-pre-wrap">{reply.message}</p>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* Reply Form */}
                <div className="space-y-3">
                  <h4 className="text-white font-semibold">Send Reply</h4>
                  <Textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type your reply here..."
                    className="bg-black border-red-600 text-white min-h-[100px]"
                  />
                  <Button
                    onClick={() => sendReplyMutation.mutate()}
                    disabled={!replyMessage.trim() || sendReplyMutation.isPending}
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {sendReplyMutation.isPending ? "Sending..." : "Send Reply"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">Select a request to view details</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

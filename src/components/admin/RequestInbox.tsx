import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, MailOpen, Clock, CheckCircle, XCircle, ArrowLeft } from "lucide-react";

interface Request {
  id: string;
  sender_user_id: string;
  request_type: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
  sender_name?: string;
  sender_email?: string;
}

interface Reply {
  id: string;
  request_id: string;
  user_id: string;
  message: string;
  created_at: string;
}

export const RequestInbox = () => {
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: requests, isLoading } = useQuery({
    queryKey: ['profile-requests'],
    queryFn: async () => {
      const { data: requestsData, error: requestsError } = await supabase
        .from('profile_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;

      // Fetch profiles separately
      const userIds = requestsData?.map(r => r.sender_user_id) || [];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      return (requestsData || []).map(req => {
        const profile = profilesData?.find(p => p.id === req.sender_user_id);
        return {
          ...req,
          sender_name: profile?.full_name || 'Unknown User',
          sender_email: profile?.email || ''
        };
      });
    }
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

      // Insert reply
      const { error: replyError } = await supabase
        .from('request_replies')
        .insert({
          request_id: selectedRequest.id,
          user_id: userData.user.id,
          message: replyMessage.trim()
        });

      if (replyError) throw replyError;

      // Update request status
      const { error: updateError } = await supabase
        .from('profile_requests')
        .update({ status: 'replied' })
        .eq('id', selectedRequest.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success("Reply sent successfully!");
      setReplyMessage("");
      setSelectedRequest(null);
      queryClient.invalidateQueries({ queryKey: ['profile-requests'] });
      queryClient.invalidateQueries({ queryKey: ['request-replies'] });
    },
    onError: (error: any) => {
      console.error("Error sending reply:", error);
      toast.error(error.message || "Failed to send reply");
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: "pending" | "in_progress" | "replied" | "closed") => {
      if (!selectedRequest) return;

      const { error } = await supabase
        .from('profile_requests')
        .update({ status })
        .eq('id', selectedRequest.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated successfully!");
      queryClient.invalidateQueries({ queryKey: ['profile-requests'] });
    },
    onError: (error: any) => {
      console.error("Error updating status:", error);
      toast.error(error.message || "Failed to update status");
    }
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      pending: { variant: "destructive", icon: Clock, label: "Pending" },
      in_progress: { variant: "default", icon: Mail, label: "In Progress" },
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

  if (isLoading) {
    return <div className="text-white">Loading requests...</div>;
  }

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">Request Inbox</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Request List */}
          <Card className="lg:col-span-1 p-6 bg-black border-2 border-red-600 max-h-[800px] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">All Requests</h2>
            <div className="space-y-3">
              {requests?.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-gray-400 text-sm">No requests yet</p>
                  <Button
                    onClick={() => navigate('/admin/portal')}
                    variant="outline"
                    className="w-full border-red-600 text-red-600 hover:bg-red-600/10"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Main Portal
                  </Button>
                </div>
              ) : (
                requests?.map((request) => (
                  <div
                    key={request.id}
                    onClick={() => setSelectedRequest(request)}
                    className={`p-4 rounded-lg cursor-pointer transition-all ${
                      selectedRequest?.id === request.id
                        ? 'bg-red-600/20 border border-red-600'
                        : 'bg-black/50 border border-red-600/30 hover:bg-red-600/10'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-white font-semibold text-sm">{request.sender_name}</span>
                      {getStatusBadge(request.status)}
                    </div>
                    <p className="text-white font-medium text-sm mb-1">{request.subject}</p>
                    <p className="text-gray-400 text-xs mb-2">
                      {formatRequestType(request.request_type)}
                    </p>
                    <p className="text-gray-500 text-xs">
                      {new Date(request.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Request Detail */}
          <Card className="lg:col-span-2 p-6 bg-black border-2 border-red-600">
            {selectedRequest ? (
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-2xl font-bold text-white mb-2">{selectedRequest.subject}</h2>
                      <p className="text-gray-400 text-sm">
                        From: {selectedRequest.sender_name} ({selectedRequest.sender_email})
                      </p>
                      <p className="text-gray-500 text-xs">
                        {new Date(selectedRequest.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatusMutation.mutate('in_progress')}
                        className="border-yellow-600 text-yellow-600 hover:bg-yellow-600/10"
                      >
                        Mark In Progress
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatusMutation.mutate('closed')}
                        className="border-green-600 text-green-600 hover:bg-green-600/10"
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                  
                  <div className="bg-red-600/10 border border-red-600/30 rounded-lg p-4 mb-4">
                    <p className="text-sm text-gray-300 mb-2">
                      <strong>Type:</strong> {formatRequestType(selectedRequest.request_type)}
                    </p>
                    <p className="text-white whitespace-pre-wrap">{selectedRequest.message}</p>
                  </div>
                </div>

                {/* Replies */}
                {replies && replies.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-white">Replies</h3>
                    {replies.map((reply) => (
                      <div key={reply.id} className="bg-black/50 border border-red-600/30 rounded-lg p-4">
                        <p className="text-gray-400 text-xs mb-2">
                          {new Date(reply.created_at).toLocaleString()}
                        </p>
                        <p className="text-white whitespace-pre-wrap">{reply.message}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply Form */}
                <div>
                  <h3 className="text-lg font-bold text-white mb-3">Send Reply</h3>
                  <Textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type your reply here..."
                    className="bg-black border-red-600 text-white mb-3 min-h-[120px]"
                  />
                  <Button
                    onClick={() => sendReplyMutation.mutate()}
                    disabled={!replyMessage.trim() || sendReplyMutation.isPending}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {sendReplyMutation.isPending ? "Sending..." : "Send Reply"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                Select a request to view details
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

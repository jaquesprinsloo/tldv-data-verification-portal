import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send } from "lucide-react";

export const SendRequestDialog = () => {
  const [open, setOpen] = useState(false);
  const [requestType, setRequestType] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', userData.user.id)
        .single();

      // Create request
      const { data: requestData, error: requestError } = await supabase
        .from('profile_requests')
        .insert({
          sender_user_id: userData.user.id,
          request_type: requestType as "data_management" | "polygraph_vetting" | "reports_accounts" | "general",
          subject: subject.trim(),
          message: message.trim()
        })
        .select()
        .single();

      if (requestError) throw requestError;

      // Send email notification
      const { error: emailError } = await supabase.functions.invoke('send-request-notification', {
        body: {
          request_id: requestData.id,
          sender_name: profile?.full_name || 'Unknown User',
          request_type: requestType,
          subject: subject.trim(),
          message: message.trim()
        }
      });

      if (emailError) {
        console.error("Error sending email notification:", emailError);
        // Don't throw - request was created successfully
      }

      toast.success("Request sent successfully!");
      setOpen(false);
      setRequestType("");
      setSubject("");
      setMessage("");
    } catch (error: any) {
      console.error("Error sending request:", error);
      toast.error(error.message || "Failed to send request");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-red-600 hover:bg-red-700 text-white gap-2">
          <Send className="h-4 w-4" />
          Send Request
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-black border-2 border-red-600 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Send Request to Master Profile</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="request-type" className="text-white">Request Type</Label>
            <Select value={requestType} onValueChange={setRequestType} required>
              <SelectTrigger id="request-type" className="bg-black border-red-600 text-white">
                <SelectValue placeholder="Select request type" />
              </SelectTrigger>
              <SelectContent className="bg-black border-red-600">
                <SelectItem value="data_management">Data Management</SelectItem>
                <SelectItem value="polygraph_vetting">Polygraph & Vetting</SelectItem>
                <SelectItem value="reports_accounts">Reports & Accounts</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="subject" className="text-white">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief description of your request"
              required
              className="bg-black border-red-600 text-white"
            />
          </div>

          <div>
            <Label htmlFor="message" className="text-white">Message</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Detailed information about your request..."
              required
              className="bg-black border-red-600 text-white min-h-[150px]"
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-red-600 text-red-600 hover:bg-red-600/10"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isLoading ? "Sending..." : "Send Request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

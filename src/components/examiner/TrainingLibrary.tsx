import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, Download, Eye, FileText, Loader2, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

type Resource = {
  id: string; title: string; description: string; category: string; file_path: string;
  file_name: string; mime_type: string; file_size: number; is_shared: boolean; created_at: string;
};
const categories = [{ value: "document", label: "Documents" }, { value: "training", label: "Training" }, { value: "interview", label: "Interviews" }];

export default function TrainingLibrary({ canManage = false }: { canManage?: boolean }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("training");
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ resource: Resource; url: string } | null>(null);
  const [removing, setRemoving] = useState<Resource | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["examiner-training"] });
  const { data: resources = [], isLoading, error } = useQuery({
    queryKey: ["examiner-training", canManage],
    queryFn: async () => {
      const { data, error } = await supabase.from("examiner_training_resources").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Resource[];
    },
  });
  useEffect(() => {
    const reload = () => { void refresh(); };
    window.addEventListener("focus", reload);
    const timer = setInterval(reload, 30000);
    return () => { window.removeEventListener("focus", reload); clearInterval(timer); };
  }, [queryClient]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const upload = async () => {
    if (!file || !title.trim()) return;
    if (file.size > 100 * 1024 * 1024) { toast.error("Please choose a file smaller than 100 MB."); return; }
    setBusy(true);
    const path = `${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");
      const { error: uploadError } = await supabase.storage.from("examiner-training").upload(path, file);
      if (uploadError) throw uploadError;
      const { error: saveError } = await supabase.from("examiner_training_resources").insert({
        title: title.trim(), description: description.trim(), category, file_path: path,
        file_name: file.name, mime_type: file.type || "application/octet-stream", file_size: file.size,
        is_shared: shared, uploaded_by: user.id,
      });
      if (saveError) {
        await supabase.storage.from("examiner-training").remove([path]);
        throw saveError;
      }
      await refresh(); setUploadOpen(false); setFile(null); setTitle(""); setDescription("");
      toast.success(shared ? "Material shared with examiners" : "Material saved privately");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not upload material"); }
    finally { setBusy(false); }
  };
  const open = async (resource: Resource, download = false) => {
    setOpening(resource.id);
    try {
      const { data, error } = await supabase.storage.from("examiner-training").download(resource.file_path);
      if (error || !data) throw error || new Error("File not available");
      const url = URL.createObjectURL(new Blob([data], { type: resource.mime_type }));
      if (download) {
        const a = document.createElement("a"); a.href = url; a.download = resource.file_name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else setPreview({ resource, url });
    } catch { toast.error("Could not open this material. Please try again."); }
    finally { setOpening(null); }
  };
  const toggleShared = async (resource: Resource, value: boolean) => {
    const { error } = await supabase.from("examiner_training_resources").update({ is_shared: value }).eq("id", resource.id);
    if (error) toast.error("Could not change sharing"); else await refresh();
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const { error: storageError } = await supabase.storage.from("examiner-training").remove([removing.file_path]);
      if (storageError) throw storageError;
      const { error } = await supabase.from("examiner_training_resources").delete().eq("id", removing.id);
      if (error) throw error;
      setRemoving(null); await refresh(); toast.success("Material deleted");
    } catch { toast.error("Could not delete material. Please try again."); }
    finally { setBusy(false); }
  };
  const visible = resources.filter(r => (filter === "all" || r.category === filter) && `${r.title} ${r.description} ${r.file_name}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /> Education & Training</h2>
      {canManage && <Button onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4 mr-2" /> Upload material</Button>}
    </div>
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search training materials" placeholder="Search materials" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <Select value={filter} onValueChange={setFilter}><SelectTrigger className="sm:w-48" aria-label="Material category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All materials</SelectItem>{categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select>
    </div>
    {isLoading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : error ? <p className="text-destructive">Materials could not be loaded. <Button variant="outline" onClick={() => refresh()}>Retry</Button></p> : visible.length === 0 ? <div className="py-14 text-center border-y"><BookOpen className="h-9 w-9 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">{search || filter !== "all" ? "No matching materials." : "No materials shared yet."}</p></div> :
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{visible.map(r => <Card key={r.id}><CardContent className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-2"><FileText className="h-6 w-6 text-primary shrink-0" /><Badge variant="outline">{categories.find(c => c.value === r.category)?.label}</Badge></div>
      <h3 className="text-base font-semibold break-words">{r.title}</h3>{r.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{r.description}</p>}
      <p className="text-xs text-muted-foreground break-words">{r.file_name} · {(r.file_size / 1024 / 1024).toFixed(1)} MB</p>
      <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-ZA")}</p>
      <div className="flex gap-2"><Button variant="outline" size="sm" disabled={opening === r.id} onClick={() => open(r)}><Eye className="h-4 w-4 mr-2" />View</Button><Button variant="ghost" size="icon" aria-label={`Download ${r.title}`} disabled={opening === r.id} onClick={() => open(r, true)}><Download className="h-4 w-4" /></Button>{canManage && <Button variant="ghost" size="icon" aria-label={`Delete ${r.title}`} onClick={() => setRemoving(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div>
      {canManage && <div className="flex items-center justify-between border-t pt-3 gap-2"><Label htmlFor={`share-${r.id}`}>{r.is_shared ? "Shared with examiners" : "Private"}</Label><Switch id={`share-${r.id}`} checked={r.is_shared} onCheckedChange={v => toggleShared(r, v)} /></div>}
    </CardContent></Card>)}</div>}
    <Dialog open={uploadOpen} onOpenChange={v => { if (!busy) setUploadOpen(v); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Upload education material</DialogTitle></DialogHeader>
      <div className="space-y-4"><div><Label htmlFor="training-title">Title</Label><Input id="training-title" value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div><Label htmlFor="training-description">Description</Label><Textarea id="training-description" value={description} onChange={e => setDescription(e.target.value)} /></div>
      <div><Label>Category</Label><Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="border border-dashed rounded-md p-5 text-center" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, "")); } }}>
      <Input ref={inputRef} type="file" aria-label="Training file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.mp4,.webm,.mov,.mp3,.wav,.m4a,.ogg" onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, "")); } }} />
      <p className="text-sm text-muted-foreground mt-2 break-words">{file ? file.name : "Drop a document, video or audio file · Up to 100 MB"}</p></div>
      <div className="flex items-center justify-between"><Label htmlFor="training-shared">Share with all examiners</Label><Switch id="training-shared" checked={shared} onCheckedChange={setShared} /></div>
      <Button className="w-full" onClick={upload} disabled={busy || !file || !title.trim()}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}Save material</Button></div>
    </DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={v => { if (!v) setPreview(null); }}><DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle className="break-words">{preview?.resource.title}</DialogTitle></DialogHeader>
      {preview && (preview.resource.mime_type.startsWith("video/") ? <video controls src={preview.url} className="w-full max-h-[65vh]" /> : preview.resource.mime_type.startsWith("audio/") ? <audio controls src={preview.url} className="w-full" /> : preview.resource.mime_type.startsWith("image/") ? <img src={preview.url} alt={preview.resource.title} className="max-h-[65vh] w-full object-contain" /> : /^(application\/pdf|text\/plain)$/.test(preview.resource.mime_type) ? <iframe src={preview.url} title={preview.resource.title} className="w-full h-[65vh] border rounded" /> : <p className="text-muted-foreground">Download this file to open it in its original application.</p>)}
      {preview && <Button variant="outline" onClick={() => open(preview.resource, true)}><Download className="h-4 w-4 mr-2" />Download file</Button>}
    </DialogContent></Dialog>
    <Dialog open={!!removing} onOpenChange={v => { if (!v && !busy) setRemoving(null); }}><DialogContent><DialogHeader><DialogTitle>Delete material?</DialogTitle></DialogHeader><p className="break-words">“{removing?.title}” will be permanently removed for everyone.</p><Button variant="destructive" disabled={busy} onClick={remove}>Delete permanently</Button></DialogContent></Dialog>
  </section>;
}
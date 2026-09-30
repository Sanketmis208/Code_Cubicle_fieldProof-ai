import * as Dialog from "@radix-ui/react-dialog";
import {
  BrainCircuit,
  Check,
  FileVideo,
  Image as ImageIcon,
  Loader2,
  Plus,
  RotateCw,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { projectsApi } from "@/api/projects";
import { assetsApi } from "@/api/assets";
import { Button } from "./ui/button";

const allowed = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];
type QueueState =
  | "queued"
  | "uploading"
  | "uploaded"
  | "analyzing"
  | "ready"
  | "failed";
type QueueItem = { file: File; preview: string; state: QueueState };
const stateLabel: Record<QueueState, string> = {
  queued: "Queued",
  uploading: "Uploading",
  uploaded: "Uploaded",
  analyzing: "Analyzing",
  ready: "Ready",
  failed: "Failed",
};

export function UploadDialog({
  open,
  onOpenChange,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [progress, setProgress] = useState(0);
  const [working, setWorking] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [dragging, setDragging] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.list,
  });
  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);
  const release = (queue = items) =>
    queue.forEach((item) => URL.revokeObjectURL(item.preview));
  const select = (incoming: FileList | null) => {
    if (!incoming) return;
    const next = [...incoming];
    const invalid = next.find(
      (file) => !allowed.includes(file.type) || file.size > 25 * 1024 * 1024,
    );
    if (invalid) {
      toast.error(`${invalid.name} is not a supported file under 25 MB`);
      return;
    }
    setItems((current) =>
      [
        ...current,
        ...next.map((file) => ({
          file,
          preview: URL.createObjectURL(file),
          state: "queued" as const,
        })),
      ].slice(0, 10),
    );
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    select(event.dataTransfer.files);
  };
  const updateState = (index: number, state: QueueState) =>
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, state } : item)),
    );
  const upload = async () => {
    if (!projectId || !items.length) return;
    setWorking(true);
    setItems((current) =>
      current.map((item) => ({ ...item, state: "uploading" })),
    );
    try {
      const result = await assetsApi.upload(
        projectId,
        items.map((item) => item.file),
        setProgress,
      );
      setItems((current) =>
        current.map((item) => ({ ...item, state: "uploaded" })),
      );
      let analysisFailures = 0;
      if (autoAnalyze) {
        for (let index = 0; index < result.assets.length; index++) {
          const asset = result.assets[index];
          if (asset.resourceType === "RAW") continue;
          updateState(index, "analyzing");
          try {
            await assetsApi.analyze(asset.id);
            updateState(index, "ready");
          } catch {
            analysisFailures += 1;
            updateState(index, "failed");
          }
        }
      }
      toast.success(
        `${result.assets.length} asset${result.assets.length === 1 ? "" : "s"} added to the evidence library`,
      );
      if (analysisFailures)
        toast.error(
          `${analysisFailures} analysis ${analysisFailures === 1 ? "request was" : "requests were"} rate-limited or unavailable. The uploads are safe; retry them from the Evidence Library.`,
          { duration: 7000 },
        );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["assets"] }),
        qc.invalidateQueries({ queryKey: ["summary"] }),
        qc.invalidateQueries({ queryKey: ["project", projectId] }),
      ]);
      release();
      setItems([]);
      setProgress(0);
      onOpenChange(false);
    } catch (error) {
      setItems((current) =>
        current.map((item) =>
          item.state === "uploading" ? { ...item, state: "failed" } : item,
        ),
      );
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setWorking(false);
    }
  };
  const retry = () => {
    setItems((current) =>
      current.map((item) =>
        item.state === "failed" ? { ...item, state: "queued" } : item,
      ),
    );
    setProgress(0);
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => !working && onOpenChange(value)}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-soft md:p-7">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="font-display text-2xl font-bold">
                Upload field evidence
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-stone">
                Securely store media, preserve source metadata, and optionally
                begin cost-conscious AI analysis for images and videos.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Close upload dialog"
                className="rounded-lg p-2 hover:bg-fog"
              >
                <X size={19} />
              </button>
            </Dialog.Close>
          </div>
          <div className="mt-6">
            <label className="label" htmlFor="upload-project">
              Project
            </label>
            <select
              id="upload-project"
              className="field"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={working}
            >
              <option value="">Choose a project</option>
              {data?.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <label
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            className={`mt-5 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${dragging ? "border-emerald-600 bg-emerald-50" : "border-black/10 bg-fog/60 hover:border-emerald-600/40 hover:bg-emerald-50/40"}`}
          >
            <input
              type="file"
              multiple
              accept={allowed.join(",")}
              className="hidden"
              onChange={(event) => select(event.target.files)}
              disabled={working}
            />
            <span className="grid size-12 place-items-center rounded-2xl bg-ink text-lime">
              <UploadCloud size={23} />
            </span>
            <p className="mt-4 font-semibold">
              {dragging ? "Release to add files" : "Drop media here or browse"}
            </p>
            <p className="mt-1 text-xs text-stone">
              JPEG, PNG, WebP, HEIC, MP4, MOV or WebM · 25 MB each · up to 10
              files
            </p>
          </label>
          {items.length > 0 && (
            <div className="mt-5 space-y-2">
              {items.map((item, index) => (
                <div
                  key={`${item.file.name}-${index}`}
                  className="flex items-center gap-3 rounded-xl border border-black/[.06] p-3"
                >
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-fog">
                    {item.file.type.startsWith("image/") ? (
                      <img
                        src={item.preview}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="grid size-full place-items-center">
                        <FileVideo size={18} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {item.file.name}
                    </p>
                    <p className="mt-0.5 text-xs text-stone">
                      {(item.file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${item.state === "failed" ? "bg-red-50 text-red-700" : item.state === "ready" ? "bg-emerald-50 text-emerald-700" : item.state === "queued" ? "bg-slate-100 text-slate-600" : "bg-violet-50 text-violet-700"}`}
                  >
                    {["uploading", "analyzing"].includes(item.state) ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : item.state === "ready" ? (
                      <Check size={12} />
                    ) : item.state === "failed" ? (
                      <X size={12} />
                    ) : item.file.type.startsWith("video/") ? (
                      <FileVideo size={12} />
                    ) : (
                      <ImageIcon size={12} />
                    )}{" "}
                    {stateLabel[item.state]}
                  </span>
                  <button
                    aria-label={`Remove ${item.file.name}`}
                    disabled={working}
                    onClick={() =>
                      setItems((current) => {
                        URL.revokeObjectURL(current[index].preview);
                        return current.filter((_, i) => i !== index);
                      })
                    }
                    className="rounded-lg p-1.5 hover:bg-fog disabled:opacity-40"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-emerald-50/70 p-4">
            <input
              type="checkbox"
              checked={autoAnalyze}
              onChange={(event) => setAutoAnalyze(event.target.checked)}
              disabled={working}
              className="mt-0.5 size-4 accent-emerald-700"
            />
            <BrainCircuit size={18} className="shrink-0 text-emerald-700" />
            <span>
              <span className="block text-sm font-semibold">
                Analyze media after upload
              </span>
              <span className="mt-1 block text-xs leading-5 text-stone">
                Each asset is analyzed independently; videos use representative
                frames and a failure will not affect successful uploads.
              </span>
            </span>
          </label>
          {working && (
            <div className="mt-5">
              <div className="flex justify-between text-xs font-semibold">
                <span>
                  {items.some((item) => item.state === "analyzing")
                    ? "Generating evidence intelligence…"
                    : "Uploading securely…"}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-fog">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            {items.some((item) => item.state === "failed") && !working && (
              <Button variant="outline" onClick={retry}>
                <RotateCw size={16} />
                Retry
              </Button>
            )}
            <Dialog.Close asChild>
              <Button variant="ghost" disabled={working}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              onClick={upload}
              disabled={!projectId || !items.length || working}
            >
              {working ? (
                <Loader2 className="animate-spin" size={17} />
              ) : (
                <Plus size={17} />
              )}
              Upload {items.length || ""}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

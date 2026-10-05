import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, CheckCircle2, Layers, Loader2, LocateFixed, MapPinOff, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { captureApi } from "@/api/trust";
import { Brand } from "@/components/brand";
import { TrustBadge } from "@/components/trust-badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import type { Asset, Site } from "@/types";

type Fix = { latitude: number; longitude: number; accuracy: number };
type Shot = { id: string; previewUrl: string; blob: Blob; kb: number; status: "sending" | "sent" | "failed"; asset?: Asset; error?: string; fix: Fix | null };

const MAX_EDGE = 1600;

function distance(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function sha256Hex(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Live capture in the phone browser, no install. Only the camera can feed it
 * (there is no file picker), place is read at the shutter, and the server
 * stamps the time, so the evidence is "live" by construction. It cannot prove
 * the phone is untampered; the app's device signing covers that.
 */
export function CapturePage() {
  const { membership } = useAuth();
  const projects = useQuery({ queryKey: ["capture-projects", membership?.organization.id], queryFn: captureApi.projects });
  const [projectId, setProjectId] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [guide, setGuide] = useState(false);
  const project = projects.data?.projects.find((item) => item.id === (projectId || projects.data?.projects[0]?.id));

  useEffect(() => {
    let stream: MediaStream | undefined;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser cannot open the camera here. Use Chrome or Safari over HTTPS.");
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((media) => {
        stream = media;
        if (videoRef.current) {
          videoRef.current.srcObject = media;
          void videoRef.current.play().then(() => setCameraReady(true)).catch(() => setCameraReady(true));
        }
      })
      .catch(() => setCameraError("Camera permission was refused. Allow camera access for this site and reload."));
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) { setGpsError("Location is not available in this browser"); return; }
    // GPS only while this page is open; nobody is tracked in the background.
    const watch = navigator.geolocation.watchPosition(
      (position) => { setFix({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }); setGpsError(null); },
      (error) => setGpsError(error.code === error.PERMISSION_DENIED ? "Location permission refused" : "Waiting for GPS…"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  const site = (() => {
    if (!fix || !project?.sites.length) return null;
    const nearest = project.sites.map((entry: Site) => ({ site: entry, meters: distance(fix, entry) })).sort((a, b) => a.meters - b.meters)[0]!;
    return { ...nearest, inside: nearest.meters <= nearest.site.radiusM + fix.accuracy };
  })();

  const send = useCallback(async (shot: Shot, targetProject: string) => {
    setShots((current) => current.map((item) => (item.id === shot.id ? { ...item, status: "sending", error: undefined } : item)));
    try {
      const sha256 = await sha256Hex(shot.blob);
      const result = await captureApi.upload(shot.blob, {
        clientCaptureId: shot.id, projectId: targetProject, sha256,
        // The server ignores this and uses its own clock for browser captures.
        capturedAt: new Date().toISOString(), timeSource: "DEVICE",
        latitude: shot.fix?.latitude ?? null, longitude: shot.fix?.longitude ?? null, accuracyM: shot.fix?.accuracy ?? null, mockLocation: null,
      });
      const asset = result.assets[0];
      setShots((current) => current.map((item) => (item.id === shot.id ? { ...item, status: "sent", asset } : item)));
    } catch (error) {
      setShots((current) => current.map((item) => (item.id === shot.id ? { ...item, status: "failed", error: error instanceof Error ? error.message : "Upload failed" } : item)));
    }
  }, []);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !project || !video.videoWidth) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Shrunk in the browser so it goes through on 2G; the hash covers exactly what is sent.
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return;
    const shot: Shot = { id: crypto.randomUUID(), previewUrl: URL.createObjectURL(blob), blob, kb: Math.round(blob.size / 1024), status: "sending", fix };
    setShots((current) => [shot, ...current].slice(0, 12));
    void send(shot, project.id);
  };

  useEffect(() => () => shots.forEach((shot) => URL.revokeObjectURL(shot.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const lastSent = shots.find((shot) => shot.status === "sent");
  return (
    <div className="min-h-screen bg-ink text-white">
      <header className="flex items-center justify-between px-4 py-3">
        <Link to="/app" className="inline-flex items-center gap-1 text-sm text-white/70"><ArrowLeft size={16} />Workspace</Link>
        <Brand light compact />
        <span className="text-[10px] font-bold uppercase tracking-[.16em] text-lime">Live capture</span>
      </header>
      <main className="mx-auto max-w-xl space-y-4 px-4 pb-10">
        {projects.isLoading ? <div className="grid h-40 place-items-center"><Loader2 className="animate-spin" /></div>
          : !projects.data?.canCapture ? <p className="rounded-2xl bg-white/10 p-5 text-sm">Your role in {membership?.organization.name} cannot add evidence. Ask an admin to make you a field worker.</p>
            : !projects.data.projects.length ? <p className="rounded-2xl bg-white/10 p-5 text-sm">You are not assigned to an active project yet.</p>
              : (
                <>
                  <select aria-label="Project" className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white" value={project?.id ?? ""} onChange={(event) => setProjectId(event.target.value)}>
                    {projects.data.projects.map((item) => <option key={item.id} value={item.id} className="text-ink">{item.name}</option>)}
                  </select>
                  <div className="relative overflow-hidden rounded-[26px] bg-black">
                    <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" />
                    {guide && lastSent && <img src={lastSent.previewUrl} alt="" className="pointer-events-none absolute inset-0 size-full object-cover opacity-35" />}
                    {!cameraReady && !cameraError && <div className="absolute inset-0 grid place-items-center"><Loader2 className="animate-spin" /></div>}
                    {cameraError && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm"><TriangleAlert className="mb-2 text-amber-300" />{cameraError}</div>}
                    <div className="absolute left-3 top-3 flex flex-wrap gap-2 text-[11px] font-bold">
                      {fix ? <span className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 backdrop-blur"><LocateFixed size={12} className="text-lime" />±{Math.round(fix.accuracy)} m</span>
                        : <span className="flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 backdrop-blur"><MapPinOff size={12} />{gpsError ?? "Finding GPS…"}</span>}
                      {site && <span className={cn("rounded-full px-2.5 py-1 backdrop-blur", site.inside ? "bg-emerald-500/80" : "bg-amber-500/85")}>{site.inside ? `Inside ${site.site.name}` : `${site.meters >= 1000 ? `${(site.meters / 1000).toFixed(1)} km` : `${Math.round(site.meters)} m`} from ${site.site.name}`}</span>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" onClick={() => setGuide((value) => !value)} disabled={!lastSent} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold disabled:opacity-40", guide ? "border-lime text-lime" : "border-white/20 text-white/70")}>
                      <Layers size={14} />Match last shot
                    </button>
                    <button type="button" aria-label="Take photo" onClick={() => void capture()} disabled={!cameraReady || Boolean(cameraError)}
                      className="grid size-20 place-items-center rounded-full border-4 border-white bg-lime text-ink transition active:scale-95 disabled:opacity-40">
                      <Camera size={30} />
                    </button>
                    <span className="w-28 text-right text-[11px] text-white/50">{fix ? "Place recorded at the shutter" : "You can shoot without GPS"}</span>
                  </div>
                  <p className="text-center text-[11px] text-white/45">Time comes from the FieldProof server, not this phone. Photos are shrunk before sending to save data.</p>
                  <ul className="space-y-2">
                    {shots.map((shot) => (
                      <li key={shot.id} className="flex items-center gap-3 rounded-2xl bg-white/[.06] p-2.5">
                        <img src={shot.previewUrl} alt="" className="size-14 rounded-xl object-cover" />
                        <div className="min-w-0 flex-1 text-sm">
                          {shot.status === "sending" && <p className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Sending {shot.kb} KB…</p>}
                          {shot.status === "sent" && shot.asset && <p className="flex items-center gap-2"><CheckCircle2 size={14} className="text-lime" />Sent, {shot.kb} KB</p>}
                          {shot.status === "sent" && !shot.asset && <p className="flex items-center gap-2"><CheckCircle2 size={14} className="text-lime" />Already received earlier</p>}
                          {shot.status === "failed" && <p className="truncate text-amber-300">{shot.error}</p>}
                          {shot.asset && <div className="mt-1"><TrustBadge status={shot.asset.trustStatus} score={shot.asset.trustScore} /></div>}
                        </div>
                        {shot.status === "failed" && project && <Button size="sm" variant="lime" onClick={() => void send(shot, project.id)}><RefreshCw size={14} />Retry</Button>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
      </main>
    </div>
  );
}

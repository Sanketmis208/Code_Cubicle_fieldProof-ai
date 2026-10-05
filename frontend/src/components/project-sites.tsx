import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crosshair, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { sitesApi } from "@/api/trust";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

/**
 * Sites are the project's real places (centre + radius). Every photo with GPS
 * is checked against them, so "taken at the project" becomes a fact, not a caption.
 */
export function ProjectSites({ projectId }: { projectId: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const manage = can("project.edit");
  const sites = useQuery({ queryKey: ["sites", projectId], queryFn: () => sitesApi.list(projectId) });
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState(300);
  const [locating, setLocating] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["sites", projectId] });
    void qc.invalidateQueries({ queryKey: ["project", projectId] });
    void qc.invalidateQueries({ queryKey: ["assets"] });
  };
  const create = useMutation({
    mutationFn: () => sitesApi.create(projectId, { name: name.trim(), latitude: Number(latitude), longitude: Number(longitude), radiusM: radius }),
    onSuccess: ({ rechecked }) => { toast.success(`Site added · ${rechecked} evidence item${rechecked === 1 ? "" : "s"} re-checked`); setName(""); setLatitude(""); setLongitude(""); refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (siteId: string) => sitesApi.remove(projectId, siteId),
    onSuccess: () => { toast.success("Site removed; evidence re-checked"); refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error("Location is not available in this browser");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { setLatitude(position.coords.latitude.toFixed(6)); setLongitude(position.coords.longitude.toFixed(6)); setLocating(false); },
      () => { toast.error("Could not read your location"); setLocating(false); },
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  };
  const lat = Number(latitude);
  const lng = Number(longitude);
  const valid = name.trim().length >= 2 && latitude !== "" && longitude !== "" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const submit = (event: FormEvent) => { event.preventDefault(); if (valid) create.mutate(); };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <section className="card p-6">
        <div className="flex items-center gap-2"><MapPin size={18} /><h2 className="font-display text-lg font-bold">Project sites</h2></div>
        <p className="mt-1 text-sm text-stone">Evidence with GPS is checked against these places. Adding or removing a site re-checks every photo.</p>
        {sites.isLoading ? <div className="grid h-32 place-items-center"><Loader2 className="animate-spin text-stone" /></div> : (
          <ul className="mt-4 divide-y divide-black/[.05]">
            {!sites.data?.sites.length && <li className="py-6 text-center text-sm text-stone">No sites yet. Location checks report “no site to compare against”.</li>}
            {sites.data?.sites.map((site) => (
              <li key={site.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{site.name}</p>
                  <p className="text-xs text-stone">{site.latitude.toFixed(5)}, {site.longitude.toFixed(5)} · radius {site.radiusM} m · {site._count?.assets ?? 0} evidence inside</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <a className="rounded-lg px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-fog" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${site.latitude}&mlon=${site.longitude}#map=16/${site.latitude}/${site.longitude}`}>Map</a>
                  {manage && <Button size="sm" variant="ghost" className="text-red-600" disabled={remove.isPending} onClick={() => window.confirm(`Remove “${site.name}”? Evidence will be re-checked.`) && remove.mutate(site.id)}><Trash2 size={14} /></Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {manage && (
        <form className="card space-y-4 p-6" onSubmit={submit}>
          <h2 className="font-display text-lg font-bold">Add a site</h2>
          <div><label className="label" htmlFor="site-name">Name</label><input id="site-name" className="field" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Plot B, Bassi" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="site-lat">Latitude</label><input id="site-lat" inputMode="decimal" className="field" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="26.9124" /></div>
            <div><label className="label" htmlFor="site-lng">Longitude</label><input id="site-lng" inputMode="decimal" className="field" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="75.7873" /></div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={useMyLocation} disabled={locating}>{locating ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}Use my current location</Button>
          <div>
            <label className="label" htmlFor="site-radius">Radius: {radius} m</label>
            <input id="site-radius" type="range" min={50} max={5000} step={50} value={radius} onChange={(event) => setRadius(Number(event.target.value))} className="w-full accent-emerald-700" />
            <p className="mt-1 text-xs text-stone">Allow for weak GPS under trees or indoors; 200–500 m suits most village sites.</p>
          </div>
          <Button disabled={!valid || create.isPending}>{create.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}Add site</Button>
        </form>
      )}
    </div>
  );
}

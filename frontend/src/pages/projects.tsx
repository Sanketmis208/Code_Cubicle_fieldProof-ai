import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Image, Loader2, MapPin, Plus, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { projectsApi } from "@/api/projects";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { useAuth } from "@/contexts/auth-context";

export function ProjectsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canCreate = can("project.create");
  const { data, isLoading, isError } = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });
  const createDemo = useMutation({
    mutationFn: () => projectsApi.create({
      name: "Jaipur Wetland Restoration · Demo",
      description: "Demo workspace for organizing traceable wetland restoration media. Upload real or clearly marked demo evidence to continue the workflow.",
      location: "Jaipur, Rajasthan",
      category: "Wetland Restoration",
      status: "ACTIVE",
      startDate: "2026-01-15",
      endDate: null,
      coverImage: null,
    }),
    onSuccess: ({ project }) => {
      toast.success("Demo project created — no evidence was fabricated");
      void qc.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/app/projects/${project.id}`);
    },
    onError: (error) => toast.error(error.message),
  });
  return <>
    <PageHeading eyebrow="Portfolio" title="Projects" description="Organize visual evidence around a location, intervention, and timeline." action={canCreate ? <Link to="/app/projects/new"><Button><Plus size={17} />New project</Button></Link> : undefined} />
    {isLoading ? <div className="grid h-72 place-items-center"><Loader2 className="animate-spin text-stone" /></div> : isError ? <div className="card p-8 text-center text-sm text-red-600">Projects could not be loaded. Check that the API is running.</div> : !data?.projects.length ? <EmptyState icon={FolderKanban} title={canCreate ? "No projects yet" : "No projects assigned to you"} description={canCreate ? "Create a project from scratch or start with a clearly labeled demo workspace. Demo creation adds metadata only—it never fabricates media or AI results." : "Projects appear here once a program manager or admin assigns you to one."} action={!canCreate ? undefined : <div className="flex flex-wrap justify-center gap-2"><Link to="/app/projects/new"><Button><Plus size={16} />Create a project</Button></Link><Button variant="outline" disabled={createDemo.isPending} onClick={() => createDemo.mutate()}>{createDemo.isPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}Create demo project</Button></div>} /> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{data.projects.map((project) => <Link to={`/app/projects/${project.id}`} key={project.id} className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-soft"><div className="relative h-36 bg-gradient-to-br from-emerald-900 via-emerald-700 to-lime-500">{project.coverImage && <img src={project.coverImage} alt="" className="size-full object-cover" />}<div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" /><div className="absolute bottom-4 left-4"><StatusBadge status={project.status} /></div></div><div className="p-5"><p className="text-xs font-bold uppercase tracking-[.12em] text-emerald-700">{project.category || "Impact project"}</p><h2 className="mt-2 truncate font-display text-xl font-bold group-hover:text-emerald-800">{project.name}</h2><p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-stone">{project.description || "No description added yet."}</p><div className="mt-5 flex items-center justify-between border-t border-black/[.06] pt-4 text-xs text-stone"><span className="flex min-w-0 items-center gap-1.5 truncate"><MapPin size={14} className="shrink-0" />{project.location || "Not set"}</span><span className="flex shrink-0 items-center gap-1.5"><Image size={14} />{project._count.assets} assets</span></div></div></Link>)}</div>}
  </>;
}

import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { projectsApi } from '@/api/projects';
import { ProjectForm } from '@/components/project-form';
import { PageHeading } from '@/components/page-heading';
import { LoadingScreen } from '@/components/loading-screen';
import type { ProjectInput } from '@/types';

export function ProjectEditorPage(){const {id}=useParams();const editing=Boolean(id);const navigate=useNavigate();const qc=useQueryClient();const {data,isLoading}=useQuery({queryKey:['project',id],queryFn:()=>projectsApi.get(id!),enabled:editing});const mutation=useMutation({mutationFn:(input:ProjectInput)=>editing?projectsApi.update(id!,input):projectsApi.create(input),onSuccess:({project})=>{void qc.invalidateQueries({queryKey:['projects']});void qc.invalidateQueries({queryKey:['project',project.id]});void qc.invalidateQueries({queryKey:['summary']});toast.success(editing?'Project updated':'Project created');navigate(`/app/projects/${project.id}`)},onError:(e)=>toast.error(e.message)});if(editing&&isLoading)return <LoadingScreen/>;return <div className="mx-auto max-w-4xl"><Link to={editing?`/app/projects/${id}`:'/app/projects'} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-stone hover:text-ink"><ArrowLeft size={16}/>Back</Link><PageHeading eyebrow={editing?'Project settings':'New evidence stream'} title={editing?'Edit project':'Create a project'} description="Give this initiative enough context to keep its evidence meaningful over time."/><ProjectForm project={data?.project} onSubmit={async i=>{await mutation.mutateAsync(i)}} submitLabel={editing?'Save changes':'Create project'}/></div>}

import { api } from "./client";
import type { Comparison, Report, ReportType } from "@/types";

const query = (projectId?: string) =>
  projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";

export const comparisonsApi = {
  list: (projectId?: string) =>
    api<{ comparisons: Comparison[] }>(`/comparisons${query(projectId)}`),
  create: (input: { projectId: string; beforeAssetId: string; afterAssetId: string }) =>
    api<{ comparison: Comparison; cached: boolean }>("/comparisons", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  remove: (id: string) => api<void>(`/comparisons/${id}`, { method: "DELETE" }),
};

export const reportsApi = {
  list: (projectId?: string) =>
    api<{ reports: Report[] }>(`/reports${query(projectId)}`),
  get: (id: string) => api<{ report: Report }>(`/reports/${id}`),
  create: (input: { projectId: string; title: string; reportType: ReportType }) =>
    api<{ report: Report }>("/reports", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  remove: (id: string) => api<void>(`/reports/${id}`, { method: "DELETE" }),
};

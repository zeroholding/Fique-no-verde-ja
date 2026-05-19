"use client";

import React, { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Eye, Download, UploadCloud, Edit2, Trash2, ShieldAlert, ArrowLeft, Search, Filter, Users, ChevronDown, X } from "lucide-react";
import Link from "next/link";

type EvidenceLog = {
    id: number;
    action: string;
    created_at: string;
    user_id: string;
    user_name: string;
    evidence_id: string;
    file_name: string | null;
    file_type: string | null;
    evidence_date: string | null;
};

type UserOption = { user_id: string; user_name: string };

const ACTION_OPTIONS = [
    { value: "",         label: "Todas as ações" },
    { value: "upload",   label: "📤 Upload" },
    { value: "view",     label: "👁 Visualização" },
    { value: "download", label: "⬇ Download" },
    { value: "edit",     label: "✏️ Edição" },
    { value: "delete",   label: "🗑 Exclusão" },
];

export default function GlobalEvidenceLogsPage() {
    const { error: showError } = useToast();
    const [logs, setLogs] = useState<EvidenceLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterAction, setFilterAction] = useState("");
    const [filterUserId, setFilterUserId] = useState("");
    const [users, setUsers] = useState<UserOption[]>([]);
    const [stats, setStats] = useState({ total: 0, uploads: 0, views: 0, deletes: 0 });

    const getToken = () => (typeof window !== "undefined" ? localStorage.getItem("token") || "" : "");

    useEffect(() => {
        fetchUsers();
        fetchLogs();
    }, []);

    // Re-busca quando filtros mudam
    useEffect(() => {
        fetchLogs();
    }, [filterAction, filterUserId]);

    const fetchUsers = async () => {
        try {
            const res = await fetch("/api/evidences/logs?users=1", {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (res.ok) setUsers(data.users || []);
        } catch(e) {}
    };

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: "1000" });
            if (filterAction) params.set("action", filterAction);
            if (filterUserId) params.set("userId", filterUserId);

            const res = await fetch(`/api/evidences/logs?${params.toString()}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (res.ok) {
                const rows: EvidenceLog[] = data.logs || [];
                setLogs(rows);
                setStats({
                    total: rows.length,
                    uploads: rows.filter(l => l.action === "upload").length,
                    views: rows.filter(l => l.action === "view").length,
                    deletes: rows.filter(l => l.action === "delete").length,
                });
            } else {
                showError(data.error || "Erro ao carregar logs.");
            }
        } catch(e) {
            showError("Falha na conexão.");
        } finally {
            setLoading(false);
        }
    };

    const clearFilters = () => {
        setFilterAction("");
        setFilterUserId("");
    };

    const hasFilters = filterAction !== "" || filterUserId !== "";

    const getActionVisuals = (action: string) => {
        switch(action) {
            case 'view':     return { icon: <Eye size={14}/>,        color: "text-blue-400 bg-blue-400/10 border-blue-400/30",    label: "Visualizou" };
            case 'download': return { icon: <Download size={14}/>,   color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30", label: "Baixou" };
            case 'upload':   return { icon: <UploadCloud size={14}/>, color: "text-purple-400 bg-purple-400/10 border-purple-400/30",  label: "Fez Upload" };
            case 'edit':     return { icon: <Edit2 size={14}/>,       color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",  label: "Editou" };
            case 'delete':   return { icon: <Trash2 size={14}/>,      color: "text-red-400 bg-red-400/10 border-red-400/30",           label: "Excluiu" };
            default:         return { icon: <ShieldAlert size={14}/>, color: "text-gray-400 bg-gray-400/10 border-gray-400/20",         label: action };
        }
    };

    const formatDateTime = (isoStr: string) => {
        if (!isoStr) return "N/A";
        return new Date(isoStr).toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
            timeZone: "America/Sao_Paulo"
        });
    };

    const formatDateBR = (isoStr: string | null) => {
        if (!isoStr) return null;
        return new Date(isoStr).toLocaleDateString("pt-BR", { timeZone: "UTC" });
    };

    const getFileExt = (fileType: string | null) => {
        if (!fileType) return "N/A";
        return (fileType.split("/")[1] || fileType).toUpperCase();
    };

    const getExtColor = (fileType: string | null) => {
        const ext = (fileType || "").toLowerCase();
        if (ext.includes("pdf")) return "text-red-400 bg-red-400/10";
        if (ext.includes("image") || ext.includes("png") || ext.includes("jpg")) return "text-sky-400 bg-sky-400/10";
        if (ext.includes("video") || ext.includes("mp4")) return "text-orange-400 bg-orange-400/10";
        return "text-gray-400 bg-gray-400/10";
    };

    return (
        <div className="px-4 py-6 sm:p-8 space-y-6 text-white min-h-[calc(100vh-100px)]">
            {/* Header */}
            <div className="flex flex-col gap-4">
                <Link href="/dashboard/evidencias" className="flex items-center gap-2 text-gray-400 hover:text-white transition w-max text-sm">
                    <ArrowLeft size={15} /> Voltar para Evidências
                </Link>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-500/15 text-indigo-400 rounded-2xl border border-indigo-500/20">
                            <ShieldAlert size={22} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight">Painel de Auditoria</h1>
                            <p className="text-xs text-gray-500 mt-0.5">Rastreio completo de interações com evidências</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: "Total de Eventos", value: stats.total, color: "indigo" },
                    { label: "Uploads",          value: stats.uploads,  color: "purple" },
                    { label: "Visualizações",    value: stats.views,   color: "blue" },
                    { label: "Exclusões",        value: stats.deletes, color: "red" },
                ].map(s => (
                    <div key={s.label} className={`bg-${s.color}-500/5 border border-${s.color}-500/20 rounded-xl px-4 py-3`}>
                        <p className={`text-2xl font-bold text-${s.color}-400`}>{s.value}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 backdrop-blur space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                    {/* Filtro por Ação */}
                    <div className="flex items-center gap-2 min-w-[200px]">
                        <Filter className="text-gray-500 shrink-0" size={16} />
                        <div className="relative w-full">
                            <select
                                value={filterAction}
                                onChange={(e) => setFilterAction(e.target.value)}
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition cursor-pointer appearance-none pr-8"
                            >
                                {ACTION_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={14} />
                        </div>
                    </div>

                    {/* Filtro por Usuário */}
                    <div className="flex items-center gap-2 min-w-[220px]">
                        <Users className="text-gray-500 shrink-0" size={16} />
                        <div className="relative w-full">
                            <select
                                value={filterUserId}
                                onChange={(e) => setFilterUserId(e.target.value)}
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition cursor-pointer appearance-none pr-8"
                            >
                                <option value="">Todos os usuários</option>
                                {users.map(u => (
                                    <option key={u.user_id} value={u.user_id}>{u.user_name}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={14} />
                        </div>
                    </div>

                    {/* Limpar filtros */}
                    {hasFilters && (
                        <button
                            onClick={clearFilters}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition"
                        >
                            <X size={14} /> Limpar filtros
                        </button>
                    )}

                    <div className="ml-auto flex items-center gap-2">
                        {loading && (
                            <span className="text-xs text-gray-500 animate-pulse">Carregando...</span>
                        )}
                        <span className="text-xs text-gray-500">{logs.length} evento(s)</span>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="text-xs bg-black/40 text-gray-500 border-b border-white/10">
                            <tr>
                                <th className="px-4 py-3 font-semibold tracking-wider uppercase">Data/Hora</th>
                                <th className="px-4 py-3 font-semibold tracking-wider uppercase">Usuário</th>
                                <th className="px-4 py-3 font-semibold tracking-wider uppercase">Ação</th>
                                <th className="px-4 py-3 font-semibold tracking-wider uppercase">Data Evidência</th>
                                <th className="px-4 py-3 font-semibold tracking-wider uppercase">Arquivo</th>
                                <th className="px-4 py-3 font-semibold tracking-wider uppercase">Tipo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 bg-black/20">
                            {loading ? (
                                [...Array(6)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        {[...Array(6)].map((_, j) => (
                                            <td key={j} className="px-4 py-4">
                                                <div className="h-3 bg-white/5 rounded-full" style={{ width: `${60 + Math.random() * 40}%` }} />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3 text-gray-500">
                                            <Search size={32} className="opacity-30" />
                                            <span className="text-sm">Nenhum evento encontrado com os filtros selecionados.</span>
                                            {hasFilters && (
                                                <button onClick={clearFilters} className="text-xs text-indigo-400 hover:underline">
                                                    Limpar filtros
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => {
                                    const vis = getActionVisuals(log.action);
                                    const dateBR = formatDateBR(log.evidence_date);
                                    const extColor = getExtColor(log.file_type);
                                    return (
                                        <tr key={log.id} className="hover:bg-white/[0.03] transition-colors">
                                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400 tabular-nums">
                                                {formatDateTime(log.created_at)}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
                                                        {log.user_name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="font-medium text-gray-200 text-sm">{log.user_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${vis.color}`}>
                                                    {vis.icon} {vis.label}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                {dateBR ? (
                                                    <span className="font-medium text-gray-200">{dateBR}</span>
                                                ) : (
                                                    <span className="text-gray-600 text-xs italic">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 max-w-[220px] truncate" title={log.file_name || undefined}>
                                                {log.file_name ? (
                                                    <span className="font-medium text-gray-200">{log.file_name}</span>
                                                ) : (
                                                    <span className="text-gray-600 text-xs italic">Arquivo Excluído</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {log.file_type ? (
                                                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold tracking-wider ${extColor}`}>
                                                        {getFileExt(log.file_type)}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-600 text-xs">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

"use client";

import React, { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { FileText, Eye, Download, UploadCloud, Edit2, Trash2, ShieldAlert, ArrowLeft, Search, Filter } from "lucide-react";
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

export default function GlobalEvidenceLogsPage() {
    const { error } = useToast();
    const [logs, setLogs] = useState<EvidenceLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterAction, setFilterAction] = useState("");
    const [searchUser, setSearchUser] = useState("");

    useEffect(() => {
        fetchLogs();
    }, [filterAction]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token") || "";
            let url = `/api/evidences/logs?limit=1000`;
            if (filterAction) url += `&action=${filterAction}`;
            if (searchUser) url += `&user=${encodeURIComponent(searchUser)}`;

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setLogs(data.logs || []);
            } else {
                error(data.error || "Erro ao carregar logs.");
            }
        } catch(e) {
            error("Falha na conexão.");
        } finally {
            setLoading(false);
        }
    };

    // Atualiza via pesquisa com botão ou Enter
    const handleSearch = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        fetchLogs();
    };

    const getActionVisuals = (action: string) => {
        switch(action) {
            case 'view': return { icon: <Eye size={16}/>, color: "text-blue-400 bg-blue-400/10 border-blue-400/20", label: "Visualizou" };
            case 'download': return { icon: <Download size={16}/>, color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", label: "Baixou" };
            case 'upload': return { icon: <UploadCloud size={16}/>, color: "text-purple-400 bg-purple-400/10 border-purple-400/20", label: "Fez Upload" };
            case 'edit': return { icon: <Edit2 size={16}/>, color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", label: "Editou" };
            case 'delete': return { icon: <Trash2 size={16}/>, color: "text-red-400 bg-red-400/10 border-red-400/20", label: "Excluiu" };
            default: return { icon: <ShieldAlert size={16}/>, color: "text-gray-400 bg-gray-400/10 border-gray-400/20", label: action };
        }
    };

    const formatDate = (isoStr: string) => {
        if (!isoStr) return "N/A";
        return new Date(isoStr).toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
        });
    };

    return (
        <div className="px-4 py-6 sm:p-8 space-y-6 text-white min-h-[calc(100vh-100px)]">
            <div className="flex flex-col gap-4">
                <Link href="/dashboard/evidencias" className="flex items-center gap-2 text-gray-400 hover:text-white transition w-max">
                    <ArrowLeft size={16} /> Voltar para Evidências
                </Link>
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl">
                        <ShieldAlert size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Painel de Auditoria (Logs)</h1>
                        <p className="text-sm text-gray-400">
                            Histórico de segurança de todas as interações com arquivos do módulo de evidências.
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 backdrop-blur">
                <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Buscar por usuário responsável..."
                            value={searchUser}
                            onChange={(e) => setSearchUser(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-black/40 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="text-gray-400" size={18} />
                        <select 
                            value={filterAction}
                            onChange={(e) => setFilterAction(e.target.value)}
                            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition cursor-pointer appearance-none"
                        >
                            <option value="">Todas as ações</option>
                            <option value="upload">Upload</option>
                            <option value="view">Visualização</option>
                            <option value="download">Download</option>
                            <option value="edit">Edição</option>
                            <option value="delete">Exclusão</option>
                        </select>
                    </div>
                    <button type="submit" className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition text-sm">
                        Buscar
                    </button>
                </form>

                <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="text-xs uppercase bg-black/40 text-gray-400">
                            <tr>
                                <th className="px-4 py-3 font-medium">Data/Hora da Ação</th>
                                <th className="px-4 py-3 font-medium">Usuário</th>
                                <th className="px-4 py-3 font-medium">Ação Realizada</th>
                                <th className="px-4 py-3 font-medium">Data Ref. Evidência</th>
                                <th className="px-4 py-3 font-medium">Nome do Arquivo</th>
                                <th className="px-4 py-3 font-medium">Tipo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 bg-black/20">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                                        Carregando auditoria...
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                                        Nenhum registro encontrado.
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => {
                                    const vis = getActionVisuals(log.action);
                                    return (
                                        <tr key={log.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-4 py-3 whitespace-nowrap text-gray-400">
                                                {formatDate(log.created_at)}
                                            </td>
                                            <td className="px-4 py-3 font-medium text-gray-200">
                                                {log.user_name}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${vis.color}`}>
                                                    {vis.icon} {vis.label}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-gray-300">
                                                {log.evidence_date ? log.evidence_date.split('-').reverse().join('/') : "Desconhecida"}
                                            </td>
                                            <td className="px-4 py-3 max-w-[200px] sm:max-w-[300px] truncate" title={log.file_name || "N/A"}>
                                                {log.file_name || <span className="text-gray-500 italic">Arquivo Excluído ou N/A</span>}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-400 uppercase tracking-wider">
                                                {log.file_type ? log.file_type.split('/')[1] || log.file_type : "N/A"}
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

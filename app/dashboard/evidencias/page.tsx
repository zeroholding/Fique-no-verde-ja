"use client";

import { useEffect, useState, useMemo, ChangeEvent, useRef } from "react";
import { ChevronLeft, ChevronRight, UploadCloud, FileText, Trash2, Maximize2, X, File, Image as ImageIcon, Video, CalendarDays, Eye, Download, Edit2, Save, History, Clock } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { CustomVideoPlayer } from "@/components/CustomVideoPlayer";

type Evidence = {
  id: string;
  date: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  description: string | null;
  creator_name: string | null;
  created_at: string;
};

type UploadProgress = {
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
};

// Utilitario para dias do mês
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay(); // 0 = Sunday

export default function EvidencesCalendarPage() {
  const { success, error } = useToast();
  
  // States do Calendario
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Data States
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // States do Modal
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // States de Upload
  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadProgress[]>([]);
  const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false);
  
  // Fullscreen Media State
  const [previewMedia, setPreviewMedia] = useState<Evidence | null>(null);

  // Edit State
  const [editingEvidence, setEditingEvidence] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Logs State
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [currentLogs, setCurrentLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedLogEvidence, setSelectedLogEvidence] = useState<Evidence | null>(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  useEffect(() => {
     // Check admin user
     const checkUser = async () => {
         try {
            const userData = localStorage.getItem("user");
            if (userData) {
               const payload = JSON.parse(userData);
               if (payload && payload.isAdmin === true) {
                   setIsAdmin(true);
               }
            }
         } catch(e) {}
     };
     checkUser();
     fetchEvidences(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  const fetchEvidences = async (year: number, month: number) => {
      setLoading(true);
      try {
          // Vamos buscar tudo do mês inteiro
          const start = new Date(year, month, 1).toISOString().split('T')[0];
          const end = new Date(year, month + 1, 0).toISOString().split('T')[0];

          const token = localStorage.getItem("token");
          const res = await fetch(`/api/evidences?start=${start}&end=${end}`, {
             headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          if (res.ok) {
              setEvidences(data.evidences || []);
          } else {
              error(data.error || "Erro ao carregar calendrio");
          }
      } catch (e) {
          error("Falha na conexão");
      } finally {
          setLoading(false);
      }
  };

  const nextMonth = () => {
      setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };
  
  const prevMonth = () => {
      setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleDayClick = (dayStr: string) => {
      // dayStr e.g. "2026-03-15"
      // Date parse local trick to avoid timezone shift
      const [y, m, d] = dayStr.split('-').map(Number);
      setSelectedDate(new Date(y, m - 1, d));
      setIsModalOpen(true);
  };

  // Upload Handlers
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          setFilesToUpload(Array.from(e.target.files));
      }
  };

  const submitUpload = async () => {
      if (filesToUpload.length === 0 || !selectedDate) return;

      const token = localStorage.getItem("token");
      if (!token) return error("Sessão expirada");

      setUploading(true);
      setIsUploadPanelOpen(true);
      
      const initialQueue: UploadProgress[] = filesToUpload.map(f => ({
          fileName: f.name,
          progress: 0,
          status: 'pending'
      }));
      setUploadQueue(initialQueue);

      try {
          const dateStr = selectedDate.toISOString().split('T')[0];
          let uploadedCount = 0;

          // Enviar um por um usando XMLHttpRequest para poder medir o progresso (%)
          for (let i = 0; i < filesToUpload.length; i++) {
              const f = filesToUpload[i];
              
              setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'uploading' } : item));

              try {
                  const data = await new Promise<any>((resolve, reject) => {
                      const xhr = new XMLHttpRequest();
                      xhr.open('POST', '/api/evidences');
                      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                      
                      // Configurações para envio bruto (bypassa FormData limit)
                      xhr.setRequestHeader('X-Upload-Type', 'raw');
                      xhr.setRequestHeader('X-File-Name', encodeURIComponent(f.name));
                      xhr.setRequestHeader('X-File-Date', dateStr);
                      if (uploadDescription) {
                          xhr.setRequestHeader('X-File-Description', encodeURIComponent(uploadDescription));
                      }
                      xhr.setRequestHeader('Content-Type', f.type || 'application/octet-stream');
                      
                      xhr.upload.onprogress = (event) => {
                          if (event.lengthComputable) {
                              const percentComplete = Math.round((event.loaded / event.total) * 100);
                              setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, progress: percentComplete } : item));
                          }
                      };

                      xhr.onload = () => {
                          if (xhr.status >= 200 && xhr.status < 300) {
                              try { resolve(JSON.parse(xhr.responseText)); } catch(e) { resolve({}); }
                          } else {
                              try { reject(new Error(JSON.parse(xhr.responseText).error)); } catch(e) { reject(new Error("Erro no upload")); }
                          }
                      };

                      xhr.onerror = () => reject(new Error("Erro de rede"));
                      xhr.send(f); // Envia o arquivo puro direto (Stream)
                  });

                  setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'success', progress: 100 } : item));
                  uploadedCount += (data.uploadedItems?.length || 1);
              } catch (err: any) {
                  setUploadQueue(prev => prev.map((item, idx) => idx === i ? { ...item, status: 'error', error: err.message } : item));
              }
          }

          if (uploadedCount > 0) {
              success(`${uploadedCount} arquivo(s) salvo(s) com sucesso!`);
              setFilesToUpload([]);
              setUploadDescription("");
              await fetchEvidences(currentYear, currentMonth); // refresh dados
          }
      } catch (err: any) {
          error(err.message || "Erro ao processar uploads");
      } finally {
          setUploading(false);
          // Fecha o painel automaticamente após alguns segundos se tudo der certo
          setTimeout(() => {
              setUploadQueue(prev => {
                  if (prev.every(p => p.status === 'success')) {
                      setIsUploadPanelOpen(false);
                  }
                  return prev;
              });
          }, 4000);
      }
  };

  const deleteEvidence = async (id: string) => {
     if (!confirm("Tem certeza que deseja excluir esta evidência permanentemente?")) return;

     const token = localStorage.getItem("token");
     try {
       const res = await fetch(`/api/evidences/${id}`, {
           method: 'DELETE',
           headers: { Authorization: `Bearer ${token}` }
       });
       const data = await res.json();
       if (res.ok) {
           success("Evidência removida!");
           // Remove instataneamente da memoria
           setEvidences(prev => prev.filter(e => e.id !== id));
       } else {
           error(data.error || "Erro ao excluir");
       }
     } catch(e) {
         error("Erro na exclusão");
     }
  };

  const handleSaveEdit = async (ev: Evidence) => {
     const token = localStorage.getItem("token");
     if (!token) return;
     
     setIsSavingEdit(true);
     try {
         const res = await fetch(`/api/evidences/${ev.id}`, {
             method: 'PUT',
             headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
             body: JSON.stringify({ description: editDescription })
         });
         const data = await res.json();
         if (res.ok) {
             success("Descrição atualizada!");
             setEvidences(prev => prev.map(e => e.id === ev.id ? { ...e, description: editDescription } : e));
             setEditingEvidence(null);
         } else {
             throw new Error(data.error || "Erro ao atualizar");
         }
     } catch(e: any) {
         error(e.message || "Erro de conexão ao salvar");
     } finally {
         setIsSavingEdit(false);
     }
  };

  const handleDownload = async (ev: Evidence | null) => {
      if (!ev) return;
      try {
          const res = await fetch(ev.file_url, { method: 'HEAD' });
          if (!res.ok) {
              error("Arquivo não encontrado no servidor. (Ele pode ter sido removido durante um deploy).");
              return;
          }
          logEvidenceAction(ev.id, 'download');
          const link = document.createElement('a');
          link.href = ev.file_url;
          link.download = ev.file_name;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      } catch (e) {
          error("Erro de conexão ao tentar baixar.");
      }
  };

  const fetchLogs = async (ev: Evidence) => {
     setSelectedLogEvidence(ev);
     setLogsLoading(true);
     setLogsModalOpen(true);
     try {
         const token = localStorage.getItem("token");
         const res = await fetch(`/api/evidences/${ev.id}/log`, {
             headers: { Authorization: `Bearer ${token}` }
         });
         const data = await res.json();
         if (res.ok) setCurrentLogs(data.logs || []);
         else error(data.error || "Erro ao buscar histórico");
     } catch(e) {
         error("Erro ao buscar logs");
     } finally {
         setLogsLoading(false);
     }
  };

  const logEvidenceAction = async (evId: string, action: 'view'|'download') => {
      try {
         const token = localStorage.getItem("token") || "";
         await fetch(`/api/evidences/${evId}/log`, {
             method: 'POST',
             headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
             body: JSON.stringify({ action })
         });
      } catch(e) {}
  };

  // Construcao do Grid do Calendario
  const totalDays = getDaysInMonth(currentYear, currentMonth);
  const firstDayIndex = getFirstDayOfMonth(currentYear, currentMonth);
  
  const daysArray = useMemo(() => {
     const arr = [];
     // Empty slots for previous month
     for(let i = 0; i < firstDayIndex; i++) {
         arr.push(null);
     }
     // Actual days
     for(let i = 1; i <= totalDays; i++) {
         // Formatar YYYY-MM-DD
         const str = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
         arr.push(str);
     }
     return arr;
  }, [currentYear, currentMonth, totalDays, firstDayIndex]);

  // Map evidences by date for quick dot rendering
  const evidencesByDate = useMemo(() => {
      const map: Record<string, Evidence[]> = {};
      evidences.forEach(ev => {
          if (!map[ev.date]) map[ev.date] = [];
          map[ev.date].push(ev);
      });
      return map;
  }, [evidences]);

  // Mídias da data selecionada
  const selectedDateStr = selectedDate ? selectedDate.toISOString().split('T')[0] : null;
  // Usar filter de novo so para prevenir timezones locais estragando o selectedDate
  const selectedDateLocalStr = selectedDate ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}` : null;
  const selectedEvidences = selectedDateLocalStr ? (evidencesByDate[selectedDateLocalStr] || []) : [];

  const formatSize = (bytes: number) => {
      if (bytes < 1024) return bytes + ' B';
      const k = bytes / 1024;
      if (k < 1024) return k.toFixed(1) + ' KB';
      return (k / 1024).toFixed(1) + ' MB';
  };

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  // Helper para renderizar visual apropriado
  const renderMediaPreview = (ev: Evidence) => {
     const isImg = ev.file_type.startsWith('image/');
     const isVid = ev.file_type.startsWith('video/');

     if (isImg) {
         return <img src={ev.file_url} className="w-full h-32 object-cover rounded-xl border border-white/10" alt={ev.file_name}/>
     }
     if (isVid) {
         return (
             <div className="w-full h-32 bg-black/50 border border-white/10 rounded-xl relative overflow-hidden group">
                <video src={`${ev.file_url}#t=0.1`} className="w-full h-full object-cover" preload="metadata" muted playsInline />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-transparent transition-colors">
                    <Video size={32} className="text-white/70 shadow-black drop-shadow-md"/>
                </div>
                <span className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 text-[10px] rounded text-white z-10">Vídeo</span>
             </div>
         )
     }
     // PDF ou Outros
     return (
         <div className="w-full h-32 bg-purple-500/10 border border-purple-500/20 flex flex-col items-center justify-center rounded-xl">
             <FileText size={40} className="text-purple-400 mb-2"/>
             <span className="text-[10px] uppercase text-purple-300 font-semibold px-2 truncate max-w-full">Documento</span>
         </div>
     )
  };

  return (
    <div className="px-4 py-6 sm:p-8 space-y-6 text-white min-h-[calc(100vh-100px)]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl">
               <CalendarDays size={24} />
            </div>
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Calendário de Evidências</h1>
                <p className="text-sm text-gray-400">
                Acompanhe e salve arquivos visuais (comprovantes, mídias) vinculados a cada dia.
                </p>
            </div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 backdrop-blur">
          {/* Header do Calendario */}
          <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-gray-100">
                  {monthNames[currentMonth]} {currentYear}
              </h2>
              <div className="flex items-center gap-2">
                  <button onClick={prevMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-gray-300 transition">
                      <ChevronLeft size={20} />
                  </button>
                  <button onClick={nextMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-gray-300 transition">
                      <ChevronRight size={20} />
                  </button>
              </div>
          </div>

          {/* Grid Semanal */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-widest">
              <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sab</div>
          </div>

          {/* Grid de Dias */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
             {daysArray.map((dateStr, index) => {
                 if (!dateStr) {
                     return <div key={`empty-${index}`} className="opacity-0"></div>; // Placeholder
                 }

                 const dayNumber = parseInt(dateStr.split('-')[2]);
                 const dayEvidences = evidencesByDate[dateStr] || [];
                 const hasEvidences = dayEvidences.length > 0;

                 return (
                     <div 
                        key={dateStr}
                        onClick={() => handleDayClick(dateStr)}
                        className="h-16 sm:h-20 md:h-24 flex flex-col items-center justify-center p-1 sm:p-2 bg-black/20 hover:bg-white/10 border border-white/5 hover:border-blue-500/50 rounded-xl cursor-pointer transition relative group"
                     >
                         <span className={`text-lg sm:text-xl font-medium ${
                             dateStr === new Date().toISOString().split('T')[0] ? 'text-blue-400' : 'text-gray-300'
                         }`}>
                             {dayNumber}
                         </span>

                         {/* Bolinhas / Contadores Visuais */}
                         {hasEvidences && (
                             <div className="flex items-center gap-1 mt-1">
                                 <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400"></div>
                                 <span className="text-[10px] hidden sm:block text-emerald-300">{dayEvidences.length}</span>
                             </div>
                         )}

                         {/* Highlight se hover */}
                         <div className="absolute inset-0 border-2 border-transparent group-hover:border-blue-500/30 rounded-xl pointer-events-none transition-colors"></div>
                     </div>
                 );
             })}
          </div>
      </div>

      {/* Modal Diário */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedDateLocalStr ? `Evidências: ${selectedDateLocalStr.split('-').reverse().join('/')}` : "Detalhes da Data"}
        widthClassName="max-w-4xl w-[95%] sm:w-[90%]"
      >
          <div className="space-y-6">
             {/* AREA DE UPLOAD (SO ADMIN) */}
             {isAdmin && (
                 <div className="bg-black/40 border border-dashed border-white/20 p-5 rounded-2xl flex flex-col gap-4">
                     <div className="flex items-center gap-2 text-gray-300 mb-2">
                         <UploadCloud size={18} className="text-blue-400"/>
                         <h3 className="font-semibold text-sm">Adicionar Arquivos</h3>
                     </div>
                     
                     <div className="flex flex-col sm:flex-row gap-3 items-end">
                         <div className="flex-1 w-full flex flex-col gap-1">
                            <label className="text-xs text-gray-400">Selecionar Midias</label>
                            <input 
                               type="file" 
                               multiple 
                               onChange={handleFileSelect}
                               className="block w-full text-sm text-gray-300 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-500/20 file:text-blue-300 hover:file:bg-blue-500/30 bg-white/5 border border-white/10 rounded-xl"
                            />
                         </div>
                         <div className="flex-1 w-full flex flex-col gap-1">
                             <label className="text-xs text-gray-400">Descrição (opcional)</label>
                             <input 
                               type="text"
                               placeholder="Ex: Print do pix"
                               value={uploadDescription}
                               onChange={e => setUploadDescription(e.target.value)}
                               className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-white focus:outline-none placeholder:text-gray-500"
                             />
                         </div>
                     </div>
                     
                     {filesToUpload.length > 0 && (
                         <Button type="button" onClick={submitUpload} disabled={uploading} className="w-full sm:w-auto self-end">
                             {uploading ? 'Salvando...' : `Confirmar Upload (${filesToUpload.length})`}
                         </Button>
                     )}
                 </div>
             )}

             {/* LISTA DO DIA */}
             <div>
                <h3 className="font-medium text-gray-300 mb-4">{selectedEvidences.length} Registros salvos</h3>
                
                {selectedEvidences.length === 0 ? (
                    <div className="py-10 text-center text-gray-500 border border-white/5 rounded-xl border-dashed">
                       Nenhum arquivo enviado para essa data.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {selectedEvidences.map(ev => {
                            const isEditing = editingEvidence === ev.id;
                            return (
                            <div key={ev.id} className="group relative bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-col gap-3 hover:bg-white/10 transition">
                                {/* Preview Visual */}
                                <div 
                                    className="cursor-pointer relative overflow-hidden rounded-xl"
                                    onClick={() => { logEvidenceAction(ev.id, 'view'); setPreviewMedia(ev); }}
                                >
                                    {renderMediaPreview(ev)}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <Maximize2 size={24} className="text-white"/>
                                    </div>
                                </div>
                                
                                <div className="flex flex-col gap-2 flex-1">
                                    <p className="text-sm font-medium text-gray-200 truncate" title={ev.file_name}>
                                        {ev.file_name}
                                    </p>
                                    
                                    {isEditing ? (
                                        <div className="flex flex-col gap-2">
                                            <input 
                                              type="text" 
                                              value={editDescription} 
                                              onChange={e => setEditDescription(e.target.value)}
                                              className="w-full text-xs rounded-lg border border-white/20 bg-black/50 px-2 py-1.5 text-white focus:outline-none focus:border-blue-400 placeholder:text-gray-500"
                                              placeholder="Nova descrição..."
                                            />
                                            <div className="flex gap-2">
                                                <button disabled={isSavingEdit} onClick={() => handleSaveEdit(ev)} className="text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 px-2 py-1.5 rounded flex-1 transition">{isSavingEdit ? '...' : 'Salvar'}</button>
                                                <button onClick={() => setEditingEvidence(null)} className="text-xs font-semibold bg-white/10 hover:bg-white/20 text-gray-300 px-2 py-1.5 rounded transition">Cancelar</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between items-center text-xs">
                                           <span className="text-gray-500 truncate mr-2" title={ev.creator_name || 'Desconhecido'}>
                                              {formatSize(ev.file_size)} • {ev.creator_name || 'Desconhecido'}
                                           </span>
                                           {ev.description && <span className="text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded truncate max-w-[120px]" title={ev.description}>{ev.description}</span>}
                                        </div>
                                    )}
                                </div>

                                {/* Ações Explícitas */}
                                <div className="grid grid-cols-2 gap-2 mt-auto pt-3 border-t border-white/5">
                                    <button onClick={() => { logEvidenceAction(ev.id, 'view'); setPreviewMedia(ev); }} className="flex items-center justify-center gap-1.5 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-xs font-medium transition">
                                        <Eye size={14}/> Ver Mídia
                                    </button>
                                    <button onClick={() => handleDownload(ev)} className="flex items-center justify-center gap-1.5 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-xs font-medium transition">
                                        <Download size={14}/> Baixar
                                    </button>
                                </div>

                                {/* Ações de Admin */}
                                {isAdmin && !isEditing && (
                                    <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 bg-black/60 backdrop-blur-md p-1.5 rounded-xl shadow-xl border border-white/10">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); fetchLogs(ev); }}
                                            className="p-1.5 bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 rounded-lg transition"
                                            title="Ver histórico de acessos"
                                        >
                                            <History size={14}/>
                                        </button>
                                        <button 
                                            onClick={() => { setEditingEvidence(ev.id); setEditDescription(ev.description || ""); }}
                                            className="p-1.5 bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white rounded-lg transition"
                                            title="Editar descrição"
                                        >
                                            <Edit2 size={14}/>
                                        </button>
                                        <button 
                                            onClick={() => deleteEvidence(ev.id)}
                                            className="p-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg transition"
                                            title="Excluir arquivo permanentemente"
                                        >
                                            <Trash2 size={14}/>
                                        </button>
                                    </div>
                                )}
                            </div>
                            );
                        })}
                    </div>
                )}
             </div>
          </div>
      </Modal>

      {/* FULLSCREEN PREVIEW */}
      {previewMedia && (
          <div className="fixed inset-0 z-[99999] bg-black/95 flex flex-col">
              <div className="flex items-center justify-between p-4 sm:p-6 text-white border-b border-white/10">
                  <div>
                      <h3 className="font-semibold text-lg">{previewMedia.file_name}</h3>
                      <p className="text-xs text-gray-400">{selectedDateLocalStr?.split('-').reverse().join('/')} • {previewMedia.description || "Sem descrição"} • {previewMedia.creator_name || "Desconhecido"}</p>
                  </div>
                  <div className="flex items-center gap-4">
                      {/* Baixar */}
                      <button onClick={() => handleDownload(previewMedia)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition flex items-center gap-2">
                          <Download size={16}/> Baixar Original
                      </button>
                      <button onClick={() => setPreviewMedia(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition">
                          <X size={24}/>
                      </button>
                  </div>
              </div>
              <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                  {previewMedia.file_type.startsWith('image/') ? (
                      <img src={previewMedia.file_url} className="max-w-full max-h-full object-contain" alt="Preview"/>
                  ) : previewMedia.file_type.startsWith('video/') ? (
                      <CustomVideoPlayer src={previewMedia.file_url} />
                  ) : previewMedia.file_type === 'application/pdf' ? (
                      <iframe src={previewMedia.file_url} className="w-full h-[85vh] rounded-xl shadow-2xl bg-white" />
                  ) : (
                      <div className="flex flex-col items-center gap-4">
                          <FileText size={80} className="text-purple-400" />
                          <p className="text-gray-300">Pré-visualização não disponível para este formato.</p>
                          <button onClick={() => handleDownload(previewMedia)} className="text-blue-400 hover:underline">
                              Baixar arquivo para abrir externamente
                          </button>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* MODAL DE HISTÓRICO / LOGS */}
      <Modal
         open={logsModalOpen}
         onClose={() => setLogsModalOpen(false)}
         title="Histórico de Acessos"
         widthClassName="max-w-2xl w-[95%]"
      >
         <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center gap-3">
               <FileText className="text-blue-400" size={24}/>
               <div>
                  <p className="font-semibold text-white">{selectedLogEvidence?.file_name}</p>
                  <p className="text-xs text-gray-400">Total de {currentLogs.length} interações registradas</p>
               </div>
            </div>

            {logsLoading ? (
               <div className="py-10 text-center text-emerald-400">Carregando histórico...</div>
            ) : (
               <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {currentLogs.map(log => (
                      <div key={log.id} className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition">
                          <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${log.action === 'download' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                  {log.action === 'download' ? <Download size={16}/> : <Eye size={16}/>}
                              </div>
                              <div>
                                  <p className="text-sm font-medium text-gray-200">
                                      {log.action === 'download' ? 'Baixou o arquivo' : 'Visualizou o arquivo'}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                      Usuário: <span className="text-gray-300 font-medium">{log.user_id === 'public' ? 'Acesso Público (Link Direto)' : log.user_name}</span>
                                  </p>
                              </div>
                          </div>
                          <div className="text-right flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1 text-xs text-gray-400">
                                  <Clock size={12}/>
                                  {new Date(log.created_at).toLocaleString('pt-BR')}
                              </div>
                          </div>
                      </div>
                  ))}

                  {/* LOG DE CRIAÇÃO (SEMPRE POR ÚLTIMO) */}
                  {selectedLogEvidence && (
                      <div className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl transition opacity-80">
                          <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                                  <UploadCloud size={16}/>
                              </div>
                              <div>
                                  <p className="text-sm font-medium text-gray-200">Fez o upload do arquivo</p>
                                  <p className="text-xs text-gray-400">
                                      Usuário: <span className="text-gray-300 font-medium">{selectedLogEvidence.creator_name || 'Desconhecido'}</span>
                                  </p>
                              </div>
                          </div>
                          <div className="text-right flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1 text-xs text-gray-400">
                                  <Clock size={12}/>
                                  {new Date(selectedLogEvidence.created_at).toLocaleString('pt-BR')}
                              </div>
                          </div>
                      </div>
                  )}
               </div>
            )}
         </div>
      </Modal>

      {/* PAINEL DE PROGRESSO DE UPLOAD NO CANTO INFERIOR DIREITO */}
      {isUploadPanelOpen && uploadQueue.length > 0 && (
          <div className="fixed bottom-4 right-4 sm:bottom-8 sm:right-8 w-80 sm:w-96 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden z-[99999] flex flex-col">
              <div className="bg-white/5 border-b border-white/10 p-3 sm:p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                      <UploadCloud size={18} className="text-emerald-400" />
                      <h3 className="font-semibold text-sm sm:text-base text-gray-200">Enviando arquivos ({uploadQueue.filter(q => q.status === 'success').length}/{uploadQueue.length})</h3>
                  </div>
                  {!uploading && (
                      <button onClick={() => setIsUploadPanelOpen(false)} className="text-gray-400 hover:text-white transition">
                          <X size={18}/>
                      </button>
                  )}
              </div>
              <div className="p-3 sm:p-4 space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar">
                  {uploadQueue.map((item, idx) => (
                      <div key={idx} className="bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col gap-2">
                          <div className="flex justify-between items-center gap-2">
                              <span className="text-xs text-gray-300 font-medium truncate flex-1" title={item.fileName}>{item.fileName}</span>
                              <span className="text-xs font-mono text-gray-400 min-w-[35px] text-right">
                                  {item.status === 'success' ? 'OK' : item.status === 'error' ? 'Erro' : `${item.progress}%`}
                              </span>
                          </div>
                          
                          {/* Barra de Progresso */}
                          <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
                              <div 
                                  className={`h-full transition-all duration-300 ${item.status === 'error' ? 'bg-red-500' : item.status === 'success' ? 'bg-emerald-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${item.status === 'error' ? 100 : item.progress}%` }}
                              />
                          </div>

                          {item.status === 'error' && (
                              <p className="text-[10px] text-red-400 mt-1">{item.error}</p>
                          )}
                      </div>
                  ))}
              </div>
          </div>
      )}

    </div>
  );
}

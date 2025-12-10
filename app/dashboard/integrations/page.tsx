"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import Card from "@/components/Card";
import { useSearchParams, useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import Link from "next/link";

type MLAccount = {
  ml_user_id: number;
  nickname: string | null;
  updated_at: string;
};

const Tooltip = ({ text, children }: { text: string; children: React.ReactNode }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({
      top: rect.top - 12, // Ajustado para o novo estilo
      left: rect.left + rect.width / 2
    });
    setIsVisible(true);
  };

  return (
    <>
      <div 
        className="inline-block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {mounted && isVisible && createPortal(
        <div 
          className="fixed z-[9999] px-4 py-2.5 rounded-xl bg-black/30 backdrop-blur-xl border border-white/10 shadow-2xl whitespace-nowrap text-sm font-medium text-white pointer-events-none -translate-x-1/2 -translate-y-full"
          style={{ top: coords.top, left: coords.left }}
        >
          {text}
        </div>,
        document.body
      )}
    </>
  );
};

export default function IntegrationsPage() {
  const { success, error } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<MLAccount[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState<number | null>(null);
  
  // Estados para o Link de Convite
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string>("");
  const [generatingInvite, setGeneratingInvite] = useState(false);

  useEffect(() => {
    const successParam = searchParams.get("success");
    const errorParam = searchParams.get("error");

    if (successParam === "true") {
      success("Integração com Mercado Livre realizada com sucesso!");
      router.replace("/dashboard/integrations");
    } else if (errorParam) {
      if (errorParam === "ml_auth_failed") {
        error("Falha na autenticação com Mercado Livre.");
      } else if (errorParam === "internal_error") {
        error("Erro ao processar integração.");
      } else {
        error("Erro desconhecido na integração.");
      }
      router.replace("/dashboard/integrations");
    }

    fetchStatus();
  }, [searchParams, success, error, router]);

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/integrations/mercadolivre/status");
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts || []);
      }
    } catch (err) {
      console.error("Erro ao buscar status", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const response = await fetch("/api/integrations/mercadolivre/auth-url");
      const data = await response.json();

      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        error("Não foi possível iniciar a conexão. Verifique as configurações.");
        setConnecting(false);
      }
    } catch (err) {
      error("Erro de conexão com o servidor.");
      setConnecting(false);
    }
  };

  const handleGenerateInvite = async () => {
    setGeneratingInvite(true);
    try {
      const response = await fetch("/api/integrations/mercadolivre/auth-url?mode=external");
      const data = await response.json();

      if (response.ok && data.url) {
        setInviteUrl(data.url);
        setShowInviteModal(true);
      } else {
        error("Erro ao gerar link de convite.");
      }
    } catch (err) {
      error("Erro de conexão ao gerar convite.");
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleDisconnect = async (mlUserId: number) => {
    if (!confirm("Tem certeza que deseja desconectar esta conta?")) return;

    setDisconnecting(mlUserId);
    try {
      const response = await fetch("/api/integrations/mercadolivre/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ml_user_id: mlUserId }),
      });

      if (response.ok) {
        success("Conta desconectada com sucesso!");
        setAccounts(accounts.filter((acc) => acc.ml_user_id !== mlUserId));
      } else {
        error("Erro ao desconectar conta.");
      }
    } catch (err) {
      error("Erro de conexão.");
    } finally {
      setDisconnecting(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-white">
        Carregando status das integrações...
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 relative">
      {/* Modal de Convite usando Componente Universal */}
      <Modal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Link de Conexão Remota"
        footer={
          <div className="flex gap-3 justify-end w-full">
            <Button 
              variant="secondary"
              onClick={() => setShowInviteModal(false)}
            >
              Fechar
            </Button>
            <Button 
              variant="primary"
              onClick={() => {
                navigator.clipboard.writeText(inviteUrl);
                success("Link copiado para a área de transferência!");
              }}
            >
              Copiar Link
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-gray-300 text-sm">
            Envie este link para seu cliente. Ao clicar, ele poderá conectar a conta do Mercado Livre dele diretamente ao seu painel, sem precisar te passar a senha.
          </p>
          
          <div className="bg-black/30 p-4 rounded-lg border border-white/10 break-all">
            <code className="text-blue-400 text-xs font-mono">{inviteUrl}</code>
          </div>
        </div>
      </Modal>

      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Integrações</h1>
          <p className="text-gray-400">Gerencie suas conexões com plataformas externas</p>
        </div>

        <Card className="bg-white/5 border border-white/10">
          <div className="flex flex-col gap-6">
            {/* Header do Card */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-yellow-400 rounded-lg flex items-center justify-center text-blue-900 font-bold text-xl shadow-lg">
                  ML
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Mercado Livre</h3>
                  <p className="text-sm text-gray-400">
                    Conecte suas contas para sincronizar vendas, anúncios e reclamações.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Tooltip text="Gerar Link para Cliente">
                  <Button
                    variant="secondary"
                    onClick={handleGenerateInvite}
                    disabled={generatingInvite}
                    size="icon"
                    className="w-10 h-10 rounded-lg"
                  >
                    {generatingInvite ? (
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    )}
                  </Button>
                </Tooltip>
                
                <Tooltip text="Conectar Nova Conta">
                  <Button
                    variant="primary"
                    onClick={handleConnect}
                    disabled={connecting}
                    size="icon"
                    className="w-10 h-10 rounded-lg"
                  >
                    {connecting ? (
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                    )}
                  </Button>
                </Tooltip>
              </div>
            </div>

            {/* Lista de Contas */}
            {accounts.length > 0 && (
              <div className="border-t border-white/10 pt-4">
                <h4 className="text-sm font-medium text-gray-400 mb-3">Contas Conectadas</h4>
                <div className="space-y-3">
                  {accounts.map((account) => (
                    <div key={account.ml_user_id} className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5 hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                        <div>
                          <p className="text-white font-medium">
                            {account.nickname || `Conta #${account.ml_user_id}`}
                          </p>
                          <p className="text-xs text-gray-500">
                            ID: {account.ml_user_id}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link href={`/dashboard/reputation?ml_user_id=${account.ml_user_id}`}>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                          >
                            Ver Reputação
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDisconnect(account.ml_user_id)}
                          disabled={disconnecting === account.ml_user_id}
                          className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                        >
                          {disconnecting === account.ml_user_id ? "Desconectando..." : "Desconectar"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {accounts.length === 0 && (
               <div className="border-t border-white/10 pt-4 text-center py-4 text-gray-500 text-sm">
                  Nenhuma conta conectada.
               </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";

type Holiday = {
  id: string;
  date: string;
  name: string;
  is_national: boolean;
  is_active: boolean;
};

const emptyForm = {
  id: "",
  date: "",
  name: "",
  isNational: true,
};

export function CommissionHolidays() {
  const { error, success } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recalculatingDate, setRecalculatingDate] = useState("");

  const fetchHolidays = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/holidays?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar feriados");
      }
      setHolidays(data.holidays || []);
    } catch (caught) {
      error(caught instanceof Error ? caught.message : "Erro ao carregar feriados");
    } finally {
      setLoading(false);
    }
  }, [error, year]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin/holidays", {
        method: form.id ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: form.id || undefined,
          date: form.date,
          name: form.name,
          isNational: form.isNational,
          isActive: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao salvar feriado");
      }
      success(form.id ? "Feriado atualizado" : "Feriado cadastrado");
      setForm(emptyForm);
      await fetchHolidays();
    } catch (caught) {
      error(caught instanceof Error ? caught.message : "Erro ao salvar feriado");
    } finally {
      setSaving(false);
    }
  };

  const deactivateHoliday = async (holiday: Holiday) => {
    const token = localStorage.getItem("token");
    if (!token || !confirm(`Desativar ${holiday.name}?`)) return;

    try {
      const response = await fetch(`/api/admin/holidays?id=${holiday.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao desativar feriado");
      }
      success("Feriado desativado");
      await fetchHolidays();
    } catch (caught) {
      error(
        caught instanceof Error ? caught.message : "Erro ao desativar feriado",
      );
    }
  };

  const recalculateDate = async (date: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setRecalculatingDate(date);
    try {
      const response = await fetch("/api/admin/commissions/recalculate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ startDate: date, endDate: date }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erro ao recalcular comissoes");
      }
      success(`${data.updated} comissoes pendentes recalculadas`);
    } catch (caught) {
      error(
        caught instanceof Error ? caught.message : "Erro ao recalcular comissoes",
      );
    } finally {
      setRecalculatingDate("");
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold">
            {form.id ? "Editar feriado" : "Cadastrar feriado"}
          </h2>
          <p className="text-sm text-gray-400">
            Datas ativas recebem a politica de fins de semana e feriados.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            required
            type="date"
            value={form.date}
            onChange={(event) => setForm({ ...form, date: event.target.value })}
            className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white"
          />
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Nome do feriado"
            className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white md:col-span-2"
          />
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? "Salvando..." : form.id ? "Atualizar" : "Adicionar"}
            </Button>
            {form.id && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setForm(emptyForm)}
              >
                Cancelar
              </Button>
            )}
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={form.isNational}
            onChange={(event) =>
              setForm({ ...form, isNational: event.target.checked })
            }
          />
          Feriado nacional ou data operacional geral
        </label>
      </form>

      <div className="rounded-2xl border border-white/10 bg-white/5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold">Calendario considerado</h2>
            <p className="text-sm text-gray-400">
              {holidays.length} datas cadastradas em {year}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="w-24 rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-white"
            />
            <Button variant="secondary" onClick={fetchHolidays} disabled={loading}>
              {loading ? "Atualizando..." : "Atualizar"}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-white/5 text-left text-gray-300">
              <tr>
                <th className="px-6 py-3">Data</th>
                <th className="px-6 py-3">Nome</th>
                <th className="px-6 py-3">Abrangencia</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {holidays.map((holiday) => {
                const date = holiday.date.slice(0, 10);
                return (
                  <tr key={holiday.id}>
                    <td className="px-6 py-3">
                      {new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-6 py-3 font-medium">{holiday.name}</td>
                    <td className="px-6 py-3 text-gray-300">
                      {holiday.is_national ? "Geral" : "Local"}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={
                          holiday.is_active ? "text-emerald-300" : "text-red-300"
                        }
                      >
                        {holiday.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setForm({
                              id: holiday.id,
                              date,
                              name: holiday.name,
                              isNational: holiday.is_national,
                            })
                          }
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={
                            !holiday.is_active || recalculatingDate === date
                          }
                          onClick={() => recalculateDate(date)}
                        >
                          {recalculatingDate === date
                            ? "Recalculando..."
                            : "Recalcular pendentes"}
                        </Button>
                        {holiday.is_active && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deactivateHoliday(holiday)}
                          >
                            Desativar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && holidays.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                    Nenhum feriado cadastrado neste ano.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

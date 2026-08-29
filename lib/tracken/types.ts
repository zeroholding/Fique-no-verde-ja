/** Tipos compartilhados do modulo Tracken. */

export type TrackenServiceType = "atraso" | "reclamacao" | "cancelado";

export type TrackenStatusRow = {
  code: string;
  label: string;
  tracken_status: string | null;
  color: string;
  sort_order: number;
  is_initial: boolean;
  is_final: boolean;
  counts_as_sla: boolean;
  allowed_next: string[];
  /** Presente somente quando o mapa e lido incluindo desativados. */
  is_active?: boolean;
};

export type TrackenCarrierRow = {
  id: string;
  code: string;
  name: string;
  color: string;
  is_active: boolean;
};

export type TrackenTicketRow = {
  id: string;
  shipment_id: string;
  order_id: string;
  carrier_id: string | null;
  carrier_code: string | null;
  carrier_name: string | null;
  carrier_color: string | null;
  buyer_nickname: string | null;
  buyer_name: string | null;
  seller_name: string;
  seller_ml_id: string | null;
  sale_date: string;
  shipping_deadline: string | null;
  shipped_at: string | null;
  shipping_mode: string | null;
  received_at: string;
  status: string;
  status_label: string | null;
  status_color: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  started_at: string | null;
  finished_at: string | null;
  resolution_note: string | null;
  ml_claim_id: string | null;
  service_type: TrackenServiceType;
  tracking_number: string | null;
  pack_id: string | null;
  delay_reason: string | null;
  requested_by: string | null;
};

export type TrackenTicketEventRow = {
  id: string;
  ticket_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_type: string;
  actor_user_id: string | null;
  actor_name: string | null;
  note: string | null;
  created_at: string;
};

/** Payload de um envio recebido da Tracken. */
export type TrackenIncomingItem = {
  shipment_id: string;
  order_id: string;
  carrier_code: string;
  service_type?: string;
  buyer?: { nickname?: string | null; name?: string | null } | null;
  seller?: { name?: string | null; ml_id?: string | null } | null;
  sale_date: string;
  shipping_deadline?: string | null;
  /** Data real em que o envio foi despachado. */
  shipped_at?: string | null;
  /** Modalidade logistica do ML: self_service = FLEX. */
  shipping_mode?: string | null;
  tracking_number?: string | null;
  pack_id?: string | null;
  delay_reason?: string | null;
  requested_by?: string | null;
  tracken_ref?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type TrackenItemResult = {
  shipment_id: string;
  status: "created" | "duplicated" | "rejected";
  ticket_id?: string;
  ticket_status?: string;
  message?: string;
  code?: string;
};

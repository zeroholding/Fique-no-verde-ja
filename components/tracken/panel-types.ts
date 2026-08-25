/** Tipos consumidos pelos componentes do painel. */

export type PanelStatus = {
  code: string;
  label: string;
  color: string;
  sort_order: number;
  is_initial: boolean;
  is_final: boolean;
  counts_as_sla: boolean;
  allowed_next: string[];
};

export type PanelCarrier = {
  id: string;
  code: string;
  name: string;
  color: string;
  total_tickets: number;
  open_tickets: number;
};

export type PanelTicket = {
  id: string;
  shipment_id: string;
  order_id: string;
  carrier_code: string | null;
  carrier_name: string | null;
  carrier_color: string | null;
  buyer_nickname: string | null;
  buyer_name: string | null;
  seller_name: string;
  sale_date: string;
  shipping_deadline: string | null;
  received_at: string;
  status: string;
  status_label: string | null;
  status_color: string | null;
  service_type: string;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  ml_claim_id: string | null;
};

export type PanelFilterState = {
  startDate: string;
  endDate: string;
  carrier: string;
  status: string;
  deadline: string;
  search: string;
  assignedToMe: boolean;
};

export type SortState = {
  sortBy: string;
  sortDir: "asc" | "desc";
};

export type PanelStats = {
  kpis: {
    total: number;
    today: number;
    byStatus: Array<{
      code: string;
      label: string;
      color: string;
      count: number;
      percentage: number;
    }>;
  };
  charts: {
    byCarrier: Array<{
      code: string;
      name: string;
      color: string;
      count: number;
      percentage: number;
    }>;
    byStatus: Array<{
      code: string;
      label: string;
      color: string;
      count: number;
      percentage: number;
    }>;
    trend: Array<{ date: string; count: number }>;
    sla: {
      percentage: number;
      target: number;
      within: number;
      measured: number;
    };
  };
};

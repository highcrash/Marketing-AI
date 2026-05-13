/**
 * Typed client for the Restora External API (/v1/external/*).
 *
 * Contract: every response is { data: <T>, meta: { branchId, generatedAt, currency, timezone } }.
 * Money fields are integer minor units (paisa for BDT) — read meta.currency
 * before formatting. Branch scoping is bound to the API key; never pass branchId.
 */

export interface ResponseMeta {
  branchId: string;
  generatedAt: string;
  currency: string;
  timezone: string;
}

export interface Envelope<T> {
  data: T;
  meta: ResponseMeta;
}

export interface BusinessProfile {
  id: string;
  name: string;
  legalName: string;
  tradingName: string;
  contact: { address: string; phone: string; email: string | null };
  branding: { logoUrl: string | null; tagline: string | null };
  social: { facebookUrl: string | null; instagramUrl: string | null };
  tax: {
    currency: string;
    rate: number;
    vatEnabled: boolean;
    serviceChargeEnabled: boolean;
    serviceChargeRate: number;
    bin: string | null;
    nbrEnabled: boolean;
  };
  timezone: string;
  currency: string;
  createdAt: string;
}

export interface DailySalesPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface SalesSummary {
  period: string;
  from: string;
  to: string;
  orderCount: number;
  voidedOrders: number;
  totalRevenue: number;
  totalSubtotal: number;
  totalTax: number;
  totalDiscount: number;
  averageOrderValue: number;
  byPaymentMethod: Record<string, number>;
  byOrderType: Record<string, number>;
}

export interface TopItem {
  menuItemId: string;
  name: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface CategoryRevenue {
  categoryId: string;
  name: string;
  revenue: number;
  quantity: number;
}

export interface CustomersOverview {
  total: number;
  activeLast30Days: number;
  activeLast90Days: number;
  withPhone: number;
  lifetimeSpend: number;
  lifetimeOrders: number;
  avgSpendPerCustomer: number;
  avgOrdersPerCustomer: number;
}

export interface CustomerSegmentRow {
  id: string;
  name: string | null;
  phone: string;
  totalSpent: number;
  totalOrders: number;
  lastVisit: string | null;
  loyaltyPoints: number;
}

export interface LoyaltySummary {
  holders: number;
  totalPointsOutstanding: number;
  avgPointsPerHolder: number;
  pointsExpiringNext30Days: number;
  settings: {
    loyaltyEnabled: boolean;
    loyaltyTakaPerPoint: number;
    loyaltyTakaPerPointRedeem: number;
    loyaltyValidityDays: number;
    firstVisitCouponEnabled: boolean;
    firstVisitCouponType: 'PERCENTAGE' | 'FLAT';
    firstVisitCouponValue: number;
    firstVisitCouponValidityDays: number;
  };
}

export interface ReviewSummary {
  count: number;
  averages: {
    food: number;
    service: number;
    atmosphere: number;
    price: number;
    overall: number;
  };
  lastReviewAt: string | null;
}

export interface ExpenseRow {
  id: string;
  category: string;
  description: string;
  amount: string;
  paymentMethod: string;
  reference: string | null;
  date: string;
  notes: string | null;
  recordedBy: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
}

export class RestoraApiError extends Error {
  constructor(public status: number, public path: string, message: string) {
    super(`Restora API ${status} on ${path}: ${message}`);
    this.name = 'RestoraApiError';
  }
}

export class RestoraClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {
    if (!baseUrl) throw new Error('RestoraClient: baseUrl is required');
    if (!apiKey) throw new Error('RestoraClient: apiKey is required');
  }

  private async get<T>(path: string): Promise<Envelope<T>> {
    const url = `${this.baseUrl.replace(/\/$/, '')}${path}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const msg = body.length > 0 ? body.slice(0, 200) : res.statusText;
      throw new RestoraApiError(res.status, path, msg);
    }
    return (await res.json()) as Envelope<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<Envelope<T>> {
    const url = `${this.baseUrl.replace(/\/$/, '')}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const msg = text.length > 0 ? text.slice(0, 300) : res.statusText;
      throw new RestoraApiError(res.status, path, msg);
    }
    return (await res.json()) as Envelope<T>;
  }

  getProfile() {
    return this.get<BusinessProfile>('/business/profile');
  }
  getDailySales(days = 30) {
    return this.get<{ days: number; series: DailySalesPoint[] }>(
      `/business/sales/daily?days=${days}`,
    );
  }
  getSalesSummary(period: 'today' | 'week' | 'month' | 'year' = 'month') {
    return this.get<SalesSummary>(`/business/sales?period=${period}`);
  }
  getTopItems(period: 'today' | 'week' | 'month' | 'year' = 'month', limit = 10) {
    return this.get<{ period: string; limit: number; items: TopItem[] }>(
      `/business/sales/top-items?period=${period}&limit=${limit}`,
    );
  }
  getRevenueByCategory(period: 'today' | 'week' | 'month' | 'year' = 'month') {
    return this.get<{ period: string; categories: CategoryRevenue[] }>(
      `/business/sales/by-category?period=${period}`,
    );
  }
  getPerformance(from?: string, to?: string) {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString();
    return this.get<unknown>(`/business/performance${qs ? `?${qs}` : ''}`);
  }
  getInventory() {
    return this.get<unknown>('/business/inventory');
  }
  getMenu() {
    return this.get<{ items: unknown[] }>('/business/menu');
  }
  getCustomers() {
    return this.get<CustomersOverview>('/business/customers');
  }
  getCustomerSegment(filter: {
    minSpent?: number;
    minVisits?: number;
    maxLastVisitDays?: number;
    minLoyaltyPoints?: number;
  } = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) {
      if (v != null) q.set(k, String(v));
    }
    const qs = q.toString();
    return this.get<{ filter: object; customers: CustomerSegmentRow[] }>(
      `/business/customers/segment${qs ? `?${qs}` : ''}`,
    );
  }
  getLoyaltySummary() {
    return this.get<LoyaltySummary>('/business/loyalty/summary');
  }
  getMarketingCampaigns() {
    return this.get<{ campaigns: unknown[] }>('/business/marketing/campaigns');
  }
  getExpenses(filter: { from?: string; to?: string; category?: string } = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) {
      if (v != null) q.set(k, String(v));
    }
    const qs = q.toString();
    return this.get<{ expenses: ExpenseRow[] }>(
      `/business/finance/expenses${qs ? `?${qs}` : ''}`,
    );
  }
  getReviews() {
    return this.get<ReviewSummary>('/business/reviews');
  }

  /// Send a single SMS via the branch's configured SMS provider.
  /// Returns: { ok, smsLogId, providerRequestId, status, error }.
  sendSms(input: { phone: string; body: string; campaignTag?: string }) {
    return this.post<{
      ok: boolean;
      smsLogId: string;
      providerRequestId: string | null;
      status: string;
      error: string | null;
    }>('/business/sms/send', input);
  }
}

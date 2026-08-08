import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

export const api = {
  // Auth (Telegram Mini App)
  getAuthStatus: async (): Promise<{ telegramAuth: boolean }> => {
    const res = await client.get('/auth/status');
    return res.data;
  },
  telegramAuth: async (initData: string) => {
    const res = await client.post('/auth/telegram', { initData });
    return res.data;
  },

  // Catalog
  getProducts: async (category?: string, search?: string) => {
    const res = await client.get('/products', { params: { category, search } });
    return res.data;
  },
  getProduct: async (idOrSlug: string) => {
    const res = await client.get(`/products/${idOrSlug}`);
    return res.data;
  },
  getCategories: async () => {
    const res = await client.get('/products/categories');
    return res.data;
  },

  // Payments
  getPaymentMode: async (): Promise<{ mode: 'mock' | 'live'; testMode: boolean }> => {
    const res = await client.get('/payments/mode');
    return res.data;
  },
  initializePayment: async (payload: {
    productId: string;
    quantity?: number;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    telegramUserId?: string;
    telegramUsername?: string;
    refCode?: string;
  }) => {
    const res = await client.post('/payments/initialize', payload);
    return res.data;
  },
  initializeCart: async (payload: {
    items: { productId: string; quantity: number }[];
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    telegramUserId?: string;
    telegramUsername?: string;
    refCode?: string;
  }) => {
    const res = await client.post('/payments/initialize-cart', payload);
    return res.data;
  },
  getCartOrders: async (cartRef: string) => {
    const res = await client.get(`/orders/cart/${cartRef}`);
    return res.data;
  },
  verifyPayment: async (txRef: string) => {
    const res = await client.get(`/payments/verify/${txRef}`);
    return res.data;
  },
  mockConfirmOrder: async (orderId: string) => {
    const res = await client.post(`/payments/mock-confirm/${orderId}`);
    return res.data;
  },

  // Orders
  getOrder: async (idOrTxRef: string) => {
    const res = await client.get(`/orders/${idOrTxRef}`);
    return res.data;
  },
  getMyOrders: async (params: { telegramUserId?: string; email?: string; page?: number; limit?: number }) => {
    const res = await client.get('/orders/mine', { params });
    return res.data;
  },

  // Affiliates
  joinAffiliate: async (payload: {
    name: string;
    phone?: string;
    email?: string;
    telegramUserId?: string;
    telegramUsername?: string;
    payoutMethod?: string;
    payoutAccount?: string;
  }) => {
    const res = await client.post('/affiliates/join', payload);
    return res.data;
  },
  getAffiliateStats: async (code: string) => {
    const res = await client.get(`/affiliates/stats/${code}`);
    return res.data;
  },
  trackAffiliateClick: async (code: string) => {
    const res = await client.post(`/affiliates/click/${code}`);
    return res.data;
  },
  getAffiliateShareLink: async (code: string, productId?: string) => {
    const res = await client.get('/affiliates/share-link', { params: { code, productId } });
    return res.data as { link: string };
  },
  requestPayout: async (payload: { code: string; method: string; account: string }) => {
    const res = await client.post('/affiliates/payout', payload);
    return res.data;
  },

  // Home cards (admin-driven hero/promo blocks)
  getHomeCards: async () => {
    const res = await client.get('/home-cards');
    return res.data;
  },
};

import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const TOKEN_KEY = 'kv_admin_token';

export const getAdminToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setAdminToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
};

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the admin session to every request
client.interceptors.request.use((config) => {
  const token = getAdminToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Expired/invalid session → drop it and bounce to the login page
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      setAdminToken(null);
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export const api = {
  // Auth
  adminLogin: async (email: string, password: string) => {
    const res = await client.post('/auth/admin/login', { email, password });
    return res.data as { ok: boolean; token: string; user: { email: string; name?: string } };
  },
  adminMe: async () => {
    const res = await client.get('/auth/admin/me');
    return res.data;
  },
  // Stats & orders
  getAdminStats: async () => {
    const res = await client.get('/orders/admin/stats');
    return res.data;
  },
  getAdminOrders: async (status?: string) => {
    const res = await client.get('/orders/admin/list', { params: { status } });
    return res.data;
  },

  // Products
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
  getTranslationStatus: async () => {
    const res = await client.get('/products/translation/status');
    return res.data;
  },
  translateProduct: async (dto: {
    name: string;
    shortDesc: string;
    description: string;
    features?: string[];
    requirements?: string[];
    activationSteps?: string[];
  }) => {
    const res = await client.post('/products/translate', dto);
    return res.data;
  },
  createCategory: async (name: string, icon: string) => {
    const res = await client.post('/products/categories', { name, icon });
    return res.data;
  },
  createProduct: async (dto: any) => {
    const res = await client.post('/products', dto);
    return res.data;
  },
  updateProduct: async (id: string, dto: any) => {
    const res = await client.put(`/products/${id}`, dto);
    return res.data;
  },
  deleteProduct: async (id: string) => {
    const res = await client.delete(`/products/${id}`);
    return res.data;
  },

  // License key pools
  getProductKeys: async (productId: string) => {
    const res = await client.get(`/licenses/${productId}/keys`);
    return res.data;
  },
  addProductKeys: async (productId: string, keys: string[]) => {
    const res = await client.post(`/licenses/${productId}/keys`, { keys });
    return res.data;
  },

  // Affiliates
  getAdminAffiliates: async () => {
    const res = await client.get('/affiliates/admin/list');
    return res.data;
  },
  getAdminCommissions: async (status?: string) => {
    const res = await client.get('/affiliates/admin/commissions', { params: { status } });
    return res.data;
  },
  payCommission: async (id: string) => {
    const res = await client.post(`/affiliates/admin/commissions/${id}/pay`);
    return res.data;
  },
  cancelCommission: async (id: string) => {
    const res = await client.post(`/affiliates/admin/commissions/${id}/cancel`);
    return res.data;
  },
  updateAffiliate: async (id: string, dto: { status?: string; commissionRate?: number }) => {
    const res = await client.put(`/affiliates/admin/${id}`, dto);
    return res.data;
  },

  // Payment mode
  getPaymentMode: async () => {
    const res = await client.get('/payments/mode');
    return res.data;
  },

  // Settings (pricing engine)
  getSettings: async () => {
    const res = await client.get('/settings');
    return res.data;
  },
  updateSettings: async (dto: { usdToEtb?: number; marginMultiplier?: number; globalDiscountPct?: number }) => {
    const res = await client.put('/settings', dto);
    return res.data;
  },

  // Supplier (HubX)
  getSupplierStatus: async () => {
    const res = await client.get('/supplier/status');
    return res.data;
  },
  getSupplierProducts: async () => {
    const res = await client.get('/supplier/products');
    return res.data;
  },
  importSupplierProduct: async (dto: {
    supplierProductId: string;
    categoryId: string;
    name?: string;
    shortDesc?: string;
    description?: string;
    bannerUrl?: string;
    gallery?: string[];
    marginMultiplier?: number;
    discountPct?: number;
    manualPrice?: number;
    originalPrice?: number;
    badge?: string;
    features?: string[];
    requirements?: string[];
    activationSteps?: string[];
    translations?: any;
  }) => {
    const res = await client.post('/supplier/import', dto);
    return res.data;
  },
  syncSupplierStock: async () => {
    const res = await client.post('/supplier/sync-stock');
    return res.data;
  },

  // Product pricing
  getAdminProducts: async () => {
    const res = await client.get('/products/admin/all');
    return res.data;
  },
  updateProductPricing: async (id: string, dto: any) => {
    const res = await client.put(`/products/${id}/pricing`, dto);
    return res.data;
  },

  // Fulfillment
  retryFulfillment: async (orderId: string) => {
    const res = await client.post(`/payments/admin/retry-fulfillment/${orderId}`);
    return res.data;
  },

  // Home cards (storefront hero/promo blocks)
  getHomeCardsAdmin: async () => {
    const res = await client.get('/home-cards/admin');
    return res.data;
  },
  createHomeCard: async (dto: any) => {
    const res = await client.post('/home-cards', dto);
    return res.data;
  },
  updateHomeCard: async (id: string, dto: any) => {
    const res = await client.put(`/home-cards/${id}`, dto);
    return res.data;
  },
  deleteHomeCard: async (id: string) => {
    const res = await client.delete(`/home-cards/${id}`);
    return res.data;
  },

  // Image upload → Cloudflare R2 → { url, key }
  uploadImage: async (file: File, folder: 'products' | 'cards' = 'products') => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', folder);
    const res = await client.post('/uploads/image', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data as { url: string; key: string };
  },

  // Previous R2 uploads for the library picker
  listUploadedImages: async (folder: 'products' | 'cards' = 'cards') => {
    const res = await client.get('/uploads/images', { params: { folder } });
    return res.data.images as { key: string; url: string; size: number; lastModified: string | null }[];
  },
};

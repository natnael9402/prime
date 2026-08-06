/** Local cart — persists across sessions, syncs badge via custom event. */

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  currency: string;
  bannerUrl: string;
  quantity: number;
  stock: number;
}

const CART_KEY = 'kv_cart';
const CART_EVENT = 'kv_cart_updated';

export function getCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(CART_EVENT));
  } catch {}
}

export function addToCart(product: {
  id: string;
  name: string;
  price: number;
  currency: string;
  bannerUrl: string;
  stock: number;
}, quantity = 1): CartItem[] {
  const items = getCart();
  const existing = items.find((i) => i.productId === product.id);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + quantity, 50, product.stock > 0 ? product.stock : 50);
  } else {
    items.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      currency: product.currency,
      bannerUrl: product.bannerUrl,
      quantity: Math.min(quantity, 50),
      stock: product.stock,
    });
  }
  saveCart(items);
  return items;
}

export function setCartQuantity(productId: string, quantity: number): CartItem[] {
  let items = getCart();
  if (quantity <= 0) {
    items = items.filter((i) => i.productId !== productId);
  } else {
    const item = items.find((i) => i.productId === productId);
    if (item) item.quantity = Math.min(quantity, 50);
  }
  saveCart(items);
  return items;
}

export function removeFromCart(productId: string): CartItem[] {
  const items = getCart().filter((i) => i.productId !== productId);
  saveCart(items);
  return items;
}

export function clearCart() {
  saveCart([]);
}

export function cartCount(): number {
  return getCart().reduce((s, i) => s + i.quantity, 0);
}

export function cartTotal(): number {
  return getCart().reduce((s, i) => s + i.price * i.quantity, 0);
}

export function onCartChange(handler: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CART_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CART_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

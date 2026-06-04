import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Building2,
  ClipboardList,
  FileDown,
  FileText,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Printer,
  Search,
  Tags,
  Trash2,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { supabase } from './lib/supabase';

const SYSTEM_NAME = '奥印ERP管理系统';
const SYSTEM_SUBTITLE = '企业进销存与仓储管理平台';
const APP_VERSION = __APP_VERSION__;
const BUILD_TIME = __BUILD_TIME__;

const emptyProduct = {
  name: '',
  sku: '',
  category_id: '',
  category_name: '',
  quantity: 0,
  unit: '个',
  cost_price: 0,
  sell_price: 0,
  warning_qty: 0,
};

const emptyCategory = {
  name: '',
  remark: '',
};

const productUnitOptions = ['KG', '桶', '条', '个'];

const emptyPartner = {
  name: '',
  contact: '',
  phone: '',
  address: '',
  remark: '',
};

const emptyCompanyProfile = {
  company_name: '',
  company_address: '',
  contact_phone: '',
  email: '',
  logo_url: '',
  remark: '',
  is_active: true,
};

const stockTypeLabels = {
  purchase_in: '采购入库',
  purchase_return: '采购退货',
  sale_out: '销售出库',
  sale_return: '销售退货',
  adjustment: '库存调整',
  system_delete: '系统删除',
};

const stockTypeTones = {
  purchase_in: 'bg-emerald-50 text-emerald-700',
  purchase_return: 'bg-orange-50 text-orange-700',
  sale_out: 'bg-sky-50 text-sky-700',
  sale_return: 'bg-violet-50 text-violet-700',
  adjustment: 'bg-slate-100 text-slate-700',
  system_delete: 'bg-rose-50 text-rose-700',
};

const deliveryOrderTypeLabels = {
  sale_out: '销售出库',
  sale_return: '销售退货',
};

const roleLabels = {
  admin: '管理员',
  warehouse: '仓管员',
  sales: '销售员',
  viewer: '查看员',
};

const menuPermissions = {
  admin: ['dashboard', 'categories', 'products', 'customers', 'suppliers', 'company', 'users', 'purchase', 'sales', 'inventory'],
  warehouse: ['dashboard', 'categories', 'products', 'purchase', 'sales', 'inventory'],
  sales: ['dashboard', 'categories', 'products', 'customers', 'sales'],
  viewer: ['dashboard', 'categories', 'products', 'customers', 'suppliers', 'sales', 'inventory'],
};

const actionPermissions = {
  manageUsers: ['admin'],
  manageCompany: ['admin'],
  manageCategories: ['admin'],
  mutateProducts: ['admin'],
  deleteProducts: ['admin'],
  mutateCustomers: ['admin', 'sales'],
  deleteCustomers: ['admin'],
  mutateSuppliers: ['admin'],
  deleteSuppliers: ['admin'],
  purchaseStock: ['admin', 'warehouse'],
  salesStock: ['admin', 'warehouse'],
  mutateDelivery: ['admin', 'warehouse', 'sales'],
  deleteDelivery: ['admin'],
  adjustStock: ['admin', 'warehouse'],
  deleteStockLogs: ['admin'],
};

function can(user, action) {
  return actionPermissions[action]?.includes(user?.role);
}

function canAccess(user, tabId) {
  return menuPermissions[user?.role]?.includes(tabId) || false;
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    real_name: user.real_name,
    role: user.role,
    status: user.status,
  };
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN');
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function todayIsoStart() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function calculateLineAmount(item) {
  return Number(item?.quantity || 0) * Number(item?.price || 0);
}

function splitAmountCells(value) {
  const fixed = Math.abs(Number(value || 0)).toFixed(2);
  const [integerPart, decimalPart] = fixed.split('.');
  const integerDigits = integerPart.padStart(6, ' ').slice(-6).split('');
  return [...integerDigits, decimalPart[0], decimalPart[1]].map((digit) => (digit === ' ' ? '' : digit));
}

function compactTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function parseLogRemark(remark = '') {
  const text = String(remark || '');
  const read = (label) => {
    const match = text.match(new RegExp(`${label}[：:]\\s*([^；;]+)`));
    return match?.[1]?.trim() || '';
  };
  const priceText = read('单价');
  return {
    customer: read('客户'),
    supplier: read('供应商'),
    price: priceText ? Number(priceText.replace(/[^\d.-]/g, '')) : 0,
  };
}

const PRINT_SETTINGS_KEY = 'erpPrintSettings';
const LEGACY_PRINT_SETTINGS_KEY = 'deliveryPrintSettings';
const printLogoSizes = {
  small: 110,
  medium: 150,
  large: 190,
};
const defaultPrintSettings = {
  paperType: 'a4',
  orientation: 'portrait',
  showLogo: true,
  logoSize: 'medium',
  showAmountGrid: true,
  hideAmounts: false,
  showQrCode: false,
};

function normalizePrintSettings(settings = {}) {
  const next = { ...defaultPrintSettings, ...settings };
  if (!['a4', 'two-part', 'triple'].includes(next.paperType)) next.paperType = defaultPrintSettings.paperType;
  if (!['portrait', 'landscape'].includes(next.orientation)) next.orientation = defaultPrintSettings.orientation;
  if (typeof next.logoSize === 'number') {
    if (next.logoSize <= 120) next.logoSize = 'small';
    else if (next.logoSize >= 180) next.logoSize = 'large';
    else next.logoSize = 'medium';
  }
  if (!Object.hasOwn(printLogoSizes, next.logoSize)) next.logoSize = defaultPrintSettings.logoSize;
  next.showLogo = Boolean(next.showLogo);
  next.showAmountGrid = next.showAmountGrid !== false;
  next.hideAmounts = Boolean(next.hideAmounts);
  next.showQrCode = Boolean(next.showQrCode);
  return next;
}

function loadPrintSettings() {
  try {
    const raw = localStorage.getItem(PRINT_SETTINGS_KEY) || localStorage.getItem(LEGACY_PRINT_SETTINGS_KEY) || '{}';
    return normalizePrintSettings(JSON.parse(raw));
  } catch {
    return defaultPrintSettings;
  }
}

function savePrintSettings(settings) {
  const normalized = normalizePrintSettings(settings);
  localStorage.setItem(PRINT_SETTINGS_KEY, JSON.stringify(normalized));
  localStorage.setItem(LEGACY_PRINT_SETTINGS_KEY, JSON.stringify(normalized));
}

function getLogoWidth(settings) {
  return printLogoSizes[normalizePrintSettings(settings).logoSize];
}

function getPrintClass(settings) {
  const normalized = normalizePrintSettings(settings);
  return `delivery-print print-page paper-${normalized.paperType} print-${normalized.orientation}${normalized.hideAmounts ? ' print-hide-amounts' : ''}`;
}

function getPdfOrientation(settings) {
  const normalized = normalizePrintSettings(settings);
  if (normalized.paperType === 'two-part') return 'p';
  return normalized.orientation === 'landscape' ? 'l' : 'p';
}

function getPdfFormat(settings) {
  return normalizePrintSettings(settings).paperType === 'triple' ? [241, 279] : 'a4';
}

function getPrintCopyCount(settings) {
  const paperType = normalizePrintSettings(settings).paperType;
  if (paperType === 'two-part') return 2;
  if (paperType === 'triple') return 3;
  return 1;
}

function syncPrintCopies(printRef, settings) {
  const root = printRef.current;
  if (!root) return;
  root.querySelectorAll('.delivery-copy-clone, .delivery-copy-separator').forEach((node) => node.remove());
  const source = root.querySelector('.delivery-copy-source');
  if (!source) return;
  const copyCount = getPrintCopyCount(settings);
  for (let index = 1; index < copyCount; index += 1) {
    const clone = source.cloneNode(true);
    clone.classList.remove('delivery-copy-source');
    clone.classList.add('delivery-copy-clone');
    root.appendChild(clone);
  }
}

async function generateQrCodeDataUrl(content) {
  const QRCode = await import('qrcode');
  return QRCode.toDataURL(String(content || ''), {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 120,
  });
}

function buildDeliveryQrContent(order) {
  return JSON.stringify({
    type: 'delivery_order',
    order_no: order.order_no,
    date: order.delivery_date,
  });
}

function buildStockDocumentQrContent(title, type) {
  return JSON.stringify({
    type: 'stock_document',
    title,
    stock_type: type,
    date: todayDate(),
  });
}

function buildStockLogQrContent(log) {
  return JSON.stringify({
    type: 'stock_log',
    id: log.id,
    stock_type: log.type,
    product_sku: log.products?.sku || '',
    created_at: log.created_at,
  });
}

function logSupabaseDeleteError(error, productId, context) {
  console.error('商品删除失败', {
    context,
    productId,
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    status: error?.status,
    supabaseError: error,
  });
}

function isForeignKeyError(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return text.includes('23503') || text.includes('foreign key') || text.includes('violates foreign key constraint');
}

function matchesQuery(row, query, fields) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;
  return fields.some((field) => String(row[field] || '').toLowerCase().includes(keyword));
}

function normalizeVisibleOrders(orders = []) {
  return orders
    .filter((order) => order.status !== 'deleted' && !order.deleted_at && !order.is_deleted)
    .map((order) => ({
      ...order,
      delivery_order_items: (order.delivery_order_items || []).filter((item) => !item.is_deleted && !item.deleted_at),
    }));
}

function nextSkuPreview(products) {
  const maxSkuNumber = products.reduce((max, product) => {
    const match = String(product.sku || '').match(/^P(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `P${String(maxSkuNumber + 1).padStart(4, '0')}`;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const autoLogin = localStorage.getItem('autoLogin') === 'true';
      const sessionUser = sessionStorage.getItem('currentUser');
      const storedUser = autoLogin ? null : sessionUser;

      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          if (user?.status === 'active' && !cancelled) {
            setCurrentUser(user);
            setLoadingSession(false);
            return;
          }
        } catch {
          localStorage.removeItem('currentUser');
          sessionStorage.removeItem('currentUser');
        }
      }

      if (autoLogin) {
        const savedUsername = localStorage.getItem('savedUsername') || '';
        const savedPassword = localStorage.getItem('savedPassword') || '';
        if (savedUsername && savedPassword) {
          const { data } = await supabase
            .from('app_users')
            .select('id, username, password, real_name, role, status')
            .eq('username', savedUsername)
            .eq('password', savedPassword)
            .maybeSingle();

          if (data?.status === 'active' && !cancelled) {
            const safeUser = sanitizeUser(data);
            localStorage.setItem('currentUser', JSON.stringify(safeUser));
            setCurrentUser(safeUser);
            setLoadingSession(false);
            return;
          }

          localStorage.removeItem('currentUser');
          localStorage.setItem('autoLogin', 'false');
        }
      }

      if (!cancelled) setLoadingSession(false);
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadingSession) return <FullScreenMessage text="正在载入系统..." />;
  return currentUser ? (
    <ErpApp
      currentUser={currentUser}
      onLogout={() => {
        localStorage.removeItem('currentUser');
        sessionStorage.removeItem('currentUser');
        localStorage.setItem('autoLogin', 'false');
        setCurrentUser(null);
      }}
    />
  ) : (
    <LoginPage
      onLogin={(user, options) => {
        const safeUser = sanitizeUser(user);
        if (options?.autoLogin) {
          localStorage.setItem('currentUser', JSON.stringify(safeUser));
          sessionStorage.removeItem('currentUser');
        } else {
          sessionStorage.setItem('currentUser', JSON.stringify(safeUser));
          localStorage.removeItem('currentUser');
        }
        setCurrentUser(safeUser);
      }}
    />
  );
}

function FullScreenMessage({ text }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="rounded-lg border border-slate-200 bg-white px-6 py-4 text-slate-600 shadow-sm">
        {text}
      </div>
    </main>
  );
}

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberPassword, setRememberPassword] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedRemember = localStorage.getItem('rememberPassword') === 'true';
    const savedAutoLogin = localStorage.getItem('autoLogin') === 'true';
    const savedUsername = localStorage.getItem('savedUsername') || '';
    const savedPassword = localStorage.getItem('savedPassword') || '';
    setRememberPassword(savedRemember);
    setAutoLogin(savedAutoLogin);
    if (savedRemember || savedAutoLogin) {
      setUsername(savedUsername);
      setPassword(savedPassword);
    }
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    const { data, error } = await supabase
      .from('app_users')
      .select('id, username, password, real_name, role, status')
      .eq('username', username.trim())
      .eq('password', password)
      .maybeSingle();

    if (error || !data || data.status !== 'active') {
      setMessage('账号或密码错误');
      setLoading(false);
      return;
    }

    const shouldSavePassword = rememberPassword || autoLogin;
    localStorage.setItem('rememberPassword', rememberPassword ? 'true' : 'false');
    localStorage.setItem('autoLogin', autoLogin ? 'true' : 'false');
    if (shouldSavePassword) {
      localStorage.setItem('savedUsername', username.trim());
      localStorage.setItem('savedPassword', password);
    } else {
      localStorage.removeItem('savedUsername');
      localStorage.removeItem('savedPassword');
    }

    onLogin(data, { autoLogin });
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-8">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Boxes size={26} />
          </div>
          <h1 className="text-2xl font-semibold text-slate-950">{SYSTEM_NAME}</h1>
          <p className="mt-2 text-sm text-slate-500">{SYSTEM_SUBTITLE}</p>
        </div>

        <form className="space-y-4" onSubmit={handleLogin}>
          <Field label="账号">
            <input
              className="input"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
              placeholder="admin"
            />
          </Field>
          <Field label="密码">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                checked={rememberPassword}
                onChange={(event) => setRememberPassword(event.target.checked)}
              />
              <span>记住密码</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                checked={autoLogin}
                onChange={(event) => {
                  setAutoLogin(event.target.checked);
                  if (event.target.checked) setRememberPassword(true);
                }}
              />
              <span>自动登录</span>
            </label>
          </div>
          {message && <AlertMessage type="error" text={message} />}
          <button className="btn-primary w-full" type="submit" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </section>
    </main>
  );
}

function ErpApp({ currentUser, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [companyProfiles, setCompanyProfiles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [categoryModal, setCategoryModal] = useState(null);
  const [productModal, setProductModal] = useState(null);
  const [partnerModal, setPartnerModal] = useState(null);
  const [companyModal, setCompanyModal] = useState(null);
  const [userModal, setUserModal] = useState(null);
  const [deliveryModal, setDeliveryModal] = useState(null);
  const [printOrder, setPrintOrder] = useState(null);
  const [printStockDocument, setPrintStockDocument] = useState(null);

  const operator = currentUser.real_name || currentUser.username || '系统用户';

  async function loadData() {
    setLoading(true);
    const [
      productsResult,
      categoriesResult,
      customersResult,
      suppliersResult,
      logsResult,
      ordersResult,
      companyProfilesResult,
      usersResult,
    ] = await Promise.all([
      supabase.from('products').select('*').eq('is_deleted', false).order('created_at', { ascending: false }),
      supabase.from('product_categories').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').order('created_at', { ascending: false }),
      supabase
        .from('stock_logs')
        .select('*, products(name, sku, unit, category_id, category_name)')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase
        .from('delivery_orders')
        .select('*, delivery_order_items(*)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('company_profile')
        .select('*')
        .order('is_active', { ascending: false })
        .order('updated_at', { ascending: false }),
      can(currentUser, 'manageUsers')
        ? supabase.from('app_users').select('id, username, real_name, role, status, created_at, updated_at').order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    const error =
      productsResult.error ||
      categoriesResult.error ||
      customersResult.error ||
      suppliersResult.error ||
      logsResult.error ||
      ordersResult.error ||
      companyProfilesResult.error ||
      usersResult.error;

    if (error) {
      setToast({ type: 'error', text: error.message });
    } else {
      setProducts(productsResult.data || []);
      setCategories(categoriesResult.data || []);
      setCustomers(customersResult.data || []);
      setSuppliers(suppliersResult.data || []);
      setLogs(logsResult.data || []);
      setOrders(normalizeVisibleOrders(ordersResult.data || []));
      setCompanyProfiles(companyProfilesResult.data || []);
      setUsers(usersResult.data || []);
    }
    setLoading(false);
  }

  async function refreshDeliveryOrders({ showSuccess = false } = {}) {
    const { data, error } = await supabase
      .from('delivery_orders')
      .select('*, delivery_order_items(*)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      setToast({ type: 'error', text: error.message });
      return false;
    }

    setOrders(normalizeVisibleOrders(data || []));
    if (showSuccess) setToast({ type: 'success', text: '送货管理列表已刷新。' });
    return true;
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAction(action, successText) {
    try {
      await action();
      setToast({ type: 'success', text: successText });
      await loadData();
      return true;
    } catch (error) {
      setToast({ type: 'error', text: error.message });
      return false;
    }
  }

  async function saveProduct(product) {
    const category = categories.find((item) => String(item.id) === String(product.category_id));
    const payload = {
      name: product.name.trim(),
      category_id: category ? category.id : null,
      category_name: category ? category.name : null,
      quantity: Number(product.quantity || 0),
      unit: product.unit.trim(),
      cost_price: Number(product.cost_price || 0),
      sell_price: Number(product.sell_price || 0),
      warning_qty: Number(product.warning_qty || 0),
    };

    if (!payload.name) throw new Error('请填写商品名称。');
    if (!payload.unit) throw new Error('请选择单位');

    if (!category) throw new Error('请选择商品类型');

    const request = product.id
      ? supabase.from('products').update(payload).eq('id', product.id)
      : supabase.from('products').insert(payload);
    const { error } = await request;
    if (error) throw error;
  }

  async function saveCategory(category) {
    const payload = {
      name: category.name.trim(),
      remark: category.remark?.trim() || null,
    };
    if (!payload.name) throw new Error('请填写商品类型名称');

    const request = category.id
      ? supabase.from('product_categories').update(payload).eq('id', category.id)
      : supabase.from('product_categories').insert(payload);
    const { error } = await request;
    if (error) throw error;

    if (category.id) {
      const { error: syncError } = await supabase
        .from('products')
        .update({ category_name: payload.name })
        .eq('category_id', category.id);
      if (syncError) throw syncError;
    }
  }

  async function deleteCategory(category) {
    if (!window.confirm(`确认删除商品类型「${category.name}」吗？已归属该类型的商品会变为未分类。`)) return;
    await runAction(async () => {
      const { error: productError } = await supabase
        .from('products')
        .update({ category_id: null, category_name: '未分类' })
        .eq('category_id', category.id);
      if (productError) throw productError;

      const { error } = await supabase.from('product_categories').delete().eq('id', category.id);
      if (error) throw error;
    }, '商品类型已删除，相关商品已设为未分类。');
  }

  async function deleteProduct(product) {
    try {
      const [{ count: stockCount, error: stockError }, { count: deliveryCount, error: deliveryError }] = await Promise.all([
        supabase.from('stock_logs').select('id', { count: 'exact', head: true }).eq('product_id', product.id),
        supabase.from('delivery_order_items').select('id', { count: 'exact', head: true }).eq('product_id', product.id),
      ]);
      if (stockError || deliveryError) {
        const error = stockError || deliveryError;
        logSupabaseDeleteError(error, product.id, '检查商品业务引用');
        throw error;
      }

      const hasBusinessRecords = Number(stockCount || 0) > 0 || Number(deliveryCount || 0) > 0;
      if (hasBusinessRecords) {
        const ok = window.confirm('该商品已有库存流水或单据记录，将进行安全删除，历史记录仍会保留，是否继续？');
        if (!ok) return;
        const { error } = await supabase
          .from('products')
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq('id', product.id);
        if (error) {
          logSupabaseDeleteError(error, product.id, '安全删除商品');
          throw error;
        }
        setToast({ type: 'success', text: '商品已安全删除，历史记录仍会保留。' });
        await loadData();
        return;
      }

      if (!window.confirm(`确认删除商品「${product.name}」吗？`)) return;
      const { error } = await supabase.from('products').delete().eq('id', product.id);
      if (error) {
        logSupabaseDeleteError(error, product.id, '物理删除商品');
        if (isForeignKeyError(error)) {
          const ok = window.confirm('该商品已有库存流水或单据记录，将进行安全删除，历史记录仍会保留，是否继续？');
          if (!ok) return;
          const { error: safeDeleteError } = await supabase
            .from('products')
            .update({ is_deleted: true, deleted_at: new Date().toISOString() })
            .eq('id', product.id);
          if (safeDeleteError) {
            logSupabaseDeleteError(safeDeleteError, product.id, '物理删除失败后转安全删除');
            throw safeDeleteError;
          }
          setToast({ type: 'success', text: '商品已安全删除，历史记录仍会保留。' });
          await loadData();
          return;
        }
        throw error;
      }
      setToast({ type: 'success', text: '商品已删除。' });
      await loadData();
    } catch (error) {
      logSupabaseDeleteError(error, product.id, '删除商品总流程');
      setToast({ type: 'error', text: error.message });
    }
  }

  async function savePartner(type, partner) {
    const table = type === 'customers' ? 'customers' : 'suppliers';
    const payload = {
      name: partner.name.trim(),
      contact: partner.contact?.trim() || null,
      phone: partner.phone?.trim() || null,
      address: partner.address?.trim() || null,
      remark: partner.remark?.trim() || null,
    };
    if (!payload.name) throw new Error('请填写名称。');

    const request = partner.id
      ? supabase.from(table).update(payload).eq('id', partner.id)
      : supabase.from(table).insert(payload);
    const { error } = await request;
    if (error) throw error;
  }

  async function deletePartner(type, partner) {
    const table = type === 'customers' ? 'customers' : 'suppliers';
    const label = type === 'customers' ? '客户' : '供应商';
    if (!window.confirm(`确认删除${label}「${partner.name}」吗？`)) return;
    await runAction(async () => {
      const { error } = await supabase.from(table).delete().eq('id', partner.id);
      if (error) throw error;
    }, `${label}已删除。`);
  }

  async function uploadCompanyLogo(file) {
    if (!file) return '';
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Logo 仅支持 jpg、png、webp 格式。');
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
    const filePath = `logos/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('company-assets')
      .upload(filePath, file, { cacheControl: '3600', upsert: false });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('company-assets').getPublicUrl(filePath);
    return data.publicUrl;
  }

  async function saveCompanyProfile(profile) {
    const payload = {
      company_name: profile.company_name.trim(),
      company_address: profile.company_address?.trim() || null,
      contact_phone: profile.contact_phone?.trim() || null,
      email: profile.email?.trim() || null,
      logo_url: profile.logo_url || null,
      remark: profile.remark?.trim() || null,
      is_active: Boolean(profile.is_active),
    };

    if (!payload.company_name) throw new Error('请填写公司名称。');

    const request = profile.id
      ? supabase.from('company_profile').update(payload).eq('id', profile.id)
      : supabase.from('company_profile').insert(payload);
    const { error } = await request;
    if (error) throw error;
  }

  async function deleteCompanyProfile(profile) {
    if (!window.confirm(`确认删除公司资料「${profile.company_name}」吗？`)) return;
    await runAction(async () => {
      const { error } = await supabase.from('company_profile').delete().eq('id', profile.id);
      if (error) throw error;
    }, '公司资料已删除。');
  }

  async function activateCompanyProfile(profile) {
    await runAction(async () => {
      const { error } = await supabase
        .from('company_profile')
        .update({ is_active: true })
        .eq('id', profile.id);
      if (error) throw error;
    }, '当前启用公司资料已更新。');
  }

  async function saveUser(user) {
    const payload = {
      username: user.username.trim(),
      real_name: user.real_name?.trim() || null,
      role: user.role,
      status: user.status || 'active',
    };
    if (!payload.username) throw new Error('请填写用户名。');
    if (!['admin', 'warehouse', 'sales', 'viewer'].includes(payload.role)) throw new Error('请选择用户角色。');

    if (user.password) payload.password = user.password;
    if (!user.id && !payload.password) throw new Error('请填写初始密码。');

    const request = user.id
      ? supabase.from('app_users').update(payload).eq('id', user.id)
      : supabase.from('app_users').insert(payload);
    const { error } = await request;
    if (error) throw error;
  }

  async function deleteUser(user) {
    if (user.id === currentUser.id) {
      setToast({ type: 'error', text: '不能删除当前登录账号。' });
      return;
    }
    if (!window.confirm(`确认删除用户「${user.username}」吗？`)) return;
    await runAction(async () => {
      const { error } = await supabase.from('app_users').delete().eq('id', user.id);
      if (error) throw error;
    }, '用户已删除。');
  }

  async function toggleUserStatus(user) {
    if (user.id === currentUser.id) {
      setToast({ type: 'error', text: '不能禁用当前登录账号。' });
      return;
    }
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    await runAction(async () => {
      const { error } = await supabase.from('app_users').update({ status: nextStatus }).eq('id', user.id);
      if (error) throw error;
    }, nextStatus === 'active' ? '用户已启用。' : '用户已禁用。');
  }

  async function moveStock({ productId, type, quantity, operatorRemark, stockDate }) {
    const { error } = await supabase.rpc('move_stock', {
      p_product_id: productId,
      p_type: type,
      p_quantity: Number(quantity),
      p_operator: operator,
      p_remark: operatorRemark || null,
      p_stock_date: stockDate || null,
    });
    if (error) throw error;
  }

  async function getNextDeliveryOrderNo() {
    const { data, error } = await supabase.rpc('next_delivery_order_no');
    if (error) throw error;
    return data;
  }

  async function deleteStockLog(log) {
    if (!can(currentUser, 'deleteStockLogs')) {
      setToast({ type: 'error', text: '权限不足，只有管理员才能删除库存流水' });
      return;
    }
    if (!window.confirm('确认删除该库存流水吗？删除后会写入审计记录，便于后续追溯。')) return;
    await runAction(async () => {
      const { error } = await supabase.rpc('delete_stock_log', {
        p_log_id: log.id,
        p_username: currentUser.username,
      });
      if (error) throw error;
    }, '库存流水已删除，操作已记录。');
  }

  async function saveDeliveryOrder(order) {
    if (!order.customer_id) throw new Error('请选择客户。');
    if (!order.items.length) throw new Error('请至少添加一条商品明细。');

    const customer = customers.find((item) => item.id === order.customer_id);
    const cleanItems = order.items.map((item) => {
      if (!item.product_id || !item.quantity) throw new Error('请完整填写商品明细。');
      const product = products.find((row) => String(row.id) === String(item.product_id));
      const quantity = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      if (!product) throw new Error('商品不存在，请重新选择。');
      if (quantity <= 0) throw new Error('商品数量必须大于 0。');
      return {
        product_id: item.product_id,
        product_name: product.name || item.product_name || '',
        sku: product.sku || item.product_sku || '',
        unit: product.unit || item.unit || '',
        quantity,
        price,
        amount: quantity * price,
        remark: item.remark || null,
      };
    });

    const { error } = await supabase.rpc('create_delivery_order_transaction', {
      p_order_type: order.order_type || 'sale_out',
      p_customer_id: order.customer_id,
      p_customer_name: customer?.name || order.customer_name || '',
      p_order_no: order.id ? order.order_no : null,
      p_delivery_date: order.delivery_date,
      p_operator: order.operator || operator,
      p_remark: order.remark || null,
      p_items: cleanItems,
      p_order_id: order.id || null,
    });
    if (error) throw error;
  }

  async function deleteDeliveryOrder(order) {
    if (!window.confirm(`确认删除单据「${order.order_no}」吗？删除后会自动恢复库存并记录系统删除流水。`)) return;
    await runAction(async () => {
      const { error } = await supabase.rpc('delete_delivery_order_transaction', {
        p_order_id: order.id,
        p_operator: operator,
      });
      if (error) throw error;
    }, '单据已删除，库存已恢复。');
  }

  async function createDeliveryDraft(orderType = 'sale_out') {
    let orderNo = '';
    try {
      orderNo = await getNextDeliveryOrderNo();
    } catch (error) {
      setToast({ type: 'error', text: error.message });
      return;
    }
    setDeliveryModal({
      order_no: orderNo,
      customer_id: '',
      customer_name: '',
      delivery_date: todayDate(),
      order_type: orderType,
      status: 'saved',
      operator,
      remark: '',
      items: [emptyDeliveryItem()],
    });
  }

  const navItems = [
    { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
    { id: 'categories', label: '商品类型', icon: Tags },
    { id: 'products', label: '商品管理', icon: Boxes },
    { id: 'customers', label: '客户管理', icon: Users },
    { id: 'suppliers', label: '供应商管理', icon: Building2 },
    { id: 'company', label: '公司资料', icon: Building2 },
    { id: 'users', label: '用户管理', icon: Users },
    { id: 'purchase', label: '采购管理', icon: PackagePlus },
    { id: 'sales', label: '送货管理', icon: Truck },
    { id: 'inventory', label: '库存流水', icon: ClipboardList },
  ];

  const navOrder = ['dashboard', 'purchase', 'sales', 'inventory', 'products', 'categories', 'customers', 'suppliers', 'company', 'users'];
  const stats = useMemo(() => buildStats(products, logs), [products, logs]);
  const activeCompanyProfile = companyProfiles.find((profile) => profile.is_active) || null;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Boxes size={22} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-950">{SYSTEM_NAME}</h1>
              <p className="text-xs text-slate-500">{operator}</p>
              <p className="text-xs text-slate-400">版本：v{APP_VERSION} / 构建时间：{BUILD_TIME}</p>
            </div>
          </div>
          <button className="btn-secondary w-full sm:w-auto" onClick={onLogout}>
            <LogOut size={16} />
            退出登录
          </button>
        </div>
      </header>

      {toast && (
        <div className="fixed right-4 top-20 z-50 w-[calc(100%-2rem)] max-w-sm print:hidden">
          <AlertMessage type={toast.type} text={toast.text} onClose={() => setToast(null)} />
        </div>
      )}

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:h-[calc(100vh-96px)] lg:grid-cols-[220px_1fr] lg:overflow-hidden print:block print:max-w-none print:p-0">
        <nav className="flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 lg:sticky lg:top-4 lg:block lg:h-full lg:space-y-2 lg:overflow-y-auto print:hidden">
          <div className="hidden items-center gap-2 border-b border-slate-100 px-2 pb-3 mb-2 lg:flex">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Boxes size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{SYSTEM_NAME}</p>
              <p className="truncate text-xs text-slate-500">{SYSTEM_SUBTITLE}</p>
              <p className="truncate text-[11px] text-slate-400">v{APP_VERSION} · {BUILD_TIME}</p>
            </div>
          </div>
          {navItems
            .filter((item) => canAccess(currentUser, item.id))
            .sort((a, b) => navOrder.indexOf(a.id) - navOrder.indexOf(b.id))
            .map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-button ${activeTab === item.id ? 'nav-button-active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <section className="min-w-0 lg:h-full lg:overflow-y-auto lg:pr-1 print:hidden">
          {!canAccess(currentUser, activeTab) && <NoPermission />}
          {activeTab === 'dashboard' && <Dashboard stats={stats} products={products} logs={logs} loading={loading} />}
          {activeTab === 'categories' && (
            <ProductCategoriesView
              categories={categories}
              canMutate={can(currentUser, 'manageCategories')}
              onAdd={() => setCategoryModal({ ...emptyCategory })}
              onEdit={(category) => setCategoryModal(category)}
              onDelete={deleteCategory}
            />
          )}
          {activeTab === 'products' && (
            <ProductsView
              products={products}
              categories={categories}
              loading={loading}
              canMutate={can(currentUser, 'mutateProducts')}
              canDelete={can(currentUser, 'deleteProducts')}
              onAdd={() => setProductModal({ ...emptyProduct, sku: nextSkuPreview(products), isSkuPreview: true })}
              onEdit={(product) => setProductModal(product)}
              onDelete={deleteProduct}
            />
          )}
          {activeTab === 'customers' && (
            <PartnersView
              title="客户管理"
              type="customers"
              rows={customers}
              canMutate={can(currentUser, 'mutateCustomers')}
              canDelete={can(currentUser, 'deleteCustomers')}
              onAdd={() => setPartnerModal({ type: 'customers', data: { ...emptyPartner } })}
              onEdit={(data) => setPartnerModal({ type: 'customers', data })}
              onDelete={(data) => deletePartner('customers', data)}
            />
          )}
          {activeTab === 'suppliers' && (
            <PartnersView
              title="供应商管理"
              type="suppliers"
              rows={suppliers}
              canMutate={can(currentUser, 'mutateSuppliers')}
              canDelete={can(currentUser, 'deleteSuppliers')}
              onAdd={() => setPartnerModal({ type: 'suppliers', data: { ...emptyPartner } })}
              onEdit={(data) => setPartnerModal({ type: 'suppliers', data })}
              onDelete={(data) => deletePartner('suppliers', data)}
            />
          )}
          {activeTab === 'company' && (
            <CompanyProfilesView
              profiles={companyProfiles}
              activeProfile={activeCompanyProfile}
              canMutate={can(currentUser, 'manageCompany')}
              onAdd={() => setCompanyModal({ ...emptyCompanyProfile })}
              onEdit={(profile) => setCompanyModal(profile)}
              onDelete={deleteCompanyProfile}
              onActivate={activateCompanyProfile}
            />
          )}
          {activeTab === 'purchase' && (
            <PurchaseSalesView
              mode="purchase"
              partners={suppliers}
              products={products}
              categories={categories}
              logs={logs}
              canSubmit={can(currentUser, 'purchaseStock')}
              onPrint={(document) => setPrintStockDocument(document)}
              onSubmit={(payload) => runAction(() => moveStock(payload), '库存已更新，采购流水已写入。')}
            />
          )}
          {activeTab === 'sales' && (
            <DeliveryManagementView
              orders={orders}
              customers={customers}
              products={products}
              categories={categories}
              canMutate={can(currentUser, 'mutateDelivery')}
              canDelete={can(currentUser, 'deleteDelivery')}
              onCreate={createDeliveryDraft}
              onEdit={(order) => setDeliveryModal(normalizeOrderForEdit(order))}
              onDelete={deleteDeliveryOrder}
              onPrint={setPrintOrder}
              onRefresh={() => refreshDeliveryOrders({ showSuccess: true })}
            />
          )}
          {activeTab === 'inventory' && (
            <InventoryView
              logs={logs}
              products={products}
              categories={categories}
              canAdjust={can(currentUser, 'adjustStock')}
              canDelete={can(currentUser, 'deleteStockLogs')}
              onAdjust={(payload) => runAction(() => moveStock(payload), '库存调整已完成。')}
              onDelete={deleteStockLog}
            />
          )}
          {activeTab === 'users' && (
            <UsersView
              users={users}
              currentUser={currentUser}
              onAdd={() => setUserModal({ username: '', password: '', real_name: '', role: 'viewer', status: 'active' })}
              onEdit={(user) => setUserModal({ ...user, password: '' })}
              onDelete={deleteUser}
              onToggleStatus={toggleUserStatus}
            />
          )}
        </section>
      </main>

      {productModal && (
        <ProductModal
          initialProduct={productModal}
          categories={categories}
          onClose={() => setProductModal(null)}
          onSave={async (product) => {
            const ok = await runAction(() => saveProduct(product), product.id ? '商品已更新。' : '商品已新增。');
            if (ok) setProductModal(null);
          }}
        />
      )}

      {categoryModal && (
        <ProductCategoryModal
          initialCategory={categoryModal}
          onClose={() => setCategoryModal(null)}
          onSave={async (category) => {
            const ok = await runAction(() => saveCategory(category), category.id ? '商品类型已更新。' : '商品类型已新增。');
            if (ok) setCategoryModal(null);
          }}
        />
      )}

      {partnerModal && (
        <PartnerModal
          type={partnerModal.type}
          initialPartner={partnerModal.data}
          onClose={() => setPartnerModal(null)}
          onSave={async (type, partner) => {
            const ok = await runAction(() => savePartner(type, partner), partner.id ? '资料已更新。' : '资料已新增。');
            if (ok) setPartnerModal(null);
          }}
        />
      )}

      {companyModal && (
        <CompanyProfileModal
          initialProfile={companyModal}
          onClose={() => setCompanyModal(null)}
          onUploadLogo={uploadCompanyLogo}
          onSave={async (profile) => {
            const ok = await runAction(
              () => saveCompanyProfile(profile),
              profile.id ? '公司资料已更新。' : '公司资料已新增。',
            );
            if (ok) setCompanyModal(null);
          }}
        />
      )}

      {userModal && (
        <UserModal
          initialUser={userModal}
          onClose={() => setUserModal(null)}
          onSave={async (user) => {
            const ok = await runAction(() => saveUser(user), user.id ? '用户已更新。' : '用户已新增。');
            if (ok) setUserModal(null);
          }}
        />
      )}

      {deliveryModal && (
        <DeliveryOrderModal
          initialOrder={deliveryModal}
          customers={customers}
          products={products}
          onClose={() => setDeliveryModal(null)}
          onSave={async (order) => {
            const ok = await runAction(() => saveDeliveryOrder(order), order.id ? '送货单已更新。' : '送货单已创建。');
            if (ok) setDeliveryModal(null);
          }}
        />
      )}

      {printOrder && (
        <DeliveryPrintModal
          order={printOrder}
          companyProfile={activeCompanyProfile}
          onClose={() => setPrintOrder(null)}
        />
      )}

      {printStockDocument && (
        <StockDocumentPrintModal
          title={printStockDocument.title}
          type={printStockDocument.type}
          logs={logs}
          companyProfile={activeCompanyProfile}
          onClose={() => setPrintStockDocument(null)}
        />
      )}
    </div>
  );
}

function buildStats(products, logs) {
  const start = todayIsoStart();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const todayLogs = logs.filter((log) => log.created_at >= start);
  const monthLogs = logs.filter((log) => log.created_at >= monthStart);
  const byType = (items, type) => items.filter((log) => log.type === type);
  const sumQty = (items) => items.reduce((sum, log) => sum + Number(log.quantity || 0), 0);
  const sumAmount = (items) => items.reduce((sum, log) => {
    const parsed = parseLogRemark(log.remark);
    const price = Number(log.unit_price || parsed.price || 0);
    return sum + Number(log.amount || (Number(log.quantity || 0) * price));
  }, 0);
  const returnStats = (type) => ({
    todayQty: sumQty(byType(todayLogs, type)),
    monthQty: sumQty(byType(monthLogs, type)),
    totalQty: sumQty(byType(logs, type)),
    todayAmount: sumAmount(byType(todayLogs, type)),
    monthAmount: sumAmount(byType(monthLogs, type)),
    totalAmount: sumAmount(byType(logs, type)),
  });
  return {
    productCount: products.length,
    totalQuantity: products.reduce((sum, product) => sum + Number(product.quantity || 0), 0),
    warningCount: products.filter((product) => Number(product.quantity) < Number(product.warning_qty)).length,
    purchaseIn: sumQty(byType(todayLogs, 'purchase_in')),
    saleOut: sumQty(byType(todayLogs, 'sale_out')),
    purchaseReturn: returnStats('purchase_return'),
    saleReturn: returnStats('sale_return'),
  };
}

function Dashboard({ stats, products, logs, loading }) {
  const warningProducts = products.filter((product) => Number(product.quantity) < Number(product.warning_qty));
  const cards = [
    { label: '商品总数', value: stats.productCount, tone: 'bg-white' },
    { label: '库存总数量', value: stats.totalQuantity, tone: 'bg-white' },
    { label: '低库存商品', value: stats.warningCount, tone: 'bg-red-50 text-red-900' },
    { label: '今日采购入库', value: stats.purchaseIn, tone: 'bg-emerald-50 text-emerald-900' },
    { label: '今日销售出库', value: stats.saleOut, tone: 'bg-sky-50 text-sky-900' },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-950">欢迎使用{SYSTEM_NAME}</h2>
        <p className="mt-1 text-sm text-slate-500">{SYSTEM_SUBTITLE}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-lg border border-slate-200 p-5 shadow-sm ${card.tone}`}>
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold">{loading ? '-' : formatNumber(card.value)}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReturnStatsCard title="采购退货统计" stats={stats.purchaseReturn} />
        <ReturnStatsCard title="销售退货统计" stats={stats.saleReturn} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="库存预警列表" icon={AlertTriangle}>
          <div className="space-y-2">
            {warningProducts.slice(0, 8).map((product) => (
              <div key={product.id} className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                <span>{product.name} / {product.sku}</span>
                <span>{product.quantity} {product.unit}</span>
              </div>
            ))}
            {warningProducts.length === 0 && <EmptyText text="当前没有低库存商品。" />}
          </div>
        </Panel>

        <Panel title="最近库存流水" icon={ClipboardList}>
          <div className="space-y-2">
            {logs.slice(0, 8).map((log) => (
              <LogRow key={log.id} log={log} compact />
            ))}
            {logs.length === 0 && <EmptyText text="暂无库存流水。" />}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ReturnStatsCard({ title, stats }) {
  const rows = [
    ['今日', stats.todayQty, stats.todayAmount],
    ['本月', stats.monthQty, stats.monthAmount],
    ['累计', stats.totalQty, stats.totalAmount],
  ];
  return (
    <Panel title={title} icon={ClipboardList}>
      <div className="grid gap-2">
        {rows.map(([label, qty, amount]) => (
          <div key={label} className="grid grid-cols-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium text-slate-700">{label}</span>
            <span>数量：{formatNumber(qty)}</span>
            <span>金额：¥{formatMoney(amount)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ProductCategoriesView({ categories, canMutate, onAdd, onEdit, onDelete }) {
  const [query, setQuery] = useState('');
  const rows = categories.filter((category) => matchesQuery(category, query, ['name', 'remark']));

  return (
    <Panel
      title="商品类型"
      subtitle="维护商品分类，用于商品筛选、商品资料和库存流水查询。"
      icon={Tags}
      action={canMutate ? <button className="btn-primary" onClick={onAdd}><Plus size={16} />新增商品类型</button> : null}
    >
      <SearchBox value={query} onChange={setQuery} placeholder="按商品类型名称或备注搜索" />
      <div className="table-scroll mt-4 overflow-x-auto">
        <table className="data-table min-w-[720px]">
          <thead>
            <tr>
              <th>ID</th>
              <th>商品类型名称</th>
              <th>备注</th>
              <th>创建时间</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((category) => (
              <tr key={category.id}>
                <td>{category.id}</td>
                <td className="font-medium">{category.name}</td>
                <td>{category.remark || '-'}</td>
                <td>{category.created_at ? new Date(category.created_at).toLocaleString('zh-CN') : '-'}</td>
                <td>
                  <RowActions
                    canEdit={canMutate}
                    canDelete={canMutate}
                    onEdit={() => onEdit(category)}
                    onDelete={() => onDelete(category)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <EmptyText text="没有找到商品类型。" />}
    </Panel>
  );
}

function ProductsView({ products, categories, loading, canMutate, canDelete, onAdd, onEdit, onDelete }) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const rows = products.filter((product) => {
    if (!matchesQuery(product, query, ['name', 'sku'])) return false;
    if (categoryFilter && String(product.category_id || '') !== String(categoryFilter)) return false;
    return true;
  });

  async function exportProductsExcel() {
    const XLSX = await import('xlsx');
    const data = rows.map((product) => ({
      商品ID: product.id,
      SKU: product.sku || '',
      商品名称: product.name || '',
      商品类型: product.category_name || '未分类',
      单位: product.unit || '',
      当前库存: Number(product.quantity || 0),
      成本价: Number(product.cost_price || 0),
      销售价: Number(product.sell_price || 0),
      预警库存: Number(product.warning_qty || 0),
      创建时间: product.created_at ? new Date(product.created_at).toLocaleString('zh-CN') : '',
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '商品资料');
    XLSX.writeFile(workbook, `商品资料_${compactTimestamp()}.xlsx`);
  }

  return (
    <Panel
      title="商品管理"
      subtitle="维护商品、SKU、价格、库存和预警值。"
      icon={Boxes}
      action={(
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <select className="input min-w-[160px]" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">全部类型</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <button className="btn-secondary" type="button" onClick={exportProductsExcel}>导出 Excel</button>
          {canMutate ? <button className="btn-primary" onClick={onAdd}><Plus size={16} />新增商品</button> : null}
        </div>
      )}
    >
      <SearchBox value={query} onChange={setQuery} placeholder="按商品名称或 SKU 搜索" />
      <div className="table-scroll mt-4 overflow-x-auto">
        <table className="data-table min-w-[1020px]">
          <thead>
            <tr>
              <th>商品名称</th>
              <th>SKU</th>
              <th>商品类型</th>
              <th>库存</th>
              <th>单位</th>
              <th>成本价</th>
              <th>销售价</th>
              <th>预警值</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => {
              const warning = Number(product.quantity) < Number(product.warning_qty);
              return (
                <tr key={product.id} className={warning ? 'bg-red-50/80 text-red-800' : ''}>
                  <td className="font-medium">{product.name}</td>
                  <td>{product.sku}</td>
                  <td>{product.category_name || '未分类'}</td>
                  <td className="font-semibold">{formatNumber(product.quantity)}</td>
                  <td>{product.unit}</td>
                  <td>¥{formatMoney(product.cost_price)}</td>
                  <td>¥{formatMoney(product.sell_price)}</td>
                  <td>{formatNumber(product.warning_qty)}</td>
                  <td>
                    <RowActions
                      canEdit={canMutate}
                      canDelete={canDelete}
                      onEdit={() => onEdit(product)}
                      onDelete={() => onDelete(product)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 && <EmptyText text="没有找到商品。" />}
    </Panel>
  );
}

function PartnersView({ title, type, rows, canMutate, canDelete, onAdd, onEdit, onDelete }) {
  const [query, setQuery] = useState('');
  const list = rows.filter((row) => matchesQuery(row, query, ['name', 'contact', 'phone', 'address']));
  const icon = type === 'customers' ? Users : Building2;

  return (
    <Panel
      title={title}
      subtitle="维护名称、联系人、电话、地址和备注。"
      icon={icon}
      action={canMutate ? <button className="btn-primary" onClick={onAdd}><Plus size={16} />新增{type === 'customers' ? '客户' : '供应商'}</button> : null}
    >
      <SearchBox value={query} onChange={setQuery} placeholder="按名称、联系人、电话或地址搜索" />
      <div className="table-scroll mt-4 overflow-x-auto">
        <table className="data-table min-w-[820px]">
          <thead>
            <tr>
              <th>名称</th>
              <th>联系人</th>
              <th>电话</th>
              <th>地址</th>
              <th>备注</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{row.name}</td>
                <td>{row.contact || '-'}</td>
                <td>{row.phone || '-'}</td>
                <td>{row.address || '-'}</td>
                <td>{row.remark || '-'}</td>
                <td>
                  <RowActions
                    canEdit={canMutate}
                    canDelete={canDelete}
                    onEdit={() => onEdit(row)}
                    onDelete={() => onDelete(row)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length === 0 && <EmptyText text="没有找到数据。" />}
    </Panel>
  );
}

function CompanyProfilesView({ profiles, activeProfile, canMutate, onAdd, onEdit, onDelete, onActivate }) {
  return (
    <div className="space-y-4">
      <Panel
        title="公司资料"
        subtitle="维护送货单打印使用的公司名称、地址、电话、邮箱和 Logo。"
        icon={Building2}
        action={canMutate ? <button className="btn-primary" onClick={onAdd}><Plus size={16} />新增公司资料</button> : null}
      >
        {activeProfile ? (
          <div className="grid gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 md:grid-cols-[120px_1fr]">
            <LogoPreview url={activeProfile.logo_url} />
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-950">{activeProfile.company_name}</h3>
                <span className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white">当前启用</span>
              </div>
              <p className="text-sm text-slate-700">地址：{activeProfile.company_address || '未设置'}</p>
              <p className="text-sm text-slate-700">电话：{activeProfile.contact_phone || '未设置'}</p>
              <p className="text-sm text-slate-700">邮箱：{activeProfile.email || '未设置'}</p>
              {activeProfile.remark && <p className="mt-2 text-sm text-slate-500">备注：{activeProfile.remark}</p>}
            </div>
          </div>
        ) : (
          <EmptyText text="当前没有启用的公司资料，送货单会使用默认占位信息。" />
        )}
      </Panel>

      <Panel title="公司资料列表" icon={Building2}>
        <div className="table-scroll overflow-x-auto">
          <table className="data-table min-w-[980px]">
            <thead>
              <tr>
                <th>Logo</th>
                <th>公司名称</th>
                <th>地址</th>
                <th>电话</th>
                <th>邮箱</th>
                <th>状态</th>
                <th>更新时间</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id}>
                  <td><LogoPreview url={profile.logo_url} small /></td>
                  <td className="font-medium">{profile.company_name}</td>
                  <td>{profile.company_address || '-'}</td>
                  <td>{profile.contact_phone || '-'}</td>
                  <td>{profile.email || '-'}</td>
                  <td>
                    <span className={`rounded px-2 py-1 text-xs font-medium ${profile.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {profile.is_active ? '启用' : '停用'}
                    </span>
                  </td>
                  <td>{new Date(profile.updated_at || profile.created_at).toLocaleString('zh-CN')}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      {canMutate && !profile.is_active && (
                        <button className="btn-small bg-emerald-50 text-emerald-700" onClick={() => onActivate(profile)}>
                          设为启用
                        </button>
                      )}
                      {canMutate && <button className="icon-button" title="编辑" onClick={() => onEdit(profile)}><Pencil size={16} /></button>}
                      {canMutate && <button className="icon-button text-red-600" title="删除" onClick={() => onDelete(profile)}><Trash2 size={16} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {profiles.length === 0 && <EmptyText text="暂无公司资料。" />}
      </Panel>
    </div>
  );
}

function CompanyProfileModal({ initialProfile, onClose, onSave, onUploadLogo }) {
  const [profile, setProfile] = useState(initialProfile);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleLogoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const logoUrl = await onUploadLogo(file);
      setProfile((current) => ({ ...current, logo_url: logoUrl }));
    } catch (error) {
      window.alert(error.message);
    } finally {
      setUploading(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    await onSave(profile);
    setSaving(false);
  }

  return (
    <Modal title={profile.id ? '编辑公司资料' : '新增公司资料'} onClose={onClose} wide>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-[180px_1fr]">
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Logo 预览</span>
            <LogoPreview url={profile.logo_url} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="公司名称">
              <input className="input" value={profile.company_name} onChange={(e) => setProfile({ ...profile, company_name: e.target.value })} required />
            </Field>
            <Field label="联系电话">
              <input className="input" value={profile.contact_phone || ''} onChange={(e) => setProfile({ ...profile, contact_phone: e.target.value })} />
            </Field>
            <Field label="邮箱">
              <input className="input" type="email" value={profile.email || ''} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
            </Field>
            <Field label="Logo 上传">
              <input className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLogoChange} />
              {uploading && <p className="mt-1 text-xs text-slate-500">Logo 上传中...</p>}
            </Field>
            <div className="sm:col-span-2">
              <Field label="公司地址">
                <input className="input" value={profile.company_address || ''} onChange={(e) => setProfile({ ...profile, company_address: e.target.value })} />
              </Field>
            </div>
          </div>
        </div>

        <Field label="备注">
          <textarea className="input min-h-24" value={profile.remark || ''} onChange={(e) => setProfile({ ...profile, remark: e.target.value })} />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(profile.is_active)}
            onChange={(e) => setProfile({ ...profile, is_active: e.target.checked })}
          />
          是否启用为当前公司资料
        </label>

        <ModalActions onCancel={onClose} saving={saving || uploading} />
      </form>
    </Modal>
  );
}

function LogoPreview({ url, small = false }) {
  const sizeClass = small ? 'h-12 w-20' : 'h-28 w-40';
  return (
    <div className={`flex ${sizeClass} items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-xs text-slate-400`}>
      {url ? <img src={url} alt="公司 Logo" className="h-full w-full object-contain" /> : '未上传'}
    </div>
  );
}

function PurchaseSalesView({ mode, partners, products, categories = [], logs = [], canSubmit, onSubmit, onPrint }) {
  const isPurchase = mode === 'purchase';
  const title = isPurchase ? '采购管理' : '销售管理';
  const partnerLabel = isPurchase ? '供应商' : '客户';
  const icon = isPurchase ? PackagePlus : PackageMinus;
  const actions = isPurchase
    ? [
        { type: 'purchase_in', title: '采购入库', printTitle: '采购入库单', direction: 'increase', priceField: 'cost_price' },
        { type: 'purchase_return', title: '采购退货', printTitle: '采购退货单', direction: 'decrease', priceField: 'cost_price' },
      ]
    : [
        { type: 'sale_out', title: '销售出库', direction: 'decrease', priceField: 'sell_price' },
        { type: 'sale_return', title: '销售退货', direction: 'increase', priceField: 'sell_price' },
      ];

  return (
    <Panel
      title={title}
      subtitle="所有操作都会同步更新库存，并写入库存流水。"
      icon={icon}
      action={isPurchase ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <button key={action.type} className="btn-secondary" onClick={() => onPrint({ title: action.printTitle, type: action.type })}>
              <Printer size={16} />
              打印{action.printTitle}
            </button>
          ))}
        </div>
      ) : (
        <button className="btn-secondary" onClick={onPrint}><Printer size={16} />打印销售出库单</button>
      )}
    >
      {canSubmit ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {actions.map((action) => (
            <StockBusinessCard
              key={action.type}
              action={action}
              partnerLabel={partnerLabel}
              partners={partners}
              products={products}
              categories={categories}
              onSubmit={onSubmit}
            />
          ))}
        </div>
      ) : mode === 'sales' ? (
        <div className="divide-y divide-slate-100">
          {logs.filter((log) => log.type === 'sale_out').map((log) => <LogRow key={log.id} log={log} />)}
          {logs.filter((log) => log.type === 'sale_out').length === 0 && <EmptyText text="暂无销售出库流水。" />}
        </div>
      ) : (
        <NoPermission />
      )}
    </Panel>
  );
}

function StockBusinessCard({ action, partnerLabel, partners, products, categories = [], onSubmit }) {
  const [partnerId, setPartnerId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [productId, setProductId] = useState('');
  const [stockDate, setStockDate] = useState(todayDate());
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(0);
  const [remark, setRemark] = useState('');
  const product = products.find((item) => item.id === productId);
  const partner = partners.find((item) => item.id === partnerId);
  const filteredProducts = categoryId
    ? products.filter((item) => String(item.category_id || '') === String(categoryId))
    : products;

  useEffect(() => {
    if (product) setPrice(product[action.priceField] || 0);
  }, [action.priceField, product]);

  function submit(event) {
    event.preventDefault();
    if (!partnerId) {
      window.alert(`请选择${partnerLabel}。`);
      return;
    }
    if (!productId) {
      window.alert('请选择商品。');
      return;
    }
    if (Number(quantity) <= 0) {
      window.alert('数量必须大于 0。');
      return;
    }
    if (action.direction === 'decrease' && product && Number(product.quantity) < Number(quantity)) {
      window.alert('库存不足，禁止出库。');
      return;
    }

    const operatorRemark = [
      `${partnerLabel}: ${partner?.name || ''}`,
      `日期: ${stockDate}`,
      `单价: ${formatMoney(price)}`,
      remark ? `备注: ${remark}` : '',
    ].filter(Boolean).join('；');

    onSubmit({ productId, type: action.type, quantity, operatorRemark, stockDate });
    setQuantity(1);
    setStockDate(todayDate());
    setRemark('');
  }

  return (
    <form className="rounded-lg border border-slate-200 bg-slate-50 p-4" onSubmit={submit}>
      <h3 className="mb-4 flex items-center gap-2 font-semibold">
        <PackageCheck size={18} />
        {action.title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={partnerLabel}>
          <select className="input" value={partnerId} onChange={(event) => setPartnerId(event.target.value)} required>
            <option value="">请选择</option>
            {partners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="日期">
          <input className="input" type="date" value={stockDate} onChange={(event) => setStockDate(event.target.value)} required />
        </Field>
        <Field label="商品">
          <select className="input mb-2" value={categoryId} onChange={(event) => {
            setCategoryId(event.target.value);
            setProductId('');
          }}>
            <option value="">全部商品类型</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <select className="input" value={productId} onChange={(event) => setProductId(event.target.value)} required>
            <option value="">请选择</option>
            {filteredProducts.map((item) => <option key={item.id} value={item.id}>{item.name} / {item.category_name || '未分类'} / {item.sku} / 库存 {item.quantity}</option>)}
          </select>
        </Field>
        <Field label="数量">
          <input className="input" type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
        </Field>
        <Field label="单价">
          <input className="input" type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} />
        </Field>
      </div>
      <Field label="备注">
        <textarea className="input mt-1 min-h-20" value={remark} onChange={(event) => setRemark(event.target.value)} />
      </Field>
      <div className="mt-4 flex justify-end">
        <button className="btn-primary" type="submit">提交{action.title}</button>
      </div>
    </form>
  );
}

function DeliveryManagementView({ orders, customers, products, canMutate, canDelete, onCreate, onEdit, onDelete, onPrint, onRefresh }) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const rows = orders
    .filter((order) => order.status !== 'deleted' && !order.deleted_at && !order.is_deleted)
    .filter((order) => ['sale_out', 'sale_return'].includes(order.order_type || 'sale_out'))
    .filter((order) => (typeFilter ? (order.order_type || 'sale_out') === typeFilter : true))
    .filter((order) => matchesQuery(order, query, ['order_no', 'customer_name', 'operator']))
    .sort((a, b) => new Date(b.created_at || b.delivery_date) - new Date(a.created_at || a.delivery_date));
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, typeFilter]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Panel
      title="送货管理"
      subtitle="销售出库和销售退货统一使用送货单模式，保存后自动更新库存并写入库存流水。"
      icon={Truck}
      action={(
        <div className="flex flex-col gap-2 sm:flex-row">
          <button className="btn-secondary" type="button" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? '刷新中...' : '刷新'}
          </button>
          {canMutate && <button className="btn-primary" onClick={() => onCreate('sale_out')}><Plus size={16} />销售出库</button>}
          {canMutate && <button className="btn-secondary" onClick={() => onCreate('sale_return')}><Plus size={16} />销售退货</button>}
        </div>
      )}
    >
      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <SearchBox value={query} onChange={setQuery} placeholder="按单号、客户名称或制单人搜索" />
        <select className="input" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="">全部类型</option>
          <option value="sale_out">销售出库</option>
          <option value="sale_return">销售退货</option>
        </select>
      </div>
      <div className="table-scroll mt-4 overflow-x-auto">
        <table className="data-table min-w-[980px]">
          <thead>
            <tr>
              <th>单号</th>
              <th>类型</th>
              <th>客户名称</th>
              <th>日期</th>
              <th>商品数量</th>
              <th>总金额</th>
              <th>制单人</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((order) => (
              <tr key={order.id}>
                <td className="font-medium">{order.order_no}</td>
                <td>{deliveryOrderTypeLabels[order.order_type || 'sale_out']}</td>
                <td>{order.customer_name}</td>
                <td>{order.delivery_date}</td>
                <td>{formatNumber(totalOrderQuantity(order.delivery_order_items))}</td>
                <td>¥{formatMoney(totalOrderAmount(order.delivery_order_items))}</td>
                <td>{order.operator}</td>
                <td>{order.status || 'saved'}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button className="icon-button" title="查看" onClick={() => onPrint(order)}><FileText size={16} /></button>
                    {canMutate && <button className="icon-button" title="编辑" onClick={() => onEdit(order)}><Pencil size={16} /></button>}
                    <button className="icon-button" title="打印" onClick={() => onPrint(order)}><Printer size={16} /></button>
                    {canDelete && <button className="icon-button text-red-600" title="删除" onClick={() => onDelete(order)}><Trash2 size={16} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > pageSize && <Pagination page={safePage} pageCount={pageCount} onPageChange={setPage} />}
      {rows.length === 0 && <EmptyText text="暂无送货管理单据。" />}
      {customers.length === 0 && <EmptyText text="提示：请先在客户管理中新增客户。" />}
      {products.length === 0 && <EmptyText text="提示：请先在商品管理中新增商品。" />}
    </Panel>
  );
}

function InventoryView({ logs, products, categories, canAdjust, canDelete, onAdjust, onDelete }) {
  const [filters, setFilters] = useState({ productQuery: '', customer: '', supplier: '', type: '', categoryId: '', start: '', end: '' });
  const [adjust, setAdjust] = useState({ productId: '', quantity: 0, remark: '' });
  const [exportWithQrCode, setExportWithQrCode] = useState(false);

  const rows = logs.filter((log) => {
    const parsed = parseLogRemark(log.remark);
    const productText = `${log.product_name || log.products?.name || ''} ${log.product_sku || log.products?.sku || ''}`.toLowerCase();
    const customerName = log.customer_name || parsed.customer || '';
    const supplierName = log.supplier_name || parsed.supplier || '';
    const categoryId = log.category_id || log.products?.category_id || '';
    if (filters.productQuery && !productText.includes(filters.productQuery.trim().toLowerCase())) return false;
    if (filters.customer && !customerName.toLowerCase().includes(filters.customer.trim().toLowerCase())) return false;
    if (filters.supplier && !supplierName.toLowerCase().includes(filters.supplier.trim().toLowerCase())) return false;
    if (filters.type && log.type !== filters.type) return false;
    if (filters.categoryId && String(categoryId) !== String(filters.categoryId)) return false;
    if (filters.start && log.created_at < `${filters.start}T00:00:00`) return false;
    if (filters.end && log.created_at > `${filters.end}T23:59:59`) return false;
    return true;
  });

  async function exportExcel() {
    const data = rows.map((log) => {
      const parsed = parseLogRemark(log.remark);
      const price = Number(log.unit_price || parsed.price || 0);
      const quantity = Number(log.quantity || 0);
      return {
        日期: new Date(log.created_at).toLocaleString('zh-CN'),
        商品编号: log.product_sku || log.products?.sku || '',
        商品名称: log.product_name || log.products?.name || '已删除商品',
        商品类型: log.category_name || log.products?.category_name || '',
        客户: log.customer_name || parsed.customer,
        供应商: log.supplier_name || parsed.supplier,
        类型: stockTypeLabels[log.type] || log.type,
        数量: quantity,
        操作前库存: log.before_qty ?? '',
        操作后库存: log.after_qty ?? '',
        单价: price,
        金额: Number(log.amount || (quantity * price).toFixed(2)),
        操作人: log.operator,
        备注: log.remark || '',
      };
    });

    if (exportWithQrCode) {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('库存流水');
      const headers = [...Object.keys(data[0] || {
        日期: '',
        商品编号: '',
        商品名称: '',
        客户: '',
        供应商: '',
        类型: '',
        数量: '',
        单价: '',
        金额: '',
        操作人: '',
        备注: '',
      }), '二维码'];
      worksheet.addRow(headers);
      worksheet.getRow(1).font = { bold: true };

      for (const [index, row] of data.entries()) {
        const excelRow = worksheet.addRow(Object.values(row));
        excelRow.height = 72;
        const qrDataUrl = await generateQrCodeDataUrl(buildStockLogQrContent(rows[index]));
        const imageId = workbook.addImage({
          base64: qrDataUrl,
          extension: 'png',
        });
        worksheet.addImage(imageId, {
          tl: { col: headers.length - 1, row: index + 1 },
          ext: { width: 72, height: 72 },
        });
      }

      worksheet.columns = headers.map((header) => ({
        header,
        key: header,
        width: header === '二维码' ? 14 : 18,
      }));
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new window.Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `库存流水_${compactTimestamp()}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      return;
    }

    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '库存流水');
    XLSX.writeFile(workbook, `库存流水_${compactTimestamp()}.xlsx`);
  }

  function submitAdjust(event) {
    event.preventDefault();
    if (!adjust.productId) {
      window.alert('请选择商品。');
      return;
    }
    if (Number(adjust.quantity) === 0) {
      window.alert('调整数量不能为 0。');
      return;
    }
    onAdjust({
      productId: adjust.productId,
      type: 'adjustment',
      quantity: Number(adjust.quantity),
      operatorRemark: adjust.remark || `库存调整 ${adjust.quantity}`,
    });
    setAdjust({ productId: '', quantity: 0, remark: '' });
  }

  return (
    <div className="space-y-4">
      {canAdjust && (
        <Panel title="库存调整" subtitle="调整数量可正可负，系统会自动更新库存并写入流水。" icon={PackageCheck}>
          <form className="grid gap-3 md:grid-cols-[1fr_180px_1fr_auto]" onSubmit={submitAdjust}>
            <Field label="商品">
              <select className="input" value={adjust.productId} onChange={(event) => setAdjust({ ...adjust, productId: event.target.value })} required>
                <option value="">请选择商品</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name} / {product.sku} / 库存 {product.quantity}</option>)}
              </select>
            </Field>
            <Field label="调整数量">
              <input className="input" type="number" value={adjust.quantity} onChange={(event) => setAdjust({ ...adjust, quantity: event.target.value })} required />
            </Field>
            <Field label="备注">
              <input className="input" value={adjust.remark} onChange={(event) => setAdjust({ ...adjust, remark: event.target.value })} />
            </Field>
            <div className="flex items-end">
              <button className="btn-primary w-full" type="submit">提交调整</button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title="库存流水查询" subtitle="支持按商品、类型和日期筛选。" icon={ClipboardList}>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <Field label="商品名称 / SKU">
            <input className="input" value={filters.productQuery} onChange={(event) => setFilters({ ...filters, productQuery: event.target.value })} placeholder="输入商品或 SKU" />
          </Field>
          <Field label="商品类型">
            <select className="input" value={filters.categoryId} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}>
              <option value="">全部类型</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <Field label="客户">
            <input className="input" value={filters.customer} onChange={(event) => setFilters({ ...filters, customer: event.target.value })} placeholder="客户名称" />
          </Field>
          <Field label="供应商">
            <input className="input" value={filters.supplier} onChange={(event) => setFilters({ ...filters, supplier: event.target.value })} placeholder="供应商名称" />
          </Field>
          <Field label="类型">
            <select className="input" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}>
              <option value="">全部类型</option>
              {Object.entries(stockTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="开始日期">
            <input className="input" type="date" value={filters.start} onChange={(event) => setFilters({ ...filters, start: event.target.value })} />
          </Field>
          <Field label="结束日期">
            <input className="input" type="date" value={filters.end} onChange={(event) => setFilters({ ...filters, end: event.target.value })} />
          </Field>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <label className="flex items-center gap-2 text-sm text-slate-600" title="勾选后导出的文件会附带二维码，可扫码查看单据详情">
            <input type="checkbox" checked={exportWithQrCode} onChange={(event) => setExportWithQrCode(event.target.checked)} />
            生成二维码
          </label>
          <button className="btn-secondary" type="button" onClick={exportExcel}>导出 Excel</button>
        </div>
        <div className="mt-4 divide-y divide-slate-100">
          {rows.map((log) => <LogRow key={log.id} log={log} canDelete={canDelete} onDelete={onDelete} />)}
        </div>
        {rows.length === 0 && <EmptyText text="暂无匹配流水。" />}
      </Panel>
    </div>
  );
}

function LogRow({ log, compact = false, canDelete = false, onDelete }) {
  return (
    <div className={`flex flex-col gap-2 px-1 py-3 sm:flex-row sm:items-center sm:justify-between ${compact ? 'rounded-lg border border-slate-100 px-3' : ''}`}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-1 text-xs font-medium ${stockTypeTones[log.type] || 'bg-slate-100 text-slate-700'}`}>
            {stockTypeLabels[log.type] || log.type}
          </span>
          <span className="font-medium">{log.product_name || log.products?.name || '已删除商品'}</span>
          <span className="text-sm text-slate-500">{log.product_sku || log.products?.sku}</span>
          {(log.category_name || log.products?.category_name) && <span className="text-sm text-slate-500">{log.category_name || log.products?.category_name}</span>}
        </div>
        {!compact && (
          <p className="mt-1 text-sm text-slate-500">
            操作人：{log.operator}{log.remark ? ` / ${log.remark}` : ''}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 text-left sm:text-right">
        <div>
          <p className="font-semibold">{formatNumber(log.quantity)} {log.products?.unit || ''}</p>
          {!compact && (log.before_qty !== null && log.before_qty !== undefined) && (
            <p className="text-xs text-slate-500">库存 {formatNumber(log.before_qty)} → {formatNumber(log.after_qty)}</p>
          )}
          <p className="text-xs text-slate-500">{new Date(log.created_at).toLocaleString('zh-CN')}</p>
        </div>
        {canDelete && !compact && (
          <button className="icon-button text-red-600" title="删除库存流水" onClick={() => onDelete?.(log)}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function UsersView({ users, currentUser, onAdd, onEdit, onDelete, onToggleStatus }) {
  const [query, setQuery] = useState('');
  const rows = users.filter((user) => matchesQuery(user, query, ['username', 'real_name', 'role', 'status']));

  return (
    <Panel
      title="用户管理"
      subtitle="维护内部账号、角色、状态和密码。开发阶段密码为明文存储。"
      icon={Users}
      action={<button className="btn-primary" onClick={onAdd}><Plus size={16} />新增用户</button>}
    >
      <SearchBox value={query} onChange={setQuery} placeholder="按账号、姓名、角色或状态搜索" />
      <div className="table-scroll mt-4 overflow-x-auto">
        <table className="data-table min-w-[880px]">
          <thead>
            <tr>
              <th>账号</th>
              <th>真实姓名</th>
              <th>角色</th>
              <th>状态</th>
              <th>创建时间</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => (
              <tr key={user.id}>
                <td className="font-medium">{user.username}</td>
                <td>{user.real_name || '-'}</td>
                <td>{roleLabels[user.role] || user.role}</td>
                <td>
                  <span className={`rounded px-2 py-1 text-xs font-medium ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    {user.status === 'active' ? '启用' : '禁用'}
                  </span>
                </td>
                <td>{new Date(user.created_at).toLocaleString('zh-CN')}</td>
                <td>
                  <div className="flex justify-end gap-2">
                    <button className="btn-small bg-slate-100 text-slate-700" onClick={() => onToggleStatus(user)} disabled={user.id === currentUser.id}>
                      {user.status === 'active' ? '禁用' : '启用'}
                    </button>
                    <button className="icon-button" title="编辑/修改密码" onClick={() => onEdit(user)}><Pencil size={16} /></button>
                    <button className="icon-button text-red-600" title="删除" onClick={() => onDelete(user)} disabled={user.id === currentUser.id}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <EmptyText text="暂无用户。" />}
    </Panel>
  );
}

function UserModal({ initialUser, onClose, onSave }) {
  const [user, setUser] = useState(initialUser);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    await onSave(user);
    setSaving(false);
  }

  return (
    <Modal title={user.id ? '编辑用户 / 修改密码' : '新增用户'} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="账号">
            <input className="input" value={user.username} onChange={(e) => setUser({ ...user, username: e.target.value })} required />
          </Field>
          <Field label="真实姓名">
            <input className="input" value={user.real_name || ''} onChange={(e) => setUser({ ...user, real_name: e.target.value })} />
          </Field>
          <Field label={user.id ? '新密码（留空不修改）' : '初始密码'}>
            <input className="input" type="password" value={user.password || ''} onChange={(e) => setUser({ ...user, password: e.target.value })} required={!user.id} />
          </Field>
          <Field label="角色">
            <select className="input" value={user.role} onChange={(e) => setUser({ ...user, role: e.target.value })} required>
              {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="状态">
            <select className="input" value={user.status || 'active'} onChange={(e) => setUser({ ...user, status: e.target.value })}>
              <option value="active">启用</option>
              <option value="disabled">禁用</option>
            </select>
          </Field>
        </div>
        <ModalActions onCancel={onClose} saving={saving} />
      </form>
    </Modal>
  );
}

function ProductCategoryModal({ initialCategory, onClose, onSave }) {
  const [category, setCategory] = useState(initialCategory);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    await onSave(category);
    setSaving(false);
  }

  return (
    <Modal title={category.id ? '编辑商品类型' : '新增商品类型'} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="商品类型名称">
          <input
            className="input"
            value={category.name}
            onChange={(event) => setCategory({ ...category, name: event.target.value })}
            required
          />
        </Field>
        <Field label="备注">
          <textarea
            className="input min-h-24"
            value={category.remark || ''}
            onChange={(event) => setCategory({ ...category, remark: event.target.value })}
          />
        </Field>
        <ModalActions onCancel={onClose} saving={saving} />
      </form>
    </Modal>
  );
}

function ProductModal({ initialProduct, categories, onClose, onSave }) {
  const [product, setProduct] = useState(initialProduct);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    await onSave(product);
    setSaving(false);
  }

  return (
    <Modal title={product.id ? '编辑商品' : '新增商品'} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="商品名称"><input className="input" value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} required /></Field>
          <Field label="商品类型">
            <select
              className="input"
              value={product.category_id || ''}
              onChange={(e) => {
                const category = categories.find((item) => String(item.id) === String(e.target.value));
                setProduct({
                  ...product,
                  category_id: e.target.value,
                  category_name: category?.name || '',
                });
              }}
              required
            >
              <option value="">请选择商品类型</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </Field>
          <Field label="SKU">
            <input
              className="input bg-slate-50 text-slate-500"
              value={product.sku || '保存时自动生成'}
              readOnly
              title={product.isSkuPreview ? '预览编号，最终编号由数据库保存时生成' : 'SKU 不允许修改'}
            />
            <p className="mt-1 text-xs text-slate-500">
              {product.isSkuPreview ? '预览编号，最终以数据库自动生成结果为准。' : 'SKU 由系统生成，不允许修改。'}
            </p>
          </Field>
          <Field label="库存数量"><input className="input" type="number" min="0" value={product.quantity} onChange={(e) => setProduct({ ...product, quantity: e.target.value })} required /></Field>
          <Field label="单位">
            <select
              className="input"
              value={product.unit || ''}
              onChange={(e) => setProduct({ ...product, unit: e.target.value })}
              required
            >
              <option value="">请选择单位</option>
              {productUnitOptions.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </Field>
          <Field label="成本价"><input className="input" type="number" min="0" step="0.01" value={product.cost_price} onChange={(e) => setProduct({ ...product, cost_price: e.target.value })} /></Field>
          <Field label="销售价"><input className="input" type="number" min="0" step="0.01" value={product.sell_price} onChange={(e) => setProduct({ ...product, sell_price: e.target.value })} /></Field>
          <Field label="库存预警值"><input className="input" type="number" min="0" value={product.warning_qty} onChange={(e) => setProduct({ ...product, warning_qty: e.target.value })} /></Field>
        </div>
        <ModalActions onCancel={onClose} saving={saving} />
      </form>
    </Modal>
  );
}

function PartnerModal({ type, initialPartner, onClose, onSave }) {
  const [partner, setPartner] = useState(initialPartner);
  const [saving, setSaving] = useState(false);
  const label = type === 'customers' ? '客户' : '供应商';

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    await onSave(type, partner);
    setSaving(false);
  }

  return (
    <Modal title={partner.id ? `编辑${label}` : `新增${label}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${label}名称`}><input className="input" value={partner.name} onChange={(e) => setPartner({ ...partner, name: e.target.value })} required /></Field>
          <Field label="联系人"><input className="input" value={partner.contact || ''} onChange={(e) => setPartner({ ...partner, contact: e.target.value })} /></Field>
          <Field label="电话"><input className="input" value={partner.phone || ''} onChange={(e) => setPartner({ ...partner, phone: e.target.value })} /></Field>
          <Field label="地址"><input className="input" value={partner.address || ''} onChange={(e) => setPartner({ ...partner, address: e.target.value })} /></Field>
        </div>
        <Field label="备注"><textarea className="input min-h-24" value={partner.remark || ''} onChange={(e) => setPartner({ ...partner, remark: e.target.value })} /></Field>
        <ModalActions onCancel={onClose} saving={saving} />
      </form>
    </Modal>
  );
}

function DeliveryOrderModal({ initialOrder, customers, products, onClose, onSave }) {
  const [order, setOrder] = useState(initialOrder);
  const [saving, setSaving] = useState(false);
  const total = totalOrderAmount(order.items);

  function updateItem(index, patch) {
    const items = order.items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, ...patch };
      const product = products.find((row) => String(row.id) === String(next.product_id));
      if (product) {
        next.product_sku = product.sku;
        next.product_name = product.name;
        next.category_name = product.category_name || '未分类';
        next.unit = product.unit;
        if (!next.price) next.price = product.sell_price || 0;
      }
      next.amount = Number(next.quantity || 0) * Number(next.price || 0);
      return next;
    });
    setOrder({ ...order, items });
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave(order);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`${order.id ? '编辑' : '新建'}${deliveryOrderTypeLabels[order.order_type || 'sale_out'] || '送货单'}`} onClose={onClose} wide>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="送货单号"><input className="input" value={order.order_no} onChange={(e) => setOrder({ ...order, order_no: e.target.value })} required /></Field>
          <Field label="业务类型">
            <select className="input" value={order.order_type || 'sale_out'} onChange={(e) => setOrder({ ...order, order_type: e.target.value })}>
              <option value="sale_out">销售出库</option>
              <option value="sale_return">销售退货</option>
            </select>
          </Field>
          <Field label="客户">
            <select className="input" value={order.customer_id} onChange={(e) => setOrder({ ...order, customer_id: e.target.value })} required>
              <option value="">请选择客户</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </Field>
          <Field label="日期"><input className="input" type="date" value={order.delivery_date} onChange={(e) => setOrder({ ...order, delivery_date: e.target.value })} required /></Field>
          <Field label="制单人"><input className="input" value={order.operator} onChange={(e) => setOrder({ ...order, operator: e.target.value })} required /></Field>
        </div>

        <div className="table-scroll overflow-x-auto rounded-lg border border-slate-200">
          <table className="data-table min-w-[1050px]">
            <thead>
              <tr>
                <th>商品</th>
                <th>商品类型</th>
                <th>产品编号</th>
                <th>单位</th>
                <th>数量</th>
                <th>单价</th>
                <th>金额</th>
                <th>备注</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={item.localId || item.id || index}>
                  <td>
                    <select className="input" value={item.product_id} onChange={(e) => updateItem(index, { product_id: e.target.value })} required>
                      <option value="">请选择商品</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name} / {product.category_name || '未分类'} / {product.sku}</option>)}
                    </select>
                  </td>
                  <td>{item.category_name || products.find((product) => String(product.id) === String(item.product_id))?.category_name || '-'}</td>
                  <td>{item.product_sku || '-'}</td>
                  <td>{item.unit || '-'}</td>
                  <td><input className="input" type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} required /></td>
                  <td><input className="input" type="number" min="0" step="0.01" value={item.price} onChange={(e) => updateItem(index, { price: e.target.value })} /></td>
                  <td>¥{formatMoney(item.amount)}</td>
                  <td><input className="input" value={item.remark || ''} onChange={(e) => updateItem(index, { remark: e.target.value })} /></td>
                  <td>
                    <button
                      type="button"
                      className="icon-button text-red-600"
                      onClick={() => setOrder({ ...order, items: order.items.filter((_, itemIndex) => itemIndex !== index) })}
                      title="删除明细"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className="btn-secondary" onClick={() => setOrder({ ...order, items: [...order.items, emptyDeliveryItem()] })}>
            <Plus size={16} />
            添加商品明细
          </button>
          <div className="text-right text-sm">
            合计金额：<span className="text-xl font-semibold text-slate-950">¥{formatMoney(total)}</span>
          </div>
        </div>

        <Field label="备注"><textarea className="input min-h-20" value={order.remark || ''} onChange={(e) => setOrder({ ...order, remark: e.target.value })} /></Field>
        <ModalActions onCancel={onClose} saving={saving} />
      </form>
    </Modal>
  );
}

function PrintSettingsPanel({ printSettings, setPrintSettings, exportPdf, onPrint, onClose }) {
  const updateSetting = (key, value) => setPrintSettings(normalizePrintSettings({ ...printSettings, [key]: value }));

  return (
    <div className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 print:hidden md:grid-cols-8">
      <Field label="打印纸张类型">
        <select className="input" value={printSettings.paperType} onChange={(event) => updateSetting('paperType', event.target.value)}>
          <option value="a4">A4标准纸</option>
          <option value="two-part">送货单二联单</option>
          <option value="triple">财务通用三联单</option>
        </select>
      </Field>
      <Field label="打印方向">
        <select className="input" value={printSettings.orientation} onChange={(event) => updateSetting('orientation', event.target.value)}>
          <option value="portrait">竖版（Portrait）</option>
          <option value="landscape">横版（Landscape）</option>
        </select>
      </Field>
      <Field label="Logo 大小">
        <select className="input" value={printSettings.logoSize} onChange={(event) => updateSetting('logoSize', event.target.value)}>
          <option value="small">小</option>
          <option value="medium">中</option>
          <option value="large">大</option>
        </select>
      </Field>
      <label className="flex items-center gap-2 pt-7 text-sm text-slate-700">
        <input type="checkbox" checked={printSettings.showLogo} onChange={(event) => updateSetting('showLogo', event.target.checked)} />
        显示 Logo
      </label>
      <label className="flex items-center gap-2 pt-7 text-sm text-slate-700">
        <input type="checkbox" checked={printSettings.showAmountGrid} onChange={(event) => updateSetting('showAmountGrid', event.target.checked)} />
        显示金额分位格
      </label>
      <label className="flex items-center gap-2 pt-7 text-sm text-slate-700">
        <input type="checkbox" checked={printSettings.hideAmounts} onChange={(event) => updateSetting('hideAmounts', event.target.checked)} />
        隐藏单价和金额
      </label>
      <label className="flex items-center gap-2 pt-7 text-sm text-slate-700" title="勾选后导出的文件会附带二维码，可扫码查看单据详情">
        <input type="checkbox" checked={printSettings.showQrCode} onChange={(event) => updateSetting('showQrCode', event.target.checked)} />
        生成二维码
      </label>
      <div className="flex flex-wrap items-end justify-end gap-2">
        <button className="btn-secondary" onClick={exportPdf}><FileDown size={16} />导出 PDF</button>
        <button className="btn-primary" onClick={onPrint}><Printer size={16} />打印</button>
        <button className="btn-secondary" onClick={onClose}><X size={16} />关闭</button>
      </div>
    </div>
  );
}

function DeliveryPrintModal({ order, companyProfile, onClose }) {
  const printRef = useRef(null);
  const [printSettings, setPrintSettings] = useState(loadPrintSettings);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const items = order.delivery_order_items || order.items || [];
  const total = items.reduce((sum, item) => sum + calculateLineAmount(item), 0);
  const logoWidth = getLogoWidth(printSettings);
  const printCompany = {
    company_name: companyProfile?.company_name || '未设置公司名称',
    company_address: companyProfile?.company_address || '未设置公司地址',
    contact_phone: companyProfile?.contact_phone || '',
    email: companyProfile?.email || '',
    logo_url: companyProfile?.logo_url || '',
  };

  useEffect(() => {
    savePrintSettings(printSettings);
    syncPrintCopies(printRef, printSettings);
  }, [printSettings]);

  useEffect(() => {
    let ignore = false;
    if (!printSettings.showQrCode) {
      setQrDataUrl('');
      return () => {
        ignore = true;
      };
    }
    generateQrCodeDataUrl(buildDeliveryQrContent(order)).then((url) => {
      if (!ignore) setQrDataUrl(url);
    });
    return () => {
      ignore = true;
    };
  }, [order, printSettings.showQrCode]);

  async function exportPdf() {
    syncPrintCopies(printRef, printSettings);
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: '#ffffff' });
    const image = canvas.toDataURL('image/png');
    const pdf = new jsPDF(getPdfOrientation(printSettings), 'mm', getPdfFormat(printSettings));
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let imageWidth = pageWidth;
    let imageHeight = (canvas.height * imageWidth) / canvas.width;
    if (imageHeight > pageHeight) {
      imageHeight = pageHeight;
      imageWidth = (canvas.width * imageHeight) / canvas.height;
    }
    pdf.addImage(image, 'PNG', (pageWidth - imageWidth) / 2, 0, imageWidth, imageHeight);
    pdf.save(`${SYSTEM_NAME}-送货单-${order.order_no}.pdf`);
  }

  function printDocument() {
    syncPrintCopies(printRef, printSettings);
    window.requestAnimationFrame(() => window.print());
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4 print:static print:bg-white print:p-0">
      <div className="mx-auto max-w-6xl rounded-lg bg-white p-4 shadow-xl print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <PrintSettingsPanel printSettings={printSettings} setPrintSettings={setPrintSettings} exportPdf={exportPdf} onPrint={printDocument} onClose={onClose} />
        <article ref={printRef} className={getPrintClass(printSettings)}>
          <section className="delivery-copy delivery-copy-source">
          <header className="delivery-header">
            <div className="logo-box">
              {printSettings.showLogo && (
                printCompany.logo_url ? (
                  <img className="delivery-logo" src={printCompany.logo_url} alt="公司 Logo" style={{ width: `${logoWidth}px` }} />
                ) : (
                  <div className="delivery-logo-placeholder" style={{ width: `${logoWidth}px` }}>LOGO</div>
                )
              )}
            </div>
            <div className="delivery-title">
              <h1>{printCompany.company_name}</h1>
              <p>
                {printCompany.company_address}
                {printCompany.contact_phone ? `  电话：${printCompany.contact_phone}` : ''}
                {printCompany.email ? `  邮箱：${printCompany.email}` : ''}
              </p>
              <h2>送 货 单</h2>
            </div>
            <div className="delivery-meta">
              <p className="text-red-600">NO：{order.order_no}</p>
              <p>制 单 人：{order.operator}</p>
              <p>送货日期：{order.delivery_date}</p>
            </div>
          </header>

          <div className="mb-2 text-sm">客户名称：{order.customer_name}</div>

          <table className="delivery-table">
            <colgroup>
              <col className="delivery-col-index" />
              <col className="delivery-col-sku" />
              <col className="delivery-col-name" />
              <col className="delivery-col-unit" />
              <col className="delivery-col-qty" />
              {!printSettings.hideAmounts && <col className="delivery-col-price" />}
              {!printSettings.hideAmounts && (
                printSettings.showAmountGrid
                  ? Array.from({ length: 8 }).map((_, index) => <col key={index} className="delivery-col-money" />)
                  : <col className="delivery-col-amount" />
              )}
              <col className="delivery-col-remark" />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan="2">序号</th>
                <th rowSpan="2">产品编号</th>
                <th rowSpan="2">产品名称</th>
                <th rowSpan="2">单位</th>
                <th rowSpan="2">数量</th>
                {!printSettings.hideAmounts && <th rowSpan="2">单价</th>}
                {!printSettings.hideAmounts && <th colSpan={printSettings.showAmountGrid ? 8 : 1} rowSpan={printSettings.showAmountGrid ? 1 : 2}>金额</th>}
                <th rowSpan="2">备注</th>
              </tr>
              {!printSettings.hideAmounts && printSettings.showAmountGrid && (
                <tr>
                  {['十', '万', '千', '百', '十', '元', '角', '分'].map((label, index) => (
                    <th key={`${label}-${index}`} className="money-cell">{label}</th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {Array.from({ length: Math.max(8, items.length) }).map((_, index) => {
                const item = items[index];
                const amountCells = splitAmountCells(calculateLineAmount(item));
                return (
                  <tr key={item?.id || index}>
                    <td>{index + 1}</td>
                    <td>{item?.product_sku || ''}</td>
                    <td>{item?.product_name || ''}</td>
                    <td>{item?.unit || ''}</td>
                    <td>{item?.quantity || ''}</td>
                    {!printSettings.hideAmounts && <td>{item ? formatMoney(item.price) : ''}</td>}
                    {!printSettings.hideAmounts && (
                      printSettings.showAmountGrid
                        ? amountCells.map((digit, digitIndex) => <td key={digitIndex} className="money-cell">{item ? digit : ''}</td>)
                        : <td>{item ? formatMoney(calculateLineAmount(item)) : ''}</td>
                    )}
                    <td>{item?.remark || ''}</td>
                  </tr>
                );
              })}
              {!printSettings.hideAmounts && (
                <tr>
                  <td colSpan={printSettings.showAmountGrid ? 15 : 8} className="text-left">金额合计：￥{formatMoney(total)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <p className="mt-2 text-sm">以上货品请核对数量，如有质量问题，请在收货后3天内通知本公司，逾期恕不负责。</p>
          <footer className="mt-5 grid grid-cols-2 gap-8 text-sm">
            <div>送货单位及经手人（盖章）：</div>
            <div>收货单位及经手人（盖章）：</div>
          </footer>
          {printSettings.showQrCode && qrDataUrl && (
            <div className="document-qr">
              <img src={qrDataUrl} alt="单据二维码" />
              <span>扫码查看单据详情</span>
            </div>
          )}
          </section>
        </article>
      </div>
    </div>
  );
}

function StockDocumentPrintModal({ title, type, logs, companyProfile, onClose }) {
  const printRef = useRef(null);
  const [printSettings, setPrintSettings] = useState(loadPrintSettings);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const logoWidth = getLogoWidth(printSettings);
  const rows = logs.filter((log) => log.type === type);
  const documentDate = rows[0]?.created_at ? new Date(rows[0].created_at).toISOString().slice(0, 10) : todayDate();
  const items = rows.map((log) => {
    const parsed = parseLogRemark(log.remark);
    const quantity = Number(log.quantity || 0);
    const price = Number(parsed.price || 0);
    return {
      id: log.id,
      product_sku: log.products?.sku || '',
      product_name: log.products?.name || '已删除商品',
      unit: log.products?.unit || '',
      quantity,
      price,
      amount: quantity * price,
      remark: log.remark || '',
    };
  });
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const printCompany = {
    company_name: companyProfile?.company_name || '未设置公司名称',
    company_address: companyProfile?.company_address || '未设置公司地址',
    contact_phone: companyProfile?.contact_phone || '',
    email: companyProfile?.email || '',
    logo_url: companyProfile?.logo_url || '',
  };

  useEffect(() => {
    savePrintSettings(printSettings);
    syncPrintCopies(printRef, printSettings);
  }, [printSettings]);

  useEffect(() => {
    let ignore = false;
    if (!printSettings.showQrCode) {
      setQrDataUrl('');
      return () => {
        ignore = true;
      };
    }
    generateQrCodeDataUrl(buildStockDocumentQrContent(title, type)).then((url) => {
      if (!ignore) setQrDataUrl(url);
    });
    return () => {
      ignore = true;
    };
  }, [printSettings.showQrCode, title, type]);

  async function exportPdf() {
    syncPrintCopies(printRef, printSettings);
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: '#ffffff' });
    const image = canvas.toDataURL('image/png');
    const pdf = new jsPDF(getPdfOrientation(printSettings), 'mm', getPdfFormat(printSettings));
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let imageWidth = pageWidth;
    let imageHeight = (canvas.height * imageWidth) / canvas.width;
    if (imageHeight > pageHeight) {
      imageHeight = pageHeight;
      imageWidth = (canvas.width * imageHeight) / canvas.height;
    }
    pdf.addImage(image, 'PNG', (pageWidth - imageWidth) / 2, 0, imageWidth, imageHeight);
    pdf.save(`${SYSTEM_NAME}-${title}-${compactTimestamp()}.pdf`);
  }

  function printDocument() {
    syncPrintCopies(printRef, printSettings);
    window.requestAnimationFrame(() => window.print());
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4 print:static print:bg-white print:p-0">
      <div className="mx-auto max-w-6xl rounded-lg bg-white p-4 shadow-xl print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <PrintSettingsPanel printSettings={printSettings} setPrintSettings={setPrintSettings} exportPdf={exportPdf} onPrint={printDocument} onClose={onClose} />

        <article ref={printRef} className={getPrintClass(printSettings)}>
          <section className="delivery-copy delivery-copy-source">
          <header className="delivery-header">
            <div className="logo-box">
              {printSettings.showLogo && (
                printCompany.logo_url ? (
                  <img className="delivery-logo" src={printCompany.logo_url} alt="公司 Logo" style={{ width: `${logoWidth}px` }} />
                ) : (
                  <div className="delivery-logo-placeholder" style={{ width: `${logoWidth}px` }}>LOGO</div>
                )
              )}
            </div>
            <div className="delivery-title">
              <h1>{printCompany.company_name}</h1>
              <p>
                {printCompany.company_address}
                {printCompany.contact_phone ? `  电话：${printCompany.contact_phone}` : ''}
                {printCompany.email ? `  邮箱：${printCompany.email}` : ''}
              </p>
              <h2>{title}</h2>
            </div>
            <div className="delivery-meta">
              <p>制 单 人：系统管理员</p>
              <p>日期：{documentDate}</p>
            </div>
          </header>

          <table className="delivery-table mt-3">
            <colgroup>
              <col className="delivery-col-sku" />
              <col className="delivery-col-name" />
              <col className="delivery-col-unit" />
              <col className="delivery-col-qty" />
              {!printSettings.hideAmounts && <col className="delivery-col-price" />}
              {!printSettings.hideAmounts && (
                printSettings.showAmountGrid
                  ? Array.from({ length: 8 }).map((_, index) => <col key={index} className="delivery-col-money" />)
                  : <col className="delivery-col-amount" />
              )}
              <col className="delivery-col-remark" />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan="2">商品编号</th>
                <th rowSpan="2">商品名称</th>
                <th rowSpan="2">单位</th>
                <th rowSpan="2">数量</th>
                {!printSettings.hideAmounts && <th rowSpan="2">单价</th>}
                {!printSettings.hideAmounts && <th colSpan={printSettings.showAmountGrid ? 8 : 1} rowSpan={printSettings.showAmountGrid ? 1 : 2}>金额</th>}
                <th rowSpan="2">备注</th>
              </tr>
              {!printSettings.hideAmounts && printSettings.showAmountGrid && (
                <tr>
                  {['十', '万', '千', '百', '十', '元', '角', '分'].map((label, index) => (
                    <th key={`${label}-${index}`} className="money-cell">{label}</th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {Array.from({ length: Math.max(8, items.length) }).map((_, index) => {
                const item = items[index];
                const amountCells = splitAmountCells(item?.amount || 0);
                return (
                  <tr key={item?.id || index}>
                    <td>{item?.product_sku || ''}</td>
                    <td>{item?.product_name || ''}</td>
                    <td>{item?.unit || ''}</td>
                    <td>{item?.quantity || ''}</td>
                    {!printSettings.hideAmounts && <td>{item ? formatMoney(item.price) : ''}</td>}
                    {!printSettings.hideAmounts && (
                      printSettings.showAmountGrid
                        ? amountCells.map((digit, digitIndex) => <td key={digitIndex} className="money-cell">{item ? digit : ''}</td>)
                        : <td>{item ? formatMoney(item.amount) : ''}</td>
                    )}
                    <td>{item?.remark || ''}</td>
                  </tr>
                );
              })}
              {!printSettings.hideAmounts && (
                <tr>
                  <td colSpan={printSettings.showAmountGrid ? 14 : 7} className="text-left">金额合计：￥{formatMoney(total)}</td>
                </tr>
              )}
            </tbody>
          </table>
          {printSettings.showQrCode && qrDataUrl && (
            <div className="document-qr">
              <img src={qrDataUrl} alt="单据二维码" />
              <span>扫码查看单据详情</span>
            </div>
          )}
          </section>
        </article>
      </div>
    </div>
  );
}

function emptyDeliveryItem() {
  return {
    localId: `${Date.now()}-${Math.random()}`,
    product_id: '',
    product_sku: '',
    product_name: '',
    spec: '',
    unit: '',
    quantity: 1,
    price: 0,
    amount: 0,
    remark: '',
  };
}

function normalizeOrderForEdit(order) {
  return {
    ...order,
    items: (order.delivery_order_items || []).map((item) => ({ ...item, localId: item.id })),
  };
}

function totalOrderAmount(items = []) {
  return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function totalOrderQuantity(items = []) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function Pagination({ page, pageCount, onPageChange }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
      <button className="btn-secondary" type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</button>
      {Array.from({ length: pageCount }, (_, index) => index + 1).map((item) => (
        <button
          key={item}
          className={item === page ? 'btn-primary' : 'btn-secondary'}
          type="button"
          onClick={() => onPageChange(item)}
        >
          {item}
        </button>
      ))}
      <button className="btn-secondary" type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>下一页</button>
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, action, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          {Icon && <div className="mt-0.5 text-slate-500"><Icon size={20} /></div>}
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
      <input className="input pl-10" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function RowActions({ canEdit, canDelete, onEdit, onDelete }) {
  return (
    <div className="flex justify-end gap-2">
      {canEdit && <button className="icon-button" title="编辑" onClick={onEdit}><Pencil size={16} /></button>}
      {canDelete && <button className="icon-button text-red-600" title="删除" onClick={onDelete}><Trash2 size={16} /></button>}
      {!canEdit && !canDelete && <span className="text-sm text-slate-400">仅查看</span>}
    </div>
  );
}

function NoPermission() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
      无权限访问此页面
    </div>
  );
}

function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 print:hidden">
      <section className={`max-h-[90vh] w-full overflow-y-auto rounded-lg bg-white shadow-xl ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}

function ModalActions({ onCancel, saving }) {
  return (
    <div className="flex justify-end gap-2">
      <button className="btn-secondary" type="button" onClick={onCancel} disabled={saving}>取消</button>
      <button className="btn-primary" type="submit" disabled={saving}>{saving ? '保存中...' : '保存'}</button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function EmptyText({ text }) {
  return <p className="py-4 text-center text-sm text-slate-500">{text}</p>;
}

function AlertMessage({ type, text, onClose }) {
  const tone = type === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-red-200 bg-red-50 text-red-700';
  return (
    <div className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-sm ${tone}`}>
      <span>{text}</span>
      {onClose && <button onClick={onClose} className="font-semibold" type="button">×</button>}
    </div>
  );
}

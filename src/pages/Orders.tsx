import { useState, useEffect, useMemo, useRef, type FormEvent } from "react";
import { Plus, Search, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { ShippingStatusBadge } from "../components/ShippingStatusBadge";
import { Modal } from "../components/Modal";
import { CitySelector, type CitySelectorValue } from "../components/CitySelector";
import { supabase } from "../lib/supabase";
import { toast } from "../components/Toast";
import { createShipment as createShipmentViaEngine } from "../services/shippingService";
import { normalizeShippingStatus } from "../lib/shippingStatus";
import type { Order, ShipmentEvent, ShipmentRecord } from "../lib/types";
import { useAuth } from "../hooks/useAuth";
import { StatusSelect } from "../components/StatusSelect";
import { normalizeStatus, type CanonicalStatus } from "../lib/statusEngine";
import { normalizeStatus as getInternalStatus } from "../utils/status";
import { formatOzonAddress, initializeOzonCities } from "../services/ozonService";
import { useGlobalOrders } from "../contexts/OrdersContext";

// Check if string contains Arabic characters
function isArabic(str: string): boolean {
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return arabicPattern.test(str);
}

// Normalize string for comparison
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .trim();
}

// Resolve city ID using ozon_cities table with Arabic support
async function resolveCityId(cityName: string): Promise<{ ozon_city_id: number | null; city_name: string }> {
  if (!cityName) return { ozon_city_id: null, city_name: "" };

  // If it's already a numeric ID, return it
  const trimmed = cityName.trim();
  if (/^\d+$/.test(trimmed)) {
    return { ozon_city_id: parseInt(trimmed, 10), city_name: cityName };
  }

  // Try Arabic name match first if input contains Arabic
  if (isArabic(cityName)) {
    const { data: arabicMatch } = await supabase
      .from('city_arabic_names')
      .select('ozon_city_id')
      .eq('arabic_name', cityName.trim())
      .single();

    if (arabicMatch) {
      const { data: cityData } = await supabase
        .from('ozon_cities')
        .select('name')
        .eq('id', arabicMatch.ozon_city_id)
        .single();
      if (cityData) return { ozon_city_id: arabicMatch.ozon_city_id, city_name: cityData.name };
    }

    // Try partial Arabic match
    const { data: arabicPartial } = await supabase
      .from('city_arabic_names')
      .select('ozon_city_id')
      .ilike('arabic_name', `%${cityName.trim()}%`)
      .limit(1);

    if (arabicPartial && arabicPartial.length > 0) {
      const { data: cityData } = await supabase
        .from('ozon_cities')
        .select('name')
        .eq('id', arabicPartial[0].ozon_city_id)
        .single();
      if (cityData) return { ozon_city_id: arabicPartial[0].ozon_city_id, city_name: cityData.name };
    }

    // If Arabic and no match, return null without fallback
    return { ozon_city_id: null, city_name: cityName };
  }

  const normalizedInput = normalizeString(cityName);

  // Try exact match first
  const { data: exactMatch } = await supabase
    .from('ozon_cities')
    .select('id, name')
    .eq('name', normalizedInput)
    .single();

  if (exactMatch) return { ozon_city_id: exactMatch.id, city_name: exactMatch.name };

  // Try alias match
  const { data: aliasMatch } = await supabase
    .from('city_aliases')
    .select('ozon_city_id')
    .eq('alias', normalizedInput)
    .single();

  if (aliasMatch) {
    const { data: cityData } = await supabase
      .from('ozon_cities')
      .select('name')
      .eq('id', aliasMatch.ozon_city_id)
      .single();
    if (cityData) return { ozon_city_id: aliasMatch.ozon_city_id, city_name: cityData.name };
  }

  // Fallback to substring match (only for Latin text)
  const { data: substringMatches } = await supabase
    .from('ozon_cities')
    .select('id, name')
    .ilike('name', `%${normalizedInput}%`)
    .limit(1);

  if (substringMatches && substringMatches.length > 0) {
    return { ozon_city_id: substringMatches[0].id, city_name: substringMatches[0].name };
  }

  return { ozon_city_id: null, city_name: cityName };
}

function isConfirmedOrderStatus(status: string) {
  const internal = getInternalStatus(status);
  return internal === 'CONFIRMED' || internal === 'OUT_FOR_DELIVERY' || internal === 'DELIVERED' || internal === 'COMING_BACK';
}

function mad(n: number) {
  return `MAD ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function isMissingAddressColumnError(error: { message?: string } | null | undefined) {
  return Boolean(error?.message && /address/i.test(error.message) && /(schema cache|column)/i.test(error.message));
}

const googleSheetSyncRequests = new Map<string, Promise<{ inserted: number; errors: string[] }>>();

async function runGoogleSheetSyncInternal(
  wid: string,
  url: string,
  onProgress?: (msg: string) => void
): Promise<{ inserted: number; errors: string[] }> {
  console.log(`[Sync] Fetching Google Sheet from URL...`);
  const res = await fetch(url);
  console.log(`[Sync] HTTP Status: ${res.status} ${res.statusText}`);
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.statusText}`);

  let data;
  try {
    data = await res.json();
  } catch (err: any) {
    console.error("[Sync] Parse error", err);
    throw new Error("La réponse n'est pas un JSON valide.");
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.error("[Sync] Invalid sheet format, not an array or empty.");
    throw new Error("Invalid sheet format — expected a JSON array of rows.");
  }

  const isObjectArray = data.length > 0 && data[0] !== null && typeof data[0] === 'object' && !Array.isArray(data[0]);
  const rawHeaders = isObjectArray ? Object.keys(data[0]) : (data[0] || []);
  const headers = rawHeaders.map((h: any) => String(h).toLowerCase().trim());
  console.log("[Sync] Detected headers:", headers);

  // Load saved column mappings
  const { data: mappingsData, error: mappingsError } = await supabase
    .from("google_sheet_column_mappings")
    .select("sheet_column, order_field")
    .eq("workspace_id", wid);

  const columnMapping = new Map<string, string>();
  if (!mappingsError && mappingsData) {
    for (const m of mappingsData) {
      columnMapping.set(m.sheet_column.toLowerCase(), m.order_field);
    }
  }

  // Helper to get column index from mappings or fallback to auto-detection
  const getColumnIndex = (field: string, fallbackKeywords: string[]): number => {
    // First check if we have a mapping for this field
    for (const [sheetCol, orderField] of columnMapping.entries()) {
      if (orderField === field) {
        return headers.indexOf(sheetCol);
      }
    }

    // Fallback to auto-detection
    return headers.findIndex((h: string) =>
      fallbackKeywords.some(keyword => h.includes(keyword))
    );
  };

  const dateIdx = getColumnIndex("created_at", ["date", "time", "horodatage", "created"]);
  const nameIdx = getColumnIndex("customer_name", ["name", "nom", "client", "first name", "customer", "customer name"]);
  const phoneIdx = getColumnIndex("phone", ["phone", "tel", "téléphone"]);
  const cityIdx = getColumnIndex("city", ["city", "ville"]);
  const priceIdx = getColumnIndex("total", ["price", "prix", "total", "montant", "variant price"]);
  const skuIdx = getColumnIndex("sku", ["sku", "ref"]);
  const ipIdx = getColumnIndex("", ["ip"]);
  const variantIdx = getColumnIndex("product_variant", ["variant", "produit", "product"]);

  const missing = [];
  if (nameIdx === -1) missing.push("Nom/Name");
  if (phoneIdx === -1) missing.push("Téléphone/Phone");
  if (cityIdx === -1) missing.push("Ville/City");

  if (missing.length > 0) {
    const errMsg = `En-têtes obligatoires manquants : ${missing.join(", ")}. Vérifiez la première ligne de votre Google Sheet ou configurez le mappage de colonnes.`;
    console.error("[Sync]", errMsg);
    throw new Error(errMsg);
  }

  let rows;
  if (isObjectArray) {
    rows = data.map((obj: any) => rawHeaders.map((key: string) => obj[key]));
  } else {
    rows = data.slice(1);
  }
  onProgress?.(`Found ${rows.length} rows. Probing database…`);

  // ── 1. Find the highest/most recent Order ID (row suffix) in the database ──
  const { data: existingOrders } = await supabase
    .from("orders")
    .select("order_number")
    .eq("workspace_id", wid)
    .like("order_number", "#GS-%");

  let maxRowIndex = 0;
  if (existingOrders) {
    for (const ord of existingOrders) {
      const parts = ord.order_number.split("-");
      const lastPart = parts[parts.length - 1];
      const rowNum = parseInt(lastPart, 10);
      if (!isNaN(rowNum) && rowNum > maxRowIndex) {
        maxRowIndex = rowNum;
      }
    }
  }

  // Start sequence from maxRowIndex + 1 to avoid collisions with existing orders
  let currentRowIndex = maxRowIndex + 1;

  // ── 2. Probe available columns using select("*") — never select("id") ───
  let hasCustomerId = false;
  let hasCustomers = false;
  let hasOrderItems = false;

  const { error: probeErr } = await supabase
    .from("orders")
    .select("customer_id")
    .limit(1);
  hasCustomerId = !probeErr;
  if (hasCustomerId) {
    const { error: cErr } = await supabase.from("customers").select("phone").limit(1);
    hasCustomers = !cErr;
  }
  const { error: oiErr } = await supabase.from("order_items").select("order_id").limit(1);
  hasOrderItems = !oiErr;

  // ── 3. Only Process New Orders (newer than maxRowIndex) ───────────────
  const newItems = rows
    .map((row, index) => ({ row, sheetIndex: index + 1 }))
    .filter((item) => item.sheetIndex > maxRowIndex);

  // Resolve the sheet's known customers in one request. The import must never
  // make one customer lookup per order row.
  const existingCustomersByPhone = new Map<string, { id: string; phone: string | null }>();
  if (hasCustomerId && hasCustomers) {
    const phones = Array.from(new Set(newItems
      .map(({ row }) => phoneIdx !== -1 && row[phoneIdx] != null ? String(row[phoneIdx]).trim() : "")
      .filter((phone) => Boolean(phone) && phone.toLowerCase() !== "null")));

    for (let start = 0; start < phones.length; start += 200) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id, phone")
        .eq("workspace_id", wid)
        .in("phone", phones.slice(start, start + 200));
      for (const customer of customers ?? []) {
        if (customer.phone) existingCustomersByPhone.set(customer.phone, customer);
      }
    }
  }

  let inserted = 0;
  const rowErrors: string[] = [];

  await initializeOzonCities();

  for (let k = 0; k < newItems.length; k++) {
    const { row, sheetIndex } = newItems[k];
    if (!row || row.length === 0) continue;

    const orderDate = dateIdx !== -1 ? row[dateIdx] : new Date().toISOString();
    const customerName = String(row[nameIdx] ?? "").trim();
    let phone = phoneIdx !== -1 && row[phoneIdx] != null ? String(row[phoneIdx]).trim() : null;

    const rawCityStr = cityIdx !== -1 ? String(row[cityIdx] ?? "").trim() : "";
    const cityResolution = await resolveCityId(rawCityStr);
    let city = cityResolution.city_name || rawCityStr;
    let ozon_city_id = cityResolution.ozon_city_id;
    let city_name = cityResolution.city_name;
    let address = "";

    // Calculate shipping cost using Smart Pricing Engine
    let shippingCost = null;
    if (ozon_city_id) {
      const { data: cityData } = await supabase
        .from("ozon_cities")
        .select("delivered_price")
        .eq("id", ozon_city_id)
        .single();
      if (cityData && cityData.delivered_price) {
        shippingCost = cityData.delivered_price;
      } else {
        // Fallback to business delivery fee
        const { data: workspaceData } = await supabase
          .from("workspaces")
          .select("business_delivery_fee")
          .eq("id", wid)
          .single();
        shippingCost = workspaceData?.business_delivery_fee || 35;
      }
    }

    const variantPrice = priceIdx !== -1 ? Number(row[priceIdx] ?? 0) : 0;
    const sku = skuIdx !== -1 ? String(row[skuIdx] ?? "").trim() : "";
    const customerIp = ipIdx !== -1 ? String(row[ipIdx] ?? "").trim() : "";
    const productVariant = variantIdx !== -1 ? String(row[variantIdx] ?? "").trim() : "";

    if (!customerName) continue;
    if (phone === "" || phone?.toLowerCase() === "null") phone = null;

    onProgress?.(`[${k + 1}/${newItems.length}] Processing new order: ${customerName}…`);

    // ── Customer ─────────────────────────────────────────────────────────────
    let customerId: string | null = null;
    if (hasCustomerId && hasCustomers && phone) {
      const ec = existingCustomersByPhone.get(phone);
      if (ec) {
        customerId = ec.id;
      } else {
        const { data: nc, error: ncErr } = await supabase
          .from("customers")
          .insert({ name: customerName, phone, city, workspace_id: wid })
          .select("id, phone")
          .single();
        if (!ncErr && nc) {
          customerId = nc.id;
          if (nc.phone) existingCustomersByPhone.set(nc.phone, nc);
        }
      }
    }

    // ── Parse stable date portion ───────────────────────────────────────────
    let parsedDate: Date;
    try {
      const dateStr = String(orderDate).trim();
      const match = dateStr.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
      if (match) {
        parsedDate = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
      } else {
        parsedDate = new Date(orderDate);
      }
      if (isNaN(parsedDate.getTime())) {
        parsedDate = new Date("2026-01-01T00:00:00Z");
      }
    } catch {
      parsedDate = new Date("2026-01-01T00:00:00Z");
    }

    const orderNumber = `#GS-${currentRowIndex}`;
    currentRowIndex++;

    // Insert new order
    const payload: Record<string, unknown> = {
      order_number: orderNumber,
      workspace_id: wid,
      customer_name: customerName,
      city: city || null,
      ozon_city_id: ozon_city_id || null,
      city_name: city_name || null,
      address: address || null,
      total: variantPrice,
      status: "pending",
      created_at: parsedDate.toISOString(),
      phone: phone || null,
      variant_price: variantPrice,
      sku: sku || null,
      customer_ip: customerIp || null,
      product_variant: productVariant || null,
      shipping_cost: shippingCost,
    };
    if (hasCustomerId && customerId) payload.customer_id = customerId;

    const { error: insErr } = await supabase
      .from("orders")
      .upsert(payload, { onConflict: "order_number" });
    if (insErr) {
      rowErrors.push(`Row ${sheetIndex} (${customerName}): ${insErr.message}`);
      continue;
    }
    inserted++;

    // Product upsert by SKU (natural key)
    if (sku && hasOrderItems) {
      await supabase.from("products").upsert(
        {
          name: productVariant || sku,
          sku,
          price: variantPrice,
          cost: 0,
          stock: 100,
          status: "active",
          workspace_id: wid,
        },
        { onConflict: "sku,workspace_id", ignoreDuplicates: true }
      );
    }
  }

  return { inserted, errors: rowErrors };
}

/**
 * The app shell owns Google Sheet polling. A shared single-flight guard keeps
 * StrictMode remounts, visibility events and manual triggers from importing
 * the same sheet twice for one workspace.
 */
export function runGoogleSheetSync(
  wid: string,
  url: string,
  onProgress?: (msg: string) => void,
): Promise<{ inserted: number; errors: string[] }> {
  const key = `${wid}:${url}`;
  const active = googleSheetSyncRequests.get(key);
  if (active) return active;

  const request = runGoogleSheetSyncInternal(wid, url, onProgress)
    .finally(() => {
      if (googleSheetSyncRequests.get(key) === request) googleSheetSyncRequests.delete(key);
    });
  googleSheetSyncRequests.set(key, request);
  return request;
}

export default function Orders() {
  const { workspace, refreshProfile } = useAuth();
  const { globalOrders: allOrders, loading, reloadGlobalOrders: reload } = useGlobalOrders();
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "youcan" | "sheets" | "manual">("all");

  const [showNew, setShowNew] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // Infinite Scroll state
  const [visibleCount, setVisibleCount] = useState(50);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight * 1.5) {
      setVisibleCount(prev => prev + 50);
    }
  };

  // Filter orders locally from the master dataset
  const orders = useMemo(() => {
    return allOrders.filter((o) => {
      // Status filter
      if (status !== "all" && normalizeStatus(o.status) !== normalizeStatus(status)) {
        return false;
      }

      // Source filter
      if (sourceFilter !== "all" && o.source !== sourceFilter) {
        return false;
      }

      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const haystack = `${o.order_number} ${o.customer?.name ?? o.customer_name ?? ''} ${o.customer?.phone} ${o.city} ${o.address}`.toLowerCase();
        return haystack.includes(searchLower);
      }

      return true;
    });
  }, [allOrders, status, sourceFilter, search]);

  const displayOrders = useMemo(() => orders.slice(0, visibleCount), [orders, visibleCount]);

  const showShippingColumn = workspace?.show_shipping_column ?? false;

  // Auto Sync states
  const [autoSync, setAutoSync] = useState(false);

  // Load autosync setting on mount/workspace change
  useEffect(() => {
    setAutoSync(Boolean(workspace?.google_sheet_autosync ?? false));
  }, [workspace?.id, workspace?.google_sheet_autosync]);

  const handleToggleAutoSync = async () => {
    if (!workspace?.id) return;
    const next = !autoSync;
    setAutoSync(next);

    const { error } = await supabase
      .from("workspaces")
      .update({ google_sheet_autosync: next })
      .eq("id", workspace.id);

    if (error) {
      setAutoSync(!next);
      console.error("[Orders] Unable to persist auto sync setting:", error);
      return;
    }

    await refreshProfile();
  };

  // Listen for global auto-sync reloads
  useEffect(() => {
    const onReload = () => reload(true);
    window.addEventListener("trigger-order-reload", onReload);
    return () => window.removeEventListener("trigger-order-reload", onReload);
  }, [reload]);

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Full CRM for your COD orders — search, filter, edit, ship."
        action={
          <div className="flex gap-2 items-center">
            <button
              onClick={handleToggleAutoSync}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-all ${autoSync
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                : "border-base-border bg-base-surface text-ink-muted hover:bg-base-raised hover:text-ink"
                }`}
            >
              <span className={`h-2 w-2 rounded-full ${autoSync ? "bg-emerald-500 animate-pulse" : "bg-zinc-500"}`} />
              {autoSync ? "Auto Sync: ON" : "Auto Sync: OFF"}
            </button>
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-accentHover"
            >
              <Plus size={14} /> New order
            </button>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, phone..."
            className="w-full rounded-lg border border-base-border bg-base-surface py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand-accent/50"
          />
        </div>
        <StatusSelect
          value={status}
          onChange={(val) => setStatus(val)}
          includeAll={true}
          allLabel="All statuses"
          className="rounded-lg border border-base-border bg-base-surface px-3 py-2 text-[13px] text-ink"
        />
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as "all" | "youcan" | "sheets" | "manual")}
          className="rounded-lg border border-base-border bg-base-surface px-3 py-2 text-[13px] text-ink"
        >
          <option value="all">All sources</option>
          <option value="youcan">YouCan</option>
          <option value="sheets">Google Sheets</option>
          <option value="manual">Manual</option>
        </select>
        <div className="text-[12.5px] text-ink-muted">{orders.filter(o => sourceFilter === "all" || o.source === sourceFilter).length} orders</div>
      </div>

      <div className="hidden md:block overflow-x-auto rounded-xl border border-base-border bg-base-surface shadow-card max-h-[100vh] lg:max-h-[calc(100vh-180px)] overflow-y-auto relative" ref={scrollContainerRef} onScroll={handleScroll}>
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-base-surface z-10 shadow-sm">
            <tr className="border-b border-base-border text-left text-[12px] text-ink-muted">
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">City</th>
              <th className="px-4 py-3 font-medium">Address</th>
              <th className="px-4 py-3 font-medium">Total</th>
              {showShippingColumn && <th className="px-4 py-3 font-medium">Shipping</th>}
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Variant</th>
              <th className="px-4 py-3 font-medium">Tracking</th>
              <th className="px-4 py-3 font-medium min-w-[120px]">Status</th>
              <th className="px-4 py-3 font-medium min-w-[140px]">Shipping Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && orders.length === 0 ? (
              <tr>
                <td colSpan={showShippingColumn ? 13 : 12} className="px-4 py-10 text-center text-ink-muted">
                  Loading orders...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={showShippingColumn ? 13 : 12}>
                  <EmptyState title="No orders found" subtitle={`No orders matching the selected source filter.`} />
                </td>
              </tr>
            ) : (
              displayOrders.map((o: Order & { delivery_status?: string | null }) => (
                <tr
                  key={o.id || o.order_number}
                  onClick={() => setEditingOrder(o)}
                  className="border-b border-base-border last:border-0 hover:bg-base-raised/60 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-ink">{o.order_number}</td>
                  <td className="px-4 py-3 text-ink">{o.customer?.name ?? o.customer_name ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted font-mono">{o.phone ?? o.customer?.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted">{o.city ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted">{o.address ? o.address : "No address"}</td>
                  <td className="px-4 py-3 font-mono text-ink">{mad(o.total)}</td>
                  {showShippingColumn && (
                    <td className="px-4 py-3 font-mono text-ink-muted">
                      {(o as any).ozon_city_id === null ? (
                        <span className="text-warning text-[11px]">Ville à vérifier</span>
                      ) : (o as any).shipping_cost !== null ? (
                        <span>{mad((o as any).shipping_cost)}</span>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-ink-muted font-mono">{o.sku ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted">{o.product_variant ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-ink-muted">{o.tracking_number ?? o.coliaty_parcel_code ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {/* Status column ALWAYS shows order.status (confirmation workflow) */}
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {/* Shipping Status column ALWAYS shows order.shipping_status (shipping workflow) */}
                    <ShippingStatusBadge status={o.shipping_status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden flex flex-col gap-3 pb-8">
        {loading && orders.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border-none bg-base-surface/60 p-4 shadow-xl backdrop-blur-xl animate-pulse">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="h-4 w-32 bg-base-raised rounded mb-2" />
                  <div className="h-3 w-24 bg-base-raised rounded" />
                </div>
                <div className="h-5 w-16 bg-base-raised rounded" />
              </div>
              <div className="flex gap-2 justify-between items-center">
                <div className="flex gap-2">
                  <div className="h-5 w-16 bg-base-raised rounded-full" />
                  <div className="h-5 w-16 bg-base-raised rounded-full" />
                </div>
                <div className="h-4 w-12 bg-base-raised rounded" />
              </div>
            </div>
          ))
        ) : orders.length === 0 ? (
          <EmptyState title="No orders yet" subtitle="New orders will show up here." />
        ) : (
          displayOrders.map((o: Order & { delivery_status?: string | null }) => (
            <div
              key={o.order_number}
              onClick={() => setEditingOrder(o)}
              className="rounded-2xl border-none bg-base-surface/60 p-4 shadow-xl backdrop-blur-xl relative overflow-hidden active:scale-[0.98] transition-transform"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-[16px] font-bold text-ink mb-0.5">{o.customer?.name ?? o.customer_name ?? "Unknown"}</div>
                  <div className="text-[13px] text-ink-muted">{o.city || "No City"} • <span className="font-mono text-ink-muted">{o.phone ?? o.customer?.phone ?? "No phone"}</span></div>
                  <div className="mt-2 text-[12px] text-ink-muted">Address: {o.address ? o.address : "No address"}</div>
                  {showShippingColumn && (
                    <div className="mt-1 text-[12px] text-ink-muted">
                      Shipping: {(o as any).ozon_city_id === null ? (
                        <span className="text-warning">Ville à vérifier</span>
                      ) : (o as any).shipping_cost !== null ? (
                        <span className="font-mono">{mad((o as any).shipping_cost)}</span>
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-mono text-[16px] font-bold text-ink tracking-tight">{mad(o.total)}</div>
                  <div className="font-mono text-[11px] text-ink-muted mt-0.5">{o.order_number}</div>
                </div>
              </div>

              {/* Product details preview */}
              {(o.product_variant || o.sku) && (
                <div className="bg-base-raised/30 rounded-lg p-2.5 mb-4 text-[13px] text-ink">
                  <span className="text-ink font-medium">{o.product_variant || "Product"}</span>
                  {o.sku && <span className="text-ink-muted font-mono ml-2 text-[11.5px] px-1.5 py-0.5 bg-base-raised rounded">{o.sku}</span>}
                </div>
              )}

              <div className="flex gap-2 items-center justify-between">
                {/* Statuses - Status badge shows order.status, Shipping Status badge shows order.shipping_status */}
                <div className="flex gap-2 overflow-x-auto whitespace-nowrap">
                  <StatusBadge status={o.status} />
                  <ShippingStatusBadge status={o.shipping_status} />
                </div>
                <div className="text-[11px] text-ink-muted font-medium">
                  {new Date(o.created_at).toLocaleDateString("en-GB", { month: 'short', day: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showNew && (
        <NewOrderModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            reload(true);
          }}
        />
      )}

      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onUpdated={() => {
            setEditingOrder(null);
            reload(true);
          }}
        />
      )}
    </div>
  );
}

function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { workspace } = useAuth();
  const carrier = workspace?.carrier || 'ozon';
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cityValue, setCityValue] = useState<CitySelectorValue>({ ozon_city_id: null, city_name: "" });
  const [address, setAddress] = useState("");
  const [total, setTotal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Diagnostic: log the current workspace state
    console.log("[NewOrder] workspace:", workspace);
    if (!workspace?.id) {
      setError("ERROR: workspace is not loaded. workspace = " + JSON.stringify(workspace));
      return;
    }

    if (carrier === 'ozon' ? !cityValue.ozon_city_id : !cityValue.carrier_city_id) {
      setError("Please select a city from the dropdown");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const custPayload = { name, phone, city: cityValue.city_name, workspace_id: workspace.id };
      console.log("[NewOrder] Inserting customer:", custPayload);

      const { data: customer, error: custErr } = await supabase
        .from("customers")
        .insert(custPayload)
        .select()
        .single();

      if (custErr) {
        console.error("[NewOrder] Customer INSERT failed:", {
          code: custErr.code,
          message: custErr.message,
          details: custErr.details,
          hint: custErr.hint,
        });
        throw new Error(`Customer insert failed: [${custErr.code}] ${custErr.message}${custErr.details ? " — " + custErr.details : ""}${custErr.hint ? " (hint: " + custErr.hint + ")" : ""}`);
      }

      // Calculate shipping cost using Smart Pricing Engine
      let shippingCost = null;
      if (cityValue.ozon_city_id) {
        const { data: cityData } = await supabase
          .from("ozon_cities")
          .select("delivered_price")
          .eq("id", cityValue.ozon_city_id)
          .single();
        if (cityData && cityData.delivered_price) {
          shippingCost = cityData.delivered_price;
        } else {
          // Fallback to business delivery fee
          const { data: workspaceData } = await supabase
            .from("workspaces")
            .select("business_delivery_fee")
            .eq("id", workspace.id)
            .single();
          shippingCost = workspaceData?.business_delivery_fee || 35;
        }
      }
      if (carrier === 'sendit' && cityValue.carrier_city_price != null) {
        shippingCost = cityValue.carrier_city_price;
      }

      const orderNumber = `#${Math.floor(1000 + Math.random() * 9000)}`;
      const orderPayload = {
        order_number: orderNumber,
        customer_id: customer.id,
        customer_name: name,
        city: cityValue.city_name,
        raw_city: cityValue.raw_city || cityValue.city_name,
        provider_city_id: carrier === 'sendit' ? String(cityValue.carrier_city_id) : null,
        ozon_city_id: carrier === 'ozon' ? cityValue.ozon_city_id : null,
        coliaty_city_id: carrier === 'coliaty' ? cityValue.carrier_city_id : null,
        city_name: cityValue.city_name,
        address,
        total: Number(total),
        status: "pending",
        workspace_id: workspace.id,
        shipping_cost: shippingCost,
      };
      console.log("[NewOrder] Inserting order:", orderPayload);

      const { error: orderErr } = await supabase.from("orders").insert(orderPayload);
      if (orderErr) {
        console.error("[NewOrder] Order INSERT failed:", {
          code: orderErr.code,
          message: orderErr.message,
          details: orderErr.details,
          hint: orderErr.hint,
        });
        throw new Error(`Order insert failed: [${orderErr.code}] ${orderErr.message}${orderErr.details ? " — " + orderErr.details : ""}${orderErr.hint ? " (hint: " + orderErr.hint + ")" : ""}`);
      }

      onCreated();
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New order" onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field label="Customer name" value={name} onChange={setName} required />
        <Field label="Phone" value={phone} onChange={setPhone} required />
        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">City <span className="text-danger">*</span></label>
          <CitySelector
            value={cityValue}
            onChange={setCityValue}
            placeholder="Search city..."
            required
            carrier={carrier}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand-accent/50"
            placeholder="Enter delivery address"
          />
        </div>
        <Field label="Total (MAD)" value={total} onChange={setTotal} type="number" required />
        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-lg bg-brand-accent py-2 text-[13px] font-medium text-white hover:bg-brand-accentHover disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create order"}
        </button>
      </form>
    </Modal>
  );
}

function EditOrderModal({ order, onClose, onUpdated }: { order: Order; onClose: () => void; onUpdated: () => void }) {
  const { workspace } = useAuth();
  const carrier = workspace?.carrier || 'ozon';

  const [name, setName] = useState(order.customer?.name || "");
  const [phone, setPhone] = useState(order.phone || order.customer?.phone || "");
  const [cityValue, setCityValue] = useState<CitySelectorValue>({
    ozon_city_id: (order as any).ozon_city_id || null,
    carrier_city_id: carrier === 'sendit' ? Number((order as any).provider_city_id) || null : (order as any).coliaty_city_id || null,
    city_name: (order as any).city_name || order.city || "",
    raw_city: (order as any).raw_city || (order as any).city_name || order.city || "",
  });
  const [address, setAddress] = useState(order.address || "");
  const [total, setTotal] = useState(String(order.total));
  const [status, setStatus] = useState<CanonicalStatus>(normalizeStatus(order.status));
  const [deliveryStatus, setDeliveryStatus] = useState<CanonicalStatus>(
    normalizeStatus(order.delivery_status ?? (isConfirmedOrderStatus(order.status) ? "pending" : ""))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isConfirmedOrderStatus(status)) {
        const fullAddr = formatOzonAddress(address, cityValue.city_name);
        if (!fullAddr || fullAddr.length < 5) {
          setError("L'adresse de livraison est trop courte (minimum 5 caractères requis pour la livraison). Veuillez la compléter.");
          setBusy(false);
          return;
        }
      }

      console.log("[EditOrderModal] === STARTING ORDER UPDATE ===");
      console.log("[EditOrderModal] Full order object:", order);
      console.log("[EditOrderModal] order.id:", order.id);
      console.log("[EditOrderModal] order['Order ID']:", (order as any)["Order ID"]);
      console.log("[EditOrderModal] order.order_number:", order.order_number);
      console.log("[EditOrderModal] workspace?.id:", workspace?.id);

      const orderKey = (order as any)["Order ID"] ? '"Order ID"' : 'id';
      const orderId = (order as any)["Order ID"] || order.id;
      console.log("[EditOrderModal] Using order key for update:", orderKey, orderId);

      if (!orderId) {
        throw new Error("Order ID is missing. Cannot update order. order.id=" + order.id + ", order['Order ID']=" + (order as any)["Order ID"]);
      }

      // CRITICAL: First verify the order exists with workspace filter
      console.log("[EditOrderModal] Verifying order exists with workspace filter...");
      const { data: existingOrder, error: checkError } = await supabase
        .from("orders")
        .select(`${orderKey}, workspace_id, order_number`)
        .eq(orderKey, orderId)
        .eq("workspace_id", workspace?.id)
        .single();

      console.log("[EditOrderModal] Existing order check:", existingOrder);
      console.log("[EditOrderModal] Existing order check error:", checkError);

      if (checkError) {
        console.error("[EditOrderModal] Order check failed with error:", checkError);
        throw new Error(`Order lookup failed. Order ID: ${orderId}, Workspace: ${workspace?.id}, Error: ${checkError.message}. This might be an RLS permission issue.`);
      }

      if (!existingOrder) {
        console.error("[EditOrderModal] Order not found in database with workspace filter");
        throw new Error(`Order not found in database with workspace filter. Order ID: ${orderId}, Workspace: ${workspace?.id}. This means either the order doesn't exist, or you don't have permission to access it in this workspace.`);
      }

      console.log("[EditOrderModal] Order verified, proceeding with update");

      if (order.customer_id) {
        console.log("[EditOrderModal] Updating customer:", order.customer_id);
        const customerUpdate = await supabase.from("customers").update({ name, phone, city: cityValue.city_name }).eq("id", order.customer_id).eq("workspace_id", workspace?.id).select();
        console.log("[EditOrderModal] Customer update response:", customerUpdate);
        if (customerUpdate.error) {
          console.error("[EditOrderModal] Customer update failed:", customerUpdate.error);
        } else if (!customerUpdate.data || customerUpdate.data.length === 0) {
          console.warn("[EditOrderModal] Customer update affected 0 rows");
        }
      }

      // Calculate shipping cost using Smart Pricing Engine
      let shippingCost = null;
      const cityId = cityValue.ozon_city_id || order.ozon_city_id;
      if (cityId) {
        const { data: cityData } = await supabase
          .from("ozon_cities")
          .select("delivered_price")
          .eq("id", cityId)
          .single();
        if (cityData && cityData.delivered_price) {
          shippingCost = cityData.delivered_price;
        } else {
          // Fallback to business delivery fee
          const { data: workspaceData } = await supabase
            .from("workspaces")
            .select("business_delivery_fee")
            .eq("id", workspace?.id)
            .single();
          shippingCost = workspaceData?.business_delivery_fee || 35;
        }
      }
      if (carrier === 'sendit' && cityValue.carrier_city_price != null) {
        shippingCost = cityValue.carrier_city_price;
      }

      const updatePayload = {
        customer_name: name,
        city: cityValue.city_name,
        raw_city: cityValue.raw_city || cityValue.city_name,
        provider_city_id: carrier === 'sendit' ? String(cityValue.carrier_city_id) : null,
        ozon_city_id: carrier === 'ozon' ? cityValue.ozon_city_id : null,
        coliaty_city_id: carrier === 'coliaty' ? cityValue.carrier_city_id : null,
        city_name: cityValue.city_name,
        address,
        total: Number(total),
        status: normalizeStatus(status),
        delivery_status: deliveryStatus === "" ? null : normalizeShippingStatus(deliveryStatus),
        phone,
        shipping_cost: shippingCost,
      };

      console.log("[EditOrderModal] Update payload:", updatePayload);

      console.log("[EditOrderModal] Executing update query...");
      console.log("[EditOrderModal] Query: UPDATE orders SET ... WHERE", orderKey, "=", orderId, "AND workspace_id =", workspace?.id);

      const query = supabase.from("orders").update(updatePayload);
      const response = await query.eq(orderKey, orderId).eq("workspace_id", workspace?.id).select();

      console.log("[EditOrderModal] Update response:", response);
      console.log("[EditOrderModal] Response data:", response.data);
      console.log("[EditOrderModal] Response error:", response.error);
      console.log("[EditOrderModal] Rows affected:", response.data?.length || 0);

      if (response.error) {
        console.error("[EditOrderModal] Update failed:", response.error);
        if (isMissingAddressColumnError(response.error)) {
          const fallbackPayload = {
            customer_name: name,
            city: cityValue.city_name,
            raw_city: cityValue.raw_city || cityValue.city_name,
            provider_city_id: carrier === 'sendit' ? String(cityValue.carrier_city_id) : null,
            ozon_city_id: carrier === 'ozon' ? cityValue.ozon_city_id : null,
            coliaty_city_id: carrier === 'coliaty' ? cityValue.carrier_city_id : null,
            city_name: cityValue.city_name,
            total: Number(total),
            status: normalizeStatus(status),
            delivery_status: deliveryStatus === "" ? null : normalizeShippingStatus(deliveryStatus),
            phone,
          };
          const fallbackQuery = supabase.from("orders").update(fallbackPayload);
          const fallbackResponse = await fallbackQuery.eq('"Order ID"', orderId).eq("workspace_id", workspace?.id).select();

          console.log("[EditOrderModal] Fallback response:", fallbackResponse);
          console.log("[EditOrderModal] Fallback data:", fallbackResponse.data);
          console.log("[EditOrderModal] Fallback rows affected:", fallbackResponse.data?.length || 0);

          if (fallbackResponse.error) {
            console.error("[EditOrderModal] Fallback update also failed:", fallbackResponse.error);
            throw fallbackResponse.error;
          }

          if (!fallbackResponse.data || fallbackResponse.data.length === 0) {
            throw new Error("No rows were updated (fallback). Check if Order ID and workspace ID are correct.");
          }
        } else {
          throw response.error;
        }
      }

      if (!response.data || response.data.length === 0) {
        throw new Error("No rows were updated. Check if Order ID and workspace ID are correct.");
      }

      console.log("[EditOrderModal] Update successful, rows affected:", response.data.length);
      toast.success("Order updated successfully");
      onUpdated();
    } catch (err: any) {
      console.error("[EditOrderModal] Error saving order:", err);
      setError(err.message ?? "Something went wrong");
      toast.error(err.message ?? "Failed to update order");
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this order?")) return;
    setBusy(true);
    try {
      console.log("[EditOrderModal] === STARTING ORDER DELETE ===");
      console.log("[EditOrderModal] Full order object:", order);
      console.log("[EditOrderModal] order.id:", order.id);
      console.log("[EditOrderModal] order['Order ID']:", (order as any)["Order ID"]);
      console.log("[EditOrderModal] order.order_number:", order.order_number);
      console.log("[EditOrderModal] workspace?.id:", workspace?.id);

      // Use the correct primary key: "Order ID" (with space)
      const orderId = (order as any)["Order ID"] || order.id;
      console.log("[EditOrderModal] Using order ID for delete:", orderId);

      if (!orderId) {
        throw new Error("Order ID is missing. Cannot delete order.");
      }

      // CRITICAL: Verify the order exists with workspace filter
      console.log("[EditOrderModal] Verifying order exists before delete...");
      const orderKey = (order as any)["Order ID"] ? '"Order ID"' : 'id';
      const { data: existingOrder, error: checkError } = await supabase
        .from("orders")
        .select(`${orderKey}, workspace_id, order_number`)
        .eq(orderKey, orderId)
        .eq("workspace_id", workspace?.id)
        .single();

      console.log("[EditOrderModal] Existing order check:", existingOrder);
      console.log("[EditOrderModal] Existing order check error:", checkError);

      if (checkError) {
        console.error("[EditOrderModal] Order check failed with error:", checkError);
        throw new Error(`Order lookup failed. Order ID: ${orderId}, Workspace: ${workspace?.id}, Error: ${checkError.message}. This might be an RLS permission issue.`);
      }

      if (!existingOrder) {
        console.error("[EditOrderModal] Order not found in database with workspace filter");
        throw new Error(`Order not found in database with workspace filter. Order ID: ${orderId}, Workspace: ${workspace?.id}. This means either the order doesn't exist, or you don't have permission to access it in this workspace.`);
      }

      console.log("[EditOrderModal] Order verified, proceeding with delete");
      console.log("[EditOrderModal] Executing delete query...");
      console.log("[EditOrderModal] Query: DELETE FROM orders WHERE", orderKey, "=", orderId, "AND workspace_id =", workspace?.id);

      const query = supabase.from("orders").delete();
      const response = await query.eq(orderKey, orderId).eq("workspace_id", workspace?.id).select();

      console.log("[EditOrderModal] Delete response:", response);
      console.log("[EditOrderModal] Delete data:", response.data);
      console.log("[EditOrderModal] Rows deleted:", response.data?.length || 0);

      if (response.error) {
        console.error("[EditOrderModal] Delete failed:", response.error);
        throw response.error;
      }

      if (!response.data || response.data.length === 0) {
        throw new Error("No rows were deleted. Check if Order ID and workspace ID are correct.");
      }

      console.log("[EditOrderModal] Delete successful, rows deleted:", response.data.length);
      toast.success("Order deleted successfully");
      onUpdated();
    } catch (err: any) {
      console.error("[EditOrderModal] Error deleting order:", err);
      setError(err.message ?? "Unable to delete order");
      toast.error(err.message ?? "Failed to delete order");
      setBusy(false);
    }
  };

  const canCreateShipment = isConfirmedOrderStatus(order.status) && !order.tracking_number;

  return (
    <Modal title={`Edit Order ${order.order_number}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field label="Customer name" value={name} onChange={setName} required />
        <Field label="Phone" value={phone} onChange={setPhone} required />
        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">City</label>
          <CitySelector
            value={cityValue}
            onChange={setCityValue}
            placeholder="Search city..."
            required
            showWarning={Boolean(
              (carrier === 'ozon' ? !cityValue.ozon_city_id : !cityValue.carrier_city_id) &&
              cityValue.city_name
            )}
            carrier={carrier}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand-accent/50"
            placeholder="Enter delivery address"
          />
        </div>
        <Field label="Total (MAD)" value={total} onChange={setTotal} type="number" required />

        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">Shipping Status</label>
          <StatusSelect
            value={deliveryStatus}
            onChange={(val) => setDeliveryStatus(val)}
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand-accent/50 outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-[12px] text-ink-muted">Status</label>
          <StatusSelect
            value={status}
            onChange={(val) => setStatus(val as CanonicalStatus)}
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand-accent/50 outline-none"
          />
        </div>

        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{error}</div>}

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-lg bg-danger/10 px-4 py-2 text-[13px] font-medium text-danger hover:bg-danger/20 disabled:opacity-60"
          >
            Delete
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-lg bg-brand-accent py-2 text-[13px] font-medium text-white hover:bg-brand-accentHover disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>


        {error && <div className="rounded-lg bg-danger/10 px-3 py-2 text-[12.5px] text-danger">{error}</div>}
      </form>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[12px] text-ink-muted">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand-accent/50"
      />
    </div>
  );
}


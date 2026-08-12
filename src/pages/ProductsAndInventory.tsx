import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
    RefreshCw, Package, PackageOpen, AlertTriangle, Search,
    Truck, CheckCircle2, RotateCcw, ShoppingCart, UploadCloud,
    TrendingUp, Plus, ChevronRight, ArrowRight, ScanLine
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { ReturnToStockModal } from "../components/ReturnToStockModal";
import { InventoryQRScanner } from "../components/inventory/InventoryQRScanner";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmt(n: number) {
    return `${Number(n).toLocaleString("fr-MA", { maximumFractionDigits: 0 })} MAD`;
}

import { normalizeStatus } from '../utils/status';

// ─── Status Buckets ────────────────────────────────────────────────
// Statuses are correctly mapped centrally via normalizeStatus
// No local maps needed.

// ─── Toast (minimal) ──────────────────────────────────────────────
function showToast(msg: string, type: 'success' | 'error' = 'success') {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;color:#fff;background:${type === 'success' ? '#22c55e' : '#ef4444'};box-shadow:0 4px 20px rgba(0,0,0,.25);animation:fadein .2s ease`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

export default function ProductsAndInventory() {
    const { workspace } = useAuth();
    const navigate = useNavigate();
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [inlineEdits, setInlineEdits] = useState<Record<string, any>>({});
    const [savingFields, setSavingFields] = useState<Record<string, boolean>>({});
    const [uploadingId, setUploadingId] = useState<string | null>(null);
    const [imageTarget, setImageTarget] = useState<any | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [qrScannerOpen, setQrScannerOpen] = useState(false);
    const [detectedQRValue, setDetectedQRValue] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // ── Load ──────────────────────────────────────────────────────
    const load = useCallback(async (silent = false) => {
        if (!workspace?.id) return;
        if (!silent) setLoading(true);

        try {
            // Fetch all orders
            const { data: orders, error: oErr } = await supabase
                .from("orders")
                .select("status, shipping_status, delivery_status, sku, product_variant, total, variant_price, created_at, quantity, returned_to_stock")
                .eq("workspace_id", workspace.id);

            if (oErr) throw oErr;

            // Fetch saved product metadata (cost, price, initial_stock, image_url)
            const { data: saved, error: pErr } = await supabase
                .from("products")
                .select("id, sku, name, cost, price, initial_stock, image_url, low_stock_threshold, inventory_tracking_enabled")
                .eq("workspace_id", workspace.id);

            if (pErr) throw pErr;

            // ── Aggregate by SKU ──────────────────────────────────
            const cleanName = (s: string) =>
                (s || '').replace(/\b\d+\s*(mad|dh|dirham|درهم)\b/gi, '')
                    .replace(/[^\u0000-\u007E\u0600-\u06FF\s]/g, '')
                    .replace(/gratuit|free|offert/gi, '')
                    .trim() || 'Unknown Product';

            const toSku = (s: string) =>
                s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

            const skuMap = new Map<string, any>();

            orders?.forEach(order => {
                const rawName = order.product_variant || order.sku || 'Unknown Product';
                const name = cleanName(rawName);
                const sku = order.sku || toSku(name);
                const key = sku || 'unknown';
                const qty = Number(order.quantity) || 1;

                if (!skuMap.has(key)) {
                    skuMap.set(key, {
                        id: key,
                        sku: key,
                        name,
                        cost: 0,
                        price: Number(order.variant_price || order.total) || 0,
                        initial_stock: 0,
                        image_url: null,
                        low_stock_threshold: 5,
                        inventory_tracking_enabled: false,
                        delivered: 0,
                        returned: 0,
                        cancelled: 0,
                        out_for_delivery: 0,
                        total_orders: 0,
                    });
                }

                const p = skuMap.get(key)!;
                const internalStatus = normalizeStatus(order.shipping_status || order.delivery_status);
                p.total_orders += 1;

                if (internalStatus === 'DELIVERED') p.delivered += qty;
                else if (internalStatus === 'COMING_BACK' && !order.returned_to_stock) p.returned += qty;
                else if (internalStatus === 'OUT_FOR_DELIVERY') p.out_for_delivery += qty;
                // Orders with returned_to_stock=true don't count as COMING_BACK even if status is RETURNED_TO_SENDER
                // NEW and CONFIRMED have no inventory impact (they remain in 'Ready To Ship')
            });

            // ── Merge saved metadata ───────────────────────────────
            const final = Array.from(skuMap.values()).map(dyn => {
                const s = saved?.find(x => x.sku === dyn.sku || x.name === dyn.name);
                if (s) {
                    return {
                        ...dyn,
                        id: s.id,
                        cost: s.cost || 0,
                        price: s.price > 0 ? s.price : dyn.price,
                        initial_stock: s.initial_stock || 0,
                        image_url: s.image_url || null,
                        low_stock_threshold: s.low_stock_threshold || 5,
                        inventory_tracking_enabled: Boolean(s.inventory_tracking_enabled),
                    };
                }
                return dyn;
            });

            // Sort by total orders desc
            final.sort((a, b) => b.total_orders - a.total_orders);
            setProducts(final);
        } catch (err: any) {
            console.error(err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [workspace?.id]);

    useEffect(() => {
        load();
        if (!workspace?.id) return;
        const ch = supabase
            .channel(`inv-${workspace.id}-${Math.random()}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `workspace_id=eq.${workspace.id}` }, () => load(true))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `workspace_id=eq.${workspace.id}` }, () => load(true))
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [workspace?.id, load]);

    // ── Listen for return-to-inventory-complete event ───────────────
    useEffect(() => {
        const handleReturnComplete = () => {
            console.log('[ProductsAndInventory] Refreshing inventory after return to stock');
            load(true); // Silent refresh
        };

        window.addEventListener('return-to-inventory-complete', handleReturnComplete);
        return () => {
            window.removeEventListener('return-to-inventory-complete', handleReturnComplete);
        };
    }, [load]);

    // ── Computed values per product ───────────────────────────────
    const getVals = (p: any) => {
        const edits = inlineEdits[p.id] || {};
        const cost = edits.cost !== undefined ? Number(edits.cost) : p.cost;
        const price = edits.price !== undefined ? Number(edits.price) : p.price;
        const initial = edits.initial_stock !== undefined ? Number(edits.initial_stock) : p.initial_stock;

        // Inventory formulas
        // Products permanently decrease warehouse stock when delivered.
        const current_stock = initial - p.delivered;

        // Products in OUT_FOR_DELIVERY and COMING_BACK are unavailable
        const ready_to_ship = Math.max(0, current_stock - p.out_for_delivery - p.returned);

        const margin = price > 0 ? Math.round(((price - cost) / price) * 100) : 0;

        return { cost, price, initial, current_stock, ready_to_ship, margin, isTracked: Boolean(p.inventory_tracking_enabled) };
    };

    // ── Top card stats ────────────────────────────────────────────
    const stats = useMemo(() => {
        const totalProducts = products.length;
        let readyToShip = 0, outForDelivery = 0, comingBack = 0, delivered = 0, lowStock = 0;

        products.forEach(p => {
            const v = getVals(p);
            if (!v.isTracked) return;
            readyToShip += v.ready_to_ship;
            outForDelivery += p.out_for_delivery;
            comingBack += p.returned;
            delivered += p.delivered;
            if (v.ready_to_ship <= (p.low_stock_threshold || 5)) lowStock++;
        });

        return { totalProducts, readyToShip, outForDelivery, comingBack, delivered, lowStock };
    }, [products, inlineEdits]);

    // ── Inline edit helpers ───────────────────────────────────────
    const handleChange = (id: string, field: string, val: string) => {
        setInlineEdits(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: val } }));
    };

    const handleSave = async (id: string, p: any, field: string) => {
        const edits = inlineEdits[id];
        if (!edits || edits[field] === undefined) return;

        const newVal = Number(edits[field]);
        const prevVal = Number(field === 'initial_stock' ? p.initial_stock : p[field]);
        if (newVal === prevVal) {
            setInlineEdits(prev => { const n = { ...prev }; if (n[id]) delete n[id][field]; return n; });
            return;
        }

        const key = `${id}-${field}`;
        setSavingFields(prev => ({ ...prev, [key]: true }));

        let targetId = id;
        try {
            if (!UUID_REGEX.test(id)) {
                const { data, error } = await supabase.from('products').insert({
                    workspace_id: workspace?.id, sku: p.sku, name: p.name, status: 'active'
                }).select('id').single();
                if (error) throw error;
                if (data) targetId = data.id;
            }
            const updatePayload = field === 'initial_stock'
                ? { [field]: newVal, inventory_tracking_enabled: true }
                : { [field]: newVal };
            const { data: savedRow, error } = await supabase
                .from('products')
                .update(updatePayload)
                .eq('id', targetId)
                .eq('workspace_id', workspace!.id)
                .select('id, cost, price, initial_stock, low_stock_threshold, inventory_tracking_enabled')
                .maybeSingle();
            if (error) throw error;
            if (!savedRow) throw new Error('Product was not found in the current workspace. Nothing was saved.');
            setProducts(prev => prev.map(product => product.id === id || product.id === targetId
                ? { ...product, ...savedRow }
                : product));
            showToast('Saved ✓');
            setInlineEdits(prev => { const n = { ...prev }; if (n[id]) delete n[id][field]; return n; });
        } catch (e: any) {
            showToast('Save failed: ' + e.message, 'error');
        } finally {
            setSavingFields(prev => ({ ...prev, [key]: false }));
        }
    };

    // ── Image upload ──────────────────────────────────────────────
    const handleImageClick = (p: any) => { setImageTarget(p); fileInputRef.current?.click(); };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !imageTarget) return;
        const p = imageTarget;
        setImageTarget(null);
        setUploadingId(p.id);
        try {
            let targetId = p.id;
            if (!UUID_REGEX.test(p.id)) {
                const { data, error } = await supabase.from('products').insert({
                    workspace_id: workspace?.id, sku: p.sku, name: p.name, status: 'active'
                }).select('id').single();
                if (error) throw error;
                if (data) targetId = data.id;
            }
            const ext = file.name.split('.').pop() || 'jpg';
            const path = `${workspace?.id}/${targetId}-${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage.from('product-images').upload(path, file, { upsert: true });
            if (upErr) throw upErr;
            const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
            await supabase.from('products').update({ image_url: urlData.publicUrl }).eq('id', targetId);
            showToast('Image uploaded ✓');
            load(true);
        } catch (e: any) {
            showToast('Upload failed: ' + e.message, 'error');
        } finally {
            setUploadingId(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Filtered products ─────────────────────────────────────────
    const filtered = useMemo(() => {
        if (!searchQuery) return products;
        const q = searchQuery.toLowerCase();
        return products.filter(p => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
    }, [products, searchQuery]);

    // ── QR Scanner handler ────────────────────────────────────────
    const handleQRDetected = useCallback((qrValue: string) => {
        console.log("[Inventory] QR detected:", qrValue);
        setDetectedQRValue(qrValue);
        // For now, just display the detected value
        // Future: Implement product lookup based on QR value
    }, []);

    // ── View Order from QR Scanner ────────────────────────────────
    const handleViewOrder = useCallback((orderId: string) => {
        console.log("[Inventory] Viewing order (uuid):", orderId);
        // Navigate to Orders page with order uuid as state
        navigate('/orders', { state: { viewOrderId: orderId } });
        // Close the QR scanner
        setQrScannerOpen(false);
    }, [navigate]);

    // ─────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 animate-fade-in-up pb-24">
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

            <PageHeader
                title="Products & Inventory"
                subtitle={`${stats.totalProducts} products tracked from your orders`}
                action={
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setQrScannerOpen(true)}
                            className="flex h-9 items-center gap-1.5 rounded-lg border border-brand/20 bg-brand/5 px-3 text-[13px] text-brand font-medium hover:bg-brand/10 transition-colors"
                        >
                            <ScanLine size={14} /> Scan QR
                        </button>
                        <button
                            onClick={() => setModalOpen(true)}
                            className="flex h-9 items-center gap-1.5 rounded-lg border border-brand/20 bg-brand/5 px-3 text-[13px] text-brand font-medium hover:bg-brand/10 transition-colors"
                        >
                            <ScanLine size={14} /> Return To Stock
                        </button>
                        {loading && <RefreshCw size={14} className="animate-spin text-ink-muted" />}
                        <button
                            onClick={() => load()}
                            className="flex h-9 items-center gap-1.5 rounded-lg border border-base-border bg-base-raised px-3 text-[13px] text-ink-muted hover:text-ink transition-colors"
                        >
                            <RefreshCw size={13} /> Refresh
                        </button>
                    </div>
                }
            />

            <ReturnToStockModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
            
            <InventoryQRScanner 
                isOpen={qrScannerOpen} 
                onClose={() => setQrScannerOpen(false)} 
                onQRDetected={handleQRDetected}
                onViewOrder={handleViewOrder}
            />

            {/* ── TOP CARDS ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <TopCard icon={<Package size={16} />} iconClass="text-blue-400 bg-blue-500/10" label="Total Products" value={stats.totalProducts} />
                <TopCard icon={<CheckCircle2 size={16} />} iconClass="text-emerald-400 bg-emerald-500/10" label="Ready To Ship" value={stats.readyToShip} badge="green" />
                <TopCard icon={<Truck size={16} />} iconClass="text-amber-400 bg-amber-500/10" label="Out For Delivery" value={stats.outForDelivery} badge="amber" />
                <TopCard icon={<RotateCcw size={16} />} iconClass="text-purple-400 bg-purple-500/10" label="Coming Back" value={stats.comingBack} badge="purple" />
                <TopCard icon={<TrendingUp size={16} />} iconClass="text-sky-400 bg-sky-500/10" label="Delivered" value={stats.delivered} badge="sky" />
                <TopCard icon={<AlertTriangle size={16} />} iconClass="text-red-400 bg-red-500/10" label="Low Stock" value={stats.lowStock} badge={stats.lowStock > 0 ? "red" : undefined} />
            </div>

            {/* ── SEARCH ── */}
            <div className="relative w-full sm:w-80">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                    type="text"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full h-9 pl-9 pr-3 rounded-lg border border-base-border bg-base-raised text-[13px] text-ink focus:border-brand/50 focus:outline-none"
                />
            </div>

            {/* ── TABLE ── */}
            <div className="rounded-2xl border border-base-border bg-base-surface shadow-card overflow-hidden">
                {loading ? (
                    <div className="py-24 flex flex-col items-center justify-center text-ink-muted gap-3">
                        <RefreshCw size={22} className="animate-spin opacity-40" />
                        <span className="text-[13px]">Building product catalog from orders...</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-24 flex flex-col items-center gap-3 text-ink-muted">
                        <PackageOpen size={38} className="opacity-30" />
                        <span className="text-[13px]">No products found. They appear automatically from orders.</span>
                    </div>
                ) : (
                    <table className="w-full text-[13px]">
                        <thead>
                            <tr className="border-b border-base-border">
                                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-ink-muted w-[260px]">Product</th>
                                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-ink-muted w-28">Cost</th>
                                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-ink-muted w-28">Price</th>
                                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-ink-muted w-28">Initial Stock</th>
                                <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-emerald-600">Ready To Ship</th>
                                <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-amber-600">Out For Delivery</th>
                                <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-sky-600">Delivered</th>
                                <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-purple-600">Coming Back</th>
                                <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-ink-muted">Orders</th>
                                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-ink-muted">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-base-border">
                            {filtered.map(p => {
                                const v = getVals(p);
                                const savingCost = savingFields[`${p.id}-cost`];
                                const savingPrice = savingFields[`${p.id}-price`];
                                const savingStock = savingFields[`${p.id}-initial_stock`];

                                return (
                                    <tr key={p.id} className="group hover:bg-base-raised/60 transition-colors">
                                        {/* Product */}
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                {/* Image cell */}
                                                <div
                                                    className="relative h-14 w-14 flex-none rounded-xl overflow-hidden border border-base-border bg-base-raised cursor-pointer group/img"
                                                    onClick={() => handleImageClick(p)}
                                                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                                                    onDrop={e => {
                                                        e.preventDefault(); e.stopPropagation();
                                                        const f = e.dataTransfer.files?.[0];
                                                        if (f?.type.startsWith('image/')) { setImageTarget(p); handleFileChange({ target: { files: [f] } } as any); }
                                                    }}
                                                >
                                                    {p.image_url
                                                        ? <img src={p.image_url} alt={p.name} className="h-full w-full object-cover group-hover/img:opacity-60 transition-opacity" />
                                                        : <div className="h-full w-full flex items-center justify-center">
                                                            <Package size={20} className="text-ink-faint group-hover/img:text-brand transition-colors" />
                                                        </div>
                                                    }
                                                    {uploadingId === p.id
                                                        ? <div className="absolute inset-0 bg-base-surface/80 flex items-center justify-center"><RefreshCw size={14} className="animate-spin text-brand" /></div>
                                                        : <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity rounded-xl"><UploadCloud size={14} className="text-white" /></div>
                                                    }
                                                </div>
                                                {/* Name + SKU */}
                                                <div className="min-w-0 cursor-pointer" onClick={() => navigate(`/products-inventory/${p.id}`)}>
                                                    <div className="font-semibold text-[14px] text-ink leading-tight truncate max-w-[160px] hover:text-brand transition-colors">{p.name || 'Untitled'}</div>
                                                    <div className="text-[11px] font-mono text-sky-500 mt-0.5 truncate max-w-[160px]">SKU: {p.sku || '—'}</div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Cost */}
                                        <td className="px-4 py-4">
                                            <EditableNumField
                                                value={v.cost}
                                                rawEdit={inlineEdits[p.id]?.cost}
                                                saving={savingCost}
                                                onChange={val => handleChange(p.id, 'cost', val)}
                                                onSave={() => handleSave(p.id, p, 'cost')}
                                                suffix="MAD"
                                            />
                                        </td>

                                        {/* Price */}
                                        <td className="px-4 py-4">
                                            <EditableNumField
                                                value={v.price}
                                                rawEdit={inlineEdits[p.id]?.price}
                                                saving={savingPrice}
                                                onChange={val => handleChange(p.id, 'price', val)}
                                                onSave={() => handleSave(p.id, p, 'price')}
                                                suffix="MAD"
                                                bold
                                            />
                                        </td>

                                        {/* Initial Stock */}
                                        <td className="px-4 py-4">
                                            <EditableNumField
                                                value={v.initial}
                                                rawEdit={inlineEdits[p.id]?.initial_stock}
                                                saving={savingStock}
                                                onChange={val => handleChange(p.id, 'initial_stock', val)}
                                                onSave={() => handleSave(p.id, p, 'initial_stock')}
                                                integer
                                            />
                                        </td>

                                        {/* Ready To Ship */}
                                        <td className="px-4 py-4 text-center">
                                            <span className={`inline-flex items-center justify-center min-w-[52px] px-3 py-1.5 rounded-full text-[13px] font-bold ${v.ready_to_ship > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                                {v.ready_to_ship}
                                            </span>
                                        </td>

                                        {/* Out For Delivery */}
                                        <td className="px-4 py-4 text-center">
                                            <span className="inline-flex items-center justify-center min-w-[52px] px-3 py-1.5 rounded-full text-[13px] font-bold bg-amber-500/10 text-amber-500">
                                                {p.out_for_delivery}
                                            </span>
                                        </td>

                                        {/* Delivered */}
                                        <td className="px-4 py-4 text-center">
                                            <span className="inline-flex items-center justify-center min-w-[52px] px-3 py-1.5 rounded-full text-[13px] font-bold bg-sky-500/10 text-sky-500">
                                                {p.delivered}
                                            </span>
                                        </td>

                                        {/* Coming Back */}
                                        <td className="px-4 py-4 text-center">
                                            <span className={`inline-flex items-center justify-center min-w-[52px] px-3 py-1.5 rounded-full text-[13px] font-bold ${p.returned > 0 ? 'bg-purple-500/10 text-purple-500' : 'bg-base-raised text-ink-muted'}`}>
                                                {p.returned}
                                            </span>
                                        </td>

                                        {/* Orders */}
                                        <td className="px-4 py-4 text-center">
                                            <button
                                                onClick={() => navigate(`/products-inventory/${p.id}`)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-base-raised border border-base-border text-[13px] font-semibold text-ink hover:border-brand/40 hover:text-brand transition-colors"
                                            >
                                                <ShoppingCart size={12} />
                                                {p.total_orders}
                                            </button>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-4 py-4 text-right">
                                            <button
                                                onClick={() => navigate(`/products-inventory/${p.id}`)}
                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-base-border text-[12px] text-ink-muted hover:text-brand hover:border-brand/40 transition-colors"
                                            >
                                                View <ArrowRight size={12} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div >
    );
}

// ─── Reusable Editable Number Field ──────────────────────────────
function EditableNumField({ value, rawEdit, saving, onChange, onSave, suffix, bold, integer }: {
    value: number;
    rawEdit?: string;
    saving?: boolean;
    onChange: (v: string) => void;
    onSave: () => void;
    suffix?: string;
    bold?: boolean;
    integer?: boolean;
}) {
    const [focused, setFocused] = useState(false);
    const isDirty = rawEdit !== undefined;

    if (focused || isDirty) {
        return (
            <div className="relative flex items-center">
                <input
                    autoFocus={focused}
                    type="number"
                    value={rawEdit ?? value}
                    onChange={e => onChange(e.target.value)}
                    onBlur={() => { setFocused(false); onSave(); }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { onChange(String(value)); setFocused(false); } }}
                    step={integer ? 1 : 0.01}
                    className="w-full rounded-lg border border-brand/60 bg-brand/5 text-brand px-2 py-1.5 text-[13px] font-mono focus:outline-none"
                />
                {saving && <RefreshCw size={11} className="absolute right-2 animate-spin text-brand" />}
            </div>
        );
    }

    return (
        <button
            onClick={() => setFocused(true)}
            disabled={saving}
            className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-mono hover:bg-brand/5 hover:text-brand transition-colors w-full text-left ${bold ? 'font-semibold text-ink' : 'text-ink-muted'}`}
        >
            {saving
                ? <RefreshCw size={12} className="animate-spin text-ink-muted" />
                : <span>{integer ? value : value > 0 ? value : '—'}{suffix ? <span className="ml-1 text-ink-faint text-[11px]">{suffix}</span> : null}</span>
            }
        </button>
    );
}

// ─── Top Card ─────────────────────────────────────────────────────
function TopCard({ icon, iconClass, label, value, badge }: {
    icon: React.ReactNode; iconClass: string; label: string; value: number; badge?: string;
}) {
    const badgeColors: Record<string, string> = {
        green: 'text-emerald-500', amber: 'text-amber-500', purple: 'text-purple-500',
        sky: 'text-sky-500', red: 'text-red-500'
    };
    return (
        <div className="rounded-xl border border-base-border bg-base-surface p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-3">
                <div className={`h-7 w-7 flex items-center justify-center rounded-lg ${iconClass}`}>{icon}</div>
                <span className="text-[11px] font-medium text-ink-muted">{label}</span>
            </div>
            <div className={`text-2xl font-bold font-mono tracking-tight ${badge && badgeColors[badge] ? badgeColors[badge] : 'text-ink'}`}>
                {value.toLocaleString()}
            </div>
        </div>
    );
}

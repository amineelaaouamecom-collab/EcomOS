import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Package, Truck, ArrowLeft, RefreshCw, BarChart, ShoppingCart, DollarSign, Target, Activity, History, Settings } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";

function mad(n: number | null | undefined) {
    if (n == null) return "0 MAD";
    return `${Number(n).toLocaleString("fr-MA", { maximumFractionDigits: 2 })} MAD`;
}

export default function ProductDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { workspace } = useAuth();

    const [product, setProduct] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("overview");

    useEffect(() => {
        async function load() {
            if (!id || !workspace?.id) return;
            setLoading(true);
            const { data } = await supabase
                .from("products")
                .select("*")
                .eq("id", id)
                .eq("workspace_id", workspace.id)
                .single();

            setProduct(data);
            setLoading(false);
        }
        load();

        if (id && workspace?.id) {
            const channelId = `product-details-${id}-${Math.random()}`;
            const channel = supabase.channel(channelId)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `id=eq.${id}` }, payload => {
                    setProduct(payload.new);
                }).subscribe();
            return () => { supabase.removeChannel(channel); };
        }
    }, [id, workspace?.id]);

    if (loading) {
        return <div className="p-8 flex justify-center"><RefreshCw className="animate-spin text-ink-muted" /></div>;
    }

    if (!product) {
        return <div className="p-8 text-center text-ink-muted">Product not found</div>;
    }

    const tabs = [
        { id: "overview", label: "Overview", icon: Package },
        { id: "inventory", label: "Inventory", icon: Truck },
        { id: "orders", label: "Orders", icon: ShoppingCart },
        { id: "finance", label: "Finance", icon: DollarSign },
        { id: "ads", label: "Ads", icon: Target },
        { id: "analytics", label: "Analytics", icon: Activity },
        { id: "history", label: "History", icon: History },
        { id: "settings", label: "Settings", icon: Settings },
    ];

    return (
        <div className="flex bg-base-background min-h-screen">
            {/* Details Left Sidebar / Nav could be here, or we use standard page layout with Tabs */}
            <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in-up space-y-6">
                {/* Page Header */}
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate("/products-inventory")} className="p-2 rounded-lg bg-base-surface border border-base-border hover:bg-base-raised transition-colors">
                        <ArrowLeft size={16} className="text-ink" />
                    </button>
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold text-ink tracking-tight">{product.name}</h1>
                            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${product.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-500/10 text-zinc-500'}`}>
                                {product.status.toUpperCase()}
                            </span>
                        </div>
                        <p className="text-[13px] text-ink-muted flex items-center gap-2 mt-1 font-mono">
                            {product.sku || "No SKU"} • {product.category || "Uncategorized"}
                        </p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 overflow-x-auto border-b border-base-border pb-px [scrollbar-width:none]">
                    {tabs.map(tab => {
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap
                            ${active ? 'border-brand text-brand bg-brand/5 rounded-t-lg' : 'border-transparent text-ink-muted hover:text-ink hover:bg-base-surface rounded-t-lg'}`}
                            >
                                <tab.icon size={15} className={active ? 'text-brand' : 'text-ink-faint'} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="mt-6">
                    {activeTab === "overview" && <TabOverview product={product} />}
                    {activeTab === "inventory" && <TabInventory product={product} />}
                    {activeTab === "orders" && <TabOrders product={product} />}
                    {activeTab === "finance" && <TabFinance product={product} />}

                    {/* Stub other tabs to avoid too large file */}
                    {["ads", "analytics", "history", "settings"].includes(activeTab) && (
                        <div className="bg-base-surface rounded-xl border border-base-border p-12 text-center">
                            <BarChart size={32} className="mx-auto mb-3 text-ink-faint" />
                            <h2 className="text-lg font-bold text-ink mb-1">Coming Soon</h2>
                            <p className="text-[13px] text-ink-muted">The {activeTab} section is under development.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Sub-components for Tabs (Ideally extracted to separate files in a real app, keeping together for brevity)
function TabOverview({ product }: { product: any }) {
    const profit = (product.price || 0) - (product.cost || 0);
    const margin = product.price ? ((profit / product.price) * 100).toFixed(1) : 0;

    // Physical stock
    const initial = product.initial_stock ?? product.stock ?? 0;
    const physical = initial + (product.returned_stock || 0) + (product.manual_added_stock || 0) - (product.delivered_stock || 0) - (product.damaged_stock || 0) - (product.manual_removed_stock || 0) - (product.lost_stock || 0);
    const available = Math.max(0, physical - (product.reserved_stock || 0));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-base-surface rounded-xl border border-base-border shadow-sm p-5">
                    <h2 className="text-[14px] font-bold text-ink mb-4">Financial Overview</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <MiniStat label="Purchase Cost" value={mad(product.cost)} />
                        <MiniStat label="Selling Price" value={mad(product.price)} />
                        <MiniStat label="Profit / Unit" value={mad(profit)} valueColor="text-emerald-500" />
                        <MiniStat label="Margin" value={`${margin}%`} />
                    </div>
                </div>

                <div className="bg-base-surface rounded-xl border border-base-border shadow-sm p-5">
                    <h2 className="text-[14px] font-bold text-ink mb-4">Inventory Overview</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <MiniStat label="Current Stock" value={physical} />
                        <MiniStat label="Available Stock" value={available} valueColor={available > (product.low_stock_threshold || 0) ? 'text-emerald-500' : 'text-red-500'} />
                        <MiniStat label="Reserved" value={product.reserved_stock || 0} valueColor="text-amber-500" />
                        <MiniStat label="Delivered" value={product.delivered_stock || 0} valueColor="text-emerald-500" />
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <div className="bg-base-surface rounded-xl border border-base-border shadow-sm p-5">
                    <h2 className="text-[14px] font-bold text-ink mb-4">Product Details</h2>
                    <div className="space-y-3 text-[13px]">
                        <DetailRow label="Category" value={product.category || "—"} />
                        <DetailRow label="Supplier" value={product.supplier || "—"} />
                        <DetailRow label="Barcode" value={product.barcode || "—"} />
                        <DetailRow label="Warehouse" value={product.warehouse || "—"} />
                        <DetailRow label="Created" value={new Date(product.created_at).toLocaleDateString()} />
                    </div>
                </div>
            </div>
        </div>
    );
}

function TabInventory({ product }: { product: any }) {
    return (
        <div className="bg-base-surface rounded-xl border border-base-border shadow-sm p-5">
            <h2 className="text-[14px] font-bold text-ink mb-4">Inventory Breakdown</h2>
            {/* Visual pipeline or list of counters */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-[13px]">
                <div>
                    <div className="text-ink-muted mb-1">Initial Stock</div>
                    <div className="font-mono text-lg font-bold text-ink">{product.initial_stock ?? product.stock ?? 0}</div>
                </div>
                <div>
                    <div className="text-ink-muted mb-1">Returned</div>
                    <div className="font-mono text-lg font-bold text-blue-500">+{product.returned_stock || 0}</div>
                </div>
                <div>
                    <div className="text-ink-muted mb-1">Manual Added</div>
                    <div className="font-mono text-lg font-bold text-emerald-500">+{product.manual_added_stock || 0}</div>
                </div>
                <div>
                    <div className="text-ink-muted mb-1">Manual Removed</div>
                    <div className="font-mono text-lg font-bold text-red-500">-{product.manual_removed_stock || 0}</div>
                </div>
                <div>
                    <div className="text-ink-muted mb-1">Damaged/Lost</div>
                    <div className="font-mono text-lg font-bold text-red-500">-{(product.damaged_stock || 0) + (product.lost_stock || 0)}</div>
                </div>
                <div className="col-span-full border-t border-base-border pt-4 mt-2 grid grid-cols-3 gap-6">
                    <div>
                        <div className="text-ink-muted uppercase font-bold tracking-wider text-[10px] mb-1">Total Physical </div>
                        <div className="font-mono text-2xl font-bold text-ink">
                            {(product.initial_stock ?? product.stock ?? 0) + (product.returned_stock || 0) + (product.manual_added_stock || 0) - (product.delivered_stock || 0) - (product.damaged_stock || 0) - (product.manual_removed_stock || 0) - (product.lost_stock || 0)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function TabOrders({ product }: { product: any }) {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchOrders = async () => {
            setLoading(true);
            const { data } = await supabase
                .from('orders')
                .select('*')
                .eq('workspace_id', product.workspace_id)
                .or(`sku.eq.${product.sku},product_variant.ilike.%${product.name}%`)
                .order('created_at', { ascending: false })
                .limit(100);

            if (data) setOrders(data);
            setLoading(false);
        };
        if (product) fetchOrders();
    }, [product]);

    return (
        <div className="bg-base-surface rounded-xl border border-base-border shadow-sm overflow-hidden">
            <h2 className="text-[14px] font-bold text-ink p-5 border-b border-base-border">Related Orders</h2>

            {loading ? (
                <div className="p-12 text-center text-ink-muted">
                    <RefreshCw className="animate-spin mx-auto mb-2 opacity-50" size={24} />
                    Loading orders...
                </div>
            ) : orders.length === 0 ? (
                <div className="p-12 text-center text-ink-muted">
                    No orders found for this product yet.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                        <thead className="bg-base-raised text-[11px] uppercase tracking-wider text-ink-muted font-bold">
                            <tr>
                                <th className="px-5 py-3">Order #</th>
                                <th className="px-5 py-3">Date</th>
                                <th className="px-5 py-3">Variant/SKU</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-base-border">
                            {orders.map(o => (
                                <tr key={o.id} className="hover:bg-base-raised/50 transition-colors">
                                    <td className="px-5 py-3 font-mono font-medium text-brand">{o.order_number}</td>
                                    <td className="px-5 py-3 text-ink-muted">{new Date(o.created_at).toLocaleDateString()}</td>
                                    <td className="px-5 py-3 limit-line-1">{o.product_variant || o.sku || '—'}</td>
                                    <td className="px-5 py-3">
                                        <span className="inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold bg-base-border/50 text-ink-muted">
                                            {o.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-right font-mono font-medium text-ink">{mad(o.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function TabFinance({ product }: { product: any }) {
    const qtyDelivered = product.delivered_stock || 0;
    const revenue = qtyDelivered * (product.price || 0);
    const costs = qtyDelivered * (product.cost || 0);
    const netProfit = revenue - costs; // Simplification (missing ads and shipping)

    return (
        <div className="bg-base-surface rounded-xl border border-base-border shadow-sm p-5">
            <h2 className="text-[14px] font-bold text-ink mb-4">Financial Extrapolations (Based on Delivered)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MiniStat label="Revenue (Delivered)" value={mad(revenue)} valueColor="text-emerald-500" />
                <MiniStat label="Total Product Cost" value={mad(costs)} />
                <MiniStat label="Gross Profit" value={mad(netProfit)} valueColor="text-emerald-500" />
            </div>
        </div>
    )
}

function MiniStat({ label, value, valueColor = "text-ink" }: { label: string; value: React.ReactNode; valueColor?: string }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[11px] text-ink-muted uppercase tracking-wider font-semibold">{label}</span>
            <span className={`font-mono text-lg font-bold ${valueColor}`}>{value}</span>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex justify-between items-center py-1">
            <span className="text-ink-muted">{label}</span>
            <span className="font-medium text-ink text-right">{value}</span>
        </div>
    );
}

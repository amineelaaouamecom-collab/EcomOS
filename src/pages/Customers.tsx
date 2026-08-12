import { useEffect, useMemo, useState } from "react";
import { Search, ChevronRight } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import type { Customer, Order } from "../lib/types";

interface CustomerProfile {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  orders: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

function mad(n: number) {
  return `MAD ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default function Customers() {
  const { workspace } = useAuth();
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspace?.id) return;
    const wid = workspace.id;

    async function load() {
      setLoading(true);
      const [customersRes, ordersRes] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, phone, city, created_at")
          .eq("workspace_id", wid),
        supabase
          .from("orders")
          .select('id:"Order ID", customer_id, total, status, created_at, shipping_status')
          .eq("workspace_id", wid),
      ]);

      const customerRows = (customersRes.data ?? []) as Customer[];
      const orderRows = (ordersRes.data ?? []) as Order[];

      const customersWithStats: CustomerProfile[] = customerRows.map((customer) => {
        const customerOrders = orderRows.filter((order) => order.customer_id === customer.id);
        const deliveredTotal = customerOrders
          .filter((order) => {
            if (order.shipping_status) {
              const normalizedShipping = order.shipping_status.toLowerCase();
              if (normalizedShipping === "livrÃ©" || normalizedShipping === "delivered") return true;
            }
            return order.status === "delivered";
          })
          .reduce((sum, order) => sum + Number(order.total), 0);

        return {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          city: customer.city,
          orders: customerOrders.length,
          totalSpent: deliveredTotal,
          lastOrderAt: customerOrders.reduce((latest, order) => {
            const created = new Date(order.created_at).getTime();
            return latest === null || created > latest ? created : latest;
          }, null as number | null) ? new Date(
            customerOrders.reduce((latest, order) => {
              const created = new Date(order.created_at).getTime();
              return latest === null || created > latest ? created : latest;
            }, null as number | null) ?? 0
          ).toISOString() : null,
        };
      });

      setCustomers(customersWithStats.sort((a, b) => b.totalSpent - a.totalSpent));
      setOrders(orderRows);
      setLoading(false);
    }

    load();
  }, [workspace?.id]);

  const filteredCustomers = useMemo(
    () => customers.filter((customer) =>
      customer.name.toLowerCase().includes(search.toLowerCase()) ||
      (customer.phone ?? "").includes(search)
    ),
    [customers, search]
  );

  return (
    <div>
      <PageHeader title="Customers" subtitle="A CRM-style customer panel with order lifetime value and contact history." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-[420px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={14} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or phone..."
            className="w-full rounded-lg border border-base-border bg-base-surface py-2 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand-accent/50"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-base-border bg-base-surface p-6 text-[13px] text-ink-muted">Loading customersâ€¦</div>
      ) : filteredCustomers.length === 0 ? (
        <EmptyState title="No customers yet" subtitle="Customers will appear here as orders are created." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredCustomers.map((customer) => (
            <article key={customer.id} className="rounded-3xl border border-base-border bg-base-surface p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">{customer.name}</h2>
                  <p className="mt-1 text-sm text-ink-muted">{customer.city ?? "City not set"}</p>
                </div>
                <div className="rounded-full bg-brand-accent/10 px-3 py-1 text-[12px] font-semibold text-brand-accent">{customer.orders} orders</div>
              </div>

              <div className="mt-5 grid gap-3 text-[13px] text-ink-muted">
                <div className="flex items-center justify-between gap-3"><span className="font-medium text-ink">Phone</span><span>{customer.phone ?? "â€”"}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="font-medium text-ink">Lifetime value</span><span className="font-semibold text-ink">{mad(customer.totalSpent)}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="font-medium text-ink">Last order</span><span>{customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString("en-GB") : "No orders"}</span></div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-2 text-[13px] font-medium text-brand"><span>View order history</span><ChevronRight size={16} /></div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

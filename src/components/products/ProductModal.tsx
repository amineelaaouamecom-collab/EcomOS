import { FormEvent, useState, useEffect, ChangeEvent } from "react";
import { Modal } from "../Modal";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";

export function ProductModal({ product, onClose, onSaved }: { product: any | null; onClose: () => void; onSaved: () => void }) {
    const { workspace } = useAuth();

    const [formData, setFormData] = useState({
        name: "", sku: "", barcode: "", variant: "", category: "", supplier: "",
        cost: "", price: "", currency: "MAD", initial_stock: "", low_stock_threshold: "5",
        warehouse: "", description: "", notes: "", status: "active" as const,
        inventory_tracking_enabled: true
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isEdit = !!product;

    useEffect(() => {
        if (product) {
            setFormData({
                name: product.name || "", sku: product.sku || "", barcode: product.barcode || "",
                variant: product.variant || "", category: product.category || "", supplier: product.supplier || "",
                cost: product.cost?.toString() || "", price: product.price?.toString() || "", currency: product.currency || "MAD",
                initial_stock: product.initial_stock?.toString() || product.stock?.toString() || "",
                low_stock_threshold: product.low_stock_threshold?.toString() || "5", warehouse: product.warehouse || "",
                description: product.description || "", notes: product.notes || "", status: product.status || "active",
                inventory_tracking_enabled: Boolean(product.inventory_tracking_enabled)
            });
        }
    }, [product]);

    const handleChange = (field: string, value: string | ChangeEvent<HTMLInputElement>) => {
        const stringValue = typeof value === 'string' ? value : (value.target as HTMLInputElement).value;
        setFormData(prev => ({ ...prev, [field]: stringValue }));
    };

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!workspace?.id) return;
        setError(null);

        const { name, sku, cost, price, initial_stock } = formData;
        if (!name.trim() || cost.trim() === "" || price.trim() === "" || initial_stock.trim() === "") {
            setError("Please fill in Name, Cost, Price, and Initial Stock.");
            return;
        }

        setBusy(true);

        const payload: any = {
            name: name.trim(), sku: sku.trim() || null, barcode: formData.barcode.trim() || null,
            variant: formData.variant.trim() || null, category: formData.category.trim() || null,
            supplier: formData.supplier.trim() || null, currency: formData.currency.trim(),
            cost: Number(cost), price: Number(price),
            initial_stock: Number(initial_stock), low_stock_threshold: Number(formData.low_stock_threshold) || 0,
            warehouse: formData.warehouse.trim() || null, description: formData.description.trim() || null,
            notes: formData.notes.trim() || null, status: formData.status,
            inventory_tracking_enabled: formData.inventory_tracking_enabled,
            workspace_id: workspace.id,
        };

        if (!isEdit) {
            // In case DB doesn't default these, set them to 0 on insert
            Object.assign(payload, {
                stock: Number(initial_stock),
                reserved_stock: 0,
                out_for_delivery_stock: 0,
                delivered_stock: 0,
                returned_stock: 0,
                cancelled_stock: 0,
                manual_added_stock: 0,
                manual_removed_stock: 0,
                damaged_stock: 0,
                lost_stock: 0
            });
        }

        const res = isEdit
            ? await supabase.from("products").update(payload).eq("id", product!.id).eq("workspace_id", workspace.id).select("id").maybeSingle()
            : await supabase.from("products").insert(payload).select("id").maybeSingle();

        setBusy(false);
        if (res.error) {
            setError(res.error.message);
        } else if (!res.data) {
            setError("Product was not found in the current workspace. Nothing was saved.");
        } else {
            // Ideally we also log the initial stock adjustment in stock_history via the backend, but this fulfills front-end needs
            onSaved();
        }
    };

    return (
        <Modal title={isEdit ? "Edit Product" : "New Product"} onClose={onClose}>
            <form onSubmit={onSubmit} className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto px-1 [scrollbar-width:thin]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Section label="Product Name">
                        <Input required value={formData.name} onChange={v => handleChange('name', v)} placeholder="Ex: Joint Cream" />
                    </Section>
                    <Section label="SKU">
                        <Input value={formData.sku} onChange={v => handleChange('sku', v)} placeholder="Ex: joint-cream" />
                    </Section>
                    <Section label="Barcode">
                        <Input value={formData.barcode} onChange={v => handleChange('barcode', v)} placeholder="Ex: 0123456789" />
                    </Section>
                    <Section label="Variant">
                        <Input value={formData.variant} onChange={v => handleChange('variant', v)} placeholder="Ex: Type A" />
                    </Section>
                    <Section label="Category">
                        <Input value={formData.category} onChange={v => handleChange('category', v)} placeholder="Ex: Health" />
                    </Section>
                    <Section label="Supplier">
                        <Input value={formData.supplier} onChange={v => handleChange('supplier', v)} placeholder="Ex: Supplier LLC" />
                    </Section>
                    <Section label="Cost">
                        <Input required type="number" min="0" step="0.01" value={formData.cost} onChange={v => handleChange('cost', v)} placeholder="0" />
                    </Section>
                    <Section label="Selling Price">
                        <Input required type="number" min="0" step="0.01" value={formData.price} onChange={v => handleChange('price', v)} placeholder="0" />
                    </Section>
                    <Section label="Initial Stock">
                        <Input required type="number" min="0" value={formData.initial_stock} onChange={v => handleChange('initial_stock', v)} placeholder="0" disabled={isEdit} title={isEdit ? "Initial stock cannot be changed here. Use Stock Adjustments." : ""} />
                    </Section>
                    <Section label="Minimum Stock Alert">
                        <Input type="number" min="0" value={formData.low_stock_threshold} onChange={v => handleChange('low_stock_threshold', v)} placeholder="10" />
                    </Section>
                    <div className="rounded-lg border border-base-border bg-base-raised px-3 py-2.5 md:col-span-2">
                        <label className="flex cursor-pointer items-start gap-3">
                            <input
                                type="checkbox"
                                checked={formData.inventory_tracking_enabled}
                                onChange={e => setFormData(prev => ({ ...prev, inventory_tracking_enabled: e.target.checked }))}
                                className="mt-0.5 h-4 w-4 rounded border-base-border text-brand focus:ring-brand"
                            />
                            <span>
                                <span className="block text-[13px] font-medium text-ink">Track inventory for this product</span>
                                <span className="mt-0.5 block text-[11.5px] text-ink-muted">Only tracked products appear in low-stock and out-of-stock alerts.</span>
                            </span>
                        </label>
                    </div>
                    <Section label="Warehouse">
                        <Input value={formData.warehouse} onChange={v => handleChange('warehouse', v)} placeholder="Ex: Main Casa" />
                    </Section>
                    <Section label="Status">
                        <select
                            value={formData.status}
                            onChange={e => handleChange('status', e.target.value)}
                            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
                        >
                            <option value="active">Active</option>
                            <option value="draft">Draft</option>
                            <option value="archived">Archived</option>
                        </select>
                    </Section>
                </div>

                <Section label="Description">
                    <textarea rows={2} value={formData.description} onChange={e => handleChange('description', e.target.value)} className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none" placeholder="Product details..." />
                </Section>

                <Section label="Notes">
                    <textarea rows={2} value={formData.notes} onChange={e => handleChange('notes', e.target.value)} className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none" placeholder="Internal notes..." />
                </Section>

                {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-[12.5px] text-red-500">{error}</div>}

                <div className="pt-2">
                    <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand py-2 text-[13px] font-medium text-white shadow hover:bg-brand/90 disabled:opacity-60 transition-colors">
                        {busy ? "Saving…" : isEdit ? "Update Product" : "Create Product"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">{label}</label>
            {children}
        </div>
    );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { onChange: (val: string) => void }) {
    const { onChange, ...rest } = props;
    return (
        <input
            {...rest}
            onChange={e => onChange(e.target.value)}
            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none disabled:opacity-50"
        />
    );
}

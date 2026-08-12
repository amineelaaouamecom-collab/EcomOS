import { FormEvent, useState } from "react";
import { Modal } from "../Modal";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";

export function StockAdjustmentModal({ product, onClose, onSaved }: { product: any; onClose: () => void; onSaved: () => void }) {
    const { workspace, profile } = useAuth();

    const [type, setType] = useState<"ADD" | "REMOVE" | "DAMAGE" | "LOST">("ADD");
    const [quantity, setQuantity] = useState("");
    const [reason, setReason] = useState("");
    const [notes, setNotes] = useState("");

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!workspace?.id || !product.id) return;
        setError(null);

        const qtyNum = Number(quantity);
        if (!quantity || qtyNum <= 0) {
            setError("Quantity must be greater than 0");
            return;
        }
        if (!reason.trim()) {
            setError("Please provide a reason for the adjustment");
            return;
        }

        setBusy(true);

        const isAddition = type === "ADD";

        // Save to stock_history
        const historyPayload = {
            workspace_id: workspace.id,
            product_id: product.id,
            quantity_change: isAddition ? qtyNum : -qtyNum,
            reason: reason.trim(),
            notes: notes.trim() || null,
            user_id: profile?.id,
        };

        // Update Product counters
        let updateField = "";
        if (type === "ADD") updateField = "manual_added_stock";
        else if (type === "REMOVE") updateField = "manual_removed_stock";
        else if (type === "DAMAGE") updateField = "damaged_stock";
        else if (type === "LOST") updateField = "lost_stock";

        // Call RPC or update directly. Since we don't have an RPC for increment, we can do a normal update using previous values.
        // Wait, Supabase js doesn't support atomic increments out of the box outside of RPC without fetching first, 
        // but we can trust the 'product' prop for a simple implementation, or do a quick fetch.
        const { data: currProduct } = await supabase.from('products').select(updateField).eq('id', product.id).single();

        if (currProduct) {
            const currentCounterValue = (currProduct as any)[updateField] || 0;
            await supabase.from('products').update({ [updateField]: currentCounterValue + qtyNum }).eq('id', product.id);
        }

        const { error: histError } = await supabase.from('stock_history').insert(historyPayload);

        setBusy(false);
        if (histError) {
            console.error(histError);
            setError("Failed to record history update.");
        } else {
            onSaved();
        }
    };

    return (
        <Modal title={`Adjust Stock: ${product.name}`} onClose={onClose}>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Adjustment Type</label>
                        <select
                            value={type}
                            onChange={e => setType(e.target.value as any)}
                            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
                        >
                            <option value="ADD">Add Stock (+)</option>
                            <option value="REMOVE">Remove Stock (-)</option>
                            <option value="DAMAGE">Damage (-)</option>
                            <option value="LOST">Lost (-)</option>
                        </select>
                    </div>
                    <div>
                        <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Quantity</label>
                        <input
                            required
                            type="number"
                            min="1"
                            value={quantity}
                            onChange={e => setQuantity(e.target.value)}
                            placeholder="Ex: 50"
                            className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
                        />
                    </div>
                </div>

                <div>
                    <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Reason</label>
                    <input
                        required
                        type="text"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="Ex: Supplier Restock"
                        className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-[12px] font-medium text-ink-muted">Notes</label>
                    <textarea
                        rows={2}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Additional details..."
                        className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink focus:border-brand/50 focus:outline-none"
                    />
                </div>

                {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-[12.5px] text-red-500">{error}</div>}

                <div className="pt-2">
                    <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand py-2 text-[13px] font-medium text-white shadow hover:bg-brand/90 disabled:opacity-60 transition-colors">
                        {busy ? "Saving…" : "Save Adjustment"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

import { useState, useEffect } from "react";
import { ChevronDown, RefreshCw, Save, X, Map, ArrowRight } from "lucide-react";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../components/Toast";

// Available Order fields for mapping
const ORDER_FIELDS = [
  // Order
  { value: "order_number", label: "Order" },
  { value: "customer_name", label: "Customer" },
  { value: "customer_name", label: "First Name" },
  { value: "customer_name", label: "Name" },
  { value: "customer_name", label: "Customer Name" },
  { value: "phone", label: "Phone" },
  { value: "city", label: "City" },
  { value: "address", label: "Address" },
  { value: "total", label: "Total" },
  { value: "sku", label: "SKU" },
  { value: "product_variant", label: "Variant" },
  { value: "tracking_number", label: "Tracking" },
  { value: "status", label: "Status" },
  { value: "delivery_status", label: "Shipping Status" },
  { value: "campaign", label: "Campaign" },
  { value: "created_at", label: "Created" },

  // Additional fields
  { value: "second_phone", label: "Second Phone" },
  { value: "email", label: "Email" },
  { value: "external_id", label: "External ID" },
  { value: "payment_method", label: "Payment Method" },
  { value: "currency", label: "Currency" },
  { value: "notes", label: "Notes" },
  { value: "country", label: "Country" },
  { value: "state", label: "State" },
  { value: "region", label: "Region" },
  { value: "postal_code", label: "Postal Code" },
  { value: "product_name", label: "Product Name" },
  { value: "quantity", label: "Quantity" },
  { value: "unit_price", label: "Unit Price" },
  { value: "shipping_company", label: "Shipping Company" },
  { value: "shipping_cost", label: "Shipping Cost" },
  { value: "delivery_fee", label: "Delivery Fee" },
  { value: "source", label: "Source" },
  { value: "ad_set", label: "Ad Set" },
  { value: "ad_name", label: "Ad Name" },
  { value: "utm_source", label: "UTM Source" },
  { value: "utm_medium", label: "UTM Medium" },
  { value: "utm_campaign", label: "UTM Campaign" },
  { value: "cod_amount", label: "COD Amount" },
  { value: "confirmation_cost", label: "Confirmation Cost" },
  { value: "product_cost", label: "Product Cost" },
  { value: "profit", label: "Profit" },
];

const REQUIRED_FIELDS = ["order_number", "phone", "city"];

interface ColumnMapping {
  sheetColumn: string;
  orderField: string | null;
}

function GoogleSheetColumnMapping() {
  const { workspace } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingHeaders, setLoadingHeaders] = useState(false);

  // Only fetch data when modal is opened and workspace is available
  useEffect(() => {
    if (isOpen && workspace?.google_sheet_url) {
      fetchSheetHeaders();
      loadSavedMappings();
    }
  }, [isOpen]);

  const fetchSheetHeaders = async () => {
    if (!workspace?.google_sheet_url) return;

    setLoadingHeaders(true);
    try {
      const res = await fetch(workspace.google_sheet_url);
      if (!res.ok) throw new Error("Failed to fetch sheet");

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Invalid sheet format");
      }

      const firstRow = data[0];
      const headers = Array.isArray(firstRow) ? firstRow : Object.keys(firstRow);
      setSheetHeaders(headers.map((h: any) => String(h)));
    } catch (err: any) {
      console.error("Failed to fetch sheet headers:", err);
      toast.error("Failed to load sheet headers");
    } finally {
      setLoadingHeaders(false);
    }
  };

  const loadSavedMappings = async () => {
    if (!workspace?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("google_sheet_column_mappings")
        .select("sheet_column, order_field")
        .eq("workspace_id", workspace.id);

      if (error) throw error;

      if (data) {
        setMappings(data.map((m: any) => ({
          sheetColumn: m.sheet_column,
          orderField: m.order_field,
        })));
      }
    } catch (err: any) {
      console.error("Failed to load mappings:", err);
    } finally {
      setLoading(false);
    }
  };

  const autoMapColumns = () => {
    const autoMappings: ColumnMapping[] = sheetHeaders.map((header) => {
      const normalizedHeader = header.toLowerCase().replace(/[_\s]/g, "");

      const matchedField = ORDER_FIELDS.find(field => {
        const normalizedField = field.label.toLowerCase().replace(/[_\s]/g, "");
        return normalizedField === normalizedHeader;
      });

      return {
        sheetColumn: header,
        orderField: matchedField?.value || null,
      };
    });

    setMappings(autoMappings);
    toast.success("Auto-mapped columns based on header names");
  };

  const resetMappings = () => {
    setMappings([]);
    toast.success("Mappings reset");
  };

  const handleMappingChange = (sheetColumn: string, orderField: string | null) => {
    setMappings(prev =>
      prev.map(m =>
        m.sheetColumn === sheetColumn
          ? { ...m, orderField }
          : m
      )
    );
  };

  const handleSave = async () => {
    if (!workspace?.id) return;

    // Validate required fields
    const mappedFields = mappings.filter(m => m.orderField).map(m => m.orderField);
    const missingRequired = REQUIRED_FIELDS.filter(field => !mappedFields.includes(field));

    if (missingRequired.length > 0) {
      toast.error(`Required fields not mapped: ${missingRequired.join(", ")}`);
      return;
    }

    // Check for duplicates
    const usedFields = mappings.filter(m => m.orderField).map(m => m.orderField);
    const duplicates = usedFields.filter((field, index) => usedFields.indexOf(field) !== index);

    if (duplicates.length > 0) {
      toast.error(`Duplicate field mappings: ${duplicates.join(", ")}`);
      return;
    }

    setSaving(true);
    try {
      // Delete existing mappings
      await supabase
        .from("google_sheet_column_mappings")
        .delete()
        .eq("workspace_id", workspace.id);

      // Insert new mappings
      const mappingsToInsert = mappings
        .filter(m => m.orderField)
        .map(m => ({
          workspace_id: workspace.id,
          sheet_column: m.sheetColumn,
          order_field: m.orderField,
        }));

      if (mappingsToInsert.length > 0) {
        const { error } = await supabase
          .from("google_sheet_column_mappings")
          .insert(mappingsToInsert);

        if (error) throw error;
      }

      toast.success("Column mappings saved successfully");
    } catch (err: any) {
      console.error("Failed to save mappings:", err);
      toast.error("Failed to save mappings");
    } finally {
      setSaving(false);
    }
  };

  const getUsedFields = () => {
    return mappings.filter(m => m.orderField).map(m => m.orderField);
  };

  if (!workspace?.google_sheet_url) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex-1 w-full flex items-center justify-center gap-2 rounded-xl border border-base-border bg-white px-4 py-2.5 text-[13px] font-semibold text-ink shadow-sm hover:bg-slate-50 transition-colors"
      >
        <Map size={14} className="text-brand" />
        Configure Mapping
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[1005] flex items-center justify-center p-4"
          onClick={() => setIsOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-[900px] flex flex-col max-h-[85vh] overflow-hidden rounded-[28px] border border-base-border bg-base-surface shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-base-border/60 bg-base-raised/30 px-7 py-6">
              <div>
                <h2 className="text-[18px] font-bold text-ink">Google Sheet Column Mapping</h2>
                <p className="text-[13px] text-ink-muted">Map your sheet headers to the internal order fields</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-full bg-base-raised p-2 text-ink-faint hover:text-ink hover:bg-base-border transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto px-7 py-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-end">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={autoMapColumns}
                      disabled={loadingHeaders || sheetHeaders.length === 0}
                      className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-2 text-[12.5px] font-semibold text-brand hover:bg-brand/20 disabled:opacity-60 flex items-center gap-1.5 transition-colors"
                    >
                      <RefreshCw size={13} /> Auto Map
                    </button>
                    <button
                      onClick={resetMappings}
                      disabled={loading}
                      className="rounded-xl border border-base-border bg-base-raised px-4 py-2 text-[12.5px] font-semibold text-ink hover:bg-base-border disabled:opacity-60 transition-colors"
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || loading}
                      className="rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-brand/90 disabled:opacity-60 flex items-center gap-1.5 transition-colors"
                    >
                      <Save size={13} /> {saving ? "Saving..." : "Save Mapping"}
                    </button>
                  </div>
                </div>

                {loadingHeaders ? (
                  <div className="flex items-center justify-center py-12 text-ink-muted text-[13px]">
                    Loading sheet headers...
                  </div>
                ) : sheetHeaders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-ink-muted text-[13px]">
                    <RefreshCw size={32} className="mb-3 opacity-50" />
                    <p>No headers detected. Click "Auto Map" to fetch from your Google Sheet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-base-border/50">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-base-border/50 bg-base-raised/30">
                          <th className="px-4 py-3 text-left font-medium text-ink w-1/2">Google Sheet Column</th>
                          <th className="px-4 py-3 text-left font-medium text-ink w-1/2">Order Field</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sheetHeaders.map((header, index) => {
                          const mapping = mappings.find(m => m.sheetColumn === header);
                          const usedFields = getUsedFields();

                          return (
                            <tr key={header} className="border-b border-base-border/30 hover:bg-base-raised/20">
                              <td className="px-4 py-3 text-ink font-mono text-[12px] font-medium">
                                {header}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <select
                                    value={mapping?.orderField || ""}
                                    onChange={(e) => handleMappingChange(header, e.target.value || null)}
                                    className="flex-1 rounded-lg border border-base-border bg-base-surface px-3 py-1.5 text-[12px] text-ink focus:border-brand-accent/50 focus:outline-none"
                                  >
                                    <option value="">Not Mapped</option>
                                    {ORDER_FIELDS.map(field => (
                                      <option
                                        key={`${field.value}-${field.label}`}
                                        value={field.value}
                                        disabled={usedFields.includes(field.value) && mapping?.orderField !== field.value}
                                      >
                                        {field.label}
                                      </option>
                                    ))}
                                  </select>
                                  {mapping?.orderField && (
                                    <ArrowRight size={14} className="text-brand-accent" />
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="rounded-lg bg-base-raised/30 p-3">
                  <div className="text-[11.5px] text-ink-muted">
                    <span className="font-medium text-ink">Required fields:</span> {REQUIRED_FIELDS.join(", ")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default GoogleSheetColumnMapping;

import { useState, useCallback, useEffect, useMemo } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "../lib/supabase";

export interface BusinessConfig {
    deliveryFee: number;
    confirmationFee: number;
    fulfillmentFee: number;
    leadFee: number;
    productCostPerOrder: number;
}

const DEFAULTS: BusinessConfig = {
    deliveryFee: 35,
    confirmationFee: 11,
    fulfillmentFee: 2,
    leadFee: 0,
    productCostPerOrder: 0,
};

function normalizeConfig(data: any | null | undefined): BusinessConfig {
    return {
        deliveryFee: Number(data?.business_delivery_fee ?? DEFAULTS.deliveryFee),
        confirmationFee: Number(data?.business_confirmation_fee ?? DEFAULTS.confirmationFee),
        fulfillmentFee: Number(data?.business_fulfillment_fee ?? DEFAULTS.fulfillmentFee),
        leadFee: Number(data?.business_lead_fee ?? DEFAULTS.leadFee),
        productCostPerOrder: Number(data?.business_product_cost ?? DEFAULTS.productCostPerOrder),
    };
}

export function useBusinessConfig() {
    const { workspace } = useAuth();
    const wid = workspace?.id ?? null;

    const [config, setConfig] = useState<BusinessConfig>(DEFAULTS);

    useEffect(() => {
        if (!wid) {
            setConfig(DEFAULTS);
            return;
        }

        let isMounted = true;
        supabase
            .from("workspaces")
            .select("business_delivery_fee, business_confirmation_fee, business_fulfillment_fee, business_lead_fee, business_product_cost")
            .eq("id", wid)
            .maybeSingle()
            .then(({ data }) => {
                if (!isMounted) return;
                setConfig(normalizeConfig(data));
            });

        return () => {
            isMounted = false;
        };
    }, [wid]);

    const save = useCallback(async (next: BusinessConfig) => {
        if (!wid) return;

        const { data, error } = await supabase
            .from("workspaces")
            .update({
                business_delivery_fee: next.deliveryFee,
                business_confirmation_fee: next.confirmationFee,
                business_fulfillment_fee: next.fulfillmentFee,
                business_lead_fee: next.leadFee,
                business_product_cost: next.productCostPerOrder,
            })
            .eq("id", wid)
            .select("business_delivery_fee, business_confirmation_fee, business_fulfillment_fee, business_lead_fee, business_product_cost")
            .maybeSingle();

        if (error) {
            throw error;
        }

        const normalized = normalizeConfig(data ?? next);
        setConfig(normalized);
        return normalized;
    }, [wid]);

    // Memoize config to prevent unnecessary recreations
    const memoizedConfig = useMemo(() => config, [config.deliveryFee, config.confirmationFee, config.fulfillmentFee, config.leadFee, config.productCostPerOrder]);

    return { config: memoizedConfig, save };
}

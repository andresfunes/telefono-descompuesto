import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseFunnelMetrics,
  type FunnelMetrics,
  type ProductAnalyticsStore,
} from "./product-analytics-store";

export class SupabaseProductAnalyticsStore implements ProductAnalyticsStore {
  async getFunnelMetrics(days = 7): Promise<FunnelMetrics> {
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw new Error("El período de analítica debe estar entre 1 y 90 días.");
    }

    const { data, error } = await createAdminClient().rpc("get_product_funnel", {
      p_days: days,
    });
    if (error) throw new Error(error.message);
    return parseFunnelMetrics(data);
  }
}

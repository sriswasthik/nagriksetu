import { createClient } from "@/lib/supabase/client";

/**
 * ============================================================
 * REFERENCE DATA
 * ============================================================
 *
 * Departments and wards are slow-moving lookup tables that several
 * views need in order to label or filter by id.
 *
 * WHY THIS EXISTS
 * The authority issue queue filtered on `DEPARTMENTS` from
 * src/lib/constants.ts, whose ids are the literals 'dept-eng',
 * 'dept-san', 'dept-elec' and 'dept-water'. The database keys
 * departments by uuid, so `workOrder.departmentId === 'dept-eng'` was
 * never true and choosing any department emptied the queue. The
 * dropdown looked functional and silently filtered everything out.
 *
 * The rows are seeded by
 * supabase/migrations/20260814120100_workflow_integrity_and_reference_data.sql
 * using the department codes ai.ts resolves against, so AI routing and
 * these lookups agree.
 *
 * Both tables are readable by any authenticated user (see the
 * "Reference data is readable" policies) — they hold no personal data.
 */

export interface Department {
  id: string;
  name: string;
  code: string;
}

export interface Ward {
  id: string;
  name: string;
  code: string;
}

export const referenceService = {
  async getDepartments(): Promise<Department[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("departments")
      .select("id, name, code")
      .order("name");

    if (error) {
      console.error("Department lookup failed:", error.message);
      throw error;
    }

    return (data ?? []) as Department[];
  },

  async getWards(): Promise<Ward[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("wards")
      .select("id, name, code")
      .order("code");

    if (error) {
      console.error("Ward lookup failed:", error.message);
      throw error;
    }

    return (data ?? []) as Ward[];
  },
};

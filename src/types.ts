export type AppRole = 'employee' | 'manager' | 'admin'
export type VisaCase = {
  id: string; case_number: string | null; customer_full_name: string; customer_phone: string | null;
  country_id: string; visa_type_id: string; workflow_id: string; current_stage_id: string;
  status: 'open' | 'on_hold' | 'completed' | 'cancelled'; priority: 'low' | 'normal' | 'high' | 'urgent';
  due_at: string | null; created_at: string; created_by: string; assigned_to: string | null;
}
export type Profile = { id: string; full_name: string; is_active: boolean }
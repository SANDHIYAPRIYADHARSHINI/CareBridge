/**
 * Backend Data Models & Types for Member 2 Services
 * Covering User Auth, Caregiver Permissions, Reminders, Timeline, Hospitals, Appointments, and Audit
 */

export type UserRole = "patient" | "caregiver" | "admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone_number?: string;
  created_at: string;
}

export type ConsentStatus = "pending" | "approved" | "rejected" | "revoked";

export interface CaregiverPermissions {
  can_view_prescriptions: boolean;
  can_view_reminders: boolean;
  can_view_appointments: boolean;
  can_view_records: boolean;
}

export interface CaregiverConsent {
  id: string;
  patient_id: string;
  caregiver_id: string;
  patient_name?: string;
  patient_email?: string;
  caregiver_name?: string;
  caregiver_email?: string;
  status: ConsentStatus;
  permissions: CaregiverPermissions;
  can_view_prescriptions?: boolean;
  can_view_reminders?: boolean;
  can_view_appointments?: boolean;
  can_view_records?: boolean;
  requested_at: string;
  responded_at?: string;
  revoked_at?: string;
}

export type DoseStatus = "pending" | "taken" | "missed" | "skipped";

export interface DoseAdherenceLog {
  id: string;
  reminder_id: string;
  scheduled_time: string;
  status: DoseStatus;
  taken_at?: string;
  notes?: string;
}

export interface MedicineReminder {
  id: string;
  patient_id: string;
  medicine_name: string;
  dosage: string;
  instructions?: string;
  times_per_day: number;
  slots: ("morning" | "noon" | "evening" | "night")[];
  total_supply?: number;
  remaining_supply?: number;
  refill_threshold?: number;
  is_verified_rx: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  dose_logs?: DoseAdherenceLog[];
}

export type TimelineEventType =
  | "prescription"
  | "reminder"
  | "dose_log"
  | "appointment"
  | "report"
  | "discharge";

export interface TimelineEvent {
  id: string;
  patient_id?: string;
  type: TimelineEventType;
  title: string;
  description?: string;
  timestamp: string;
  source?: string;
  doctor_name?: string;
  hospital_name?: string;
  document_url?: string;
  is_verified: boolean;
  confidence?: number;
  status?: string;
  flags?: string[];
  metadata?: Record<string, unknown>;
}

export interface TimelineResponse {
  patient_id: string;
  total_events: number;
  events: TimelineEvent[];
}

export type CapacityDataSourceType = "simulated" | "verified" | "outdated" | "unavailable";

export interface Hospital {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  contact_number: string;
  emergency_available: boolean;
  emergency_status?: string;
  bed_capacity?: number | null;
  beds_available?: number | null;
  icu_capacity?: number | null;
  icu_available?: number | null;
  wait_time_minutes?: number | null;
  facilities?: string[];
  distance_km?: number | null;
  status: "normal" | "busy" | "critical" | "unknown";
  last_updated: string;
  is_simulated: boolean;
  data_source?: string;
  data_source_type?: CapacityDataSourceType;
}

export type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed";

export interface Doctor {
  id: string;
  hospital_id: string;
  name: string;
  department: string;
  qualification?: string | null;
  consultation_fee?: number | null;
  is_available: boolean;
  created_at: string;
}

export interface AppointmentSlot {
  id: string;
  doctor_id: string;
  hospital_id: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
}

export interface Appointment {
  id: string;
  patient_id: string;
  hospital_id: string;
  doctor_id?: string | null;
  slot_id?: string | null;
  hospital_name: string;
  doctor_name: string;
  department: string;
  scheduled_time: string;
  status: AppointmentStatus;
  notes?: string | null;
  booked_by_id?: string | null;
  booked_by_role?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
}

export interface AppointmentCreatePayload {
  hospital_id: string;
  doctor_id?: string | null;
  slot_id?: string | null;
  doctor_name: string;
  department: string;
  scheduled_time: string;
  status?: AppointmentStatus;
  notes?: string | null;
  patient_id?: string | null;
}

export interface AppointmentCancelPayload {
  reason?: string;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_name?: string;
  actor_role?: string;
  patient_id: string;
  action: string;
  resource: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export type AuditLogResponse = AuditLog;

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
  phone_number?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface ConsentRequestCreate {
  patient_id?: string;
  patient_email?: string;
  permissions?: Partial<CaregiverPermissions>;
}

export interface ConsentUpdate {
  status: ConsentStatus;
  permissions?: Partial<CaregiverPermissions>;
}

export interface PatientSummaryForCaregiverResponse {
  patient_id: string;
  patient_name: string;
  patient_email: string;
  permissions: CaregiverPermissions;
  prescriptions: unknown[];
  reminders: unknown[];
  appointments: unknown[];
  records: unknown[];
}

export interface ReminderCreatePayload {
  medicine_name: string;
  dosage: string;
  instructions?: string;
  times_per_day?: number;
  slots?: ("morning" | "noon" | "evening" | "night")[];
  total_supply?: number;
  remaining_supply?: number;
  refill_threshold?: number;
  is_verified_rx?: boolean;
}

export interface ReminderUpdatePayload {
  medicine_name?: string;
  dosage?: string;
  instructions?: string;
  times_per_day?: number;
  slots?: ("morning" | "noon" | "evening" | "night")[];
  total_supply?: number;
  remaining_supply?: number;
  refill_threshold?: number;
  is_active?: boolean;
}

export interface DoseLogCreatePayload {
  scheduled_time: string;
  status: DoseStatus;
  notes?: string;
}

export interface PrescriptionMedicineItemPayload {
  medicine_name: string;
  dosage: string;
  instructions?: string;
  times_per_day?: number;
  slots?: ("morning" | "noon" | "evening" | "night")[];
  total_supply?: number;
  remaining_supply?: number;
  refill_threshold?: number;
}

export interface PrescriptionImportPayload {
  prescription_id?: string;
  medicines: PrescriptionMedicineItemPayload[];
}


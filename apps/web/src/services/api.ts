/**
 * CareBridge Main API Client (Member 2 Service)
 * Handles communications with the FastAPI backend for Auth, Consent, Reminders, Timeline, Hospitals, and Appointments.
 */

import type {
  User,
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  ConsentRequestCreate,
  ConsentUpdate,
  CaregiverConsent,
  AuditLogResponse,
  PatientSummaryForCaregiverResponse,
  MedicineReminder,
  ReminderCreatePayload,
  ReminderUpdatePayload,
  DoseLogCreatePayload,
  PrescriptionImportPayload,
  DoseAdherenceLog,
  TimelineResponse,
  Hospital,
} from "../types/backend";

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status = 500, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
}

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError("Unable to connect to the CareBridge API service.", 0);
  }

  if (!response.ok) {
    let errorData: unknown = null;
    try {
      errorData = await response.json();
    } catch {
      // Non-json response
    }
    const message =
      typeof errorData === "object" && errorData !== null && "detail" in errorData
        ? String((errorData as { detail: unknown }).detail)
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, errorData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

// ==========================================
// Authentication APIs
// ==========================================

export async function registerUser(payload: RegisterRequest): Promise<TokenResponse> {
  const data = await apiFetch<TokenResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (data.access_token) {
    setAuthToken(data.access_token);
  }
  return data;
}

export async function loginUser(payload: LoginRequest): Promise<TokenResponse> {
  const data = await apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (data.access_token) {
    setAuthToken(data.access_token);
  }
  return data;
}

export async function getCurrentUser(): Promise<User> {
  return apiFetch<User>("/auth/me");
}

export async function seedDemoAccounts(): Promise<{ message: string; accounts: unknown }> {
  return apiFetch<{ message: string; accounts: unknown }>("/auth/seed-demo", {
    method: "POST",
  });
}

// ==========================================
// Consent & Access Control APIs
// ==========================================

export async function requestCaregiverAccess(
  payload: ConsentRequestCreate
): Promise<CaregiverConsent> {
  return apiFetch<CaregiverConsent>("/consent/request", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPatientConsents(): Promise<CaregiverConsent[]> {
  return apiFetch<CaregiverConsent[]>("/consent/patient");
}

export async function getCaregiverRequests(): Promise<CaregiverConsent[]> {
  return apiFetch<CaregiverConsent[]>("/consent/caregiver");
}

export async function updateConsentStatus(
  consentId: string,
  payload: ConsentUpdate
): Promise<CaregiverConsent> {
  return apiFetch<CaregiverConsent>(`/consent/${consentId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getAuditLogs(limit = 50): Promise<AuditLogResponse[]> {
  return apiFetch<AuditLogResponse[]>(`/consent/audit-logs?limit=${limit}`);
}

export async function getPatientSummaryForCaregiver(
  patientId: string
): Promise<PatientSummaryForCaregiverResponse> {
  return apiFetch<PatientSummaryForCaregiverResponse>(
    `/consent/patient-summary/${patientId}`
  );
}

// ==========================================
// Medicine Reminders & Dose Tracking APIs
// ==========================================

export async function getReminders(patientId?: string): Promise<MedicineReminder[]> {
  const query = patientId ? `?patient_id=${encodeURIComponent(patientId)}` : "";
  return apiFetch<MedicineReminder[]>(`/reminders/${query}`);
}

export async function createReminder(
  payload: ReminderCreatePayload
): Promise<MedicineReminder> {
  return apiFetch<MedicineReminder>("/reminders/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function importRemindersFromPrescription(
  payload: PrescriptionImportPayload
): Promise<MedicineReminder[]> {
  return apiFetch<MedicineReminder[]>("/reminders/from-prescription", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getRefillAlerts(): Promise<MedicineReminder[]> {
  return apiFetch<MedicineReminder[]>("/reminders/refills");
}

export async function getReminder(reminderId: string): Promise<MedicineReminder> {
  return apiFetch<MedicineReminder>(`/reminders/${reminderId}`);
}

export async function updateReminder(
  reminderId: string,
  payload: ReminderUpdatePayload
): Promise<MedicineReminder> {
  return apiFetch<MedicineReminder>(`/reminders/${reminderId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteReminder(reminderId: string): Promise<void> {
  await apiFetch<void>(`/reminders/${reminderId}`, {
    method: "DELETE",
  });
}

export async function logDose(
  reminderId: string,
  payload: DoseLogCreatePayload
): Promise<DoseAdherenceLog> {
  return apiFetch<DoseAdherenceLog>(`/reminders/${reminderId}/doses`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ==========================================
// Health Timeline APIs
// ==========================================

export async function getTimeline(
  patientId?: string,
  recordType?: string
): Promise<TimelineResponse> {
  const params = new URLSearchParams();
  if (patientId) params.append("patient_id", patientId);
  if (recordType && recordType !== "all") params.append("record_type", recordType);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<TimelineResponse>(`/timeline/${query}`);
}

// ==========================================
// Hospital Finder & Map APIs
// ==========================================

export interface HospitalFilterParams {
  query?: string;
  emergency_only?: boolean;
  facility?: string;
  lat?: number;
  lon?: number;
}

export async function getHospitals(
  params?: HospitalFilterParams
): Promise<Hospital[]> {
  const queryParams = new URLSearchParams();
  if (params?.query) queryParams.append("query", params.query);
  if (params?.emergency_only) queryParams.append("emergency_only", "true");
  if (params?.facility && params.facility !== "all") queryParams.append("facility", params.facility);
  if (params?.lat !== undefined) queryParams.append("lat", params.lat.toString());
  if (params?.lon !== undefined) queryParams.append("lon", params.lon.toString());

  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";
  return apiFetch<Hospital[]>(`/hospitals/${queryString}`);
}

export async function getHospitalById(hospitalId: string): Promise<Hospital> {
  return apiFetch<Hospital>(`/hospitals/${hospitalId}`);
}




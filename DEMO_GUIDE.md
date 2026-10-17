# CareBridge AI — Hackathon Demonstration Guide (Member 2)

> **AMD Developer Hackathon ACT III (lablab.ai)**  
> **Track 2: Health and Wellbeing**  
> **Member 2 Scope:** Patient Journey, Caregiver Access Control, Medication Reminders, Unified Health Timeline, Hospital Finder & Capacity Monitoring, Appointment Booking, and AI API Client Integration.

---

## ⚠️ Important Safety & Data Disclaimers

1. **Non-Diagnostic & Advisory Only:** CareBridge AI is an assistive healthcare coordination platform. It **never diagnoses illnesses, never prescribes medications, and never alters prescribed dosages**. All health advice is grounded in user-provided documents or qualified physician consultations.
2. **100% Synthetic Demo Data:** All patient records, doctor names, medical histories, and prescription images used in tests and live demonstrations are **completely synthetic and fictitious**. No real patient data or personally identifiable information (PII) is stored or processed.
3. **Simulated Hospital Telemetry:** Hospital crowd levels, ICU occupancy, bed counts, and emergency department wait times are **clearly labeled as `Simulated` or `Verified Synthetic`** to ensure hackathon judges and demo viewers understand these are live simulations for demonstration purposes only.

---

## 🔑 Pre-Configured Synthetic Demo Accounts

The platform includes pre-seeded demo accounts with one-click sign-in buttons on the Security Modal:

| Role | Synthetic Email | Default Password | Demo Persona | Key Privileges |
| :--- | :--- | :--- | :--- | :--- |
| **Patient** | `patient@carebridge.health` | `CareBridge@123` | **Kaviya Sundaram** | Full ownership of records, prescription extraction, reminder tracking, caregiver authorization, appointment booking. |
| **Caregiver** | `caregiver@carebridge.health` | `CareBridge@123` | **Dr. Anitha Nathan** | Request access to patient records; view only permitted scopes (e.g. reminders, prescriptions); blocked from unauthorized records. |

*Quick Demo Chip:* On any login/register screen, clicking **"Demo Patient Account"** or **"Demo Caregiver Account"** will automatically authenticate against the backend or initialize offline synthetic fallback mode.

---

## 🚀 End-to-End Hackathon Demonstration Flow

Follow this 7-step walkthrough to demonstrate the complete patient and caregiver journey:

```
[1. Patient Login] ➔ [2. Prescription AI] ➔ [3. Dose Tracker & Refill] ➔ [4. Authorize Caregiver]
         ➔ [5. Caregiver View & Granular Restriction] ➔ [6. Hospital Map & Capacity] ➔ [7. Appointment Booking]
```

---

### Step 1: Patient Registration and Login
- **Action:**
  1. Open the web interface at `http://localhost:5173`.
  2. Click **"Sign In"** in the navigation header.
  3. Click **"Demo Patient Account (Kaviya Sundaram)"** (or enter `patient@carebridge.health` / `CareBridge@123`).
- **Expected Outcome:**
  - Secure session token is stored in session storage.
  - User badge displays **"Kaviya Sundaram"** with **"Patient"** role badge.
  - Role-based navigation is unlocked: Timeline, Reminders, Hospitals, Appointments, Caregiver Access, and AI Assistant.
  - Strict RBAC prevents patient accounts from accessing caregiver-only administration endpoints.

---

### Step 2: Patient Views Prescription Data (Member 1 AI Integration)
- **Action:**
  1. Navigate to the **"AI Health Assistant"** tab (`/ai`).
  2. Notice the **AMD ROCm Hardware Telemetry Badge** displaying model inference hardware (e.g., `AMD Instinct MI300X (ROCm 6.2)` or `Mock ROCm Mode`).
  3. Upload a sample prescription image or click **"Load Synthetic Prescription"** (`rx_metformin.png`).
  4. View extracted medications:
     - **Metformin 500 mg:** Frequency: *Twice daily*, Timing: *After food*, Tamil: *உணவுக்குப் பின் தண்ணீருடன் உட்கொள்ளவும்*.
     - **Atorvastatin 10 mg:** Frequency: *Once daily*, Timing: *At bedtime*, Tamil: *இரவு படுக்கைக்கு முன் உட்கொள்ளவும்*.
- **Expected Outcome:**
  - Fast inference metrics displayed (`latency_ms: ~120ms`, model: `google/gemma-2-9b-it`).
  - Strict grounding citations with evidence line numbers linking directly to the OCR text.
  - Bilingual instructions (English & Tamil) rendered in native typography (Noto Sans Tamil).

---

### Step 3: Patient Creates Medication Reminders & Logs Doses
- **Action:**
  1. Click **"Import to Reminders"** from the extracted prescription, or navigate to **"Medication Reminders"** (`/reminders`).
  2. View active reminder: **Metformin 500mg** (Morning 08:30, Night 20:30, Remaining Supply: 4 doses, Refill Threshold: 3 doses).
  3. Click **"Log Dose Taken"** for the scheduled dose.
  4. Observe supply decrement: Remaining supply decreases from 4 to 3 doses.
- **Expected Outcome:**
  - Supply counter instantly updates to **3 doses remaining**.
  - Because remaining supply reaches the threshold (3 <= 3), a prominent **Refill Alert Banner** (`⚠️ Low Supply Alert — Refill Needed`) is triggered.
  - Dose adherence audit log records the timestamp and status (`TAKEN`).

---

### Step 4: Patient Authorizes Caregiver with Granular Permissions
- **Action:**
  1. Navigate to **"Caregiver Access"** (`/consent`).
  2. Review pending access request from caregiver **Dr. Anitha Nathan** (`caregiver@carebridge.health`).
  3. Select custom granular permissions:
     - ✅ **Medication Reminders & Dose Adherence** (`can_view_reminders: true`)
     - ✅ **Prescription History** (`can_view_prescriptions: true`)
     - ❌ **Doctor Appointments** (`can_view_appointments: false` — Unchecked)
     - ❌ **Diagnostic Medical Reports** (`can_view_records: false` — Unchecked)
  4. Click **"Approve Access Request"**.
- **Expected Outcome:**
  - Consent status updates to `Approved` with timestamp.
  - Security audit log records: `update_consent_approved` with specific granted permission scopes.
  - The patient retains the one-click **"Revoke Access"** button to immediately terminate access at any time.

---

### Step 5: Caregiver Views Permitted Information (Privacy Verification)
- **Action:**
  1. Click the user profile in the header and select **"Switch to Caregiver"** (or log out and click **"Demo Caregiver Account"**).
  2. Open the **"Caregiver Portal"** or view the authorized patient summary for Kaviya Sundaram.
  3. Inspect the access badge: **"Active Caregiver Access — Restricted Scopes Applied"**.
  4. Navigate to the **"Health Timeline"** (`/timeline?patient_id=...`):
     - Caregiver can see: Medication Reminders and Verified Prescriptions.
     - Caregiver CANNOT see: Lab reports, discharge summaries, or confidential notes.
  5. Attempt to view or book an appointment for the patient:
- **Expected Outcome:**
  - System blocks access with **HTTP 403 Forbidden** and a security notice: *"Caregiver does not possess appointment management permissions for this patient."*
  - Complete privacy and patient data sovereignty are preserved.

---

### Step 6: Patient Searches Hospitals & Views Live Capacity Telemetry
- **Action:**
  1. Switch back to the Patient persona and open **"Hospital Finder & Map"** (`/hospitals`).
  2. Search for `"Apollo"` in the search bar or filter by `"Emergency Only"`.
  3. Click on the hospital marker or card for **Apollo Speciality Hospitals (Greams Road, Chennai)**.
  4. Inspect the Capacity Telemetry panel:
     - **Crowd Status:** `Busy` / `Normal` / `High Surge`
     - **Beds Available:** `14 / 120`
     - **ICU Available:** `2 / 20`
     - **Emergency Dept Wait Time:** `~35 minutes`
     - **Source Label:** `Simulated Telemetry — Updated 2 mins ago`
  5. Click the **"Simulate Live Crowd Shift"** button (`POST /hospitals/{id}/simulate-crowd`).
- **Expected Outcome:**
  - Status transitions dynamically with smooth color-coded badge indicators (Green = Normal, Amber = Busy, Red = Surge).
  - All simulated capacity metrics are explicitly badged to prevent confusing simulation with official hospital admissions.
  - The **"Emergency Navigation Shortcut"** opens direct turn-by-turn directions with emergency hotline dialing.

---

### Step 7: Patient Searches Doctors & Books Appointment
- **Action:**
  1. Navigate to **"Book Appointment"** (`/appointments`).
  2. Filter by department: select **"Cardiology"**.
  3. Choose **Dr. R. Sundararajan, MD, DM (Senior Cardiologist)** at Apollo Speciality Hospitals.
  4. Select an available morning time slot (e.g. `10:30 AM – 11:00 AM`).
  5. Enter consultation notes: *"Routine annual cardiac checkup and Metformin regimen review"*.
  6. Click **"Confirm Appointment Booking"**.
  7. **Test Double-Booking Prevention:** Open another window or simulate a second patient attempting to select and book the exact same slot.
  8. **Test Cancellation:** In the **"My Appointments"** tab, click **"Cancel Booking"** and enter a reason.
- **Expected Outcome:**
  - Booking status confirms immediately with appointment ID and calendar summary.
  - The slot status transitions to `is_booked: true` and disappears from available slot listings.
  - Second booking attempt is rejected with **HTTP 409 Conflict**: *"This time slot has already been booked by another patient. Please choose an alternate slot."*
  - Cancelling the booking updates status to `Cancelled` and automatically releases the slot back to `is_booked: false`.

---

## 🛠️ Local Execution & Verification

### Running the Backend Services
```bash
# Navigate to services/backend
cd services/backend

# Run all automated tests (44 tests including full E2E demo journey)
pytest -v

# Run linting
ruff check .

# Start backend server
uvicorn app.main:app --reload --port 8000
```

### Running the Frontend Application
```bash
# Navigate to apps/web
cd apps/web

# Verify production build and TypeScript types
npm run build

# Start local Vite development server
npm run dev
```

The application will be live at `http://localhost:5173`.

---

## 📊 Summary of Synthetic Data Objects

| Entity | Synthetic Sample Instances | Attributes & Grounding |
| :--- | :--- | :--- |
| **Hospitals** | Apollo Greams Road, Fortis Malar, MIOT International, Rajiv Gandhi Govt Hospital | Lat/Lon coordinates, emergency service boolean, verified facilities, live capacity telemetry. |
| **Doctors** | Dr. R. Sundararajan (Cardiology), Dr. Priya Chandrasekar (Neurology), Dr. S. Balasubramanian (Endocrinology) | Specialization, qualifications, consultation fees, pre-generated available slots. |
| **Prescriptions** | Metformin 500mg, Atorvastatin 10mg, Telmisartan 40mg | OCR line evidence IDs, Tamil instructions, timing, dosage, confidence scores. |
| **Reminders** | Twice daily with meals, bedtime doses, refill alerts | Dosage, frequency, remaining supply counter, threshold alert triggers. |
| **Consents** | Granular permission matrix, audit logs, revocation timestamps | Full cryptographic traceability and audit logging. |

---

*CareBridge AI — Built with passion for patient dignity, accessibility, and caregiver coordination on AMD ROCm.*

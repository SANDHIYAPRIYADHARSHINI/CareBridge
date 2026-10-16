import React, { useState } from "react";
import {
  CalendarCheck,
  Hospital as HospitalIcon,
  Clock,
  CheckCircle,
  XCircle,
  PlusCircle,
  WarningCircle,
  Flask,
} from "@phosphor-icons/react";
import type { Appointment } from "../../types/backend";
import { StateFeedback } from "../../components/ui/StateFeedback";
import "./AppointmentsScreen.css";

interface AppointmentsScreenProps {
  language: "en" | "ta";
  preselectedHospitalName?: string;
}

const INITIAL_APPOINTMENTS: Appointment[] = [
  {
    id: "apt-1",
    patient_id: "patient-1",
    hospital_id: "hosp-1",
    hospital_name: "Apollo Speciality Hospital (Greams Road)",
    doctor_name: "Dr. K. Senthil Nathan, MD",
    department: "Cardiology & Diabetology",
    scheduled_time: "2026-10-19T10:30:00Z",
    status: "confirmed",
    notes: "Follow-up HbA1c review and blood pressure check.",
    created_at: new Date().toISOString(),
  },
  {
    id: "apt-2",
    patient_id: "patient-1",
    hospital_id: "hosp-2",
    hospital_name: "Rajiv Gandhi Government General Hospital (RGGGH)",
    doctor_name: "Dr. P. Vimala Devi, MS",
    department: "Ophthalmology Clinic",
    scheduled_time: "2026-10-24T14:00:00Z",
    status: "pending",
    notes: "Diabetic retinopathy annual screening.",
    created_at: new Date().toISOString(),
  },
];

const AVAILABLE_SLOTS = [
  "09:30 AM",
  "10:30 AM",
  "11:30 AM",
  "02:00 PM",
  "03:30 PM",
  "04:30 PM",
];

export const AppointmentsScreen: React.FC<AppointmentsScreenProps> = ({
  language,
  preselectedHospitalName,
}) => {
  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [doubleBookingAlert, setDoubleBookingAlert] = useState(false);

  // Form states
  const [doctorName, setDoctorName] = useState("Dr. K. Senthil Nathan, MD");
  const [department, setDepartment] = useState("Cardiology & Internal Medicine");
  const [hospitalName, setHospitalName] = useState(preselectedHospitalName || "Apollo Speciality Hospital (Greams Road)");
  const [selectedDate, setSelectedDate] = useState("2026-10-22");
  const [selectedSlot, setSelectedSlot] = useState("10:30 AM");
  const [appointmentNotes, setAppointmentNotes] = useState("");

  const isTa = language === "ta";

  const handleBook = (e: React.FormEvent) => {
    e.preventDefault();

    // Check for double-booking conflict simulation
    const conflict = appointments.some(
      (a) => a.status !== "cancelled" && a.scheduled_time.includes(selectedDate)
    );

    if (conflict) {
      setDoubleBookingAlert(true);
      return;
    }

    setDoubleBookingAlert(false);
    const newApt: Appointment = {
      id: `apt-${Date.now()}`,
      patient_id: "patient-1",
      hospital_id: "hosp-custom",
      hospital_name: hospitalName,
      doctor_name: doctorName,
      department: department,
      scheduled_time: `${selectedDate}T${selectedSlot.startsWith("10") ? "10:30" : "14:00"}:00Z`,
      status: "confirmed",
      notes: appointmentNotes || "Routine Consultation",
      created_at: new Date().toISOString(),
    };

    setAppointments((prev) => [newApt, ...prev]);
    setBookingSuccess(true);
    setTimeout(() => {
      setBookingSuccess(false);
      setIsBookingModalOpen(false);
    }, 1500);
  };

  const handleCancel = (aptId: string) => {
    setAppointments((prev) =>
      prev.map((a) => (a.id === aptId ? { ...a, status: "cancelled" } : a))
    );
  };

  return (
    <div className="appointments-screen" lang={language}>
      {/* Banner */}
      <div className="appointments-banner">
        <div>
          <div className="badge-pill">
            <CalendarCheck size={16} weight="fill" />
            <span>{isTa ? "மருத்துவ சந்திப்புகள்" : "Doctor & Hospital Appointments"}</span>
          </div>
          <h1 className="appointments-title">
            {isTa ? "மருத்துவர் ஆலோசனைகள் & முன்பதிவு" : "Clinical Consultations & Booking"}
          </h1>
          <p className="appointments-sub">
            {isTa
              ? "மருத்துவமனை அல்லது சிறப்பு மருத்துவரைத் தேர்ந்தெடுத்து வசதியான நேரத்தில் பதிவு செய்யுங்கள்."
              : "Schedule consultations with verified specialists and manage upcoming clinical visits."}
          </p>
        </div>

        <div className="banner-actions">
          <div className="synthetic-badge-pill">
            <Flask size={14} weight="bold" />
            <span>{isTa ? "மாதிரி முன்பதிவு அமைப்பு" : "Synthetic Booking Engine"}</span>
          </div>
          <button
            type="button"
            className="book-new-btn"
            onClick={() => setIsBookingModalOpen(true)}
          >
            <PlusCircle size={18} weight="bold" />
            <span>{isTa ? "புதிய சந்திப்பை பதிவு செய்" : "Book New Appointment"}</span>
          </button>
        </div>
      </div>

      {/* Appointments List */}
      <div className="appointments-list-section">
        <h2 className="section-title">
          {isTa ? "உங்கள் மருத்துவ சந்திப்புகள்" : "Scheduled Appointments"}
        </h2>

        {appointments.length === 0 ? (
          <StateFeedback
            state="empty"
            title={isTa ? "சந்திப்புகள் எதுவும் இல்லை" : "No appointments scheduled"}
            message={isTa ? "புதிய மருத்துவ சந்திப்பைப் பதிவு செய்ய மேலே உள்ள பட்டனை அழுத்தவும்." : "Schedule an in-person or telemedicine consultation with a physician."}
            actionLabel={isTa ? "சந்திப்பு பதிவு செய்" : "Book Appointment"}
            onAction={() => setIsBookingModalOpen(true)}
          />
        ) : (
          <div className="appointments-grid">
            {appointments.map((apt) => {
              const isConfirmed = apt.status === "confirmed";
              const isPending = apt.status === "pending";
              const isCancelled = apt.status === "cancelled";

              return (
                <div key={apt.id} className={`appointment-card ${apt.status}`}>
                  <div className="card-header">
                    <div>
                      <h3 className="doctor-title">{apt.doctor_name}</h3>
                      <span className="department-tag">{apt.department}</span>
                    </div>

                    <div className="status-badge-wrap">
                      {isConfirmed && (
                        <span className="status-badge confirmed">
                          <CheckCircle size={14} weight="fill" />
                          <span>{isTa ? "உறுதியானது" : "Confirmed"}</span>
                        </span>
                      )}
                      {isPending && (
                        <span className="status-badge pending">
                          <Clock size={14} weight="fill" />
                          <span>{isTa ? "நிலுவையில்" : "Pending"}</span>
                        </span>
                      )}
                      {isCancelled && (
                        <span className="status-badge cancelled">
                          <XCircle size={14} weight="fill" />
                          <span>{isTa ? "ரத்து செய்யப்பட்டது" : "Cancelled"}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="appointment-meta-rows">
                    <div className="meta-row">
                      <HospitalIcon size={16} className="meta-icon" />
                      <span>{apt.hospital_name}</span>
                    </div>
                    <div className="meta-row">
                      <Clock size={16} className="meta-icon" />
                      <span>{new Date(apt.scheduled_time).toLocaleString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}</span>
                    </div>
                  </div>

                  {apt.notes && <p className="apt-notes">&ldquo;{apt.notes}&rdquo;</p>}

                  <div className="card-footer-action">
                    {!isCancelled && (
                      <button
                        type="button"
                        className="btn-cancel-apt"
                        onClick={() => handleCancel(apt.id)}
                      >
                        {isTa ? "சந்திப்பை ரத்து செய்" : "Cancel Appointment"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Booking Modal */}
      {isBookingModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsBookingModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{isTa ? "மருத்துவர் சந்திப்பு முன்பதிவு" : "Book Doctor Appointment"}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsBookingModalOpen(false)}
              >
                &times;
              </button>
            </div>

            {bookingSuccess ? (
              <StateFeedback
                state="success"
                title={isTa ? "சந்திப்பு வெற்றிகரமாக பதிவு செய்யப்பட்டது!" : "Appointment Confirmed!"}
                message={isTa ? "உங்கள் மருத்துவ காலக்கோட்டில் விவரங்கள் சேர்க்கப்பட்டுள்ளன." : "Details have been securely added to your health timeline."}
              />
            ) : (
              <form onSubmit={handleBook} className="booking-form">
                {doubleBookingAlert && (
                  <div className="double-booking-warning">
                    <WarningCircle size={18} weight="fill" />
                    <span>
                      {isTa
                        ? "எச்சரிக்கை: இந்த தேதியில் உங்களுக்கு ஏற்கனவே மற்றொரு மருத்துவ சந்திப்பு உள்ளது! மாற்று தேதியைத் தேர்வு செய்யவும்."
                        : "Conflict Detected: You already have another appointment scheduled on this date! Please choose an alternative slot."}
                    </span>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">{isTa ? "மருத்துவமனை" : "Hospital"}</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={hospitalName}
                    onChange={(e) => setHospitalName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{isTa ? "மருத்துவர் பெயர்" : "Doctor Name"}</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">{isTa ? "மருத்துவப் பிரிவு" : "Department"}</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  />
                </div>

                <div className="form-row-2col">
                  <div className="form-group">
                    <label className="form-label">{isTa ? "தேதி" : "Date"}</label>
                    <input
                      type="date"
                      required
                      className="form-input"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">{isTa ? "நேரம்" : "Slot"}</label>
                    <select
                      className="form-input"
                      value={selectedSlot}
                      onChange={(e) => setSelectedSlot(e.target.value)}
                    >
                      {AVAILABLE_SLOTS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{isTa ? "குறிப்புகள் (விருப்பத்தேர்வு)" : "Notes (Optional)"}</label>
                  <textarea
                    rows={2}
                    className="form-input"
                    placeholder={isTa ? "பரிசோதனை நோக்கம்..." : "Reason for visit..."}
                    value={appointmentNotes}
                    onChange={(e) => setAppointmentNotes(e.target.value)}
                  />
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    onClick={() => setIsBookingModalOpen(false)}
                  >
                    {isTa ? "ரத்து செய்" : "Cancel"}
                  </button>
                  <button type="submit" className="modal-submit-btn">
                    {isTa ? "முன்பதிவை உறுதிசெய்" : "Confirm Appointment"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

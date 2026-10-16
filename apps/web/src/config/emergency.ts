/**
 * Emergency & Crisis Helpline Numbers Configuration.
 *
 * CRITICAL SAFETY NOTICE:
 * All emergency numbers in this file are explicitly marked as TO_VERIFY.
 * Before clinical production deployment, each contact number and regional routing
 * must be verified against current state and national regulatory protocols.
 */

export interface EmergencyContactEntry {
  /** Dialable telephone number or shortcode */
  readonly number: string;
  /** Primary English display label */
  readonly label: string;
  /** Primary Tamil display label (தமிழ்) */
  readonly labelTa: string;
  /** Descriptive metadata and jurisdiction */
  readonly description: string;
  /** Verification flag - explicitly set to TO_VERIFY */
  readonly status: "TO_VERIFY";
}

export interface EmergencyDirectoryConfig {
  /** Primary National Ambulance & Emergency Medical Services (India: 108) */
  readonly ambulance: EmergencyContactEntry;
  /** Tele-MANAS National Mental Health & Crisis Helpline (India: 14416) */
  readonly teleManas: EmergencyContactEntry;
  /** Unified National Emergency Response Support System (India: 112) */
  readonly nationalEmergency: EmergencyContactEntry;
}

export const EMERGENCY_CONFIG: EmergencyDirectoryConfig = {
  ambulance: {
    number: "108",
    label: "Emergency Ambulance",
    labelTa: "அவசர ஆம்புலன்ஸ்",
    description: "National Emergency Ambulance Medical Service (India)",
    status: "TO_VERIFY",
  },
  teleManas: {
    number: "14416",
    label: "Tele-MANAS Crisis Helpline",
    labelTa: "டெலி-மானாஸ் மனநல உதவி",
    description: "National Tele Mental Health Assistance and Networking Across States",
    status: "TO_VERIFY",
  },
  nationalEmergency: {
    number: "112",
    label: "National Emergency Number",
    labelTa: "தேசிய அவசர உதவி எண்",
    description: "Unified Emergency Response Support System (ERSS)",
    status: "TO_VERIFY",
  },
} as const;

export default EMERGENCY_CONFIG;

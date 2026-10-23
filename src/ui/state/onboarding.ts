import type { ProblemId } from "../../domain/recommendations";

/** Selection made on the welcome screen, handed to the consultant once (not persisted). */
let pending: ProblemId[] = [];
export function setOnboardingSelection(ids: ProblemId[]) {
  pending = [...ids];
}
export function takeOnboardingSelection(): ProblemId[] {
  const out = pending;
  pending = [];
  return out;
}

/** Whether the user chose "skip for now" on the data intake screen (this page load only). */
let intakeSkipped = false;
export function isIntakeSkipped() {
  return intakeSkipped;
}
export function setIntakeSkipped(v: boolean) {
  intakeSkipped = v;
}

/** Opens the data intake directly in manual mode once (set from the welcome screen). */
let intakeManual = false;
export function requestManualIntake() {
  intakeManual = true;
}
export function takeManualIntake(): boolean {
  const v = intakeManual;
  intakeManual = false;
  return v;
}

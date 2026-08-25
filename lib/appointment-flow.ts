import { AppointmentStatus } from "@prisma/client";

/**
 * The groom flow, with no server dependencies, so the kiosk (a client
 * component) and the server both work from the same list instead of keeping
 * private copies that drift.
 */
export const STATUS_FLOW: AppointmentStatus[] = [
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.DRYING,
  AppointmentStatus.FINISHING,
  AppointmentStatus.COMPLETE,
  AppointmentStatus.READY_PICKUP,
  AppointmentStatus.PICKED_UP,
];

/** Next status along the flow, or null at either end. */
export function nextStatus(current: AppointmentStatus | string): AppointmentStatus | null {
  if (current === AppointmentStatus.SCHEDULED) return AppointmentStatus.CHECKED_IN;
  const index = STATUS_FLOW.indexOf(current as AppointmentStatus);
  return index >= 0 && index < STATUS_FLOW.length - 1 ? STATUS_FLOW[index + 1] : null;
}

export type SaleLookupState =
  | "SALEABLE" | "INVALID_QR" | "UNKNOWN_SERIAL" | "OTHER_EVENT" | "ALREADY_SOLD"
  | "ISSUED_TO_ANOTHER_SELLER" | "NOT_ISSUED_TO_YOU" | "TICKET_CANCELLED" | "TICKET_REVOKED"
  | "SALES_CLOSED" | "TICKET_TYPE_INACTIVE" | "EVENT_NOT_SELLING";

export type SaleLookupTone = "success" | "warning" | "danger";
export interface SaleLookupPresentation { message: string; icon: string; tone: SaleLookupTone; label: string; }

export const SALE_LOOKUP_PRESENTATION: Record<SaleLookupState, SaleLookupPresentation> = {
  SALEABLE: { label: "Ready to sell", message: "Ticket is available to sell.", icon: "badge-check", tone: "success" },
  INVALID_QR: { label: "Invalid QR", message: "QR code is unknown or invalid.", icon: "qr-code", tone: "danger" },
  UNKNOWN_SERIAL: { label: "Unknown serial", message: "Ticket serial was not found.", icon: "search-x", tone: "danger" },
  OTHER_EVENT: { label: "Different event", message: "This ticket belongs to another event.", icon: "calendar-x", tone: "warning" },
  ALREADY_SOLD: { label: "Already sold", message: "This ticket has already been sold.", icon: "ticket-x", tone: "warning" },
  ISSUED_TO_ANOTHER_SELLER: { label: "Held by another seller", message: "This ticket is held by another seller.", icon: "user-round-x", tone: "warning" },
  NOT_ISSUED_TO_YOU: { label: "Not issued to you", message: "This ticket has not been issued to you.", icon: "user-round", tone: "warning" },
  TICKET_CANCELLED: { label: "Cancelled", message: "This ticket has been cancelled.", icon: "ban", tone: "danger" },
  TICKET_REVOKED: { label: "Revoked", message: "This ticket has been revoked.", icon: "shield-ban", tone: "danger" },
  SALES_CLOSED: { label: "Sales closed", message: "Sales are closed for this event or ticket category.", icon: "clock-alert", tone: "warning" },
  TICKET_TYPE_INACTIVE: { label: "Category inactive", message: "This ticket category is inactive.", icon: "tags", tone: "warning" },
  EVENT_NOT_SELLING: { label: "Event not selling", message: "This event is not selling tickets.", icon: "calendar-off", tone: "warning" },
};

export interface ScanCartTicket {
  serial: string;
  ticketTypeName: string;
  priceUgx: number;
  entryMethod: "SCAN" | "MANUAL";
  token?: string;
}

export function addCartTicket(cart: ScanCartTicket[], ticket: ScanCartTicket): ScanCartTicket[] {
  if (cart.some((item) => item.serial.toUpperCase() === ticket.serial.toUpperCase())) return cart;
  return [...cart, ticket];
}

export function removeCartTicket(cart: ScanCartTicket[], serial: string): ScanCartTicket[] {
  return cart.filter((ticket) => ticket.serial.toUpperCase() !== serial.toUpperCase());
}

import {
  Document,
  Image,
  Line,
  Page,
  Svg,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";

/**
 * Print-ready ticket PDF (PRD 5.6).
 *
 * Composition (owner directive: 5 tickets per A4): A4 portrait pages with 5
 * tickets stacked, dashed cut guides between them. The page is exactly
 * 210 × 297 mm, so each ticket is printed at SHEET_SCALE (~94%) of the
 * 210 × 59 mm artwork — that is what leaves real print margins on every
 * side (~6 mm left/right, ~10 mm top/bottom). The sheet arrangement stays a
 * configurable implementation detail; the artwork is the fixed target: main
 * section ~70% + detachable stub ~30%, dashed perforation, deep green /
 * gold / white theme, QR generated from the ticket's secure token (never
 * from the serial).
 */

const mm = (value: number): number => (value * 72) / 25.4;

/** Uniform geometric shrink so 5 tickets fit one A4 with print margins. */
export const SHEET_SCALE = 0.94;
export const PAGE_WIDTH = mm(210); // A4 portrait
export const PAGE_HEIGHT = mm(297);
export const TICKET_WIDTH = mm(210 * SHEET_SCALE);
export const TICKET_HEIGHT = mm(59 * SHEET_SCALE);
export const TICKETS_PER_PAGE = 5;
const MAIN_WIDTH = Math.round(TICKET_WIDTH * 0.7); // ~70% main / 30% stub
const STUB_WIDTH = TICKET_WIDTH - MAIN_WIDTH;
const STACK_LEFT = Math.round((PAGE_WIDTH - TICKET_WIDTH) / 2);
const STACK_TOP = Math.round((PAGE_HEIGHT - TICKET_HEIGHT * TICKETS_PER_PAGE) / 2);

const GREEN = "#0F3D2E";
const GOLD = "#C8A24A";
const INK = "#14201B";
const GRAY = "#46534D";
const STUB_BG = "#EEF4F0";

/**
 * Multiplies a point value of the full-size 210 × 59 mm artwork by the sheet
 * scale, so the printed ticket is a geometrically faithful (but smaller)
 * replica. All internal dimensions go through this.
 */
const s = (value: number): number => value * SHEET_SCALE;

/** Everything the renderer needs for one printed ticket. */
export interface TicketPrintRow {
  serial: string;
  /** Raw QR token — decrypted in the print path only, never persisted again. */
  token: string;
  ticketTypeName: string;
  printLabel: string | null;
  event: {
    name: string;
    venue: string;
    address: string | null;
    /** Calendar date `YYYY-MM-DD` in the event's timezone. */
    eventDate: string;
    startTime: string;
    endTime: string;
    accentColor: string | null;
    ticketFooterText: string | null;
    organiserContact: string | null;
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** `2026-12-05` → `Sat, 5 Dec 2026` (calendar date, no timezone shift). */
export function formatEventDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const weekday = DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
  return `${weekday}, ${day} ${MONTHS[month - 1]} ${year}`;
}

const styles = StyleSheet.create({
  page: { position: "relative", backgroundColor: "#FFFFFF" },

  ticket: { position: "relative", flexDirection: "row", backgroundColor: "#FFFFFF" },

  main: { width: MAIN_WIDTH, flexDirection: "row", padding: s(8), gap: s(6) },
  mainLeft: { flex: 1, justifyContent: "space-between" },

  headerBar: {
    backgroundColor: GREEN,
    borderRadius: s(2),
    paddingHorizontal: s(6),
    paddingVertical: s(3),
  },
  headerText: { color: "#FFFFFF", fontWeight: "bold", fontSize: s(14) },
  goldRule: { height: s(2), backgroundColor: GOLD, marginTop: s(2) },
  meta: { fontSize: s(9), color: INK, marginTop: s(3) },
  category: { fontSize: s(11), fontWeight: "bold", color: GREEN },
  serial: { fontSize: s(16), fontWeight: "bold", color: INK, marginTop: s(1) },
  warning: { fontSize: s(6), color: GRAY },
  contact: { fontSize: s(6.5), color: GRAY, marginTop: s(1) },

  qrBlock: { justifyContent: "center", alignItems: "center", width: s(126) },
  qr: { width: s(118), height: s(118) },
  qrCaption: { fontSize: s(6), color: GRAY, marginTop: s(2) },

  stub: {
    width: STUB_WIDTH,
    backgroundColor: STUB_BG,
    paddingHorizontal: s(6),
    paddingVertical: s(6),
    justifyContent: "space-between",
  },
  logoBand: {
    backgroundColor: GREEN,
    borderRadius: s(2),
    paddingVertical: s(3),
    alignItems: "center",
  },
  logoText: { color: "#FFFFFF", fontWeight: "bold", fontSize: s(11), letterSpacing: s(1) },
  stubLabel: { fontSize: s(6.5), color: GRAY, textAlign: "center" },
  stubCategory: { fontSize: s(7.5), fontWeight: "bold", color: GREEN, textAlign: "center" },
  stubSerial: { fontSize: s(11), fontWeight: "bold", color: INK, textAlign: "center", marginTop: s(2) },
  stubKeep: { fontSize: s(6.5), color: GRAY, textAlign: "center" },
  stubDate: { fontSize: s(7), color: INK, textAlign: "center", marginTop: s(1) },
});

function Ticket({ row, qr }: { row: TicketPrintRow; qr: Buffer }) {
  // Event-configured accent colour, falling back to the KSP deep green.
  const headerBg = row.event.accentColor ?? GREEN;
  const place = row.event.address
    ? `${row.event.venue}, ${row.event.address}`
    : row.event.venue;

  return (
    <View style={styles.ticket} wrap={false}>
      <View style={styles.main}>
        <View style={styles.mainLeft}>
          <View>
            <View style={[styles.headerBar, { backgroundColor: headerBg }]}>
              <Text style={styles.headerText}>{row.event.name}</Text>
            </View>
            <View style={styles.goldRule} />
            <Text style={styles.meta}>
              {formatEventDate(row.event.eventDate)} · {row.event.startTime}–{row.event.endTime}
            </Text>
            <Text style={styles.meta}>{place}</Text>
          </View>

          <View>
            <Text style={styles.category}>{row.printLabel ?? row.ticketTypeName}</Text>
            <Text style={styles.serial}>{row.serial}</Text>
          </View>

          <View>
            <Text style={styles.warning}>
              Duplicate serials are void. Only a server-confirmed scan admits entry.
            </Text>
            {row.event.ticketFooterText ? (
              <Text style={styles.contact}>{row.event.ticketFooterText}</Text>
            ) : null}
            {row.event.organiserContact ? (
              <Text style={styles.contact}>{row.event.organiserContact}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.qrBlock}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt prop; QR encodes the ticket token */}
          <Image src={qr} style={styles.qr} />
          <Text style={styles.qrCaption}>Scan at the gate</Text>
        </View>
      </View>

      <View style={styles.stub}>
        <View>
          <View style={styles.logoBand}>
            <Text style={styles.logoText}>KSP</Text>
          </View>
          <Text style={styles.stubLabel}>ADMIT ONE</Text>
        </View>
        <View>
          <Text style={styles.stubCategory}>{row.printLabel ?? row.ticketTypeName}</Text>
          <Text style={styles.stubSerial}>{row.serial}</Text>
        </View>
        <View>
          <Text style={styles.stubKeep}>KEEP THIS STUB</Text>
          <Text style={styles.stubDate}>{formatEventDate(row.event.eventDate)}</Text>
        </View>
      </View>

      {/* Dashed perforation between main ticket and detachable stub. */}
      <Svg
        style={{ position: "absolute", left: MAIN_WIDTH - s(4), top: 0, width: s(8), height: TICKET_HEIGHT }}
      >
        <Line x1={s(4)} y1={0} x2={s(4)} y2={TICKET_HEIGHT} stroke={GRAY} strokeWidth={s(0.7)} strokeDasharray={`${s(3)} ${s(3)}`} />
      </Svg>
    </View>
  );
}

/** Renders the full document; `rows` may span several pages (5 per page). */
export async function renderTicketsPdf(rows: TicketPrintRow[]): Promise<Buffer> {
  if (rows.length === 0) {
    throw new Error("Nothing to print: no printable tickets were supplied.");
  }

  // QR generation is CPU-bound; do it once per row up front.
  const qrBuffers = await Promise.all(
    rows.map((row) =>
      QRCode.toBuffer(row.token, {
        type: "png",
        // A four-module white quiet zone keeps the unchanged QR footprint
        // reliably scannable after printing and trimming.
        margin: 4,
        width: 512,
        errorCorrectionLevel: "Q",
        color: { dark: "#000000", light: "#FFFFFF" },
      }),
    ),
  );

  const pages: TicketPrintRow[][] = [];
  for (let i = 0; i < rows.length; i += TICKETS_PER_PAGE) {
    pages.push(rows.slice(i, i + TICKETS_PER_PAGE));
  }

  const doc = (
    <Document>
      {pages.map((pageRows, pageIndex) => (
        <Page key={pageIndex} size={[PAGE_WIDTH, PAGE_HEIGHT]} style={styles.page}>
          {pageRows.map((row, rowIndex) => (
            <View
              key={row.serial}
              style={{
                position: "absolute",
                left: STACK_LEFT,
                top: STACK_TOP + rowIndex * TICKET_HEIGHT,
                width: TICKET_WIDTH,
                height: TICKET_HEIGHT,
              }}
              wrap={false}
            >
              <Ticket row={row} qr={qrBuffers[pageIndex * TICKETS_PER_PAGE + rowIndex]} />
            </View>
          ))}

          {/* Dashed cut guides: above the first ticket, between tickets, below
              the last. One small SVG per line — a page-sized SVG would trigger
              react-pdf's "can't wrap between pages" warning. */}
          {Array.from({ length: TICKETS_PER_PAGE + 1 }, (_, i) => {
            const y = STACK_TOP + i * TICKET_HEIGHT;
            return (
              <Svg
                key={i}
                style={{ position: "absolute", left: STACK_LEFT, top: y - s(4), width: TICKET_WIDTH, height: s(8) }}
              >
                <Line
                  x1={0}
                  y1={s(4)}
                  x2={TICKET_WIDTH}
                  y2={s(4)}
                  stroke={GRAY}
                  strokeWidth={s(0.7)}
                  strokeDasharray={`${s(4)} ${s(4)}`}
                />
              </Svg>
            );
          })}
        </Page>
      ))}
    </Document>
  );

  return renderToBuffer(doc);
}

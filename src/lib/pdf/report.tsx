import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReportData } from "@/server/services/reports.service";

const styles = StyleSheet.create({
  page: { padding: 34, fontFamily: "Helvetica", fontSize: 9, color: "#17241d" },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", color: "#0b4d2c", marginBottom: 5 },
  meta: { color: "#647067", marginBottom: 14 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#d8ded9", minHeight: 19, alignItems: "center" },
  head: { backgroundColor: "#eaf1ec", fontFamily: "Helvetica-Bold" },
  cell: { flexGrow: 1, flexBasis: 0, paddingHorizontal: 4, paddingVertical: 4 },
  footer: { marginTop: 14, color: "#647067", fontSize: 8 },
});

function ReportDocument({ report }: { report: ReportData }) {
  return <Document title={`${report.title} - ${report.eventName}`}>
    <Page size="A4" orientation="landscape" style={styles.page} wrap>
      <Text style={styles.title}>{report.title}</Text>
      <Text style={styles.meta}>{report.eventName} · Generated {new Date(report.generatedAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })} · Amounts are UGX unless stated</Text>
      <View style={[styles.row, styles.head]}>{report.columns.map((column, i) => <Text key={`${i}-${column}`} style={styles.cell}>{column}</Text>)}</View>
      {report.rows.map((row, ri) => <View key={ri} style={styles.row} wrap={false}>{row.map((cell, ci) => <Text key={ci} style={styles.cell}>{cell === null ? "" : String(cell)}</Text>)}</View>)}
      {report.rows.length === 0 && <Text style={styles.cell}>No records found for the selected filters.</Text>}
      <Text style={styles.footer} fixed>This report reflects staff-recorded data and does not independently verify bank or mobile-money receipts.</Text>
    </Page>
  </Document>;
}

export function renderReportPdf(report: ReportData): Promise<Buffer> {
  return renderToBuffer(<ReportDocument report={report} />);
}

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { SaleDto } from "@/server/services/sales.service";

const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", fontSize: 10, color: "#14201B" },
  header: { borderBottomWidth: 3, borderBottomColor: "#0F3D2E", paddingBottom: 14, marginBottom: 18 },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#0F3D2E" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 5, marginBottom: 4 },
  metadata: { color: "#46534D", marginTop: 3 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 6, gap: 16 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 7, color: "#0F3D2E" },
  line: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: "#D2DBD5", paddingVertical: 7, gap: 16 },
  itemDescription: { flex: 1, lineHeight: 1.35 },
  amount: { fontFamily: "Helvetica-Bold", textAlign: "right" },
  total: { borderTopWidth: 1.5, borderTopColor: "#0F3D2E", marginTop: 9, paddingTop: 9, fontFamily: "Helvetica-Bold", fontSize: 11 },
  balance: { fontFamily: "Helvetica-Bold", color: "#0F3D2E" },
  status: { marginTop: 15, padding: 11, borderRadius: 4, fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "center" },
  paid: { backgroundColor: "#DCFCE7", color: "#14532D" },
  due: { backgroundColor: "#FEF3C7", color: "#713F12" },
  note: { marginTop: 18, padding: 10, backgroundColor: "#EEF4F0", color: "#33443A", lineHeight: 1.4 },
});

const ugx = (amount: number) => `UGX ${new Intl.NumberFormat("en-UG").format(amount)}`;

function ReceiptDocument({ sale }: { sale: SaleDto }) {
  const paid = sale.status === "PAID";
  const paymentLabel = paid
    ? "PAID IN FULL"
    : sale.amountPaidUgx > 0
      ? "PARTIALLY PAID · BALANCE DUE"
      : "PAYMENT DUE · NO PAYMENT RECORDED";
  return (
    <Document title={`Receipt ${sale.reference}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>KSP Hotel Gulu</Text>
          <Text style={styles.title}>SALE RECEIPT · {sale.reference}</Text>
          <Text style={styles.metadata}>{sale.eventName} · {sale.venue}</Text>
          <Text style={styles.metadata}>Receipt date: {new Date(sale.createdAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })}</Text>
          <Text style={styles.metadata}>Seller: {sale.seller.displayName}</Text>
          {sale.customerName ? <Text style={styles.metadata}>Customer: {sale.customerName}</Text> : null}
          {sale.customerPhone ? <Text style={styles.metadata}>Phone: {sale.customerPhone}</Text> : null}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          {sale.items.map((item) => (
            <View key={item.id} style={styles.line}>
              <Text style={styles.itemDescription}>{item.quantity} × {item.ticketTypeName} · {ugx(item.unitPriceUgx)} each</Text>
              <Text style={styles.amount}>{ugx(item.lineTotalUgx)}</Text>
            </View>
          ))}
          {sale.discountUgx > 0 ? <View style={styles.line}><Text style={styles.itemDescription}>Discount{sale.discountReason ? ` · ${sale.discountReason}` : ""}</Text><Text style={styles.amount}>−{ugx(sale.discountUgx)}</Text></View> : null}
          <View style={[styles.row, styles.total]}><Text>Total</Text><Text>{ugx(sale.totalUgx)}</Text></View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payments recorded</Text>
          {sale.payments.map((payment) => (
            <View key={payment.id} style={styles.line}>
              <Text style={styles.itemDescription}>{new Date(payment.recordedAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })} · {payment.method}{payment.externalRef ? ` · Ref ${payment.externalRef}` : ""}</Text>
              <Text style={styles.amount}>{ugx(payment.netAmountUgx)}</Text>
            </View>
          ))}
          {sale.payments.length === 0 ? <Text>No payments recorded.</Text> : null}
          <View style={styles.row}><Text>Amount paid</Text><Text style={styles.amount}>{ugx(sale.amountPaidUgx)}</Text></View>
          <View style={[styles.row, styles.total]}><Text>Balance outstanding</Text><Text style={styles.balance}>{ugx(sale.balanceUgx)}</Text></View>
        </View>
        <Text style={[styles.status, paid ? styles.paid : styles.due]}>{paymentLabel}</Text>
        <Text style={styles.note}>This receipt records payments entered by authorised staff. It is not a ticket and does not independently verify payment with a bank or mobile-money provider.</Text>
      </Page>
    </Document>
  );
}

export function renderReceiptPdf(sale: SaleDto): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument sale={sale} />);
}

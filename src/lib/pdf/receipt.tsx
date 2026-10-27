import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { SaleDto } from "@/server/services/sales.service";

const styles = StyleSheet.create({
  page: { padding: 38, fontFamily: "Helvetica", fontSize: 10, color: "#17241d" },
  header: { borderBottomWidth: 2, borderBottomColor: "#0b4d2c", paddingBottom: 12, marginBottom: 16 },
  brand: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#0b4d2c" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 4 },
  muted: { color: "#647067" },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, color: "#0b4d2c" },
  line: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: "#d8ded9", paddingVertical: 6 },
  total: { borderTopWidth: 1, borderTopColor: "#0b4d2c", marginTop: 8, paddingTop: 8, fontFamily: "Helvetica-Bold" },
  note: { marginTop: 18, padding: 9, backgroundColor: "#f2f6f3", color: "#45534a" },
});

const ugx = (amount: number) => `UGX ${new Intl.NumberFormat("en-UG").format(amount)}`;

function ReceiptDocument({ sale }: { sale: SaleDto }) {
  const paid = sale.status === "PAID";
  return (
    <Document title={`Receipt ${sale.reference}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>KSP Hotel Gulu</Text>
          <Text style={styles.title}>SALE RECEIPT · {sale.reference}</Text>
          <Text>{sale.eventName} · {sale.venue}</Text>
          <Text>Receipt date: {new Date(sale.createdAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })}</Text>
          <Text>Seller: {sale.seller.displayName}</Text>
          {sale.customerName ? <Text>Customer: {sale.customerName}</Text> : null}
          {sale.customerPhone ? <Text>Phone: {sale.customerPhone}</Text> : null}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          {sale.items.map((item) => (
            <View key={item.id} style={styles.line}>
              <Text>{item.quantity} × {item.ticketTypeName} at {ugx(item.unitPriceUgx)}</Text>
              <Text>{ugx(item.lineTotalUgx)}</Text>
            </View>
          ))}
          {sale.discountUgx > 0 ? <View style={styles.line}><Text>Discount{sale.discountReason ? ` · ${sale.discountReason}` : ""}</Text><Text>−{ugx(sale.discountUgx)}</Text></View> : null}
          <View style={[styles.row, styles.total]}><Text>Total</Text><Text>{ugx(sale.totalUgx)}</Text></View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payments recorded</Text>
          {sale.payments.map((payment) => (
            <View key={payment.id} style={styles.line}>
              <Text>{new Date(payment.recordedAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })} · {payment.method}{payment.externalRef ? ` · Ref ${payment.externalRef}` : ""}</Text>
              <Text>{ugx(payment.netAmountUgx)}</Text>
            </View>
          ))}
          {sale.payments.length === 0 ? <Text>No payments recorded.</Text> : null}
          <View style={styles.row}><Text>Amount paid</Text><Text>{ugx(sale.amountPaidUgx)}</Text></View>
          <View style={styles.row}><Text>Balance outstanding</Text><Text>{ugx(sale.balanceUgx)}</Text></View>
          <View style={[styles.row, styles.total]}><Text>{paid ? "PAID IN FULL" : "PARTIALLY PAID / PAYMENT DUE"}</Text><Text>{sale.status}</Text></View>
        </View>
        <Text style={styles.note}>This receipt records payments entered by authorised staff. It is not a ticket and does not independently verify payment with a bank or mobile-money provider.</Text>
      </Page>
    </Document>
  );
}

export function renderReceiptPdf(sale: SaleDto): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument sale={sale} />);
}

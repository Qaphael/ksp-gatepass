type TestPrisma = typeof import("../tests/helpers/db").prisma;

const eventName = "GatePass E2E Design Event";

async function seedDesignEvent(prisma: TestPrisma) {
  const eventData = {
    name: eventName,
    description: "Automated UI fixture. Test database only.",
    venue: "KSP Hotel Gulu",
    address: null,
    timezone: "Africa/Kampala",
    eventDate: new Date("2027-01-15T00:00:00.000Z"),
    startTime: "18:00",
    endTime: "23:00",
    capacity: 500,
    salesOpen: true,
    admissionOpen: true,
    admissionStartedAt: null,
    salesOpensAt: null,
    salesClosesAt: null,
    admissionOpensAt: null,
    admissionClosesAt: null,
    status: "SCHEDULED" as const,
    admissionPolicy: "FULL_PAYMENT" as const,
    ticketFooterText: null,
    organiserContact: null,
    accentColor: null,
  };
  const existing = await prisma.event.findFirst({ where: { name: eventName } });
  const event = existing
    ? await prisma.event.update({ where: { id: existing.id }, data: eventData })
    : await prisma.event.create({ data: eventData });

  const ticketType = await prisma.ticketType.findUnique({
    where: { eventId_name: { eventId: event.id, name: "E2E General" } },
  });
  if (ticketType) {
    await prisma.ticketType.update({
      where: { id: ticketType.id },
      data: { priceUgx: 10000, allocationLimit: 500, status: "ACTIVE" },
    });
  } else {
    await prisma.ticketType.create({
      data: {
        eventId: event.id,
        name: "E2E General",
        description: "Automated UI fixture. Test database only.",
        priceUgx: 10000,
        allocationLimit: 500,
        permitsAdmission: true,
        status: "ACTIVE",
      },
    });
  }
}

export default async function globalSetup() {
  const dbPort = Number(process.env.EMBEDDED_PG_PORT ?? 5434);
  process.env.TEST_DATABASE_NAME = "ksp_gatepass_design_test";
  process.env.TEST_DATABASE_URL = `postgresql://postgres:postgres@localhost:${dbPort}/ksp_gatepass_design_test`;
  const { default: setup, teardown } = await import("../tests/global-setup");
  await setup();
  const { prisma } = await import("../tests/helpers/db");
  try {
    await seedDesignEvent(prisma);
  } catch (error) {
    await teardown();
    throw error;
  } finally {
    await prisma.$disconnect();
  }
  return teardown;
}

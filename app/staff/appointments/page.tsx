import { prisma } from "@/lib/prisma";
import { Prisma, AppointmentStatus, AppointmentType, StaffRole, StationRole } from "@prisma/client";
import { nextStatus } from "@/lib/appointment-flow";
import {
  formatServiceType,
  formatShopDate,
  formatShopTime,
  formatStatus,
  shopDayKey,
  shopDayRange,
} from "@/lib/utils";
import { checkInWithKennel, moveStatus } from "./actions";
import CheckInDialog from "@/components/CheckInDialog";
import StageRail from "@/components/StageRail";
import {
  KENNELABLE_STATUSES,
  compartmentCapacity,
  compartmentRoom,
  householdCompartmentLimit,
} from "@/lib/kennels";
import {
  ARRIVAL_CLASS,
  ARRIVAL_LABEL,
  ARRIVAL_TEXT_CLASS,
  arrivalLevel,
  arrivalThresholds,
  minutesLate,
} from "@/lib/arrivals";
import { PICKUP_LEVEL_CLASS, PICKUP_LEVEL_LABEL, formatWait, pickupWatchlist } from "@/lib/pickups";
import Link from "next/link";
import FilterAutoSubmit from "@/components/FilterAutoSubmit";
import { PageShell, PageSection, StatStrip, Well } from "@/components/ui";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Appointments" };

/**
 * The working list: find a visit, see where it stands, and move it on without
 * leaving the page. Anything deeper happens on the visit's own page.
 */


const IN_SHOP: AppointmentStatus[] = [
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.DRYING,
  AppointmentStatus.FINISHING,
  AppointmentStatus.COMPLETE,
];

const VIEWS = {
  day: "Day",
  week: "7 Day",
  month: "30 Day",
} as const;
type View = keyof typeof VIEWS;

const GROUPS = {
  active: "Active",
  all: "All (incl. cancelled)",
  open: "Open",
  in_shop: "In the shop",
  finished: "Finished",
  cancelled: "Cancelled",
} as const;
type Group = keyof typeof GROUPS;

/**
 * A cancelled visit is not work, so the working list leaves it out until it is
 * asked for. "All" still means all — it is one item down the same menu.
 */
const DEFAULT_GROUP: Group = "active";

const GROUP_FILTER: Record<Group, AppointmentStatus[] | null> = {
  active: Object.values(AppointmentStatus).filter(
    (status) => status !== AppointmentStatus.CANCELLED
  ),
  all: null,
  open: [AppointmentStatus.SCHEDULED, ...IN_SHOP, AppointmentStatus.READY_PICKUP],
  in_shop: IN_SHOP,
  finished: [AppointmentStatus.READY_PICKUP, AppointmentStatus.PICKED_UP],
  cancelled: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
};

interface Filters {
  view: View;
  date: string;
  group: Group;
  q: string;
  staffId: string;
  stationId: string;
  type: string;
}

function queryString(filters: Filters, patch: Partial<Filters> = {}): string {
  const merged = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (merged.view !== "day") params.set("view", merged.view);
  if (merged.date) params.set("date", merged.date);
  if (merged.group !== DEFAULT_GROUP) params.set("group", merged.group);
  if (merged.q) params.set("q", merged.q);
  if (merged.staffId) params.set("staffId", merged.staffId);
  if (merged.stationId) params.set("stationId", merged.stationId);
  if (merged.type) params.set("type", merged.type);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Shift a YYYY-MM-DD key by whole days. */
function shiftDay(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

interface PageProps {
  searchParams: Promise<Partial<Record<keyof Filters, string>> & { error?: string }>;
}

/**
 * One of the three at-a-glance groups above the list. The label carries the
 * count, so the well below it holds pets and nothing else — and an empty well
 * reads as "nobody" without a line of wording saying so.
 */
function NowWell({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h2 className="mb-1 flex items-baseline gap-1.5 text-xs font-bold tracking-tight text-stone-500">
        {label}
        <span className={count > 0 ? "text-stone-800" : "text-stone-400"}>{count}</span>
      </h2>
      <Well as="ul" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {children}
      </Well>
    </div>
  );
}

export default async function StaffAppointmentsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const todayKey = shopDayKey();
  const tomorrowKey = shiftDay(todayKey, 1);

  const filters: Filters = {
    view: (searchParams.view as View) in VIEWS ? (searchParams.view as View) : "day",
    date: searchParams.date ?? todayKey,
    group: (searchParams.group as Group) in GROUPS ? (searchParams.group as Group) : DEFAULT_GROUP,
    q: searchParams.q?.trim() ?? "",
    staffId: searchParams.staffId ?? "",
    stationId: searchParams.stationId ?? "",
    type: searchParams.type ?? "",
  };

  // Range for the chosen view, always resolved in shop time.
  const dayStart = shopDayRange(new Date(`${filters.date}T12:00:00Z`)).start;
  const dayEnd = shopDayRange(new Date(`${filters.date}T12:00:00Z`)).end;
  const range: Prisma.DateTimeFilter =
    filters.view === "day"
      ? { gte: dayStart, lt: dayEnd }
      : filters.view === "week"
        ? { gte: dayStart, lt: new Date(dayStart.getTime() + 7 * 86400000) }
        : { gte: dayStart, lt: new Date(dayStart.getTime() + 30 * 86400000) };

  const statuses = GROUP_FILTER[filters.group];

  const where: Prisma.AppointmentWhereInput = {
    scheduledAt: range,
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(filters.staffId ? { staffId: filters.staffId } : {}),
    ...(filters.stationId ? { stationId: filters.stationId } : {}),
    ...(filters.type ? { appointmentType: filters.type as AppointmentType } : {}),
    ...(filters.q
      ? {
          OR: [
            { pet: { name: { contains: filters.q, mode: "insensitive" } } },
            { customer: { firstName: { contains: filters.q, mode: "insensitive" } } },
            { customer: { lastName: { contains: filters.q, mode: "insensitive" } } },
            { customer: { phone: { contains: filters.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [
    appointments,
    groomers,
    stations,
    kennels,
    perCompartment,
    householdMax,
    arrivals,
    counts,
    operationalAppointments,
    pickupList,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: {
        pet: { select: { id: true, name: true, hasBiteHistory: true } },
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        station: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
        kennel: { include: { station: { select: { name: true } } } },
        services: { include: { service: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 300,
    }),
    prisma.staff.findMany({
      where: { isActive: true, roles: { hasSome: [StaffRole.GROOMER, StaffRole.BATHER] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.station.findMany({
      where: { isActive: true, role: { not: StationRole.KENNEL } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.kennel.findMany({
      where: { isActive: true, station: { isActive: true } },
      select: {
        id: true,
        label: true,
        station: { select: { name: true } },
        // Who is inside decides whether a household may share this door.
        appointments: {
          where: { status: { in: KENNELABLE_STATUSES } },
          select: { customerId: true },
        },
      },
      orderBy: [{ station: { name: "asc" } }, { row: "asc" }, { column: "asc" }],
    }),
    compartmentCapacity(),
    householdCompartmentLimit(),
    arrivalThresholds(),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { scheduledAt: range },
      _count: { _all: true },
    }),
    prisma.appointment.findMany({
      // READY_PICKUP joins IN_SHOP here and nowhere else: the board's last
      // column holds a finished pet whose owner has been told, and the counts
      // above it still mean what they always did.
      where: {
        scheduledAt: range,
        status: { in: [AppointmentStatus.SCHEDULED, ...IN_SHOP, AppointmentStatus.READY_PICKUP] },
      },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        stationId: true,
        pet: { select: { name: true, hasBiteHistory: true } },
        customer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    pickupWatchlist(),
  ]);

  const countFor = (list: AppointmentStatus[]) =>
    counts.filter((row) => list.includes(row.status)).reduce((n, row) => n + row._count._all, 0);

  const summary = [
    { label: "Scheduled", value: countFor([AppointmentStatus.SCHEDULED]) },
    { label: "In the shop", value: countFor(IN_SHOP) },
    { label: "Ready", value: countFor([AppointmentStatus.READY_PICKUP]) },
    { label: "Picked up", value: countFor([AppointmentStatus.PICKED_UP]) },
    {
      label: "Cancelled",
      value: countFor([AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW]),
    },
  ];

  const listQuery = queryString(filters);

  /*
   * The three live bands answer "what is happening in the shop right now" over
   * the whole range. The moment the counter narrows to one groomer, station,
   * type or name they are asking a different question, and the bands answer a
   * set they can no longer see — so the page becomes the list alone. The view
   * and date are navigation, not a filter: the bands follow the range.
   */
  const isFiltered =
    Boolean(filters.q || filters.staffId || filters.stationId || filters.type) ||
    filters.group !== DEFAULT_GROUP;
  const now = new Date();
  const arrivingNext = operationalAppointments
    .filter((appointment) => appointment.status === AppointmentStatus.SCHEDULED && appointment.scheduledAt >= now)
    .slice(0, 4);

  /*
   * Compartments with room, offered when a pet arrives. Room is per customer,
   * not per door: a door already holding this household's dogs still has space
   * for another of theirs, and none for anyone else's.
   */
  const kennelChoicesFor = (customerId: string) =>
    kennels
      .map((kennel) => ({
        kennel,
        room: compartmentRoom(
          kennel.appointments.map((occupant) => occupant.customerId),
          customerId,
          perCompartment,
          householdMax
        ),
      }))
      .filter(({ room }) => room.ok)
      .map(({ kennel, room }) => ({
        id: kennel.id,
        label: kennel.label,
        stationName: kennel.station.name,
        inside: room.inside,
        capacity: room.limit,
        sharedHousehold: room.sharedHousehold,
      }));
  // Filters stay collapsed until asked for, but never hide the fact that some
  // are applied.
  const activeFilters = [
    filters.q,
    filters.group !== DEFAULT_GROUP ? filters.group : "",
    filters.staffId,
    filters.stationId,
    filters.type,
  ].filter(Boolean).length;
  const selectClass =
    "border border-stone-300 rounded-lg px-2 py-1.5 text-sm text-stone-800 bg-white shadow-sm ";

  /*
   * Today and Tomorrow are the same day view on two dates, so the arrows keep
   * working from either — a separate view key would only duplicate them.
   */
  const tabs: { label: string; patch: Partial<Filters>; active: boolean }[] = [
    {
      label: "Today",
      patch: { view: "day", date: todayKey },
      active: filters.view === "day" && filters.date === todayKey,
    },
    {
      label: "Tomorrow",
      patch: { view: "day", date: tomorrowKey },
      active: filters.view === "day" && filters.date === tomorrowKey,
    },
    { label: VIEWS.week, patch: { view: "week" }, active: filters.view === "week" },
    { label: VIEWS.month, patch: { view: "month" }, active: filters.view === "month" },
  ];

  /*
    The tabs change what the card is showing, so they stay on its toolbar.
    Booking creates something new instead, which is the page's action — it sits
    beside the title, where every other screen keeps its action.
  */
  const viewTabs = (
    <div className="flex items-center gap-0.5 rounded-lg border border-well-line bg-well p-0.5">
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          href={`/staff/appointments${queryString(filters, tab.patch)}`}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            tab.active
              ? "bg-stone-800 text-white shadow-sm"
              : "text-stone-600 hover:bg-white hover:text-stone-900"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );

  /*
    Filters is a control on the toolbar, and the panel it opens is a band across
    the whole card — a <details> cannot straddle the two, and this page is a
    server component with no client JS of its own. A checkbox its label toggles
    does it in CSS: the input is the `peer`, the label is the button, and the
    panel below shows on `peer-checked`. `defaultChecked` opens it when filters
    are already applied, so nothing is narrowing the list invisibly.
  */
  const filtersToggle = (
    <label
      htmlFor="filters-open"
      className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-well-line bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 shadow-sm transition-colors hover:bg-well peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
    >
      Filters
      {activeFilters > 0 && (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
          {activeFilters}
        </span>
      )}
    </label>
  );

  const newVisit = (
    <Link
      href="/staff/appointments/new"
      className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm transition-colors whitespace-nowrap"
    >
      + New
    </Link>
  );

  return (
    /*
      One card, not three. The day being read, the filters that narrow it and
      the counts for the range are a single control — split across separate
      cards they read as unrelated things floating on the page.
    */
    <PageShell
      title="Appointments"
      subtitle={`${appointments.length} shown`}
      actions={newVisit}
    >
        <input
          id="filters-open"
          type="checkbox"
          className="peer sr-only"
          defaultChecked={activeFilters > 0}
          aria-label="Show filters"
        />
        {/* The day being read and the views that change it, on one line */}
        <div className="bg-band px-2 py-1.5 flex items-center gap-2 flex-wrap">
          <div className="flex flex-1 items-center gap-1">
          {filters.view === "day" ? (
            <>
              <Link
                href={`/staff/appointments${queryString(filters, { date: shiftDay(filters.date, -1) })}`}
                aria-label="Previous day"
                className="px-2 py-1 rounded-lg text-stone-500 hover:bg-white hover:text-stone-800 transition-colors"
              >
                ←
              </Link>
              {/*
                The date, and only the date. "Today" and "Tomorrow" are the two
                tabs to the right, which light up on these same dates — saying
                it here as well named the day twice and gave the shop two
                controls for going back to today.
              */}
              <span className="text-sm font-semibold text-stone-800">
                {formatShopDate(dayStart, { weekday: "long", month: "long", day: "numeric" })}
              </span>
              <Link
                href={`/staff/appointments${queryString(filters, { date: shiftDay(filters.date, 1) })}`}
                aria-label="Next day"
                className="px-2 py-1 rounded-lg text-stone-500 hover:bg-white hover:text-stone-800 transition-colors"
              >
                →
              </Link>
            </>
          ) : (
            <span className="flex-1 px-2 text-sm font-semibold text-stone-800">
              From {formatShopDate(dayStart, { weekday: "long", month: "long", day: "numeric" })}
            </span>
          )}
          </div>
          {viewTabs}
          {filtersToggle}
        </div>

        {/* The panel the toggle above opens. `peer-checked` is what connects the
            two — the toggle is a control on the toolbar and the panel is a band
            under it, which a <details> cannot span. */}
        <form
          method="GET"
          className="hidden peer-checked:flex px-3 py-2 border-t border-stone-100 flex-wrap items-center gap-2"
        >
          <FilterAutoSubmit>
            <input type="hidden" name="view" value={filters.view} />
            <input
              name="q"
              type="search"
              aria-label="Search pet, owner or phone"
              defaultValue={filters.q}
              placeholder="Pet, owner or phone…"
              className={`${selectClass} w-52`}
            />
            <input name="date" type="date" aria-label="Filter by date" defaultValue={filters.date} className={selectClass} />
            <select name="group" aria-label="Group by" defaultValue={filters.group} className={selectClass}>
              {Object.entries(GROUPS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select name="staffId" aria-label="Filter by groomer" defaultValue={filters.staffId} className={selectClass}>
              <option value="">Any groomer</option>
              {groomers.map((groomer) => (
                <option key={groomer.id} value={groomer.id}>
                  {groomer.name}
                </option>
              ))}
            </select>
            <select name="stationId" aria-label="Filter by station" defaultValue={filters.stationId} className={selectClass}>
              <option value="">Any station</option>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
            <select name="type" aria-label="Filter by visit type" defaultValue={filters.type} className={selectClass}>
              <option value="">Any type</option>
              <option value={AppointmentType.APPOINTMENT}>Booked</option>
              <option value={AppointmentType.WALK_IN}>Walk-in</option>
            </select>
            <button
              type="submit"
              className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
            >
              Apply
            </button>
            {listQuery && (
              <Link href="/staff/appointments" className="text-xs text-stone-400 hover:text-stone-600 underline">
                Reset
              </Link>
            )}
          </FilterAutoSubmit>
        </form>

        {/* Counts for the range, regardless of the current filter */}
        <StatStrip stats={summary} />

        {!isFiltered && (
          /*
            Three questions the counter is asked all day, side by side on one
            band. Stacked as three bands they pushed the list itself below the
            fold on a shop terminal, and the answer to each is usually a couple
            of names — a column each is the whole of it.
          */
          <PageSection>
            <div className="grid gap-3 sm:grid-cols-2">
              <NowWell label="Waiting for pickup" count={pickupList.pets.length}>
                {pickupList.pets.slice(0, 4).map((pet) => (
                  <li key={pet.appointmentId}>
                    <Link
                      href={`/staff/appointments/${pet.appointmentId}`}
                      className="flex items-center gap-1.5 hover:text-brand-text"
                    >
                      <span className="font-semibold truncate">{pet.petName}</span>
                      <span
                        className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${PICKUP_LEVEL_CLASS[pet.level]}`}
                        title={PICKUP_LEVEL_LABEL[pet.level]}
                      >
                        {formatWait(pet.waitingMins)}
                      </span>
                    </Link>
                  </li>
                ))}
              </NowWell>
              <NowWell label="Arriving next" count={arrivingNext.length}>
                {arrivingNext.map((appointment) => (
                  <li key={appointment.id}>
                    <Link
                      href={`/staff/appointments/${appointment.id}`}
                      className="flex items-center gap-1.5 hover:text-brand-text"
                    >
                      <span className="font-semibold truncate">{appointment.pet.name}</span>
                      <span className="shrink-0 text-stone-500">
                        {formatShopTime(appointment.scheduledAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </NowWell>
            </div>
          </PageSection>
        )}

        {searchParams.error === "not_found" && (
          <div className="mx-3 mb-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-red-800 text-sm font-medium">
            That appointment no longer exists.
          </div>
        )}

        {/* List — takes whatever height is left and scrolls inside the card */}
        {appointments.length === 0 ? (
          <PageSection grow className="text-center text-sm">
            <p className="text-stone-500">
              {isFiltered
                ? "Nothing matches those filters."
                : filters.view === "day"
                  ? "Nothing booked for this day."
                  : "Nothing booked in this range."}
            </p>
            {/* Only the filtered case gets a way out — booking is already the
                "+ New" button on the toolbar above. */}
            {isFiltered && (
              <Link
                href="/staff/appointments"
                className="mt-2 inline-block font-semibold text-brand-text hover:underline"
              >
                Clear the filters
              </Link>
            )}
          </PageSection>
        ) : (
          <PageSection grow scroll padded={false}>
            <table className="w-full text-sm text-center">
              <thead className="bg-well text-stone-500 text-[10px] tracking-tight sticky top-0 z-10 shadow-[0_1px_0_rgb(var(--well-line))]">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left">Stage</th>
                  <th scope="col" className="px-3 py-2">When</th>
                  <th scope="col" className="px-3 py-2">Pet</th>
                  <th scope="col" className="px-3 py-2">Owner</th>
                  <th scope="col" className="px-3 py-2">Services</th>
                  <th scope="col" className="px-3 py-2">Groomer</th>
                  <th scope="col" className="px-3 py-2">Where</th>
                  <th scope="col" className="px-3 py-2">Move</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {appointments.map((appt) => {
                  const next = nextStatus(appt.status);
                  // Only a pet that has not arrived can be late.
                  const lateness =
                    appt.status === AppointmentStatus.SCHEDULED
                      ? arrivalLevel(appt.scheduledAt, arrivals)
                      : null;
                  const services =
                    appt.services.length > 0
                      ? appt.services
                          .map((line) => line.service?.name ?? formatServiceType(line.serviceType))
                          .join(", ")
                      : formatServiceType(appt.serviceType);
                  return (
                    <tr key={appt.id} className="hover:bg-well transition-colors">
                      <td className="px-3 py-1.5 whitespace-nowrap text-left">
                        {(() => {
                          const arrivalAlert = lateness && lateness !== "on_time";
                          return (
                            <span className="inline-flex items-center gap-1.5">
                              {/* Lateness is the one thing that outranks progress:
                                  a pet that has not arrived is not moving along
                                  the rail at all. */}
                              {arrivalAlert && (
                                <span
                                  className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black ${ARRIVAL_CLASS[lateness]}`}
                                  title={`${ARRIVAL_LABEL[lateness]} · ${minutesLate(appt.scheduledAt)}m`}
                                  aria-label={`${ARRIVAL_LABEL[lateness]} by ${minutesLate(appt.scheduledAt)} minutes`}
                                >
                                  !
                                </span>
                              )}
                              <StageRail status={appt.status} />
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <Link
                          href={`/staff/appointments/${appt.id}`}
                          className={`font-medium hover:text-brand-text ${
                            lateness ? ARRIVAL_TEXT_CLASS[lateness] : "text-stone-800"
                          }`}
                        >
                          {formatShopTime(appt.scheduledAt)}
                        </Link>
                        {filters.view !== "day" && (
                          <span className="block text-[10px] text-stone-400">
                            {formatShopDate(appt.scheduledAt, { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <Link
                          href={`/staff/pets/${appt.pet.id}`}
                          className="font-semibold text-stone-900 hover:text-brand-text"
                        >
                          {appt.pet.name}
                        </Link>
                        {appt.pet.hasBiteHistory && (
                          <span className="ml-1.5 text-[9px] bg-red-100 text-red-700 px-1 rounded font-bold">
                            BITE
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-stone-600 whitespace-nowrap">
                        <Link
                          href={`/staff/customers/${appt.customer.id}`}
                          className="hover:text-brand-text"
                        >
                          {appt.customer.firstName} {appt.customer.lastName}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 text-stone-600 max-w-[16rem] truncate" title={services}>
                        {services}
                      </td>
                      <td className="px-3 py-1.5 text-stone-500 whitespace-nowrap">
                        {appt.staff?.name ?? <span className="text-amber-700">Unassigned</span>}
                      </td>
                      <td className="px-3 py-1.5 text-stone-500 whitespace-nowrap">
                        {appt.kennel
                          ? `${appt.kennel.station.name} ${appt.kennel.label}`
                          : (appt.station?.name ?? <span className="text-stone-400">—</span>)}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {next === AppointmentStatus.CHECKED_IN ? (
                          <CheckInDialog
                            action={checkInWithKennel}
                            appointmentId={appt.id}
                            petName={appt.pet.name}
                            ownerName={`${appt.customer.firstName} ${appt.customer.lastName}`}
                            kennels={kennelChoicesFor(appt.customer.id)}
                            listQuery={listQuery}
                            needsKennel={appt.needsKennel}
                          />
                        ) : next ? (
                          <form action={moveStatus} className="inline">
                            <input type="hidden" name="appointmentId" value={appt.id} />
                            <input type="hidden" name="status" value={next} />
                            <input type="hidden" name="returnTo" value="list" />
                            <input type="hidden" name="listQuery" value={listQuery} />
                            <button
                              type="submit"
                              className="rounded-md border border-well-line bg-white px-2 py-1 text-xs font-semibold text-brand-text transition-colors hover:bg-well"
                            >
                              → {formatStatus(next)}
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-stone-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PageSection>
        )}
        {appointments.length === 300 && (
          <p className="px-3 py-2 border-t border-stone-100 text-xs text-stone-400">
            Showing the first 300 — narrow the range or filters to see more.
          </p>
        )}
    </PageShell>
  );
}

import { prisma } from "@/lib/prisma";
import { Prisma, AppointmentStatus, StaffRole } from "@prisma/client";
import { nextStatus } from "@/lib/appointment-flow";
import {
  formatServiceType,
  formatShopDate,
  formatShopTime,
  formatStatus,
  shopDayKey,
  shopDayRange,
  shopDayRangeForKey,
} from "@/lib/utils";
import { checkInWithKennel, moveStatus } from "./actions";
import CheckInDialog from "@/components/CheckInDialog";
import StageRail from "@/components/StageRail";
import {
  KENNELABLE_STATUSES,
  compartmentRoom,
  LIMIT_SELECT,
  stationLimits,
} from "@/lib/kennels";
import {
  ARRIVAL_CLASS,
  ARRIVAL_LABEL,
  ARRIVAL_TEXT_CLASS,
  arrivalLevel,
  arrivalThresholds,
  minutesLate,
} from "@/lib/arrivals";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getConfig } from "@/lib/config";
import { isEnabled } from "@/lib/features";
import { rebookingEvidence, rebookingList } from "@/lib/rebooking";
import FilterAutoSubmit from "@/components/FilterAutoSubmit";
import DateJump from "@/components/DateJump";
import AppointmentCalendar from "@/components/AppointmentCalendar";
import { shiftDayKey, unitBounds } from "@/lib/calendar-grid";
import { PageShell, PageSection, StatStrip } from "@/components/ui";

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
  week: "Week",
  month: "Month",
} as const;
type View = keyof typeof VIEWS;

const GROUPS = {
  active: "Active",
  scheduled: "Not arrived",
  in_shop: "In the shop",
  picked_up: "Picked up",
  cancelled: "Cancelled",
  all: "All (incl. cancelled)",
  rebook: "Due to rebook",
} as const;
type Group = keyof typeof GROUPS;

/**
 * A cancelled visit is not work, so the working list leaves it out until it is
 * asked for. "All" still means all — it is one item down the same menu.
 */
const DEFAULT_GROUP: Group = "active";

/*
 * Below "Active" the groups are the stages of one day and they do not overlap:
 * every status belongs to exactly one of them. The menu used to carry "Open"
 * and "Finished" as well, which each spanned two of the others — picking one
 * of five options that share their rows tells the counter nothing about what
 * the list is now missing.
 */
const GROUP_FILTER: Record<Group, AppointmentStatus[] | null> = {
  active: Object.values(AppointmentStatus).filter(
    (status) => status !== AppointmentStatus.CANCELLED
  ),
  scheduled: [AppointmentStatus.SCHEDULED],
  // A pet whose owner has been rung is still standing in the shop.
  in_shop: [...IN_SHOP, AppointmentStatus.READY_PICKUP],
  picked_up: [AppointmentStatus.PICKED_UP],
  cancelled: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
  all: null,
  // Never queried: "Due to rebook" is a list of customers with no visit at
  // all, so it takes the page rather than narrowing the board.
  rebook: null,
};

const SELECT_CLASS =
  "border border-stone-300 rounded-lg px-2 py-1.5 text-sm text-stone-800 bg-white shadow-sm ";

interface Filters {
  view: View;
  date: string;
  group: Group;
  q: string;
  staffId: string;
}

function queryString(filters: Filters, patch: Partial<Filters> = {}): string {
  const merged = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (merged.view !== "day") params.set("view", merged.view);
  if (merged.date) params.set("date", merged.date);
  if (merged.group !== DEFAULT_GROUP) params.set("group", merged.group);
  if (merged.q) params.set("q", merged.q);
  if (merged.staffId) params.set("staffId", merged.staffId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

interface PageProps {
  searchParams: Promise<Partial<Record<keyof Filters, string>> & { error?: string }>;
}

export default async function StaffAppointmentsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const todayKey = shopDayKey();
  const tomorrowKey = shiftDayKey(todayKey, 1);

  const filters: Filters = {
    view: (searchParams.view as View) in VIEWS ? (searchParams.view as View) : "day",
    date: searchParams.date ?? todayKey,
    group: (searchParams.group as Group) in GROUPS ? (searchParams.group as Group) : DEFAULT_GROUP,
    q: searchParams.q?.trim() ?? "",
    staffId: searchParams.staffId ?? "",
  };

  const config = await getConfig();
  const rebookingOn = isEnabled(config, "featureRebookingPrompts");

  /*
   * The call list used to be its own page in the sidebar, which put "who to
   * ring" one click away from the only screen that books anything. It is a
   * group of this list now — a list of households rather than visits, so it
   * takes the page instead of narrowing the board: no date to read, no counts
   * for a range, no groomer to filter by.
   */
  if (filters.group === "rebook") {
    if (!rebookingOn) redirect("/staff/appointments");
    return <RebookingBoard config={config} />;
  }

  /*
   * Range for the chosen view, always resolved in shop time. A week and a month
   * are the *calendar* week and month holding the chosen day rather than 7 or 30
   * days from it — a grid draws Sunday to Saturday, and a range that started
   * mid-week would leave the first row half empty and the last row spilling.
   */
  const dayStart = shopDayRange(new Date(`${filters.date}T12:00:00Z`)).start;
  const dayEnd = shopDayRange(new Date(`${filters.date}T12:00:00Z`)).end;
  const bounds = unitBounds(filters.date, filters.view === "week" ? "week" : "month");
  const range: Prisma.DateTimeFilter =
    filters.view === "day"
      ? { gte: dayStart, lt: dayEnd }
      : {
          gte: shopDayRangeForKey(bounds.first)!.start,
          lt: shopDayRangeForKey(bounds.last)!.end,
        };

  const statuses = GROUP_FILTER[filters.group];

  const where: Prisma.AppointmentWhereInput = {
    scheduledAt: range,
    ...(statuses ? { status: { in: statuses } } : {}),
    ...(filters.staffId ? { staffId: filters.staffId } : {}),
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
    kennels,
    arrivals,
    counts,
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
    prisma.kennel.findMany({
      where: { isActive: true, station: { isActive: true } },
      select: {
        id: true,
        label: true,
        // Each unit carries its own compartment size.
        station: { select: { name: true, ...LIMIT_SELECT } },
        // Who is inside decides whether a household may share this door.
        appointments: {
          where: { status: { in: KENNELABLE_STATUSES } },
          select: { customerId: true },
        },
      },
      orderBy: [{ station: { name: "asc" } }, { row: "asc" }, { column: "asc" }],
    }),
    arrivalThresholds(),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { scheduledAt: range },
      _count: { _all: true },
    }),
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

  const isFiltered =
    Boolean(filters.q || filters.staffId) || filters.group !== DEFAULT_GROUP;

  /*
    Clearing the filters is not going back to today: the counter narrowing
    Thursday wants Thursday unnarrowed. Only the three controls below the
    counts are cleared — the view and the date stay where they were put.
  */
  const clearedHref = `/staff/appointments${queryString(filters, {
    group: DEFAULT_GROUP,
    q: "",
    staffId: "",
  })}`;

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
          stationLimits(kennel.station).perCompartment,
          stationLimits(kennel.station).householdMax
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

  // Date navigation shares a dedicated toolbar below the page actions.
  const viewTabs = (
    <div className="flex items-center gap-0.5 rounded-lg border border-well-line bg-well p-0.5">
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          href={`/staff/appointments${queryString(filters, tab.patch)}`}
          aria-current={tab.active ? "page" : undefined}
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
    Everything the list is narrowed by, carried through the date form so
    jumping to a day keeps the filters that were applied to it.
  */
  const carryFields = (
    <>
      {Object.entries({
        view: filters.view,
        group: filters.group,
        q: filters.q,
        staffId: filters.staffId,
      })
        .filter(([, value]) => value)
        .map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
    </>
  );

  /*
    The readable date is the picker: DateJump lays a transparent date field over
    it and opens the browser's own calendar on click — no picker library.
    Choosing a day auto-submits this little GET form, which is why the filters
    ride along hidden.
  */
  const datePicker = (label: string, widthClass: string) => (
    <form method="GET" className="relative flex">
      <FilterAutoSubmit scope="daynav">
        {carryFields}
        <DateJump
          name="date"
          defaultValue={filters.date}
          ariaLabel="Jump to date"
          label={label}
          widthClass={widthClass}
        />
      </FilterAutoSubmit>
    </form>
  );

  /* The day being read, and the arrows that change it. */
  const dayNav =
    filters.view === "day" ? (
      <div className="flex items-center gap-1">
        <Link
          href={`/staff/appointments${queryString(filters, { date: shiftDayKey(filters.date, -1) })}`}
          aria-label="Previous day"
          className="px-2 py-1 rounded-lg text-stone-500 hover:bg-white hover:text-stone-800 transition-colors"
        >
          ←
        </Link>
        {/*
          The date, and only the date. "Today" and "Tomorrow" are the two tabs
          to the right, which light up on these same dates — saying it here as
          well named the day twice and gave the shop two controls for going
          back to today.
        */}
        {/*
          A fixed slot: "Fri, May 1" and "Wednesday, September 24" are different
          widths, so an auto-width date moved the arrow the counter had just
          clicked out from under the pointer. Wide enough for the longest
          weekday and month.
        */}
        {datePicker(
          formatShopDate(dayStart, { weekday: "long", month: "long", day: "numeric" }),
          "w-56"
        )}
        <Link
          href={`/staff/appointments${queryString(filters, { date: shiftDayKey(filters.date, 1) })}`}
          aria-label="Next day"
          className="px-2 py-1 rounded-lg text-stone-500 hover:bg-white hover:text-stone-800 transition-colors"
        >
          →
        </Link>
      </div>
    ) : (
      /* The unit being read, stepped a whole week or month at a time — the
         grid's rows are the calendar's, so the arrows have to move by the
         calendar too. */
      <div className="flex items-center gap-1">
        <Link
          href={`/staff/appointments${queryString(filters, {
            date: shiftDayKey(bounds.first, -1),
          })}`}
          aria-label={`Previous ${filters.view}`}
          className="px-2 py-1 rounded-lg text-stone-500 hover:bg-white hover:text-stone-800 transition-colors"
        >
          ←
        </Link>
        {datePicker(
          filters.view === "week"
            ? `${formatShopDate(shopDayRangeForKey(bounds.first)!.start, {
                month: "short",
                day: "numeric",
              })} – ${formatShopDate(shopDayRangeForKey(bounds.last)!.start, {
                month: "short",
                day: "numeric",
              })}`
            : formatShopDate(shopDayRangeForKey(bounds.first)!.start, {
                month: "long",
                year: "numeric",
              }),
          "w-56"
        )}
        <Link
          href={`/staff/appointments${queryString(filters, {
            date: shiftDayKey(bounds.last, 1),
          })}`}
          aria-label={`Next ${filters.view}`}
          className="px-2 py-1 rounded-lg text-stone-500 hover:bg-white hover:text-stone-800 transition-colors"
        >
          →
        </Link>
      </div>
    );

  const newVisit = (
    <Link
      href="/staff/appointments/new"
      className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm transition-colors whitespace-nowrap"
    >
      + New appointment
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
      actions={newVisit}
    >
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-well-line bg-band px-3 py-2">
          {dayNav}
          {viewTabs}
        </div>


        {/* Counts for the range, regardless of the current filter */}
        <StatStrip stats={summary} />

        {searchParams.error === "not_found" && (
          <div className="mx-3 mb-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-red-800 text-sm font-medium">
            That appointment no longer exists.
          </div>
        )}

        {/*
          Three controls, sitting on the list they narrow. They were behind a
          header toggle two bands up, which meant reading the counts, the date
          and the stat strip before finding out why the list was short.
        */}
        <form
          method="GET"
          className="flex flex-wrap items-center gap-2 border-t border-well-line bg-band px-3 py-2"
        >
          <FilterAutoSubmit scope="filters">
            <input type="hidden" name="view" value={filters.view} />
            {/* The date is chosen in the header, not here — but it has to
                survive a filter change, so it rides along hidden. */}
            <input type="hidden" name="date" value={filters.date} />
            <input
              name="q"
              type="search"
              aria-label="Search pet, owner or phone"
              defaultValue={filters.q}
              placeholder="Pet, owner or phone…"
              className={`${SELECT_CLASS} w-52`}
            />
            <select name="group" aria-label="Group by" defaultValue={filters.group} className={SELECT_CLASS}>
              {Object.entries(GROUPS)
                .filter(([value]) => value !== "rebook" || rebookingOn)
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
            <select name="staffId" aria-label="Filter by groomer" defaultValue={filters.staffId} className={SELECT_CLASS}>
              <option value="">Any groomer</option>
              {groomers.map((groomer) => (
                <option key={groomer.id} value={groomer.id}>
                  {groomer.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
            >
              Apply
            </button>
            {isFiltered && (
              <Link href={clearedHref} className="text-xs text-stone-400 hover:text-stone-600 underline">
                Reset
              </Link>
            )}
          </FilterAutoSubmit>
        </form>

        {/*
          A range is drawn, not listed. The grid is the same rows the list
          would have shown — no second query — and it carries no stage moves:
          those belong to the day being worked, one tab to the left.
        */}
        {filters.view !== "day" ? (
          <PageSection
            title={filters.view === "week" ? "Week" : "Month"}
            hint={`${appointments.length} visits`}
            grow
            scroll
            padded={false}
          >
            <AppointmentCalendar
              anchorKey={filters.date}
              unit={filters.view === "week" ? "week" : "month"}
              visits={appointments.map((appt) => ({
                id: appt.id,
                scheduledAt: appt.scheduledAt,
                status: appt.status,
                petName: appt.pet.name,
                staffName: appt.staff?.name ?? null,
              }))}
              dayHref={(dayKey) =>
                `/staff/appointments${queryString(filters, { view: "day", date: dayKey })}`
              }
            />
          </PageSection>
        ) : appointments.length === 0 ? (
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
                href={clearedHref}
                className="mt-2 inline-block font-semibold text-brand-text hover:underline"
              >
                Clear the filters
              </Link>
            )}
          </PageSection>
        ) : (
          <PageSection title="Appointment list" hint={`${appointments.length} visits shown`} grow scroll padded={false}>
            <table className="w-full min-w-[860px] text-sm text-left">
              <thead className="bg-well text-stone-500 text-[10px] tracking-tight sticky top-0 z-10 shadow-[0_1px_0_rgb(var(--well-line))]">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left">Stage</th>
                  <th scope="col" className="px-3 py-2">When</th>
                  <th scope="col" className="px-3 py-2">Pet</th>
                  <th scope="col" className="px-3 py-2">Owner</th>
                  <th scope="col" className="px-3 py-2">Services</th>
                  <th scope="col" className="px-3 py-2">Groomer</th>
                  <th scope="col" className="px-3 py-2">Where</th>
                  <th scope="col" className="px-3 py-2">Next step</th>
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
                      <td className="px-3 py-3 whitespace-nowrap text-left">
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
                      <td className="px-3 py-3 whitespace-nowrap">
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
                      <td className="px-3 py-3">
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
                      <td className="px-3 py-3 text-stone-600 whitespace-nowrap">
                        <Link
                          href={`/staff/customers/${appt.customer.id}`}
                          className="hover:text-brand-text"
                        >
                          {appt.customer.firstName} {appt.customer.lastName}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-stone-600 max-w-[16rem] truncate" title={services}>
                        {services}
                      </td>
                      <td className="px-3 py-3 text-stone-500 whitespace-nowrap">
                        {appt.staff?.name ?? <span className="text-amber-700">Unassigned</span>}
                      </td>
                      <td className="px-3 py-3 text-stone-500 whitespace-nowrap">
                        {appt.kennel
                          ? `${appt.kennel.station.name} ${appt.kennel.label}`
                          : (appt.station?.name ?? <span className="text-stone-400">—</span>)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
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

/**
 * The households that have not come back.
 *
 * `customerRhythm()` in lib/insights.ts has known this one customer at a time
 * since it was written, and nobody at the counter opens 120 profiles to find
 * out who has drifted. Every row carries its numbers -- the `evidence` rule
 * from lib/insights.ts -- because a list that says "overdue" without saying
 * how it knows is a list nobody trusts twice.
 *
 * No actions here beyond the phone and the booking link. Rebooking is a call.
 */
async function RebookingBoard({
  config,
}: {
  config: { rebookingGraceDays: number; featureRebookingPrompts: boolean };
}) {
  const due = await rebookingList(config);
  const lapsing = due.filter((row) => row.lapsing).length;
  const chased = due.filter((row) => row.prompted).length;

  return (
    <PageShell
      title="Appointments"
      subtitle={`Households past their own usual gap between grooms with nothing booked, worst first. ${
        config.rebookingGraceDays > 0
          ? `${config.rebookingGraceDays} days of grace after they are due.`
          : "Listed the day they are due."
      }`}
      actions={
        <Link
          href="/staff/appointments/new"
          className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm transition-colors whitespace-nowrap"
        >
          + New appointment
        </Link>
      }
    >
      {/* The same control that got here, so the board is one choice away. */}
      <form
        method="GET"
        className="flex flex-wrap items-center gap-2 border-t border-well-line bg-band px-3 py-2"
      >
        <FilterAutoSubmit scope="filters">
          <select name="group" aria-label="Group by" defaultValue="rebook" className={SELECT_CLASS}>
            {Object.entries(GROUPS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
          >
            Apply
          </button>
        </FilterAutoSubmit>
      </form>

      <StatStrip
        stats={[
          { label: "Overdue", value: due.length },
          { label: "Drifting away", value: lapsing },
          { label: "Already nudged", value: chased },
        ]}
      />

      {due.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          Nobody is overdue. A household needs three finished visits before the shop has a cadence
          to measure them against.
        </PageSection>
      ) : (
        <PageSection grow scroll padded={false} bodyClassName="divide-y divide-stone-100">
          {due.map((row) => (
            <div key={row.customerId} className="px-3 py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-900">
                  <Link href={`/staff/customers/${row.customerId}`} className="hover:underline">
                    {row.customer.firstName} {row.customer.lastName}
                  </Link>
                  {row.lapsing && (
                    <span className="ml-2 align-middle text-xs font-semibold border rounded-full px-2 py-0.5 bg-amber-50 text-amber-800 border-amber-200">
                      Drifting away
                    </span>
                  )}
                  {row.prompted && (
                    <span className="ml-2 align-middle text-xs text-stone-400">nudged</span>
                  )}
                </p>
                <p className="text-xs text-stone-500">
                  {row.customer.pets.map((pet) => pet.name).join(", ") || "No pets on file"} · last in{" "}
                  {formatShopDate(row.lastVisitAt)}
                </p>
                <p className="text-xs text-stone-400">{rebookingEvidence(row)}</p>
              </div>

              <p className="text-sm text-stone-700 whitespace-nowrap">
                <span className="font-semibold">{row.daysOverdue}</span> days past
              </p>

              <div className="flex items-center gap-3 text-sm whitespace-nowrap">
                {row.customer.phone && (
                  <a href={`tel:${row.customer.phone}`} className="text-amber-700 hover:text-amber-900 underline">
                    {row.customer.phone}
                  </a>
                )}
                <Link
                  href={`/staff/appointments/new?customerId=${row.customerId}`}
                  className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-3 py-1.5 rounded-lg text-xs font-semibold"
                >
                  Book
                </Link>
              </div>
            </div>
          ))}
        </PageSection>
      )}
    </PageShell>
  );
}

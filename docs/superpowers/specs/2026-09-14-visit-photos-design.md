# Visit photos (cluster 1)

## Problem

A grooming shop photographs the pet. Before, so a matted coat that had to
come off is on the record; after, because the finished dog is the work, and
the owner wants to see it. The app stores exactly one photo per pet — a
profile picture on `Pet.photoId` — so the shop has nowhere to put a photo
that belongs to *one day*.

Three things follow from having none:

- A shave-down argument is one person's word against another's. The consent
  trail added in `c5f71ff` records that the owner said yes; nothing records
  what the coat looked like when the shop asked.
- The next groomer reads the groom record (`groomBlade`, `groomShampoo`) and
  still cannot see the cut.
- The finished dog is the shop's best marketing and it is thrown away.

## Decisions

- **Photos hang off the visit, not the pet.** `VisitPhoto` rows reference
  `Appointment`. `Pet.photoId` stays the profile picture: the pet's face for
  identification, not a record of a groom. A pet's photo history is the
  photos of its visits, read through the appointment.
- **Reuse `Photo`.** Bytes already live in Postgres behind `/api/photos/[id]`
  with `storePhoto()` capping at 2 MB and JPEG/PNG/WebP. One volume to back
  up, nothing lost on redeploy, no second storage story. `VisitPhoto` is a
  join row carrying *what the photo is of*.
- **`kind` is `BEFORE | AFTER | ISSUE`**, not free text. Before and after are
  what the shop takes; `ISSUE` is the matting, the hot ear, the nail that was
  already split — the photo that belongs beside a `VisitEvent`, taken at the
  moment somebody noticed. Three values keep the strip sortable and the
  before/after pair findable without reading captions.
- **Owner visibility is opt-in per photo**, the same rule and the same reason
  as `VisitEvent.ownerVisible`: an `ISSUE` photo is often evidence for the
  shop, and a matted belly is not something every owner wants sent to them.
  A groomer ticks the ones the owner gets.
- **No portal upload.** Only staff add a visit photo. An owner sending photos
  is a different feature (inbound media, moderation) and nobody asked for it.
- **`featureVisitPhotos` is a registry entry**, default **on** — a shop that
  never uploads sees an empty strip and an upload control, which costs it
  nothing, and the shops that want this want it immediately. `offMeans:
  "frozen"`: photos already taken stay readable on the visits they belong to,
  new uploads refuse. Never `silent` — deleting or hiding a photographic
  record because a switch moved is the opposite of why a shop keeps one.

## Schema

```prisma
model VisitPhoto {
  id            String         @id @default(cuid())
  appointmentId String
  photoId       String
  kind          VisitPhotoKind
  /// What the groomer wants the next one to know. Optional: the kind and the
  /// picture usually say it.
  caption       String?
  /// Opt-*in*, like VisitEvent.ownerVisible. An ISSUE photo is often the
  /// shop's evidence rather than something to send.
  ownerVisible  Boolean        @default(false)
  takenById     String?
  createdAt     DateTime       @default(now())

  appointment Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  photo       Photo       @relation(fields: [photoId], references: [id])
  takenBy     Staff?      @relation(fields: [takenById], references: [id])

  @@index([appointmentId, kind])
  @@map("visit_photos")
}

enum VisitPhotoKind {
  BEFORE
  AFTER
  ISSUE
}
```

`onDelete: Cascade` on the appointment matches `AppointmentService`. The
`Photo` relation is **not** cascade: `deletePhotoIfUnused()` owns the bytes
and must be the only thing that frees them.

`Photo` gains `visitPhotos VisitPhoto[]`, `Staff` gains `visitPhotos
VisitPhoto[]`, `Appointment` gains `photos VisitPhoto[]`, and `SystemConfig`
gains `featureVisitPhotos Boolean @default(true)`.

## `lib/visit-photos.ts`

Pure where it can be, matching `lib/visit-record.ts` next door:

```ts
export interface PhotoRow { id: string; kind: VisitPhotoKind; ownerVisible: boolean; createdAt: Date; }

/** Before, after, issue — display order, each group oldest first. */
export function sortPhotos<T extends PhotoRow>(photos: T[]): T[];

/** The pair a visit is judged on. Latest of each kind; either may be null. */
export function beforeAfter<T extends PhotoRow>(photos: T[]): { before: T | null; after: T | null };

/** What the owner may see. */
export function ownerPhotos<T extends PhotoRow>(photos: T[]): T[];

/** Parsed from the upload form; the enum is not trusted from a post. */
export function readKind(value: unknown): VisitPhotoKind | null;
```

"Latest of each kind" rather than first: a groomer who reshoots a bad photo
expects the new one to be the one shown, and neither deleting the old one nor
teaching the strip about supersession is worth a column.

## Authorization

- **Upload / delete**: a server action on the visit screen calling
  `requireStaff()` and `requireFeature("featureVisitPhotos")`.
- **Serving bytes**: `/api/photos/[id]` today asks "does this customer own a
  pet or a profile carrying this photo id". It gains one more clause: the
  photo is on a `VisitPhoto` with `ownerVisible: true` whose appointment
  belongs to this customer. **`ownerVisible` is load-bearing here** — without
  the clause an owner sees nothing of their own dog; with it and without the
  flag, they would see the shop's internal evidence.
- Staff keep seeing everything, as they do now.

## Where photos appear

| Surface | What | Gate |
|---|---|---|
| `/staff/appointments/[id]` | The strip, the uploader, per-photo visibility and delete | Page section, hidden when off |
| `/staff/stations/[id]` job aid | The last visit's `AFTER` photo, if there is one — the cut to repeat | Section, hidden when off |
| `/staff/pets/[id]` | Recent visit photos across visits | Section, hidden when off |
| `/portal/appointments/[id]` | The owner-visible photos of that visit | Section, hidden when off |
| `/station/[id]` kiosk | **Nothing.** | — |

The kiosk faces the lobby and already renders only what a groomer needs at
arm's length; a photo strip there is a screen nobody is reading and a pet
somebody else can see.

## Testing

`lib/visit-photos.test.ts`, pure: display order across the three kinds,
`beforeAfter()` taking the latest of each and tolerating a missing side,
`ownerPhotos()` filtering, `readKind()` refusing `"toString"` and unknown
strings (same trap `readTheme()` avoids with `Object.hasOwn`).

## Out of scope

- No image processing: no thumbnails, no resizing, no EXIF stripping. 2 MB
  is the existing cap and the browser scales the strip.
- No portal upload, no email attachment. The ready-for-pickup email gets a
  line saying photos are on the visit, not the bytes.
- No before/after composite image. Two photos side by side is the same thing
  without a canvas.

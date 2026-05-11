# WhatsOn Parliament API — Data Shape Notes

Sampled: 2026-05-11 to 2026-05-15 (State Opening week + prorogation overlap)

---

## Endpoints

### `/calendar/events/diary.json`

The most useful endpoint for rendering. Returns an array of day objects:

```
[
  {
    "Date": "2026-05-13T00:00:00",
    "Houses": [
      { "Name": "Commons", "NonSittingPeriod": null|{...}, "Events": [...] },
      { "Name": "Lords",   "NonSittingPeriod": null|{...}, "Events": [...] },
      { "Name": "Joint",   "NonSittingPeriod": null,       "Events": [...] }
    ]
  },
  ...
]
```

- Always returns exactly three house entries per day: Commons, Lords, Joint.
- `NonSittingPeriod` is non-null when Parliament is not sitting. When it is set, `Events` is always `[]`.
- Joint house is used for joint committees (cross-house). In this sample it was always empty.

### `/calendar/events/list.json` (Commons / Lords)

Flat array of event objects. Same fields as the events inside diary. The ordering is **not** strictly chronological — 14 May events appeared before 13 May events in the Commons response. Use the diary endpoint if you need date-grouped rendering.

### `/calendar/events/nonsitting.json`

Flat array of non-sitting period objects. Fields:
- `Id`, `StartDate`, `EndDate`, `Category` (human label), `CategoryCode`, `House`
- `CategoryCode "3"` = Prorogation; `"6"` = Non-sitting Friday
- `StartTime`, `EndTime`, `Description`, `SummarisedDetails` are all null in practice.

### `/calendar/types/list.json`

Reference list of event types (7 entries). Key types seen in events:
- `"Main Chamber"` (Commons & Lords, separate entries)
- `"Select & Joint Committees"` (Commons & Lords)
- `"Westminster Hall"` (Commons)
- `"General Committee"` (Commons)
- `"Grand Committee"` (Lords)

### `/calendar/categories/list.json`

Reference list of ~100 category labels with optional `Summary` HTML. Used to match `event.Category` strings to descriptions. Most `Summary` values are null or empty HTML paragraphs.

---

## Event Object Fields

| Field | Type | Notes |
|---|---|---|
| `Id` | int | Unique event identifier |
| `StartDate` / `EndDate` | ISO date string | Always the same day for committee events |
| `CancelledDate` | null \| date string | Non-null if cancelled |
| `StartTime` | string | 24-hour "HH:MM" or `""` when unscheduled |
| `EndTime` | string | 24-hour "HH:MM" or `""` when unscheduled |
| `Description` | null \| string | Topic/subject line. **Null for State Opening, Debate on the Address, etc.** Use `Category` as fallback title. |
| `Notes` | null \| string | Free-text notes, rarely populated |
| `SortOrder` | int | Ordering within a day+house group (0 = committees, 1+ = chamber events) |
| `Type` | string | Venue type: "Main Chamber", "Select & Joint Committees", etc. |
| `House` | string | "Commons" or "Lords" |
| `LeadHouse` | null \| string | Set on committee events ("Commons"/"Lords"); null for chamber events |
| `Category` | string | Event category label, e.g. "Oral evidence", "Adjournment", "Private Meeting" |
| `Location` | null \| string | Room name, e.g. "The Grimond Room, Portcullis House". Null for chamber events. |
| `HasSpeakers` | bool | True when `Members` has speaker/opener data |
| `Committee` | null \| object | See below. Null for chamber events. |
| `Members` | array | MP/Lord objects. Used for Adjournment debate openers, Lords debate speakers, etc. |
| `EventActivities` | null \| array | Oral evidence witness panels; see below |
| `Tags` | array | Always empty in samples |
| `Metadata` | array | Always empty in samples |
| `SummarisedDetails` | string | Pre-formatted summary with literal `\n` separators (not actual newlines). Useful as a sanity check but raw data is better for formatting. |
| `BillId` / `BillName` / `BillPageLink` | null \| string | Bill info when event concerns legislation |

---

## Committee Object

```json
{
  "Id": 83,
  "Description": "Home Affairs Committee",
  "Category": 1,
  "IsCommons": true,
  "IsLords": false,
  "Inquiries": [
    { "Id": 9774, "Description": "Responses to antisemitism", "SortOrder": 0 }
  ],
  "ShowOnWebsite": true
}
```

- `Inquiries` can be an empty array when a committee meets without a named inquiry (e.g. Private Meetings).
- `Description` is the committee name.
- `Inquiries[0].Description` is the inquiry/topic title — this is the most useful sub-heading for oral evidence rows.

---

## Member Object

```json
{
  "Id": 4591,
  "Name": "Sarah Olney",
  "ListAs": "Olney, Sarah",
  "Party": "Liberal Democrat",
  "MemberFrom": "Richmond Park",
  "PartyColour": "fc7d0b",
  "PhotoUrl": "https://data.parliament.uk/membersdataplatform/services/images/MemberPhoto/4591",
  "SortOrder": 1
}
```

Used in two contexts:
1. **Chamber events** — the MP/Lord who opens the debate (Adjournment, Westminster Hall, etc.).
2. **Lords Main Chamber debates** — speakers listed when `HasSpeakers` is true.

---

## EventActivities — Witness/Attendee Panels

Oral evidence sessions use `EventActivities` to break the session into timed panels:

```json
"EventActivities": [
  { "Id": 37356, "StartTime": "10:30 am", "EndTime": "11:45 am", "Attendees": [] },
  { "Id": 37358, "StartTime": "11:45 am", "EndTime": "12:30 pm", "Attendees": [] }
]
```

**Critical quirks:**

1. **`StartTime`/`EndTime` use 12-hour format** ("10:30 am", "3:00 pm"), unlike the event-level `StartTime` which uses 24-hour format ("14:30"). Parse accordingly.

2. **`Attendees` is the witness array** — each attendee object is expected to have name/organisation fields, but **all `Attendees` arrays in this sample are empty `[]`**. This is almost certainly because witnesses had not yet been confirmed at time of fetching (State Opening week, committees just reforming). Real oral evidence sessions in normal sitting weeks will have populated `Attendees`.

3. **`EventActivities` can be `null`** (not just empty array) on events that are not oral evidence, and also on some oral evidence events where panels aren't broken out.

4. **Outer event `StartTime`** may differ from the first activity start time. For the Public Accounts Committee (Id 27054): outer `StartTime` = "09:30" but first activity starts "10:00 am". The outer time likely reflects when the room is booked / doors open.

---

## Quirks Summary

- **Empty `Description`**: Main Chamber events often have a null `Description`. For these, the `Category` field ("State Opening of Parliament", "Debate on the Address") is the display title.
- **Empty `StartTime`/`EndTime`**: Adjournment and some other chamber items have `""` for both times — expected, not a bug.
- **`SummarisedDetails` escaping**: The field contains literal backslash-n (`\n`) sequences, not actual newlines. Splitting on `\\n` in JS gives the sections.
- **Non-sitting days**: When `NonSittingPeriod` is set, `Events` is always empty — no need to check events on those days.
- **`list` endpoint order**: Not chronological. If building a dated table, use the diary endpoint or sort by `StartDate` + `SortOrder`.
- **Committee `SortOrder` = 0**: Committees always have `SortOrder` 0; chamber business uses 1, 2, 3… This means sorting by `SortOrder` alone within a house/day puts committees first.
- **Joint house events**: Joint committees appear under `House: "Joint"` in the diary grouping. In the list endpoint, `House` will be either "Commons" or "Lords" (the lead house), so the same event can appear in both list responses.
- **Prorogation spans**: A single `NonSittingPeriod` record can span many days (e.g. 30 Apr–12 May for prorogation). It will appear on every day within that range in the diary response.

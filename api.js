const API_BASE = 'https://whatson-api.parliament.uk/calendar/events';

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Use local date parts to avoid UTC-vs-local shifts on date-only values.
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// "2026-05-13T00:00:00" → "Wednesday May 13, 2026"
function formatDisplayDate(isoString) {
  const [year, month, day] = isoString.slice(0, 10).split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return `${DAY_NAMES[d.getDay()]} ${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

// "14:30" → "02.30pm"  |  "" or null → null
function format24hTime(timeStr) {
  if (!timeStr) return null;
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}.${m}${ampm}`;
}

// "3:00 pm" → "03.00pm"  (EventActivity times use 12h format)
function formatActivityTime(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d+):(\d+)\s*(am|pm)$/i);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = match[3].toLowerCase();
  return `${String(h).padStart(2, '0')}.${m}${ampm}`;
}

// Attendees are plain strings: "Name, Role" or "Name - Role" or just "Name".
// Split on the first occurrence of " - " or ", " to separate name from role.
function parseAttendeeString(str) {
  str = str.trim();
  const dashIdx = str.indexOf(' - ');
  if (dashIdx !== -1) {
    return { name: str.slice(0, dashIdx).trim(), role: str.slice(dashIdx + 3).trim() };
  }
  const commaIdx = str.indexOf(', ');
  if (commaIdx !== -1) {
    return { name: str.slice(0, commaIdx).trim(), role: str.slice(commaIdx + 2).trim() };
  }
  return { name: str, role: null };
}

// Build a human-readable description string from whichever fields are available.
function buildDescription(event) {
  if (event.Description && event.Description.trim()) {
    return event.Description.trim();
  }
  const committee = event.Committee;
  if (committee) {
    const inquiry = committee.Inquiries && committee.Inquiries.length > 0
      ? committee.Inquiries[0].Description
      : null;
    return inquiry ? `${committee.Description} — ${inquiry}` : committee.Description;
  }
  // Fall back to category name (e.g. "State Opening of Parliament")
  return event.Category || null;
}

// Flatten EventActivities into a list of witness entries.
// Each activity is one timed panel; its Attendees are strings (may be empty when not yet confirmed).
function parseWitnesses(event) {
  const activities = event.EventActivities;
  if (!activities || activities.length === 0) return [];

  const witnesses = [];
  for (const activity of activities) {
    const formatted = formatActivityTime(activity.StartTime);
    const timeLabel = formatted ? `From ${formatted}` : null;
    const attendees = activity.Attendees || [];

    for (const str of attendees) {
      const { name, role } = parseAttendeeString(str);
      witnesses.push({ time: timeLabel, name, role });
    }
    // If Attendees is empty the panel slot exists but witnesses aren't confirmed;
    // nothing is added — callers can check witnesses.length === 0 on oral evidence events.
  }

  return witnesses;
}

function parseEvent(event) {
  const t = format24hTime(event.StartTime);

  return {
    id: event.Id,
    time: t ? `From ${t}` : null,
    type: event.Category || event.Type,
    description: buildDescription(event),
    committee: event.Committee ? event.Committee.Description : null,
    inquiry: event.Committee && event.Committee.Inquiries && event.Committee.Inquiries.length > 0
      ? event.Committee.Inquiries[0].Description
      : null,
    location: event.Location || null,
    witnesses: parseWitnesses(event),
    members: (event.Members || []).map(m => ({
      name: m.Name,
      party: m.Party,
      constituency: m.MemberFrom,
    })),
    billName: event.BillName || null,
    notes: event.Notes || null,
    isPrivateMeeting: event.Category === 'Private Meeting',
    isCancelled: event.CancelledDate !== null,
  };
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export async function fetchWeekData(startDate, endDate) {
  const url = `${API_BASE}/diary.json?queryParameters.startDate=${startDate}&queryParameters.endDate=${endDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Diary API error ${res.status}: ${url}`);
  return res.json();
}

export async function fetchNonSitting(startDate, endDate) {
  const url = `${API_BASE}/nonsitting.json?queryParameters.startDate=${startDate}&queryParameters.endDate=${endDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Non-sitting API error ${res.status}: ${url}`);
  return res.json();
}

// Returns { startDate, endDate } as "YYYY-MM-DD" strings.
// Sat/Sun → the coming Monday. Mon-Fri → the following Monday (i.e. next week).
export function getNextWeekRange() {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon, …, 6=Sat

  let daysUntilMon;
  if (day === 0) {
    daysUntilMon = 1;       // Sunday  → +1 day
  } else if (day === 6) {
    daysUntilMon = 2;       // Saturday → +2 days
  } else {
    daysUntilMon = 8 - day; // Mon(1)→7, Tue(2)→6, Wed(3)→5, Thu(4)→4, Fri(5)→3
  }

  const monday = new Date(today);
  monday.setDate(today.getDate() + daysUntilMon);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  return { startDate: toISODate(monday), endDate: toISODate(friday) };
}

// Takes the raw diary API response and returns { commons: [...], lords: [...] }.
// Each element: { date, events, nonSitting, nonSittingCategory? }
export function parseEvents(diaryData) {
  const commons = [];
  const lords = [];

  for (const day of diaryData) {
    const dateStr = formatDisplayDate(day.Date);

    for (const house of day.Houses) {
      // Joint committee entries are reflected under the lead house in the list
      // endpoints; skip here to avoid duplication.
      if (house.Name === 'Joint') continue;

      const target = house.Name === 'Commons' ? commons : lords;

      if (house.NonSittingPeriod) {
        target.push({
          date: dateStr,
          events: [],
          nonSitting: true,
          nonSittingCategory: house.NonSittingPeriod.Category,
        });
      } else {
        const events = (house.Events || [])
          .filter(ev => ev.CancelledDate === null)
          .slice()
          .sort((a, b) => {
            const aHasTime = a.StartTime !== '';
            const bHasTime = b.StartTime !== '';
            // Timed events always precede untimed ones.
            if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
            if (aHasTime) {
              // Both timed: ascending chronological order.
              // For same time, higher SortOrder comes first — this puts chamber
              // events (SortOrder ≥ 1) before same-time committees (SortOrder 0).
              const diff = a.StartTime.localeCompare(b.StartTime);
              return diff !== 0 ? diff : b.SortOrder - a.SortOrder;
            }
            // Both untimed: preserve the API's parliamentary sequence (SortOrder asc).
            return a.SortOrder - b.SortOrder;
          })
          .map(parseEvent);

        target.push({ date: dateStr, events, nonSitting: false });
      }
    }
  }

  return { commons, lords };
}

// ---------------------------------------------------------------------------
// Inline style constants — Gmail strips <style> blocks and CSS classes,
// so every element that needs styling gets it directly in its style attribute.
// ---------------------------------------------------------------------------

const FONT = 'font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333333;';

const TABLE_STYLE =
  'border-collapse:collapse;width:600px;margin-bottom:28px;' + FONT;

const TITLE_STYLE =
  'padding:10px 12px;border:1px solid #1a3a5c;background-color:#1a3a5c;' +
  'color:#ffffff;text-align:center;font-weight:bold;font-size:14px;' +
  'font-family:Arial,Helvetica,sans-serif;';

const COL_HEADER_STYLE =
  'padding:8px 10px;border:1px solid #cccccc;background-color:#e8ecf0;' +
  'text-align:left;font-weight:bold;' + FONT;

const DATE_CELL_STYLE =
  'padding:8px 10px;border:1px solid #dddddd;vertical-align:top;' +
  'width:130px;white-space:nowrap;' + FONT;

const EVENT_CELL_STYLE =
  'padding:8px 10px;border:1px solid #dddddd;vertical-align:top;line-height:1.5;' + FONT;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// "From 03.30pm" → "03.30pm"  (used to build witness panel headers)
function stripFrom(str) {
  return str ? str.replace(/^From\s+/, '') : '';
}

// Categories where the API attaches a member object that is ministerial/procedural
// (e.g. the PM for PMQs, the Leader of the House for Business Statement).
// These should NOT be displayed — the member is implicit from the event type.
// For these categories the member object represents the minister/PM answering,
// not the backbencher who called the debate — the member is implicit and adds
// no useful information to the newsletter.
const SUPPRESS_MEMBER_CATEGORIES = new Set([
  "Prime Minister's Question Time",
  'Oral questions',
  'Business Statement',
  'Statement',
  'Urgent question',
  'Ten Minute Rule Motion',
  'Ministerial statement',
  "Speaker's Statement",
  'Select Committee Statement',
]);

// Build the display string for one member, omitting "Life peer" (uninformative for Lords).
function memberStr(m) {
  const parts = [m.name, m.party];
  if (m.constituency && m.constituency !== 'Life peer') parts.push(m.constituency);
  return parts.filter(Boolean).join(', ');
}

// Render the witness block for one event.
// Witnesses are grouped by their panel time (a single oral evidence session can
// have multiple timed panels, each with its own set of witnesses).
// If there are no confirmed witnesses the function returns an empty string.
function renderWitnesses(witnesses) {
  if (!witnesses || witnesses.length === 0) return '';

  // Preserve panel order while grouping by time key.
  const panels = [];
  const seen = new Map();
  for (const w of witnesses) {
    const key = w.time || '';
    if (!seen.has(key)) {
      seen.set(key, []);
      panels.push({ key, group: seen.get(key) });
    }
    seen.get(key).push(w);
  }

  let html = '';
  for (const [index, { key, group }] of panels.entries()) {
    const timeStr = stripFrom(key);
    const label = timeStr ? `Witnesses at ${timeStr}:` : 'Witnesses:';

    html += `${index === 0 ? '<br>' : '<br><br>'}${label}`;
    for (const w of group) {
      const text = w.name && w.role ? `${w.name}, ${w.role}` : (w.name || '');
      if (text) html += `<br>${text}`;
    }
  }

  return html;
}

// Build the HTML content that goes inside a single event <td>.
function renderEventContent(ev) {
  if (ev.isPrivateMeeting) {
    return `<b>${ev.committee} - Private meeting</b>`;
  }

  const lines = [];
  const suppressMembers = SUPPRESS_MEMBER_CATEGORIES.has(ev.type);

  // 1. Time (bold)
  if (ev.time) lines.push(`<b>${ev.time}</b>`);

  // 2. Type line.
  //    Committee events: "Committee Name - Category"
  //    Chamber events:   just "Category"
  if (ev.committee) {
    lines.push(`<b>${ev.committee} - ${ev.type}</b>`);
  } else if (ev.type) {
    lines.push(`<b>${ev.type}</b>`);
  }

  // 3. Description / inquiry line.
  //    Inquiry is suppressed for private meetings (reference format: just
  //    "Committee Name - Private Meeting", no topic line).
  //    Description is skipped when it would duplicate the type label.
  const descBase = (!ev.isPrivateMeeting && ev.inquiry)
    || (!ev.committee && ev.description && ev.description !== ev.type
          ? ev.description
          : null);

  if (descBase) {
    // Single-member non-committee events (Adjournment, WH debates, PMBs, Lords
    // Orders and regulations): append member inline as "desc - Name, Party[, Const.]"
    if (!ev.committee && !suppressMembers && ev.members && ev.members.length === 1) {
      lines.push(`${descBase} - ${memberStr(ev.members[0])}`);
    } else {
      lines.push(descBase);
    }
  } else if (!ev.committee && !suppressMembers && ev.members && ev.members.length === 1) {
    // No description but one relevant member — show inline.
    lines.push(memberStr(ev.members[0]));
  }

  // 4. Multiple members on their own line (Lords debates, joint-committee events).
  //    Suppressed for ministerial/procedural categories.
  if (!suppressMembers && ev.members && ev.members.length > 1) {
    lines.push(ev.members.map(m => m.name).join(', '));
  }

  let html = lines.filter(Boolean).join('<br>');

  // 5. Witnesses section (blank line then labelled panel groups).
  html += renderWitnesses(ev.witnesses);

  return html;
}

// Render all <tr> elements for one calendar day.
function renderDayRows(day, houseName) {
  // Non-sitting day — single row with a plain message.
  if (day.nonSitting) {
    const label = houseName === 'House of Commons'
      ? 'The House of Commons is not sitting'
      : 'The House of Lords is not sitting';
    return (
      `<tr>\n` +
      `  <td style="${DATE_CELL_STYLE}">${day.date}</td>\n` +
      `  <td style="${EVENT_CELL_STYLE}">${label}</td>\n` +
      `</tr>`
    );
  }

  // Sitting day with no events yet confirmed.
  if (day.events.length === 0) {
    return (
      `<tr>\n` +
      `  <td style="${DATE_CELL_STYLE}">${day.date}</td>\n` +
      `  <td style="${EVENT_CELL_STYLE}"><em>No events scheduled</em></td>\n` +
      `</tr>`
    );
  }

  // One <tr> per event; date cell uses rowspan to span all rows for this day.
  return day.events.map((ev, i) => {
    const content = renderEventContent(ev);
    if (i === 0) {
      const span = day.events.length > 1 ? ` rowspan="${day.events.length}"` : '';
      return (
        `<tr>\n` +
        `  <td${span} style="${DATE_CELL_STYLE}">${day.date}</td>\n` +
        `  <td style="${EVENT_CELL_STYLE}">${content}</td>\n` +
        `</tr>`
      );
    }
    return (
      `<tr>\n` +
      `  <td style="${EVENT_CELL_STYLE}">${content}</td>\n` +
      `</tr>`
    );
  }).join('\n');
}

// Render one complete table (Commons or Lords).
function renderTable(days, houseName) {
  const bodyRows = days.map(day => renderDayRows(day, houseName)).join('\n');

  return [
    `<table style="${TABLE_STYLE}">`,
    `<thead>`,
    `<tr><th colspan="2" style="${TITLE_STYLE}">${houseName}</th></tr>`,
    `<tr>`,
    `  <th style="${COL_HEADER_STYLE}width:130px;">Date</th>`,
    `  <th style="${COL_HEADER_STYLE}">Event</th>`,
    `</tr>`,
    `</thead>`,
    `<tbody>`,
    bodyRows,
    `</tbody>`,
    `</table>`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Takes the { commons, lords } object returned by parseEvents() and returns
// an HTML string containing both tables, ready to paste into Gmail.
export function renderTables(parsedEvents) {
  const commonsHtml = renderTable(parsedEvents.commons, 'House of Commons');
  const lordsHtml   = renderTable(parsedEvents.lords,   'House of Lords');
  return commonsHtml + '\n\n' + lordsHtml;
}

export function renderCommonsTable(parsedEvents) {
  return renderTable(parsedEvents.commons, 'House of Commons');
}

export function renderLordsTable(parsedEvents) {
  return renderTable(parsedEvents.lords, 'House of Lords');
}

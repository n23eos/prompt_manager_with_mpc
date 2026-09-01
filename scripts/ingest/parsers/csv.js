"use strict";
// Minimal RFC 4180 CSV reader: handles quoted fields, embedded commas,
// newlines and doubled quotes. Enough for the prompt sources we import.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Rows as objects keyed by the header line.
function parseCsvRecords(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const rec = {};
    header.forEach((key, i) => (rec[key] = cells[i] ?? ""));
    return rec;
  });
}

module.exports = { parseCsv, parseCsvRecords };

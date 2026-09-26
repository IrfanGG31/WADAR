/** Minimal RFC 4180 CSV parser with delimiter auto-detection (Indonesian Excel exports use ";"). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]!;
    if (inQuotes) {
      if (char === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** First row = headers; the rest become objects keyed by header (server maps header aliases). */
export function rowsToObjects(rows: unknown[][]): Array<Record<string, unknown>> {
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((cell) => String(cell ?? "").trim());
  return body.map((cells) => {
    const record: Record<string, unknown> = {};
    keys.forEach((key, index) => {
      if (key) record[key] = cells[index] ?? null;
    });
    return record;
  });
}

export async function readSpreadsheet(file: File): Promise<Array<Record<string, unknown>>> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    const rows = (await readSheet(file)) as unknown[][];
    return rowsToObjects(rows);
  }
  return rowsToObjects(parseCsv(await file.text()));
}

import { describe, expect, it } from "vitest";
import { AdifDocument } from "../types/adif";
import {
  apply,
  duplicateIds,
  emptyLog,
  fromAdifDocument,
  logStats,
  matchesSearch,
  parseSearch,
  toAdifDocument,
} from "./log";

function doc(records: Record<string, string>[], columns = Object.keys(records[0] ?? {})): AdifDocument {
  return { header_text: "Station log", headers: { APP_NOTE: "keep" }, columns, records };
}

function logWith(records: Record<string, string>[]) {
  return fromAdifDocument(doc(records));
}

describe("QSO ids", () => {
  it("assigns increasing ids and strips them on the way back to ADIF", () => {
    const log = logWith([{ CALL: "K1A" }, { CALL: "K2B" }]);
    expect(log.qsos.map((qso) => qso.id)).toEqual([1, 2]);
    expect(log.nextId).toBe(3);
    const exported = toAdifDocument(log);
    expect(exported.records).toEqual([{ CALL: "K1A" }, { CALL: "K2B" }]);
    expect(JSON.stringify(exported)).not.toContain('"id"');
  });

  it("keeps the same id on the same QSO when a new QSO is prepended", () => {
    const log = logWith([{ CALL: "K1A" }, { CALL: "K2B" }]);
    const kept = log.qsos[1].id;
    const next = apply(log, new Set(), {
      type: "NEW_QSO",
      now: new Date("2026-01-02T03:04:00Z"),
    }).log;
    expect(next.qsos[0].fields).toMatchObject({
      QSO_DATE: "20260102",
      TIME_ON: "0304",
      CALL: "",
      BAND: "20m",
      MODE: "FT8",
    });
    expect(next.qsos.find((qso) => qso.id === kept)?.fields.CALL).toBe("K2B");
    expect(next.nextId).toBe(4);
    expect(next.fields).toEqual(expect.arrayContaining(["QSO_DATE", "TIME_ON", "CALL", "BAND", "MODE"]));
  });

  it("mints fresh ids when merging and keeps the open header", () => {
    const log = logWith([{ CALL: "K1A" }]);
    const incoming = doc([{ CALL: "K2B", NOTES: "park" }], ["CALL", "NOTES"]);
    incoming.header_text = "other header";
    incoming.headers = { APP_NOTE: "discard" };
    const next = apply(log, new Set(), { type: "MERGE", incoming }).log;
    expect(next.headerText).toBe("Station log");
    expect(next.headers).toEqual({ APP_NOTE: "keep" });
    expect(next.qsos.map((qso) => qso.fields.CALL)).toEqual(["K1A", "K2B"]);
    expect(next.qsos[1].id).toBe(2);
    expect(next.fields).toContain("NOTES");
    expect(next.nextId).toBe(3);
  });
});

describe("field order", () => {
  it("pulls known fields to the front in priority order", () => {
    const log = fromAdifDocument(doc(
      [{ NOTES: "x", CALL: "K1A", COMMENT: "hi" }],
      ["NOTES", "CALL", "COMMENT"],
    ));
    expect(log.fields).toEqual(["CALL", "COMMENT", "NOTES"]);
  });
});

describe("search expressions", () => {
  const fields = { CALL: "K1ABC", MODE: "FT8" };

  it("treats plain text as a literal and /pattern/i as a regex", () => {
    expect(parseSearch("FT8")).toEqual({ kind: "literal", text: "FT8" });
    expect(parseSearch("/ft8/i")).toEqual({ kind: "regex", source: "ft8", flags: "i" });
    expect(matchesSearch(fields, "ft8")).toBe(false);
    expect(matchesSearch(fields, "/ft8/i")).toBe(true);
    expect(matchesSearch(fields, "/nope/")).toBe(false);
  });

  it("rejects flags other than i and a broken pattern", () => {
    expect(parseSearch("/ft8/g").kind).toBe("invalid");
    expect(parseSearch("/[/").kind).toBe("invalid");
    expect(matchesSearch(fields, "/[/")).toBe(true);
  });

  it("treats an empty find and // as no pattern", () => {
    expect(parseSearch("").kind).toBe("empty");
    expect(parseSearch("//").kind).toBe("empty");
  });
});

describe("edits", () => {
  it("does not change a QSO when find is empty or the pattern is broken", () => {
    const log = logWith([{ CALL: "FT8" }]);
    const scope = new Set([log.qsos[0].id]);
    const empty = apply(log, scope, { type: "REPLACE", field: "CALL", find: "", replace: "-" });
    expect(empty.error).toBeUndefined();
    expect(empty.log).toBe(log);
    const slashes = apply(log, scope, { type: "REPLACE", field: "CALL", find: "//", replace: "-" });
    expect(slashes.log).toBe(log);
    const broken = apply(log, scope, { type: "REPLACE", field: "CALL", find: "/[/", replace: "-" });
    expect(broken.log).toBe(log);
    expect(broken.error).toBeTruthy();
  });

  it("replaces every literal match and inserts regex replacements as text", () => {
    const log = logWith([{ MODE: "FT8 FT8" }]);
    const scope = new Set([log.qsos[0].id]);
    const literal = apply(log, scope, {
      type: "REPLACE", field: "MODE", find: "FT8", replace: "CW",
    }).log;
    expect(literal.qsos[0].fields.MODE).toBe("CW CW");
    const regex = apply(log, scope, {
      type: "REPLACE", field: "MODE", find: "/ft8/i", replace: "$1",
    }).log;
    expect(regex.qsos[0].fields.MODE).toBe("$1 $1");
  });

  it("does not turn a comma frequency into a band", () => {
    const log = logWith([{ FREQ: "7,074", BAND: "" }]);
    const scope = new Set([log.qsos[0].id]);
    const next = apply(log, scope, { type: "DERIVE_BAND", overwrite: true }).log;
    expect(next.qsos[0].fields.BAND).toBe("");
    expect(next).toBe(log);
  });

  it("fills a blank band and overwrites only when asked", () => {
    const log = logWith([
      { FREQ: "14.074", BAND: "" },
      { FREQ: "14.074", BAND: "40m" },
    ]);
    const scope = new Set(log.qsos.map((qso) => qso.id));
    const filled = apply(log, scope, { type: "DERIVE_BAND", overwrite: false }).log;
    expect(filled.qsos[0].fields.BAND).toBe("20m");
    expect(filled.qsos[1].fields.BAND).toBe("40m");
    const overwritten = apply(filled, scope, { type: "DERIVE_BAND", overwrite: true }).log;
    expect(overwritten.qsos[1].fields.BAND).toBe("20m");
  });

  it("deletes only the QSOs in scope", () => {
    const log = logWith([{ CALL: "K1A" }, { CALL: "K2B" }]);
    const next = apply(log, new Set([log.qsos[0].id]), { type: "DELETE" }).log;
    expect(next.qsos.map((qso) => qso.fields.CALL)).toEqual(["K2B"]);
  });
});

describe("duplicates", () => {
  it("selects later QSOs and ignores a blank callsign", () => {
    const log = logWith([
      { CALL: "k1a", BAND: "20M", MODE: "ft8", QSO_DATE: "20260101", TIME_ON: "120059" },
      { CALL: "K1A", BAND: "20m", MODE: "FT8", QSO_DATE: "20260101", TIME_ON: "120030" },
      { CALL: "K1A", BAND: "20m", MODE: "FT8", QSO_DATE: "20260101", TIME_ON: "1200" },
      { CALL: "", BAND: "20m", MODE: "FT8", QSO_DATE: "20260101", TIME_ON: "1200" },
      { CALL: "  ", BAND: "20m", MODE: "FT8", QSO_DATE: "20260101", TIME_ON: "1200" },
    ]);
    expect(duplicateIds(log)).toEqual([log.qsos[1].id, log.qsos[2].id]);
  });
});

describe("ADIF Master log tools", () => {
  it("copies TIME_ON into TIME_OFF and pads short times to HHMMSS", () => {
    const log = logWith([{ TIME_ON: "1200", TIME_OFF: "" }]);
    const scope = new Set(log.qsos.map((qso) => qso.id));
    const copied = apply(log, scope, { type: "TIME_OFF_FROM_ON" }).log;
    expect(copied.qsos[0].fields.TIME_OFF).toBe("1200");
    const fixed = apply(copied, scope, { type: "FIX_TIME" }).log;
    expect(fixed.qsos[0].fields.TIME_ON).toBe("120000");
    expect(fixed.qsos[0].fields.TIME_OFF).toBe("120000");
  });

  it("duplicates a QSO with a new id and moves it down", () => {
    const log = logWith([{ CALL: "K1A" }, { CALL: "K2B" }]);
    const first = log.qsos[0].id;
    const copied = apply(log, new Set([first]), { type: "DUPLICATE" }).log;
    expect(copied.qsos.map((qso) => qso.fields.CALL)).toEqual(["K1A", "K1A", "K2B"]);
    expect(copied.qsos[1].id).not.toBe(first);
    const moved = apply(copied, new Set([copied.qsos[1].id]), { type: "MOVE_QSO", direction: "down" }).log;
    expect(moved.qsos.map((qso) => qso.fields.CALL)).toEqual(["K1A", "K2B", "K1A"]);
  });

  it("sorts by date and time, with a missing date last", () => {
    const log = logWith([
      { CALL: "C", QSO_DATE: "20260102", TIME_ON: "0100" },
      { CALL: "A", QSO_DATE: "20260101", TIME_ON: "2300" },
      { CALL: "B", QSO_DATE: "", TIME_ON: "0000" },
    ]);
    const next = apply(log, new Set(), { type: "SORT_BY_TIME" }).log;
    expect(next.qsos.map((qso) => qso.fields.CALL)).toEqual(["A", "C", "B"]);
  });

  it("splits a field on the first separator and adds several fields at once", () => {
    const log = logWith([{ COMMENT: "US-4555 KFF-4555" }]);
    const scope = new Set([log.qsos[0].id]);
    const split = apply(log, scope, {
      type: "SPLIT_FIELD", field: "COMMENT", separator: " ", into: "SIG_INFO",
    }).log;
    expect(split.qsos[0].fields.COMMENT).toBe("US-4555");
    expect(split.qsos[0].fields.SIG_INFO).toBe("KFF-4555");
    const added = apply(split, new Set(), { type: "ADD_FIELD", name: "POTA_REF, MY_POTA_REF" }).log;
    expect(added.fields.slice(-2)).toEqual(["POTA_REF", "MY_POTA_REF"]);
  });

  it("fills FREQ from BAND without touching a frequency that is already set", () => {
    const log = logWith([{ BAND: "20m", FREQ: "" }, { BAND: "20m", FREQ: "14.200" }]);
    const scope = new Set(log.qsos.map((qso) => qso.id));
    const next = apply(log, scope, { type: "FREQ_FROM_BAND", overwrite: false }).log;
    expect(next.qsos[0].fields.FREQ).toBe("14.074");
    expect(next.qsos[1].fields.FREQ).toBe("14.200");
  });

  it("counts QSOs, callsigns, bands, and modes", () => {
    const log = logWith([
      { CALL: "k1a", BAND: "20m", MODE: "FT8" },
      { CALL: "K1A", BAND: "20m", MODE: "ft8" },
      { CALL: "K2B", BAND: "40m", MODE: "CW" },
    ]);
    expect(logStats(log)).toMatchObject({
      qsos: 3,
      calls: 2,
      byBand: [{ name: "20m", count: 2 }, { name: "40m", count: 1 }],
      byMode: [{ name: "FT8", count: 2 }, { name: "CW", count: 1 }],
    });
  });
});

describe("empty log", () => {
  it("starts with the starter fields", () => {
    expect(emptyLog().fields).toEqual([
      "QSO_DATE", "TIME_ON", "CALL", "BAND", "FREQ", "MODE", "RST_SENT", "RST_RCVD", "GRIDSQUARE",
    ]);
  });
});

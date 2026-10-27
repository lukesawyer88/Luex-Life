import { describe, expect, it } from "vitest";

import { applyMapping, csvSignature, findHeaderRow, guessMapping, importKeys, looksSame, matchBill, parseAmount, parseCsv, parseDate, parseOfx } from "./import-parse";

describe("CSV reading", () => {
  it("handles quotes, a BOM and CRLF", () => {
    const rows = parseCsv('﻿Date,Description,Amount\r\n01/10/2026,"TESCO, STORES 123",-12.50\r\n02/10/2026,"Say ""hi""",5\r\n');
    expect(rows).toEqual([["Date", "Description", "Amount"], ["01/10/2026", "TESCO, STORES 123", "-12.50"], ["02/10/2026", 'Say "hi"', "5"]]);
  });
  it("finds semicolons", () => {
    expect(parseCsv("a;b;c\n1;2;3")[1]).toEqual(["1", "2", "3"]);
  });
  it("guesses a UK bank with paid in and paid out columns", () => {
    const rows = parseCsv("Account name: Joint\nDate,Type,Description,Paid out,Paid in,Balance\n03/10/2026,DD,OCTOPUS ENERGY,95.00,,1000.00\n04/10/2026,BGC,WAGES,,2000.00,3000.00");
    const h = findHeaderRow(rows);
    expect(h).toBe(1);
    const m = guessMapping(rows, h);
    expect(m.date).toBe(0);
    expect(m.payee).toBe(2);
    expect(m.out).toBe(3);
    expect(m.in).toBe(4);
    const { lines } = applyMapping(rows, m);
    expect(lines).toEqual([
      { date: "2026-10-03", payee: "OCTOPUS ENERGY", amount: -95, fitid: null },
      { date: "2026-10-04", payee: "WAGES", amount: 2000, fitid: null },
    ]);
    expect(csvSignature(rows, h)).toBe("date|type|description|paid out|paid in|balance");
  });
  it("guesses a single signed amount column", () => {
    const rows = parseCsv("Transaction Date,Counter Party,Amount (GBP)\n2026-10-05,Netflix,-10.99");
    const m = guessMapping(rows, findHeaderRow(rows));
    expect(m.amount).toBe(2);
    expect(m.dateFormat).toBe("ymd");
    expect(applyMapping(rows, m).lines[0]).toEqual({ date: "2026-10-05", payee: "Netflix", amount: -10.99, fitid: null });
  });
});

describe("dates and amounts", () => {
  it("reads common date styles", () => {
    expect(parseDate("31/01/2026", "dmy")).toBe("2026-01-31");
    expect(parseDate("01/31/2026", "mdy")).toBe("2026-01-31");
    expect(parseDate("5 Oct 2026", "dmy")).toBe("2026-10-05");
    expect(parseDate("05-Sept-26", "dmy")).toBe("2026-09-05");
    expect(parseDate("20261005120000", "ymd")).toBeNull();
    expect(parseDate("20261005", "ymd")).toBe("2026-10-05");
    expect(parseDate("31/02/2026", "dmy")).toBeNull();
  });
  it("reads amounts", () => {
    expect(parseAmount("£1,234.50")).toBe(1234.5);
    expect(parseAmount("(12.00)")).toBe(-12);
    expect(parseAmount("12.00 DR")).toBe(-12);
    expect(parseAmount("12.00 CR")).toBe(12);
    expect(parseAmount("1.234,50")).toBe(1234.5);
    expect(parseAmount("TESCO")).toBeNull();
  });
});

describe("OFX", () => {
  it("reads transactions without closing tags", () => {
    const ofx = `OFXHEADER:100\n<OFX><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003000000[0:GMT]<TRNAMT>-95.00<FITID>abc1<NAME>OCTOPUS &amp; CO<MEMO>DD</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261004<TRNAMT>2000.00<FITID>abc2<MEMO>WAGES
</BANKTRANLIST></OFX>`;
    expect(parseOfx(ofx)).toEqual([
      { date: "2026-10-03", payee: "OCTOPUS & CO", amount: -95, fitid: "abc1" },
      { date: "2026-10-04", payee: "WAGES", amount: 2000, fitid: "abc2" },
    ]);
  });
});

describe("matching", () => {
  const a = "11111111-1111-1111-1111-111111111111";
  it("gives identical lines different keys, and the same keys next time", () => {
    const l = { date: "2026-10-01", payee: "Coffee", amount: -3, fitid: null };
    const k1 = importKeys([l, l], a);
    expect(k1[0]).not.toBe(k1[1]);
    expect(importKeys([l, l], a)).toEqual(k1);
  });
  it("spots a payment already typed in", () => {
    const l = { date: "2026-10-01", payee: "TESCO STORES 1234", amount: -84.2, fitid: null };
    expect(looksSame(l, { on_date: "2026-10-01", amount: "84.20", direction: "out", payee: "Tesco" })).toBe(true);
    expect(looksSame(l, { on_date: "2026-10-02", amount: "84.20", direction: "out", payee: "Tesco" })).toBe(false);
  });
  it("matches a bill near its due date", () => {
    const bills = [{ id: "b", name: "Energy", payee_match: "octopus", next_due: "2026-10-01" }];
    expect(matchBill({ date: "2026-10-03", payee: "OCTOPUS ENERGY", amount: -95, fitid: null }, bills)?.id).toBe("b");
    expect(matchBill({ date: "2026-10-09", payee: "OCTOPUS ENERGY", amount: -95, fitid: null }, bills)).toBeNull();
  });
});

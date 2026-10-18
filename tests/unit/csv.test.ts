import { describe, expect, it } from "vitest";
import { parseCsv, parsePupilCsv, toCsv } from "@/server/csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF, BOM and blank lines", () => {
    expect(parseCsv('﻿code,name\r\n"P1","Smith, ""Jo"""\r\n\r\nP2,\n')).toEqual([
      ["code", "name"],
      ["P1", 'Smith, "Jo"'],
      ["P2", ""],
    ]);
  });
});

describe("parsePupilCsv", () => {
  it("reads code and optional name columns in any order and case", () => {
    expect(parsePupilCsv("Name,CODE\nAlex Example,P01\n,P02")).toEqual({
      rows: [
        { code: "P01", name: "Alex Example" },
        { code: "P02", name: null },
      ],
      errors: [],
    });
  });
  it("needs a code header", () => {
    expect(parsePupilCsv("P01,Alex").errors[0]?.message).toMatch(/header/);
  });
  it("reports bad and duplicate codes by row", () => {
    const r = parsePupilCsv("code\nP01\nbad code!\nP01");
    expect(r.errors).toEqual([
      { line: 3, message: expect.stringMatching(/letters, digits/) },
      { line: 4, message: "Code P01 appears more than once." },
    ]);
  });
});

describe("toCsv", () => {
  it("quotes where needed and neutralises spreadsheet formulas", () => {
    expect(toCsv([["a,b", 'say "hi"', "=SUM(A1)", "+1", "-x", "@cmd", 3, null]])).toBe(
      `"a,b","say ""hi""",'=SUM(A1),'+1,'-x,'@cmd,3,\r\n`,
    );
  });
  it("leaves negative numbers passed as numbers alone", () => {
    expect(toCsv([[-1]])).toBe("-1\r\n");
  });
});

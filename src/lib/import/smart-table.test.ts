import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";

vi.mock("@/lib/ai/claude-client", () => ({ claudeChat: vi.fn() }));
import { mapColumns, matchName, norm, parseDate, parseDelimited, readTable, type FieldSpec } from "./smart-table";

const FIELDS: FieldSpec[] = [
  { key: "findings", kind: "longtext", synonyms: ["findings", "observation", "الملاحظة", "الوصف"] },
  { key: "location", synonyms: ["location", "الموقع", "المكان"] },
  { key: "observedAt", kind: "date", synonyms: ["date", "التاريخ"] },
  { key: "type", synonyms: ["type", "النوع"] },
];

describe("smart-table", () => {
  it("normalises Arabic spelling variants and digits", () => {
    expect(norm("الملاحظة")).toBe(norm("ملاحظه"));
    expect(norm("إجراء")).toBe(norm("اجراء"));
    expect(norm("٢٠٢٤")).toBe("2024");
  });

  it("detects the delimiter and quoted fields", () => {
    const rows = parseDelimited('a;b;c\n1;"x; y";3\n4;5;6\n');
    expect(rows).toEqual([["a", "b", "c"], ["1", "x; y", "3"], ["4", "5", "6"]]);
  });

  it("parses day-first, ISO, Excel-serial and Arabic-digit dates", () => {
    expect(parseDate("05/03/2024")?.toISOString().slice(0, 10)).toBe("2024-03-05");
    expect(parseDate("2024-03-05")?.toISOString().slice(0, 10)).toBe("2024-03-05");
    expect(parseDate(45356)?.toISOString().slice(0, 10)).toBe("2024-03-05");
    expect(parseDate("٠٥/٠٣/٢٠٢٤")?.toISOString().slice(0, 10)).toBe("2024-03-05");
    expect(parseDate("not a date")).toBeNull();
  });

  it("skips title rows, finds the header and maps Arabic columns in any order", async () => {
    const csv = "تقرير الملاحظات الشهري\n\nالتاريخ,المكان,الوصف,النوع\n01/02/2024,فهود,عامل بدون خوذة قرب الرافعة,فعل غير آمن\n03/02/2024,يبال,تسرب زيت صغير عند المضخة رقم 3,حالة\n";
    const t = await readTable(Buffer.from(csv, "utf-8"), "x.csv");
    expect(t.headerRow).toBe(3);
    expect(t.rows).toHaveLength(2);
    const { map } = await mapColumns(t, FIELDS);
    expect(map).toEqual({ observedAt: 0, location: 1, findings: 2, type: 3 });
  });

  it("falls back to the values when headers are unknown", async () => {
    const csv = "col1,col2,col3\n2024-01-01,A,Scaffold missing toe boards on level 2\n2024-01-02,B,Hot work without a fire watch near tank T-4\n";
    const t = await readTable(Buffer.from(csv), "x.csv");
    const { map, via } = await mapColumns(t, FIELDS);
    expect(map.observedAt).toBe(0);
    expect(map.findings).toBe(2);
    expect(via.findings).toBe("values");
  });

  it("picks the sheet that holds the data in a workbook", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Cover page"], ["Prepared by HSE"]]), "Cover");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Observation", "Location", "Date"],
      ["Unbarricaded excavation at well pad", "Fahud", "2024-02-01"],
      ["Expired fire extinguisher in control room", "Yibal", "2024-02-02"],
    ]), "Data");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const t = await readTable(buf, "obs.xlsx");
    expect(t.sheet).toBe("Data");
    expect(t.rows).toHaveLength(2);
  });

  it("matches site names loosely", () => {
    const sites = [{ code: "FHD-001", name: "Fahud", nameAr: "فهود" }, { code: "YBL-001", name: "Yibal", nameAr: "يبال" }];
    const names = (s: (typeof sites)[number]) => [s.code, s.name, s.nameAr];
    expect(matchName("Fahud tank farm", sites, names)?.code).toBe("FHD-001");
    expect(matchName("حقل يبال", sites, names)?.code).toBe("YBL-001");
    expect(matchName("ybl-001", sites, names)?.code).toBe("YBL-001");
    expect(matchName("Muscat", sites, names)).toBeNull();
  });
});

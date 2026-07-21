import { describe, expect, it } from "vite-plus/test";

import {
  inferMediaUploadType,
  isSafeExternalMediaUrl,
  validateMediaUploadFile,
} from "./media-policy";

describe("inferMediaUploadType", () => {
  it.each([
    [new File(["x"], "photo.webp", { type: "image/webp" }), "image"],
    [new File(["x"], "lecture.mp3", { type: "audio/mpeg" }), "audio"],
    [new File(["x"], "clip.mp4", { type: "video/mp4" }), "video"],
    [new File(["x"], "worksheet.bin", { type: "application/pdf" }), "pdf"],
    [new File(["x"], "handout.pdf", { type: "application/octet-stream" }), "pdf"],
    [
      new File(["x"], "brief.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      "document",
    ],
    [new File(["x"], "marks.xlsx", { type: "" }), "spreadsheet"],
    [new File(["name,score\nAda,100\n"], "marks.csv", { type: "text/plain" }), "spreadsheet"],
    [new File(["x"], "slides.pptx", { type: "" }), "presentation"],
    [new File(["x"], "source.zip", { type: "" }), "archive"],
    [new File(["x"], "notes.md", { type: "" }), "text"],
    [new File(["x"], "unknown.bin", { type: "application/octet-stream" }), "other"],
  ] as const)("classifies %s as %s", (file, expected) => {
    expect(inferMediaUploadType(file)).toBe(expected);
  });
});

describe("validateMediaUploadFile", () => {
  it("returns the validated media type for allowed uploads", () => {
    const file = new File(["abc"], "image.png", { type: "image/png" });

    expect(validateMediaUploadFile(file, "image")).toBe("image");
  });

  it("allows extension fallback for browser files with missing MIME type", () => {
    const file = new File(["abc"], "slides.pptx", { type: "" });

    expect(validateMediaUploadFile(file, "presentation")).toBe("presentation");
  });

  it("allows plain-text CSV files as spreadsheet uploads", () => {
    const file = new File(["name,score\nAda,100\n"], "marks.csv", { type: "text/plain" });

    expect(validateMediaUploadFile(file, "spreadsheet")).toBe("spreadsheet");
  });

  it.each(["marks.xlsx", "marks.ods"])(
    "rejects plain-text MIME for non-CSV spreadsheet %s",
    (filename) => {
      const file = new File(["name,score\nAda,100\n"], filename, { type: "text/plain" });

      expect(() => validateMediaUploadFile(file, "spreadsheet")).toThrow(
        /not an allowed spreadsheet file/,
      );
    },
  );

  it("rejects plain-text MIME for PDF uploads", () => {
    const file = new File(["not a pdf"], "guide.pdf", { type: "text/plain" });

    expect(() => validateMediaUploadFile(file, "pdf")).toThrow(/not an allowed pdf file/);
  });

  it("rejects active image formats such as SVG", () => {
    const file = new File(["<svg></svg>"], "unsafe.svg", {
      type: "image/svg+xml",
    });

    expect(() => validateMediaUploadFile(file, "image")).toThrow(/not an allowed image file/);
  });

  it("rejects disallowed extensions even when the MIME type is allowed", () => {
    const file = new File(["abc"], "unsafe.svg", { type: "image/png" });

    expect(() => validateMediaUploadFile(file, "image")).toThrow(/not an allowed image file/);
  });

  it("rejects oversized uploads", () => {
    const file = new File(["x"], "large.txt", { type: "text/plain" });
    Object.defineProperty(file, "size", { value: 3 * 1024 * 1024 });

    expect(() => validateMediaUploadFile(file, "text")).toThrow(/text upload limit is 2 MB/);
  });
});

describe("isSafeExternalMediaUrl", () => {
  it.each(["https://example.com/file.png", "http://example.com/file.png"])("allows %s", (url) => {
    expect(isSafeExternalMediaUrl(url)).toBe(true);
  });

  it.each(["javascript:alert(1)", "data:text/html,<svg></svg>", "/relative.png"])(
    "rejects %s",
    (url) => {
      expect(isSafeExternalMediaUrl(url)).toBe(false);
    },
  );
});

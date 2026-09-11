import { describe, expect, it } from "vitest";
import { JsonLineParser } from "./json-lines";

describe("JsonLineParser", () => {
  it("parses complete and fragmented messages", () => {
    const parser = new JsonLineParser();

    expect(parser.push('{"id":1,"res')).toEqual([]);
    expect(
      parser.push('ult":{"ok":true}}\n{"method":"turn/started"}\n'),
    ).toEqual([{ id: 1, result: { ok: true } }, { method: "turn/started" }]);
  });

  it("flushes a final message without a newline", () => {
    const parser = new JsonLineParser();
    parser.push('{"method":"initialized"}');
    expect(parser.finish()).toEqual([{ method: "initialized" }]);
  });
});

export class JsonLineParser {
  private buffer = "";

  push(chunk: string): unknown[] {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    return lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  }

  finish(): unknown[] {
    const line = this.buffer.trim();
    this.buffer = "";
    return line ? [JSON.parse(line) as unknown] : [];
  }
}

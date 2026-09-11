import { delimiter } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCodexEnvironment } from "./codex-process";

describe("buildCodexEnvironment", () => {
  it("prepends the Codex launcher directory so env can find its Node sibling", () => {
    const environment = buildCodexEnvironment(
      "/Users/example/.nvm/versions/node/v24/bin/codex",
      { PATH: "/usr/bin:/bin", CUSTOM_VALUE: "preserved" },
    );

    expect(environment.PATH?.split(delimiter)).toEqual([
      "/Users/example/.nvm/versions/node/v24/bin",
      "/usr/bin",
      "/bin",
    ]);
    expect(environment.CUSTOM_VALUE).toBe("preserved");
  });

  it("does not duplicate a launcher directory already on PATH", () => {
    const directory = "/usr/local/bin";
    const environment = buildCodexEnvironment(`${directory}/codex`, {
      PATH: `${directory}${delimiter}/usr/bin`,
    });

    expect(environment.PATH).toBe(`${directory}${delimiter}/usr/bin`);
  });
});

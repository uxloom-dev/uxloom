/**
 * CI-native output formats (RFC 0003 R4). One normalized finding shape in,
 * three formats out: --json (stable machine schema), --sarif (SARIF 2.1.0
 * for code-scanning upload), --github (workflow-command annotations).
 */

export interface ReportableFinding {
  code: string;
  severity: "error" | "warning";
  message: string;
  fix?: string;
  /** File+line for audit evidence; the project file for design findings. */
  file: string;
  line?: number;
  screen?: string;
  state?: string;
  journey?: string;
}

export interface ReportEnvelope {
  tool: "uxloom";
  command: "check" | "audit" | "design";
  version: string;
  summary: Record<string, number | string>;
  findings: ReportableFinding[];
}

export type OutputFormat = "human" | "json" | "sarif" | "github";

export function parseFormatFlag(args: string[]): OutputFormat {
  if (args.includes("--sarif")) return "sarif";
  if (args.includes("--json")) return "json";
  if (args.includes("--github")) return "github";
  return "human";
}

export function renderJson(envelope: ReportEnvelope): string {
  return JSON.stringify(envelope, null, 2);
}

export function renderSarif(envelope: ReportEnvelope): string {
  const ruleIds = [...new Set(envelope.findings.map((f) => f.code))];
  return JSON.stringify(
    {
      $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: `uxloom-${envelope.command}`,
              informationUri: "https://uxloom.dev",
              version: envelope.version,
              rules: ruleIds.map((id) => ({ id, shortDescription: { text: id } })),
            },
          },
          results: envelope.findings.map((f) => ({
            ruleId: f.code,
            level: f.severity,
            message: { text: f.fix ? `${f.message} Fix: ${f.fix}` : f.message },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: f.file },
                  region: { startLine: f.line ?? 1 },
                },
              },
            ],
          })),
        },
      ],
    },
    null,
    2,
  );
}

export function renderGithub(envelope: ReportEnvelope): string {
  // https://docs.github.com/actions/reference/workflow-commands
  const esc = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  return envelope.findings
    .map((f) => {
      const cmd = f.severity === "error" ? "error" : "warning";
      const loc = `file=${f.file}${f.line ? `,line=${f.line}` : ""}`;
      return `::${cmd} ${loc},title=uxloom ${envelope.command}: ${f.code}::${esc(f.message + (f.fix ? ` Fix: ${f.fix}` : ""))}`;
    })
    .join("\n");
}

export function render(envelope: ReportEnvelope, format: Exclude<OutputFormat, "human">): string {
  if (format === "json") return renderJson(envelope);
  if (format === "sarif") return renderSarif(envelope);
  return renderGithub(envelope);
}

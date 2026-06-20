export type ResponseMode = "brief" | "standard" | "deep";

export const responseModes: Array<{
  value: ResponseMode;
  label: string;
  detail: string;
}> = [
  {
    value: "brief",
    label: "Brief",
    detail: "Faster, tighter answers",
  },
  {
    value: "standard",
    label: "Standard",
    detail: "Balanced depth",
  },
  {
    value: "deep",
    label: "Deep",
    detail: "Longer analysis",
  },
];

export function isResponseMode(value: unknown): value is ResponseMode {
  return (
    value === "brief" ||
    value === "standard" ||
    value === "deep"
  );
}

export const brl = (v: number | string | { toString(): string }) =>
  Number(v.toString()).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const date = (d: Date | string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export const dateTime = (d: Date | string) =>
  new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function bytes(n: number | bigint) {
  const v = Number(n);
  if (v < 1024) return `${v} B`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  return `${(v / 1024 ** 3).toFixed(2)} GB`;
}

export const caseCode = (code: number) => `DD-${String(code).padStart(5, "0")}`;

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

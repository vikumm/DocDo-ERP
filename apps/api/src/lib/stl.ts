/** Volume (ml) de um STL binário/ASCII assumindo unidades em mm. Retorna null se não conseguir calcular. */
export function stlVolumeMl(buf: Buffer): number | null {
  try {
    const isBinary = buf.length >= 84 && 84 + buf.readUInt32LE(80) * 50 === buf.length;
    let vol = 0;
    const add = (a: number[], b: number[], c: number[]) => {
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    };
    if (isBinary) {
      const n = buf.readUInt32LE(80);
      for (let i = 0; i < n; i++) {
        const o = 84 + i * 50 + 12;
        const v = [0, 1, 2].map((k) => [buf.readFloatLE(o + k * 12), buf.readFloatLE(o + k * 12 + 4), buf.readFloatLE(o + k * 12 + 8)]);
        add(v[0], v[1], v[2]);
      }
    } else {
      const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
      let m: RegExpExecArray | null;
      const pts: number[][] = [];
      while ((m = re.exec(buf.toString("utf8")))) pts.push([+m[1], +m[2], +m[3]]);
      for (let i = 0; i + 2 < pts.length; i += 3) add(pts[i], pts[i + 1], pts[i + 2]);
      if (!pts.length) return null;
    }
    const ml = Math.abs(vol) / 1000;
    return Number.isFinite(ml) && ml > 0 ? Math.round(ml * 10) / 10 : null;
  } catch {
    return null;
  }
}

/** Remove texto do cabeçalho (binário: 80 bytes; ASCII: nome após "solid"), que pode trazer dados do exame. */
export function sanitizeStl(buf: Buffer): Buffer {
  const isBinary = buf.length >= 84 && 84 + buf.readUInt32LE(80) * 50 === buf.length;
  if (isBinary) {
    const out = Buffer.from(buf);
    out.fill(0, 0, 80);
    out.write("DocDo STL", 0, "ascii");
    return out;
  }
  const text = buf.toString("utf8");
  return Buffer.from(text.replace(/^\s*solid[^\r\n]*/, "solid docdo").replace(/endsolid[^\r\n]*/g, "endsolid docdo"), "utf8");
}

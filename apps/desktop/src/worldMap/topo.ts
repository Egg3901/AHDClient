// Minimal TopoJSON -> SVG decoder. No deps. ~40 lines core plus helpers.
// Quantized, delta-encoded arcs with transform {scale, translate} per world-atlas.

export interface DecodedFeature {
  iso: string; // numeric string like "276" (may be empty for N. Cyprus etc)
  name: string;
  rings: Array<Array<[number, number]>>; // each ring is lon/lat points
  type: string;
}

// Topology shape from world-atlas
interface RawTopology {
  type: string;
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: {
    countries: {
      type: string;
      geometries: Array<{
        type: string;
        arcs?: unknown;
        id?: string;
        properties: { name: string };
      }>;
    };
  };
}

export function decodeTopology(topo: RawTopology): DecodedFeature[] {
  const scale = topo.transform.scale;
  const translate = topo.transform.translate;
  const rawArcs = topo.arcs;

  const decodedArcs: Array<Array<[number, number]>> = rawArcs.map((arc) => {
    let x = 0;
    let y = 0;
    const pts: Array<[number, number]> = [];
    for (const pt of arc) {
      const dx = pt[0]!;
      const dy = pt[1]!;
      x += dx;
      y += dy;
      pts.push([x * scale[0] + translate[0], y * scale[1] + translate[1]]);
    }
    return pts;
  });

  function getArc(idx: number): Array<[number, number]> {
    if (idx >= 0) return decodedArcs[idx]!;
    const rev = decodedArcs[-idx - 1]!;
    const copy = rev.slice().reverse();
    return copy;
  }

  function buildRing(indices: number[]): Array<[number, number]> {
    let pts: Array<[number, number]> = [];
    for (let i = 0; i < indices.length; i++) {
      const arcIdx = indices[i]!;
      const arcPts = getArc(arcIdx);
      if (i === 0) pts = pts.concat(arcPts);
      else pts = pts.concat(arcPts.slice(1));
    }
    return pts;
  }

  const out: DecodedFeature[] = [];
  for (const geom of topo.objects.countries.geometries) {
    const iso = (geom.id ?? "") as string;
    const name = geom.properties.name;
    const type = geom.type;
    let rings: Array<Array<[number, number]>> = [];
    if (type === "Polygon") {
      const arcs = geom.arcs as number[][];
      for (const ringIndices of arcs) rings.push(buildRing(ringIndices));
    } else if (type === "MultiPolygon") {
      const arcs = geom.arcs as number[][][];
      for (const poly of arcs) {
        for (const ringIndices of poly) rings.push(buildRing(ringIndices));
      }
    }
    out.push({ iso, name, rings, type });
  }
  return out;
}

// Equirectangular projection to SVG coordinates. Width/height define viewBox.
export function projectLonLat(lon: number, lat: number, width: number, height: number): [number, number] {
  const x = ((lon + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return [x, y];
}

export function ringsToPathD(rings: Array<Array<[number, number]>>, width: number, height: number): string {
  let d = "";
  for (const ring of rings) {
    if (ring.length === 0) continue;
    for (let i = 0; i < ring.length; i++) {
      const [lon, lat] = ring[i]!;
      const [x, y] = projectLonLat(lon, lat, width, height);
      if (i === 0) d += `M${x.toFixed(2)},${y.toFixed(2)}`;
      else d += `L${x.toFixed(2)},${y.toFixed(2)}`;
    }
    d += "Z ";
  }
  return d;
}

// ============================================================
// Embedded simplified Israel border (lon,lat), clockwise from the north.
// Source: simplified public outline (Natural Earth / OSM). Offline — no network.
// Consumed by globe.js to draw the flat recon map + project settlements.
// ============================================================
const IsraelGeo = (() => {
  'use strict';
  const OUTLINE = [
    [35.57,33.28],[35.62,33.24],[35.70,33.18],[35.80,33.05],[35.86,32.92],
    [35.78,32.75],[35.62,32.70],[35.57,32.50],[35.55,32.20],[35.52,31.90],
    [35.48,31.75],[35.50,31.50],[35.45,31.25],[35.40,31.10],[35.34,30.92],
    [35.20,30.58],[35.10,30.18],[35.00,29.85],[34.92,29.55],[34.88,29.92],
    [34.80,30.32],[34.70,30.72],[34.55,31.10],[34.48,31.35],[34.42,31.55],
    [34.62,31.58],[34.75,31.80],[34.78,32.08],[34.85,32.40],[34.92,32.70],
    [35.05,32.85],[35.10,33.05],[35.30,33.10],[35.45,33.20],[35.57,33.28],
  ];
  const lons = OUTLINE.map(p => p[0]), lats = OUTLINE.map(p => p[1]);
  const BOUNDS = {
    minLon: Math.min(...lons), maxLon: Math.max(...lons),
    minLat: Math.min(...lats), maxLat: Math.max(...lats),
  };
  const midLat = (BOUNDS.minLat + BOUNDS.maxLat) / 2;
  const asp = Math.cos(midLat * Math.PI / 180);

  // Project lon/lat -> {x,y} pixels. view = {W,H,pad,zoom,panX,panY}.
  // Equirectangular with cos(midLat) aspect correction; fits BOUNDS into a
  // pad-inset W*H box (north up), then scales about center + pans.
  function project(lon, lat, view) {
    const { W, H, pad, zoom, panX, panY } = view;
    const lonSpan = (BOUNDS.maxLon - BOUNDS.minLon) * asp;
    const latSpan = BOUNDS.maxLat - BOUNDS.minLat;
    const bw = W - pad * 2, bh = H - pad * 2;
    const scale = Math.min(bw / lonSpan, bh / latSpan); // fit, keep aspect
    const drawW = lonSpan * scale, drawH = latSpan * scale;
    const ox = (W - drawW) / 2, oy = (H - drawH) / 2;
    let x = ox + ((lon - BOUNDS.minLon) * asp) * scale;
    let y = oy + (BOUNDS.maxLat - lat) * scale; // invert: north up
    const cx = W / 2, cy = H / 2;                // zoom about center
    x = cx + (x - cx) * zoom + panX;
    y = cy + (y - cy) * zoom + panY;
    return { x, y };
  }

  return { OUTLINE, BOUNDS, project };
})();
if (typeof module !== 'undefined') module.exports = IsraelGeo;

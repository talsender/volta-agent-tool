// Pure transform: wizard inputs → render-ready sim state. No Three.js, no DOM.
// Axes: N=-z, S=+z, E=+x, W=-x. Azimuth deg: 0=N,90=E,180=S,270=W. Sun elev 60°.
function buildSimState(inputs, roofConfig) {
  const SUN_ELEV = 60;
  const materials = (inputs.materials || []).filter(m => (parseInt(m.size) || 0) > 0);
  const totalArea = materials.reduce((a, m) => a + (parseInt(m.size) || 0), 0);

  const parts = materials.map(m => {
    const def = (roofConfig.materials || []).find(x => x.id === m.id);
    const size = parseInt(m.size) || 0;
    return {
      id: m.id,
      label: def ? def.label : m.id,
      geometry: def && def.geometry ? def.geometry : 'flat',
      size,
      areaShare: totalArea > 0 ? size / totalArea : 0,
    };
  });

  // sun direction (unit vector pointing toward the sun)
  const azRad = ((inputs.azimuth || 0) % 360) * Math.PI / 180;
  const elevRad = SUN_ELEV * Math.PI / 180;
  const cosE = Math.cos(elevRad);
  const sun = {
    az: inputs.azimuth || 0,
    elev: SUN_ELEV,
    dir: {
      x: Math.sin(azRad) * cosE,
      y: Math.sin(elevRad),
      z: -Math.cos(azRad) * cosE,
    },
  };

  // obstacles by shading level, placed on the sun side (between sun and house)
  const shading = inputs.shading || 'none';
  const obstacles = [];
  const dist = 9;
  let oid = 0;
  const place = (type, mult, lateral) => obstacles.push({
    id: 'auto' + (oid++),
    type,
    x: sun.dir.x * dist * mult + lateral,
    z: sun.dir.z * dist * mult,
    height: type === 'building' ? 8 : 3.5,
  });
  if (shading === 'partial') {
    place('tree', 1, 2);
  } else if (shading === 'heavy') {
    place('tree', 1, 3);
    place('tree', 1.05, -3);
    place('building', 1.25, 0);
  }

  // house footprint from total area (meters-ish), clamped to a pleasant scene size
  const footprint = Math.max(5, Math.min(18, Math.sqrt(totalArea || 25)));
  const stories = /^condo/.test(inputs.propertyType || '') ? 2 : 1;
  // orientation: which way the roof faces. Default azimuth 180 (south) → 0 rotation.
  const orientationRad = (180 - (inputs.azimuth || 180)) * Math.PI / 180;

  return { totalArea, parts, house: { footprint, stories, orientationRad }, sun, obstacles };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Object.assign(module.exports || {}, { buildSimState });
}

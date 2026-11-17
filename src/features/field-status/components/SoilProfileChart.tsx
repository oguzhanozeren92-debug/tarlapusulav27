import type { SoilGridsProfile } from '../../../services/soilGridsService';
import { interpretSoil, type SoilLayerRow } from '../services/soilInterpretation';
import './SoilProfileChart.css';

const COLORS = { sand: '#d8b46a', silt: '#a8946b', clay: '#7a4b2e' } as const;
const LABELS = { sand: 'Kum', silt: 'Silt', clay: 'Kil' } as const;
const fin = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const num1 = (v: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(v);

export default function SoilProfileChart({ profile, textureLabel }: { profile: SoilGridsProfile; textureLabel: string }) {
  const p = profile.properties;
  const rows: SoilLayerRow[] = p.ph.layers.map((layer, i) => ({
    depth: layer.depth.replace('cm', ' cm'),
    ph: fin(layer.value),
    sand: fin(p.sand.layers.find((l) => l.depth === layer.depth)?.value ?? p.sand.layers[i]?.value),
    silt: fin(p.silt.layers.find((l) => l.depth === layer.depth)?.value ?? p.silt.layers[i]?.value),
    clay: fin(p.clay.layers.find((l) => l.depth === layer.depth)?.value ?? p.clay.layers[i]?.value),
    oc: fin(p.organicCarbon.layers.find((l) => l.depth === layer.depth)?.value ?? p.organicCarbon.layers[i]?.value),
  }));

  const notes = interpretSoil({
    texture: { sand: fin(profile.texture.sandPercent), silt: fin(profile.texture.siltPercent), clay: fin(profile.texture.clayPercent), label: textureLabel },
    ph: fin(p.ph.topsoil0To30),
    ocGkg: fin(p.organicCarbon.topsoil0To30),
    layers: rows,
    intel: (profile as any).soilIntelligenceV2,
  });

  // Sütunlar: her derinlik için kum/silt/kil yığılmış %100 sütun.
  const W = 320, H = 190, top = 14, base = 150, colW = 54;
  const gap = (W - 30 - rows.length * colW) / (rows.length + 1);
  const scale = (base - top) / 100;

  return (
    <section className="tp-soil-chart" aria-label="Toprak profili grafiği ve yorumu">
      <div className="tp-soil-chart-legend">
        {(['sand', 'silt', 'clay'] as const).map((k) => (
          <span key={k}><i style={{ background: COLORS[k] }} />{LABELS[k]}</span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Derinliğe göre kum, silt ve kil oranları">
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={28} x2={W} y1={base - t * scale} y2={base - t * scale} className="grid" />
            <text x={24} y={base - t * scale + 3} className="axis" textAnchor="end">{t}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = 30 + gap + i * (colW + gap);
          const total = (r.sand ?? 0) + (r.silt ?? 0) + (r.clay ?? 0) || 1;
          let y = base;
          return (
            <g key={r.depth}>
              {(['sand', 'silt', 'clay'] as const).map((k) => {
                const v = ((r[k] ?? 0) / total) * 100;
                const h = v * scale;
                y -= h;
                return (
                  <g key={k}>
                    <rect x={x} y={y} width={colW} height={Math.max(0, h - 1)} rx={3} fill={COLORS[k]} />
                    {v >= 12 && <text x={x + colW / 2} y={y + h / 2 + 4} textAnchor="middle" className={`seg ${k}`}>{Math.round(v)}</text>}
                  </g>
                );
              })}
              <text x={x + colW / 2} y={base + 15} textAnchor="middle" className="depth">{r.depth}</text>
              <text x={x + colW / 2} y={base + 29} textAnchor="middle" className="meta">
                pH {r.ph === null ? '—' : num1(r.ph)}{r.oc === null ? '' : ` · OK ${Math.round(r.oc)}`}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="tp-soil-chart-cap">Sütunlar katman başına kum/silt/kil yüzdesi. OK: organik karbon (g/kg).</p>

      {notes.length > 0 && (
        <div className="tp-soil-notes">
          <strong className="tp-soil-notes-head">Toprağın yorumu</strong>
          <ul>
            {notes.map((n) => (
              <li key={n.title} className={`tone-${n.tone}`}>
                <b>{n.title}</b>
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
          <p className="tp-soil-notes-foot">250 m çözünürlüklü model tahminidir; gübre dozu bu yoruma göre değil, laboratuvar toprak analizine göre belirlenir.</p>
        </div>
      )}
    </section>
  );
}

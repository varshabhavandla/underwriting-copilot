export interface Part { key: string; label: string; value: number }

/** A ring chart in plain SVG (no chart library). The ring has circumference 100 so each part's length is its percentage. */
export function Donut({ parts, caption }: { parts: Part[]; caption: string }) {
  const total = parts.reduce((t, p) => t + p.value, 0);
  const R = 15.9155; // circumference 100
  let offset = 25; // start at the top
  return (
    <div className="donut-wrap">
      <svg className="donut" viewBox="0 0 42 42" role="img" aria-label={`${caption}: ${parts.map((p) => `${p.label} ${p.value}`).join(", ")}`}>
        <circle className="donut-track" cx="21" cy="21" r={R} />
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => {
          const pct = (p.value / total) * 100;
          const seg = <circle key={p.key} className={`donut-seg seg-${p.key}`} cx="21" cy="21" r={R} strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={offset} />;
          offset -= pct;
          return seg;
        })}
        <text className="donut-total" x="21" y="22.5">{total}</text>
        <text className="donut-cap" x="21" y="27">{caption}</text>
      </svg>
      <div className="legend">
        {parts.map((p) => (
          <div key={p.key} className="legend-row"><span className={`swatch sw-${p.key}`} />{p.label}<b>{p.value}</b></div>
        ))}
      </div>
    </div>
  );
}

export interface Bar { key: string; label: string; value: number }

/** Horizontal bars scaled to the largest value. */
export function Bars({ items }: { items: Bar[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars">
      {items.map((i) => (
        <div key={i.key} className="bar-row">
          <div className="bar-label"><span>{i.label}</span><b>{i.value}</b></div>
          <div className="bar-track"><div className={`bar-fill bar-${i.key}`} style={{ width: `${(i.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

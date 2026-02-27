// Badge component — renders color-coded severity/state badges
export default function Badge({ label = '', type = 'default' }) {
  const val = (label || '').toString().toLowerCase();

  let cls = 'badge ';
  if (type === 'severity') {
    if (val === 'critical') cls += 'badge-critical';
    else if (val === 'high') cls += 'badge-high';
    else if (val === 'medium') cls += 'badge-medium';
    else cls += 'badge-low';
  } else if (type === 'state') {
    if (val === 'running' || val === 'available') cls += 'badge-success';
    else if (val === 'stopped' || val === 'stopping') cls += 'badge-danger';
    else if (val === 'pending' || val === 'starting') cls += 'badge-warning';
    else cls += 'badge-info';
  } else if (type === 'bool') {
    cls += val === 'true' || label === true ? 'badge-success' : 'badge-low';
  } else {
    cls += 'badge-info';
  }

  return <span className={cls}>{label?.toString()}</span>;
}

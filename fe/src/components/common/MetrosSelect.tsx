import { formatMetros } from '@utils/metros';

interface Props {
  value: number;
  max: number | null | undefined;
  onChange: (value: number) => void;
  className?: string;
  'aria-label'?: string;
}

export function MetrosSelect({ value, max, onChange, ...props }: Props) {
  const pasos = max != null && Number.isFinite(max) ? Math.max(0, Math.floor(max * 2)) : 0;
  const disponible = value > 0 && Number.isInteger(value * 2) && value * 2 <= pasos;
  return <select {...props} value={value} disabled={pasos === 0}
    onChange={(event) => {
      const next = Number(event.target.value);
      if (next > 0 && Number.isInteger(next * 2) && next * 2 <= pasos) onChange(next);
    }}>
    {!disponible && <option value={value} disabled>
      {formatMetros(value)} m — {pasos ? 'elige una medida disponible' : 'sin medidas disponibles'}
    </option>}
    {Array.from({ length: pasos }, (_, index) => {
      const metros = (index + 1) / 2;
      return <option key={metros} value={metros}>{formatMetros(metros)} m</option>;
    })}
  </select>;
}

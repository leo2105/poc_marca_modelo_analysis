import type { RaceDefinition } from '../data/races'

interface RaceSelectProps {
  races: RaceDefinition[]
  value: string
  onChange: (eventId: string) => void
  disabled?: boolean
  className?: string
  id?: string
}

export function RaceSelect({ races, value, onChange, disabled = false, className = '', id = 'race-select' }: RaceSelectProps) {
  return (
    <label className={`race-select ${className}`.trim()} htmlFor={id}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-label="Seleccionar carrera"
        onChange={(event) => onChange(event.target.value)}
      >
        {races.map((item) => (
          <option key={item.eventId} value={item.eventId}>
            {item.eventTitle}
          </option>
        ))}
      </select>
    </label>
  )
}

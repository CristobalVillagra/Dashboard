import type { QuerySortMode } from "@/lib/query-groups"
import { QUERY_SORT_OPTIONS } from "@/lib/query-groups"

export function QuerySortControls({
  value,
  onChange,
}: {
  value: QuerySortMode
  onChange: (mode: QuerySortMode) => void
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-1 rounded-md border border-[#cfd9e5] bg-[#f7f9fc] p-1 text-xs sm:grid-cols-3 sm:text-sm">
      {QUERY_SORT_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded px-2 py-2 font-medium leading-snug transition sm:px-3 ${
            value === option.value ? "bg-white text-[#1f7a5b] shadow-sm" : "text-[#5c6f82]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

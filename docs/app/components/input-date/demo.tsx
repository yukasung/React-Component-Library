'use client'

import { useState } from 'react'
import { InputDate, formatDateValue } from 'react-component-library'

function formatCommitted(value: Date | null) {
  return value === null ? 'null' : formatDateValue(value, 'Y-m-d')
}

export function DefaultDemo() {
  const [value, setValue] = useState<Date | null>(new Date())

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDate format="d/m/Y" value={value} onChange={setValue} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {formatCommitted(value)}
      </p>
    </div>
  )
}

export function ValueDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDate value={value} onChange={setValue} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {formatCommitted(value)}
      </p>
    </div>
  )
}

export function LocaleDemo() {
  const [enValue, setEnValue] = useState<Date | null>(new Date(2026, 6, 22))
  const [thValue, setThValue] = useState<Date | null>(new Date(2026, 6, 22))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-locale-en" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          locale="en" (default)
        </label>
        <InputDate id="demo-locale-en" value={enValue} onChange={setEnValue} />
      </div>
      <div>
        <label htmlFor="demo-locale-th" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          locale="th"
        </label>
        <InputDate id="demo-locale-th" value={thValue} onChange={setThValue} locale="th" />
      </div>
    </div>
  )
}

export function IsRequiredDemo() {
  const [requiredValue, setRequiredValue] = useState<Date | null>(new Date())
  const [optionalValue, setOptionalValue] = useState<Date | null>(null)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-is-required" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isRequired (default)
        </label>
        <InputDate id="demo-is-required" value={requiredValue} onChange={setRequiredValue} />
      </div>
      <div>
        <label htmlFor="demo-is-optional" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isRequired={'{false}'}
        </label>
        <InputDate
          id="demo-is-optional"
          value={optionalValue}
          onChange={setOptionalValue}
          isRequired={false}
          placeholder="วันเกิด (ไม่บังคับ)"
        />
      </div>
    </div>
  )
}

export function MinMaxDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 15))
  const min = new Date(2026, 6, 10)
  const max = new Date(2026, 6, 20)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDate min={min} max={max} value={value} onChange={setValue} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {formatCommitted(value)} — min: {formatCommitted(min)}, max: {formatCommitted(max)}
      </p>
    </div>
  )
}

export function DateRangeDemo() {
  const [start, setStart] = useState<Date | null>(new Date(2026, 6, 10))
  const [end, setEnd] = useState<Date | null>(new Date(2026, 6, 20))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-range-start" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          วันเริ่มต้น (max = วันสิ้นสุด)
        </label>
        <InputDate id="demo-range-start" value={start} onChange={setStart} max={end} isRequired={false} />
      </div>
      <div>
        <label htmlFor="demo-range-end" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          วันสิ้นสุด (min = วันเริ่มต้น)
        </label>
        <InputDate id="demo-range-end" value={end} onChange={setEnd} min={start} isRequired={false} />
      </div>
    </div>
  )
}

const FORMAT_DEMO_ROWS = [
  { format: 'Y-m-d', defaultValue: new Date(2026, 6, 22) },
  { format: 'd/m/Y', defaultValue: new Date(2026, 6, 22) },
  { format: 'm/d/Y', defaultValue: new Date(2026, 6, 22) },
  { format: 'y-m-d', defaultValue: new Date(2026, 6, 22) },
  // day=5/month=7 (both single-digit) so j/n's "no leading zero" behavior is
  // actually visible -- "22" wouldn't show any difference from d's padded
  // "22", unlike the other rows above.
  { format: 'j/n/Y', defaultValue: new Date(2026, 6, 5) },
  { format: 'n/j/Y', defaultValue: new Date(2026, 6, 5) },
] as const

function FormatDemoRow({ format, defaultValue }: { format: string; defaultValue: Date }) {
  const [value, setValue] = useState<Date | null>(defaultValue)

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-400">{format}:</span>
      <InputDate id={`demo-format-${format}`} value={value} onChange={setValue} format={format} className="flex-1" />
    </div>
  )
}

export function FormatDemo() {
  return (
    <div className="not-prose my-6 flex max-w-xs flex-col gap-3">
      {FORMAT_DEMO_ROWS.map(({ format, defaultValue }) => (
        <FormatDemoRow key={format} format={format} defaultValue={defaultValue} />
      ))}
    </div>
  )
}

export function HintDemo() {
  const [value, setValue] = useState<Date | null>(new Date())

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDate value={value} onChange={setValue} hint="รูปแบบ: ปี-เดือน-วัน" />
    </div>
  )
}

export function TextDemo() {
  const [text, setText] = useState('2026-07-22')
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDate value={value} onChange={setValue} text={text} onTextChange={setText} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        ข้อความดิบที่แสดงอยู่ตอนนี้คือ "{text}"
      </p>
    </div>
  )
}

export function HandleWheelDemo() {
  const [offValue, setOffValue] = useState<Date | null>(new Date(2026, 6, 15))
  const [onValue, setOnValue] = useState<Date | null>(new Date(2026, 6, 15))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-wheel-off" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          handleWheel (default)
        </label>
        <InputDate id="demo-wheel-off" value={offValue} onChange={setOffValue} />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          The current value is {formatCommitted(offValue)}
        </p>
      </div>
      <div>
        <label htmlFor="demo-wheel-on" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          handleWheel={'{true}'}
        </label>
        <InputDate id="demo-wheel-on" value={onValue} onChange={setOnValue} handleWheel />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          The current value is {formatCommitted(onValue)}
        </p>
      </div>
    </div>
  )
}

export function IsOpenDemo() {
  const [value, setValue] = useState<Date | null>(new Date())
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="not-prose my-6 max-w-xs">
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          เปิดปฏิทิน
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          ปิดปฏิทิน
        </button>
      </div>
      <InputDate value={value} onChange={setValue} isOpen={isOpen} onOpenChange={setIsOpen} />
    </div>
  )
}

export function CloseOnSelectionDemo() {
  const [closesValue, setClosesValue] = useState<Date | null>(new Date())
  const [staysValue, setStaysValue] = useState<Date | null>(new Date())

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-close-on" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          closeOnSelection (default)
        </label>
        <InputDate id="demo-close-on" value={closesValue} onChange={setClosesValue} />
      </div>
      <div>
        <label htmlFor="demo-close-off" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          closeOnSelection={'{false}'}
        </label>
        <InputDate id="demo-close-off" value={staysValue} onChange={setStaysValue} closeOnSelection={false} />
      </div>
    </div>
  )
}

export function ShowDropdownButtonDemo() {
  const [shownValue, setShownValue] = useState<Date | null>(new Date())
  const [hiddenValue, setHiddenValue] = useState<Date | null>(new Date())

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-dropdown-on" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          showDropdownButton (default)
        </label>
        <InputDate id="demo-dropdown-on" value={shownValue} onChange={setShownValue} />
      </div>
      <div>
        <label htmlFor="demo-dropdown-off" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          showDropdownButton={'{false}'}
        </label>
        <InputDate id="demo-dropdown-off" value={hiddenValue} onChange={setHiddenValue} showDropdownButton={false} />
      </div>
    </div>
  )
}

export function MonthCountDemo() {
  const [value, setValue] = useState<Date | null>(new Date())

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDate value={value} onChange={setValue} monthCount={2} />
    </div>
  )
}

export function ReadOnlyDemo() {
  const [editableValue, setEditableValue] = useState<Date | null>(new Date())
  const [readOnlyValue, setReadOnlyValue] = useState<Date | null>(new Date())

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-editable" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isReadOnly={'{false}'} (default)
        </label>
        <InputDate id="demo-editable" value={editableValue} onChange={setEditableValue} />
      </div>
      <div>
        <label htmlFor="demo-readonly" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isReadOnly={'{true}'}
        </label>
        <InputDate
          id="demo-readonly"
          value={readOnlyValue}
          onChange={setReadOnlyValue}
          isReadOnly
          showDropdownButton={false}
        />
      </div>
    </div>
  )
}

export function DisabledDemo() {
  const [enabledValue, setEnabledValue] = useState<Date | null>(new Date())
  const [disabledValue, setDisabledValue] = useState<Date | null>(new Date())

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-enabled" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isDisabled={'{false}'} (default)
        </label>
        <InputDate id="demo-enabled" value={enabledValue} onChange={setEnabledValue} />
      </div>
      <div>
        <label htmlFor="demo-disabled" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isDisabled={'{true}'}
        </label>
        <InputDate id="demo-disabled" value={disabledValue} onChange={setDisabledValue} isDisabled />
      </div>
    </div>
  )
}

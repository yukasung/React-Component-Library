'use client'

import { useState } from 'react'
import { InputDateTime, formatDateValue } from '@yukasung/react-components'

// Both halves in one fixed form, whatever the field's own format is — the note
// under each demo reports the committed value, not what the field renders.
function formatCommitted(value: Date | null) {
  return value === null ? 'null' : formatDateValue(value, 'Y-m-d H:i')
}

// Module-level so the min/max Dates stay referentially stable across renders.
const NINE_AM = new Date(2026, 0, 1, 9, 0)
const FIVE_PM = new Date(2026, 0, 1, 17, 0)
const JULY_START = new Date(2026, 6, 1, 8, 0)
const JULY_END = new Date(2026, 6, 31, 18, 0)

export function DefaultDemo() {
  const [value, setValue] = useState<Date | null>(new Date())

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDateTime value={value} onChange={setValue} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {formatCommitted(value)}
      </p>
    </div>
  )
}

export function ValueDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDateTime value={value} onChange={setValue} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {formatCommitted(value)}
      </p>
    </div>
  )
}

export function LocaleDemo() {
  const [enValue, setEnValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))
  const [thValue, setThValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-dt-locale-en" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          locale="en" (default)
        </label>
        <InputDateTime id="demo-dt-locale-en" value={enValue} onChange={setEnValue} />
      </div>
      <div>
        <label htmlFor="demo-dt-locale-th" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          locale="th"
        </label>
        <InputDateTime id="demo-dt-locale-th" value={thValue} onChange={setThValue} locale="th" />
      </div>
    </div>
  )
}

export function PlaceholderDemo() {
  const [maskValue, setMaskValue] = useState<Date | null>(null)
  const [twelveValue, setTwelveValue] = useState<Date | null>(null)
  const [customValue, setCustomValue] = useState<Date | null>(null)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-3">
      <div>
        <label htmlFor="demo-dt-ph-default" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          ค่าเริ่มต้น (format Y-m-d H:i)
        </label>
        <InputDateTime id="demo-dt-ph-default" value={maskValue} onChange={setMaskValue} isRequired={false} />
      </div>
      <div>
        <label htmlFor="demo-dt-ph-12h" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          ค่าเริ่มต้น (format d/m/Y h:i K)
        </label>
        <InputDateTime
          id="demo-dt-ph-12h"
          value={twelveValue}
          onChange={setTwelveValue}
          isRequired={false}
          format="d/m/Y h:i K"
        />
      </div>
      <div>
        <label htmlFor="demo-dt-ph-custom" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          กำหนดเอง
        </label>
        <InputDateTime
          id="demo-dt-ph-custom"
          value={customValue}
          onChange={setCustomValue}
          isRequired={false}
          placeholder="เลือกวันและเวลา"
        />
      </div>
    </div>
  )
}

export function IsRequiredDemo() {
  const [requiredValue, setRequiredValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))
  const [optionalValue, setOptionalValue] = useState<Date | null>(null)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-dt-required" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isRequired (default)
        </label>
        <InputDateTime id="demo-dt-required" value={requiredValue} onChange={setRequiredValue} />
      </div>
      <div>
        <label htmlFor="demo-dt-optional" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isRequired={'{false}'}
        </label>
        <InputDateTime id="demo-dt-optional" value={optionalValue} onChange={setOptionalValue} isRequired={false} />
      </div>
    </div>
  )
}

export function MinMaxDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 15, 12, 0))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDateTime value={value} onChange={setValue} min={JULY_START} max={JULY_END} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {formatCommitted(value)} — min: 2026-07-01 08:00, max: 2026-07-31 18:00
      </p>
    </div>
  )
}

export function RangeDemo() {
  const [start, setStart] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))
  const [end, setEnd] = useState<Date | null>(new Date(2026, 6, 22, 17, 0))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-dt-start" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          เริ่ม (max = สิ้นสุด)
        </label>
        <InputDateTime id="demo-dt-start" value={start} onChange={setStart} max={end} isRequired={false} />
      </div>
      <div>
        <label htmlFor="demo-dt-end" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          สิ้นสุด (min = เริ่ม)
        </label>
        <InputDateTime id="demo-dt-end" value={end} onChange={setEnd} min={start} isRequired={false} />
      </div>
    </div>
  )
}

const FORMAT_DEMO_ROWS = ['Y-m-d H:i', 'd/m/Y H:i', 'd/m/Y h:i K', 'j/n/y G:i'] as const

function FormatDemoRow({ format }: { format: string }) {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 14, 30))

  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-400">{format}:</span>
      <InputDateTime
        id={`demo-dt-format-${format}`}
        value={value}
        onChange={setValue}
        format={format}
        className="flex-1"
      />
    </div>
  )
}

export function FormatDemo() {
  return (
    <div className="not-prose my-6 flex max-w-md flex-col gap-3">
      {FORMAT_DEMO_ROWS.map((format) => (
        <FormatDemoRow key={format} format={format} />
      ))}
    </div>
  )
}

const TIME_STEP_DEMO_ROWS = [10, 15, 30, 60] as const

function TimeStepDemoRow({ timeStep }: { timeStep: number }) {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))

  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-400">timeStep={timeStep}:</span>
      <InputDateTime
        id={`demo-dt-step-${timeStep}`}
        value={value}
        onChange={setValue}
        timeStep={timeStep}
        className="flex-1"
      />
    </div>
  )
}

export function TimeStepDemo() {
  return (
    <div className="not-prose my-6 flex max-w-md flex-col gap-3">
      {TIME_STEP_DEMO_ROWS.map((timeStep) => (
        <TimeStepDemoRow key={timeStep} timeStep={timeStep} />
      ))}
    </div>
  )
}

export function NoTimeStepDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 7))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDateTime value={value} onChange={setValue} timeStep={null} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {formatCommitted(value)} — เหลือแต่ปุ่มปฏิทิน, เวลาพิมพ์เอาอย่างเดียว
      </p>
    </div>
  )
}

export function TimeRangeDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDateTime value={value} onChange={setValue} timeMin={NINE_AM} timeMax={FIVE_PM} timeStep={30} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {formatCommitted(value)} — รายการเวลา 09:00-17:00 ทุก 30 นาที
      </p>
    </div>
  )
}

export function TimeFormatDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDateTime value={value} onChange={setValue} timeFormat="h:i K" timeStep={30} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        ช่องแสดงตาม format (24 ชั่วโมง) ส่วนรายการใน dropdown แสดงตาม timeFormat (12 ชั่วโมง)
      </p>
    </div>
  )
}

export function TextDemo() {
  const [text, setText] = useState('2026-07-22 09:30')
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDateTime value={value} onChange={setValue} text={text} onTextChange={setText} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">ข้อความดิบที่แสดงอยู่ตอนนี้คือ "{text}"</p>
    </div>
  )
}

export function HandleWheelDemo() {
  const [plainValue, setPlainValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))
  const [wheelValue, setWheelValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-dt-no-wheel" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          handleWheel={'{false}'} (default)
        </label>
        <InputDateTime id="demo-dt-no-wheel" value={plainValue} onChange={setPlainValue} />
      </div>
      <div>
        <label htmlFor="demo-dt-wheel" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          handleWheel
        </label>
        <InputDateTime id="demo-dt-wheel" value={wheelValue} onChange={setWheelValue} handleWheel />
      </div>
    </div>
  )
}

export function CloseOnSelectionDemo() {
  const [closeValue, setCloseValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))
  const [keepOpenValue, setKeepOpenValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-dt-close" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          closeOnSelection (default)
        </label>
        <InputDateTime id="demo-dt-close" value={closeValue} onChange={setCloseValue} />
      </div>
      <div>
        <label htmlFor="demo-dt-keep-open" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          closeOnSelection={'{false}'}
        </label>
        <InputDateTime
          id="demo-dt-keep-open"
          value={keepOpenValue}
          onChange={setKeepOpenValue}
          closeOnSelection={false}
        />
      </div>
    </div>
  )
}

export function ShowDropdownButtonDemo() {
  const [withButtons, setWithButtons] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))
  const [withoutButtons, setWithoutButtons] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label
          htmlFor="demo-dt-with-buttons"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80"
        >
          showDropdownButton (default)
        </label>
        <InputDateTime id="demo-dt-with-buttons" value={withButtons} onChange={setWithButtons} />
      </div>
      <div>
        <label
          htmlFor="demo-dt-without-buttons"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80"
        >
          showDropdownButton={'{false}'}
        </label>
        <InputDateTime
          id="demo-dt-without-buttons"
          value={withoutButtons}
          onChange={setWithoutButtons}
          showDropdownButton={false}
        />
      </div>
    </div>
  )
}

export function MonthCountDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDateTime value={value} onChange={setValue} monthCount={2} />
    </div>
  )
}

export function MaxDropdownHeightDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputDateTime value={value} onChange={setValue} maxDropdownHeight={120} />
    </div>
  )
}

export function ReadOnlyDemo() {
  const [editableValue, setEditableValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))
  const [readOnlyValue, setReadOnlyValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-dt-normal" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          ปกติ
        </label>
        <InputDateTime id="demo-dt-normal" value={editableValue} onChange={setEditableValue} />
      </div>
      <div>
        <label htmlFor="demo-dt-readonly" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isReadOnly
        </label>
        <InputDateTime
          id="demo-dt-readonly"
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
  const [enabledValue, setEnabledValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))
  const [disabledValue, setDisabledValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-dt-enabled" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          ปกติ
        </label>
        <InputDateTime id="demo-dt-enabled" value={enabledValue} onChange={setEnabledValue} />
      </div>
      <div>
        <label htmlFor="demo-dt-disabled" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isDisabled
        </label>
        <InputDateTime id="demo-dt-disabled" value={disabledValue} onChange={setDisabledValue} isDisabled />
      </div>
    </div>
  )
}

// The context the field actually ships in, and the one that used to be missing
// here: an application overlay that portals into <body> too, so only the layer
// decides which one the user sees. Kept deliberately plain — the library has no
// modal of its own, and the point is the stacking, not the dialog.
export function InModalDemo() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))

  return (
    <div className="not-prose my-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white dark:bg-white dark:text-gray-900"
      >
        เปิด modal
      </button>
      {open ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-gray-900/40 p-4">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900">
            <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">
              modal นี้อยู่ที่ z-index 1000
            </p>
            <InputDateTime value={value} onChange={setValue} />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              The current value is {formatCommitted(value)}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-4 text-sm text-gray-500 underline dark:text-gray-400"
            >
              ปิด
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

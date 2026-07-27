'use client'

import { useState } from 'react'
import { InputTime, formatTimeValue } from 'react-component-library'

// Only the time part of these matters — the date they carry is arbitrary,
// but keeping them at module scope keeps them referentially stable across
// re-renders.
const NINE_AM = new Date(2026, 6, 22, 9, 0)
const FIVE_PM = new Date(2026, 6, 22, 17, 0)

function formatCommitted(value: Date | null) {
  return value === null ? 'null' : formatTimeValue(value, 'H:i')
}

export function DefaultDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputTime value={value} onChange={setValue} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {formatCommitted(value)}
      </p>
    </div>
  )
}

export function ValueDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 14, 30))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputTime value={value} onChange={setValue} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {formatCommitted(value)}
      </p>
    </div>
  )
}

export function DateTimeDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputTime value={value} onChange={setValue} step={30} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        ค่าเต็มของ Date คือ {value === null ? 'null' : value.toString()}
      </p>
    </div>
  )
}

export function IsRequiredDemo() {
  const [requiredValue, setRequiredValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))
  const [optionalValue, setOptionalValue] = useState<Date | null>(null)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-time-required" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isRequired (default)
        </label>
        <InputTime id="demo-time-required" value={requiredValue} onChange={setRequiredValue} />
      </div>
      <div>
        <label htmlFor="demo-time-optional" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isRequired={'{false}'}
        </label>
        <InputTime
          id="demo-time-optional"
          value={optionalValue}
          onChange={setOptionalValue}
          isRequired={false}
          placeholder="เวลานัดหมาย (ไม่บังคับ)"
        />
      </div>
    </div>
  )
}

export function MinMaxDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 12, 0))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputTime min={NINE_AM} max={FIVE_PM} step={30} value={value} onChange={setValue} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {formatCommitted(value)} — min: 09:00, max: 17:00
      </p>
    </div>
  )
}

export function TimeRangeDemo() {
  const [start, setStart] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))
  const [end, setEnd] = useState<Date | null>(new Date(2026, 6, 22, 17, 0))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-time-start" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          เวลาเริ่ม (max = เวลาสิ้นสุด)
        </label>
        <InputTime id="demo-time-start" value={start} onChange={setStart} max={end} step={30} isRequired={false} />
      </div>
      <div>
        <label htmlFor="demo-time-end" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          เวลาสิ้นสุด (min = เวลาเริ่ม)
        </label>
        <InputTime id="demo-time-end" value={end} onChange={setEnd} min={start} step={30} isRequired={false} />
      </div>
    </div>
  )
}

const STEP_DEMO_ROWS = [5, 15, 30, 60] as const

function StepDemoRow({ step }: { step: number }) {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))

  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-400">step={step}:</span>
      <InputTime id={`demo-step-${step}`} value={value} onChange={setValue} step={step} className="flex-1" />
    </div>
  )
}

export function StepDemo() {
  return (
    <div className="not-prose my-6 flex max-w-sm flex-col gap-3">
      {STEP_DEMO_ROWS.map((step) => (
        <StepDemoRow key={step} step={step} />
      ))}
    </div>
  )
}

export function NoStepDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 7))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputTime value={value} onChange={setValue} step={null} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {formatCommitted(value)} — ไม่มี dropdown, พิมพ์ได้อย่างเดียว
      </p>
    </div>
  )
}

const FORMAT_DEMO_ROWS = ['H:i', 'h:i K', 'G:i', 'h.i K'] as const

function FormatDemoRow({ format }: { format: string }) {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 14, 30))

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-400">{format}:</span>
      <InputTime id={`demo-format-${format}`} value={value} onChange={setValue} format={format} className="flex-1" />
    </div>
  )
}

export function FormatDemo() {
  return (
    <div className="not-prose my-6 flex max-w-xs flex-col gap-3">
      {FORMAT_DEMO_ROWS.map((format) => (
        <FormatDemoRow key={format} format={format} />
      ))}
    </div>
  )
}

export function IsEditableDemo() {
  const [editableValue, setEditableValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))
  const [pickOnlyValue, setPickOnlyValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-time-editable" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isEditable (default)
        </label>
        <InputTime id="demo-time-editable" value={editableValue} onChange={setEditableValue} step={30} />
      </div>
      <div>
        <label htmlFor="demo-time-pick-only" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isEditable={'{false}'}
        </label>
        <InputTime
          id="demo-time-pick-only"
          value={pickOnlyValue}
          onChange={setPickOnlyValue}
          isEditable={false}
          step={30}
        />
      </div>
    </div>
  )
}

export function HintDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputTime value={value} onChange={setValue} hint="รูปแบบ: ชั่วโมง:นาที (24 ชั่วโมง)" />
    </div>
  )
}

export function TextDemo() {
  const [text, setText] = useState('09:30')
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 30))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputTime value={value} onChange={setValue} text={text} onTextChange={setText} />
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
        <label htmlFor="demo-time-no-wheel" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          handleWheel={'{false}'} (default)
        </label>
        <InputTime id="demo-time-no-wheel" value={plainValue} onChange={setPlainValue} step={15} />
      </div>
      <div>
        <label htmlFor="demo-time-wheel" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          handleWheel
        </label>
        <InputTime id="demo-time-wheel" value={wheelValue} onChange={setWheelValue} step={15} handleWheel />
      </div>
    </div>
  )
}

export function OnOpenChangeDemo() {
  const [isOpen, setIsOpen] = useState(false)
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputTime value={value} onChange={setValue} onOpenChange={setIsOpen} step={30} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        ตอนนี้รายการเวลา{isOpen ? 'เปิดอยู่' : 'ปิดอยู่'}
      </p>
    </div>
  )
}

export function CloseOnSelectionDemo() {
  const [closingValue, setClosingValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))
  const [stayingValue, setStayingValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-time-closing" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          closeOnSelection (default)
        </label>
        <InputTime id="demo-time-closing" value={closingValue} onChange={setClosingValue} step={30} />
      </div>
      <div>
        <label htmlFor="demo-time-staying" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          closeOnSelection={'{false}'}
        </label>
        <InputTime
          id="demo-time-staying"
          value={stayingValue}
          onChange={setStayingValue}
          step={30}
          closeOnSelection={false}
        />
      </div>
    </div>
  )
}

export function ShowDropdownButtonDemo() {
  const [withButton, setWithButton] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))
  const [withoutButton, setWithoutButton] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-time-with-button" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          showDropdownButton (default)
        </label>
        <InputTime id="demo-time-with-button" value={withButton} onChange={setWithButton} step={30} />
      </div>
      <div>
        <label
          htmlFor="demo-time-without-button"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80"
        >
          showDropdownButton={'{false}'}
        </label>
        <InputTime
          id="demo-time-without-button"
          value={withoutButton}
          onChange={setWithoutButton}
          step={30}
          showDropdownButton={false}
        />
      </div>
    </div>
  )
}

export function MaxDropdownHeightDemo() {
  const [value, setValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputTime value={value} onChange={setValue} step={15} maxDropdownHeight={120} />
    </div>
  )
}

export function ReadOnlyDemo() {
  const [editableValue, setEditableValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))
  const [readOnlyValue, setReadOnlyValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-time-normal" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          ปกติ
        </label>
        <InputTime id="demo-time-normal" value={editableValue} onChange={setEditableValue} />
      </div>
      <div>
        <label htmlFor="demo-time-readonly" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isReadOnly
        </label>
        <InputTime
          id="demo-time-readonly"
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
  const [enabledValue, setEnabledValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))
  const [disabledValue, setDisabledValue] = useState<Date | null>(new Date(2026, 6, 22, 9, 0))

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-time-enabled" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          ปกติ
        </label>
        <InputTime id="demo-time-enabled" value={enabledValue} onChange={setEnabledValue} />
      </div>
      <div>
        <label htmlFor="demo-time-disabled" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isDisabled
        </label>
        <InputTime id="demo-time-disabled" value={disabledValue} onChange={setDisabledValue} isDisabled />
      </div>
    </div>
  )
}

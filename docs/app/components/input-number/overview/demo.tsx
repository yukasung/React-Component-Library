'use client'

import { useRef, useState } from 'react'
import { InputNumber, parseDraft, parseFormattedInput, parseNumericFormat } from 'react-component-library'

function formatCommitted(value: number | null) {
  return value === null ? 'null' : String(value)
}

// InputNumber only fires onChange on commit (blur/Enter/spin/arrow) by
// design (see the "value" section above) — these demos still want to show
// the plain underlying number as the user types, for immediate feedback, so
// they listen to the underlying native <input>'s own "input" event directly
// (passed straight through via InputNumber's ...rest spread) instead of
// relying on onChange. This is a demo-only convenience, not something the
// library itself exposes as a prop.
//
// The "input" event fires with the raw, not-yet-reformatted display text
// (e.g. typing a 3rd decimal digit under a 2-decimal format briefly inserts
// it before the library's own live-reformat trims it back down) — reading
// straight from event.currentTarget.value would flash that intermediate,
// too-long text. Deferring the read to the next animation frame lets
// InputNumber's own reformat (a synchronous state update React already
// flushes before paint) land in the DOM first. The result is then parsed
// back down to a plain number via the same parseFormattedInput/parseDraft
// the library uses internally, so this always shows the bare value (e.g.
// "23423432.32"), never the "$23,423,432.32" decorated display text.
function useLiveText(initialValue: number | null, format?: string) {
  const [liveText, setLiveText] = useState(formatCommitted(initialValue))
  const inputRef = useRef<HTMLInputElement>(null)
  const formatSpec = format ? parseNumericFormat(format) : undefined
  function onInput() {
    requestAnimationFrame(() => {
      if (!inputRef.current) return
      const raw = inputRef.current.value
      const parsed = formatSpec ? parseFormattedInput(raw, formatSpec) : parseDraft(raw)
      // undefined means "not parseable yet" (e.g. a bare "-" or "1." mid-type)
      // — fall back to the raw text so there's still some feedback.
      setLiveText(parsed === undefined ? raw : formatCommitted(parsed))
    })
  }
  return { liveText, inputRef, onInput }
}

export function DefaultDemo() {
  const [value, setValue] = useState<number | null>(10)
  const live = useLiveText(value, 'C2')

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputNumber value={value} onChange={setValue} ref={live.inputRef} onInput={live.onInput} showSpinButtons={false} format="C2" />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {live.liveText}
      </p>
    </div>
  )
}

export function ValueDemo() {
  const [value, setValue] = useState<number | null>(10)
  const [onChangeCount, setOnChangeCount] = useState(0)
  const live = useLiveText(value)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputNumber
        value={value}
        onChange={(next) => {
          setValue(next)
          setOnChangeCount((count) => count + 1)
        }}
        ref={live.inputRef} onInput={live.onInput}
      />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {live.liveText} · onChange ถูกเรียกไปแล้ว {onChangeCount} ครั้ง —
        ลองพิมพ์เลขหลายหลักดูโดยยังไม่กด Enter/blur เลขนี้จะไม่ขยับ
      </p>
    </div>
  )
}

export function PlaceholderDemo() {
  const [value, setValue] = useState<number | null>(null)
  const live = useLiveText(value)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputNumber isRequired={false} value={value} onChange={setValue} ref={live.inputRef} onInput={live.onInput} placeholder="เช่น 100" />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {live.liveText} — ต้องปิด isRequired ก่อนถึงจะเห็น
        placeholder เพราะฟิลด์ต้องว่างจริง ๆ
      </p>
    </div>
  )
}

export function IsRequiredDemo() {
  const [requiredValue, setRequiredValue] = useState<number | null>(null)
  const [optionalValue, setOptionalValue] = useState<number | null>(null)
  const liveRequired = useLiveText(requiredValue)
  const liveOptional = useLiveText(optionalValue)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-is-required" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isRequired (default)
        </label>
        <InputNumber
          id="demo-is-required"
          value={requiredValue}
          onChange={setRequiredValue}
          ref={liveRequired.inputRef} onInput={liveRequired.onInput}
        />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          The current value is {liveRequired.liveText} — ลองลบตัวเลขจนหมดดู
          จะกระโดดกลับเป็น 0 ทันที
        </p>
      </div>
      <div>
        <label htmlFor="demo-is-optional" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isRequired={'{false}'}
        </label>
        <InputNumber
          id="demo-is-optional"
          value={optionalValue}
          onChange={setOptionalValue}
          ref={liveOptional.inputRef} onInput={liveOptional.onInput}
          isRequired={false}
          placeholder="ไม่บังคับกรอก"
        />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          The current value is {liveOptional.liveText} —
          ลบจนหมดแล้วปล่อยว่างได้ตามปกติ
        </p>
      </div>
    </div>
  )
}

export function MinMaxDemo() {
  const [value, setValue] = useState<number | null>(50)
  const live = useLiveText(value)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputNumber min={0} max={100} value={value} onChange={setValue} ref={live.inputRef} onInput={live.onInput} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {live.liveText} — min: 0, max: 100 (ลองกดปุ่ม spin
        ค้างไปจนสุดขอบเขต)
      </p>
    </div>
  )
}

export function StepDemo() {
  const [value, setValue] = useState<number | null>(1)
  const live = useLiveText(value)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputNumber step={0.1} value={value} onChange={setValue} ref={live.inputRef} onInput={live.onInput} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        The current value is {live.liveText} — step: 0.1 (ลองกดปุ่ม spin
        ขึ้นหลาย ๆ ครั้ง ค่าจะไม่เพี้ยนจากปัญหา floating point)
      </p>
    </div>
  )
}

const FORMAT_DEMO_SPECS = ['n0', 'n2', 'c0', 'c2', 'p0', 'p2'] as const

function FormatDemoRow({ format }: { format: (typeof FORMAT_DEMO_SPECS)[number] }) {
  const [value, setValue] = useState<number | null>(0)

  return (
    <div className="flex items-center gap-3">
      <span className="w-8 shrink-0 font-mono text-sm text-gray-600 dark:text-gray-400">{format}:</span>
      <InputNumber
        id={`demo-format-${format}`}
        value={value}
        onChange={setValue}
        format={format}
        showSpinButtons={false}
        className="flex-1"
      />
    </div>
  )
}

export function FormatDemo() {
  return (
    <div className="not-prose my-6 flex max-w-xs flex-col gap-3">
      {FORMAT_DEMO_SPECS.map((format) => (
        <FormatDemoRow key={format} format={format} />
      ))}
    </div>
  )
}

export function ShowSpinButtonsDemo() {
  const [shownValue, setShownValue] = useState<number | null>(10)
  const [hiddenValue, setHiddenValue] = useState<number | null>(10)
  const liveShown = useLiveText(shownValue)
  const liveHidden = useLiveText(hiddenValue)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-spin-shown" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          showSpinButtons (default)
        </label>
        <InputNumber id="demo-spin-shown" value={shownValue} onChange={setShownValue} ref={liveShown.inputRef} onInput={liveShown.onInput} />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          The current value is {liveShown.liveText}
        </p>
      </div>
      <div>
        <label htmlFor="demo-spin-hidden" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          showSpinButtons={'{false}'}
        </label>
        <InputNumber
          id="demo-spin-hidden"
          value={hiddenValue}
          onChange={setHiddenValue}
          ref={liveHidden.inputRef} onInput={liveHidden.onInput}
          showSpinButtons={false}
        />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          The current value is {liveHidden.liveText} — ไม่มีปุ่ม spin แต่
          focus แล้วกดลูกศรขึ้น/ลงยังขยับค่าได้
        </p>
      </div>
    </div>
  )
}

export function ReadOnlyDemo() {
  const [editableValue, setEditableValue] = useState<number | null>(10)
  const [readOnlyValue, setReadOnlyValue] = useState<number | null>(10)
  const liveEditable = useLiveText(editableValue)
  const liveReadOnly = useLiveText(readOnlyValue)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-editable" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isReadOnly={'{false}'} (default)
        </label>
        <InputNumber
          id="demo-editable"
          value={editableValue}
          onChange={setEditableValue}
          ref={liveEditable.inputRef} onInput={liveEditable.onInput}
        />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          The current value is {liveEditable.liveText} — แก้ไขได้ตามปกติ
        </p>
      </div>
      <div>
        <label htmlFor="demo-readonly" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isReadOnly={'{true}'}
        </label>
        <InputNumber
          id="demo-readonly"
          value={readOnlyValue}
          onChange={setReadOnlyValue}
          ref={liveReadOnly.inputRef} onInput={liveReadOnly.onInput}
          isReadOnly
        />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          The current value is {liveReadOnly.liveText} —
          พิมพ์/spin/ลูกศรไม่ได้ แต่ focus และเลือกข้อความได้
        </p>
      </div>
    </div>
  )
}

export function DisabledDemo() {
  const [enabledValue, setEnabledValue] = useState<number | null>(10)
  const [disabledValue, setDisabledValue] = useState<number | null>(10)
  const liveEnabled = useLiveText(enabledValue)
  const liveDisabled = useLiveText(disabledValue)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-enabled" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isDisabled={'{false}'} (default)
        </label>
        <InputNumber id="demo-enabled" value={enabledValue} onChange={setEnabledValue} ref={liveEnabled.inputRef} onInput={liveEnabled.onInput} />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          The current value is {liveEnabled.liveText} — แก้ไขได้ตามปกติ
        </p>
      </div>
      <div>
        <label htmlFor="demo-disabled" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isDisabled={'{true}'}
        </label>
        <InputNumber
          id="demo-disabled"
          value={disabledValue}
          onChange={setDisabledValue}
          ref={liveDisabled.inputRef} onInput={liveDisabled.onInput}
          isDisabled
        />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          The current value is {liveDisabled.liveText} —
          ใช้งานไม่ได้เลย แม้แต่ focus
        </p>
      </div>
    </div>
  )
}

export function RepeatButtonsDemo() {
  const [repeatValue, setRepeatValue] = useState<number | null>(0)
  const [singleValue, setSingleValue] = useState<number | null>(0)
  const liveRepeat = useLiveText(repeatValue)
  const liveSingle = useLiveText(singleValue)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-repeat-on" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          repeatButtons (default)
        </label>
        <InputNumber id="demo-repeat-on" value={repeatValue} onChange={setRepeatValue} ref={liveRepeat.inputRef} onInput={liveRepeat.onInput} />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          The current value is {liveRepeat.liveText} — กดปุ่ม spin ค้างไว้ดู
          จะขยับซ้ำต่อเนื่อง
        </p>
      </div>
      <div>
        <label htmlFor="demo-repeat-off" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          repeatButtons={'{false}'}
        </label>
        <InputNumber
          id="demo-repeat-off"
          value={singleValue}
          onChange={setSingleValue}
          ref={liveSingle.inputRef} onInput={liveSingle.onInput}
          repeatButtons={false}
        />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          The current value is {liveSingle.liveText} — กดค้างไม่มีผล
          ต้องคลิกทีละครั้ง
        </p>
      </div>
    </div>
  )
}

export function HandleWheelDemo() {
  const [offValue, setOffValue] = useState<number | null>(5)
  const [onValue, setOnValue] = useState<number | null>(5)
  const liveOff = useLiveText(offValue)
  const liveOn = useLiveText(onValue)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-wheel-off" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          handleWheel (default)
        </label>
        <InputNumber id="demo-wheel-off" value={offValue} onChange={setOffValue} ref={liveOff.inputRef} onInput={liveOff.onInput} />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          The current value is {liveOff.liveText} — focus แล้วเลื่อนล้อเมาส์ไม่มีผล
        </p>
      </div>
      <div>
        <label htmlFor="demo-wheel-on" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          handleWheel={'{true}'}
        </label>
        <InputNumber id="demo-wheel-on" value={onValue} onChange={setOnValue} ref={liveOn.inputRef} onInput={liveOn.onInput} handleWheel />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          The current value is {liveOn.liveText} — focus ก่อน แล้วเลื่อนล้อเมาส์เพื่อขยับค่า
        </p>
      </div>
    </div>
  )
}

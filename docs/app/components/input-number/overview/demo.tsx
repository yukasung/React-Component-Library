'use client'

import { useState } from 'react'
import { InputNumber } from 'react-component-library'

function formatCommitted(value: number | null) {
  return value === null ? 'null' : String(value)
}

export function DefaultDemo() {
  const [value, setValue] = useState<number | null>(10)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputNumber value={value} onChange={setValue} showSpinButtons={false} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        Committed value: {formatCommitted(value)}
      </p>
    </div>
  )
}

export function ValueDemo() {
  const [value, setValue] = useState<number | null>(10)
  const [onChangeCount, setOnChangeCount] = useState(0)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputNumber
        value={value}
        onChange={(next) => {
          setValue(next)
          setOnChangeCount((count) => count + 1)
        }}
      />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        value: {formatCommitted(value)} · onChange ถูกเรียกไปแล้ว {onChangeCount} ครั้ง — ลองพิมพ์เลขหลายหลักดูโดยยังไม่กด Enter/blur เลขนี้จะไม่ขยับ
      </p>
    </div>
  )
}

export function PlaceholderDemo() {
  const [value, setValue] = useState<number | null>(null)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputNumber isRequired={false} value={value} onChange={setValue} placeholder="เช่น 100" />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        Committed value: {formatCommitted(value)} — ต้องปิด isRequired ก่อนถึงจะเห็น placeholder เพราะฟิลด์ต้องว่างจริง ๆ
      </p>
    </div>
  )
}

export function IsRequiredDemo() {
  const [requiredValue, setRequiredValue] = useState<number | null>(null)
  const [optionalValue, setOptionalValue] = useState<number | null>(null)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-is-required" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isRequired (default)
        </label>
        <InputNumber id="demo-is-required" value={requiredValue} onChange={setRequiredValue} />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Committed value: {formatCommitted(requiredValue)} — ลองลบตัวเลขจนหมดดู จะกระโดดกลับเป็น 0 ทันที
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
          isRequired={false}
          placeholder="ไม่บังคับกรอก"
        />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Committed value: {formatCommitted(optionalValue)} — ลบจนหมดแล้วปล่อยว่างได้ตามปกติ
        </p>
      </div>
    </div>
  )
}

export function MinMaxDemo() {
  const [value, setValue] = useState<number | null>(50)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputNumber min={0} max={100} value={value} onChange={setValue} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        Committed value: {formatCommitted(value)} — min: 0, max: 100 (ลองกดปุ่ม spin ค้างไปจนสุดขอบเขต)
      </p>
    </div>
  )
}

export function StepDemo() {
  const [value, setValue] = useState<number | null>(1)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputNumber step={0.1} value={value} onChange={setValue} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        Committed value: {formatCommitted(value)} — step: 0.1 (ลองกดปุ่ม spin ขึ้นหลาย ๆ ครั้ง ค่าจะไม่เพี้ยนจากปัญหา floating point)
      </p>
    </div>
  )
}

export function ShowSpinButtonsDemo() {
  const [shownValue, setShownValue] = useState<number | null>(10)
  const [hiddenValue, setHiddenValue] = useState<number | null>(10)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-spin-shown" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          showSpinButtons (default)
        </label>
        <InputNumber id="demo-spin-shown" value={shownValue} onChange={setShownValue} />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Committed value: {formatCommitted(shownValue)}
        </p>
      </div>
      <div>
        <label htmlFor="demo-spin-hidden" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          showSpinButtons={'{false}'}
        </label>
        <InputNumber id="demo-spin-hidden" value={hiddenValue} onChange={setHiddenValue} showSpinButtons={false} />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Committed value: {formatCommitted(hiddenValue)} — ไม่มีปุ่ม spin แต่ focus แล้วกดลูกศรขึ้น/ลงยังขยับค่าได้
        </p>
      </div>
    </div>
  )
}

export function ReadOnlyDemo() {
  const [editableValue, setEditableValue] = useState<number | null>(10)
  const [readOnlyValue, setReadOnlyValue] = useState<number | null>(10)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-editable" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isReadOnly={'{false}'} (default)
        </label>
        <InputNumber id="demo-editable" value={editableValue} onChange={setEditableValue} />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Committed value: {formatCommitted(editableValue)} — แก้ไขได้ตามปกติ
        </p>
      </div>
      <div>
        <label htmlFor="demo-readonly" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isReadOnly={'{true}'}
        </label>
        <InputNumber id="demo-readonly" value={readOnlyValue} onChange={setReadOnlyValue} isReadOnly />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Committed value: {formatCommitted(readOnlyValue)} — พิมพ์/spin/ลูกศรไม่ได้ แต่ focus และเลือกข้อความได้
        </p>
      </div>
    </div>
  )
}

export function DisabledDemo() {
  const [enabledValue, setEnabledValue] = useState<number | null>(10)
  const [disabledValue, setDisabledValue] = useState<number | null>(10)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-enabled" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isDisabled={'{false}'} (default)
        </label>
        <InputNumber id="demo-enabled" value={enabledValue} onChange={setEnabledValue} />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Committed value: {formatCommitted(enabledValue)} — แก้ไขได้ตามปกติ
        </p>
      </div>
      <div>
        <label htmlFor="demo-disabled" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          isDisabled={'{true}'}
        </label>
        <InputNumber id="demo-disabled" value={disabledValue} onChange={setDisabledValue} isDisabled />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Committed value: {formatCommitted(disabledValue)} — ใช้งานไม่ได้เลย แม้แต่ focus
        </p>
      </div>
    </div>
  )
}

export function RepeatButtonsDemo() {
  const [repeatValue, setRepeatValue] = useState<number | null>(0)
  const [singleValue, setSingleValue] = useState<number | null>(0)

  return (
    <div className="not-prose my-6 grid gap-6 sm:grid-cols-2">
      <div>
        <label htmlFor="demo-repeat-on" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          repeatButtons (default)
        </label>
        <InputNumber id="demo-repeat-on" value={repeatValue} onChange={setRepeatValue} />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Committed value: {formatCommitted(repeatValue)} — กดปุ่ม spin ค้างไว้ดู จะขยับซ้ำต่อเนื่อง
        </p>
      </div>
      <div>
        <label htmlFor="demo-repeat-off" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-white/80">
          repeatButtons={'{false}'}
        </label>
        <InputNumber id="demo-repeat-off" value={singleValue} onChange={setSingleValue} repeatButtons={false} />
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Committed value: {formatCommitted(singleValue)} — กดค้างไม่มีผล ต้องคลิกทีละครั้ง
        </p>
      </div>
    </div>
  )
}

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
      <InputNumber value={value} onChange={setValue} />
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        Committed value: {formatCommitted(value)}
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

'use client'

import { useState } from 'react'
import { InputTag } from '@yukasung/react-components'

const options = ['สำคัญ', 'เร่งด่วน', 'ติดตาม', 'เอกสารครบ']

export function DefaultDemo() {
  const [value, setValue] = useState<readonly string[]>(['สำคัญ', 'ติดตาม'])

  return (
    <div className="not-prose my-6 max-w-sm">
      <InputTag
        ariaLabel="แท็ก"
        options={options}
        value={value}
        onChange={setValue}
        placeholder="เลือกแท็ก"
        removeLabel={(tag) => `ลบแท็ก ${tag}`}
      />
    </div>
  )
}

export function CustomTagDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <div className="not-prose my-6 max-w-sm">
      <InputTag
        ariaLabel="แท็กกิจกรรม"
        options={options}
        value={value}
        onChange={setValue}
        placeholder="เลือกหรือเพิ่มแท็ก"
        removeLabel={(tag) => `ลบแท็ก ${tag}`}
        addCustomTag={{
          ariaLabel: 'เพิ่มแท็กใหม่',
          placeholder: 'พิมพ์แท็กแล้วกด Enter',
        }}
      />
    </div>
  )
}

export function DisabledDemo() {
  return (
    <div className="not-prose my-6 max-w-sm">
      <InputTag
        ariaLabel="แท็ก"
        options={options}
        defaultValue={['สำคัญ']}
        isDisabled
        removeLabel={(tag) => `ลบแท็ก ${tag}`}
      />
    </div>
  )
}

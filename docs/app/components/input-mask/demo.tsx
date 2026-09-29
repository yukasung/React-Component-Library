'use client'

import { useState } from 'react'
import { InputMask } from '@yukasung/react-components'

// The raw value with its blanks made visible. An optional position left
// empty contributes a space, and a note explaining that a space survives
// into the value cannot do it with an invisible character.
function shown(value: string | null) {
  return value === null ? 'null' : `"${value.replace(/ /g, '␣')}"`
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{children}</p>
}

export function DefaultDemo() {
  const [value, setValue] = useState<string | null>(null)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputMask mask="000-000-0000" value={value} onChange={setValue} isRequired={false} />
      <Note>ค่าที่ commit คือ {shown(value)}</Note>
    </div>
  )
}

export function MaskDemo() {
  const [taxId, setTaxId] = useState<string | null>(null)
  const [postcode, setPostcode] = useState<string | null>(null)

  return (
    <div className="not-prose my-6 flex max-w-xs flex-col gap-4">
      <div>
        <InputMask mask="0-0000-00000-00-0" value={taxId} onChange={setTaxId} isRequired={false} />
        <Note>เลขประจำตัวผู้เสียภาษี — {shown(taxId)}</Note>
      </div>
      <div>
        <InputMask mask="00000" value={postcode} onChange={setPostcode} isRequired={false} />
        <Note>รหัสไปรษณีย์ — {shown(postcode)}</Note>
      </div>
    </div>
  )
}

export function ValueDemo() {
  const [value, setValue] = useState<string | null>('0812345678')

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputMask mask="000-000-0000" value={value} onChange={setValue} isRequired={false} />
      <Note>ค่าที่ commit คือ {shown(value)} — ไม่มีขีดคั่นอยู่ในค่า</Note>
    </div>
  )
}

export function OptionalDemo() {
  const [value, setValue] = useState<string | null>('02 5551234')

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputMask mask="(999) 000-0000" value={value} onChange={setValue} isRequired={false} />
      <Note>
        ค่าที่ commit คือ {shown(value)} — ลบรหัสพื้นที่ออกแล้วดูช่องว่างที่ยังอยู่ในค่า
      </Note>
    </div>
  )
}

export function LetterDemo() {
  const [plate, setPlate] = useState<string | null>(null)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputMask mask=">LL 0000" value={plate} onChange={setPlate} isRequired={false} />
      <Note>พิมพ์ตัวพิมพ์เล็กได้ จะถูกแปลงเป็นตัวพิมพ์ใหญ่ให้ — {shown(plate)}</Note>
    </div>
  )
}

export function ThaiDemo() {
  const [value, setValue] = useState<string | null>(null)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputMask mask="LLLL" value={value} onChange={setValue} isRequired={false} />
      <Note>สระและวรรณยุกต์เกาะไปกับพยัญชนะตัวหน้า — {shown(value)}</Note>
    </div>
  )
}

export function PromptCharDemo() {
  const [value, setValue] = useState<string | null>(null)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputMask mask="00/00" promptChar="•" value={value} onChange={setValue} isRequired={false} />
      <Note>ค่าที่ commit คือ {shown(value)}</Note>
    </div>
  )
}

export function PlaceholderDemo() {
  const [value, setValue] = useState<string | null>(null)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputMask
        mask="000-000-0000"
        placeholder="กรอกเบอร์โทรศัพท์"
        value={value}
        onChange={setValue}
        isRequired={false}
      />
      <Note>ค่าที่ commit คือ {shown(value)}</Note>
    </div>
  )
}

export function OverwriteModeDemo() {
  const [inserted, setInserted] = useState<string | null>('123456')
  const [overwritten, setOverwritten] = useState<string | null>('123456')

  return (
    <div className="not-prose my-6 flex max-w-xs flex-col gap-4">
      <div>
        <InputMask mask="000-000" value={inserted} onChange={setInserted} isRequired={false} />
        <Note>ค่าเริ่มต้น — แทรกแล้วดันตัวที่เหลือไปทางขวา</Note>
      </div>
      <div>
        <InputMask
          mask="000-000"
          overwriteMode
          value={overwritten}
          onChange={setOverwritten}
          isRequired={false}
        />
        <Note>overwriteMode — เขียนทับตัวที่ caret อยู่</Note>
      </div>
    </div>
  )
}

export function TextDemo() {
  const [value, setValue] = useState<string | null>('0812345678')
  const [text, setText] = useState('')

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputMask
        mask="000-000-0000"
        value={value}
        onChange={setValue}
        onTextChange={setText}
        isRequired={false}
      />
      <Note>
        ข้อความที่แสดง <code>{text || '—'}</code> · ค่าที่ commit {shown(value)}
      </Note>
    </div>
  )
}

export function OnInvalidInputDemo() {
  const [value, setValue] = useState<string | null>(null)
  const [refused, setRefused] = useState<string | null>(null)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputMask
        mask="000-000"
        value={value}
        onChange={setValue}
        onInvalidInput={(info) => setRefused(`${info.reason}${info.input ? ` — "${info.input}"` : ''}`)}
        isRequired={false}
      />
      <Note>ลองพิมพ์ตัวอักษร · ครั้งล่าสุดที่ถูกปฏิเสธ: {refused ?? '—'}</Note>
    </div>
  )
}

export function IsRequiredDemo() {
  const [required, setRequired] = useState<string | null>('123456')
  const [optional, setOptional] = useState<string | null>('123456')

  return (
    <div className="not-prose my-6 flex max-w-xs flex-col gap-4">
      <div>
        <InputMask mask="000-000" value={required} onChange={setRequired} />
        <Note>ค่าเริ่มต้น — ลบให้ว่างแล้วออกจากฟิลด์ ค่าเดิมจะกลับมา</Note>
      </div>
      <div>
        <InputMask mask="000-000" value={optional} onChange={setOptional} isRequired={false} />
        <Note>isRequired={'{false}'} — ลบให้ว่างแล้วออกจากฟิลด์ จะได้ {shown(optional)}</Note>
      </div>
    </div>
  )
}

export function ReadOnlyDemo() {
  return (
    <div className="not-prose my-6 max-w-xs">
      <InputMask mask="000-000-0000" defaultValue="0812345678" isReadOnly />
    </div>
  )
}

export function DisabledDemo() {
  return (
    <div className="not-prose my-6 max-w-xs">
      <InputMask mask="000-000-0000" defaultValue="0812345678" isDisabled />
    </div>
  )
}

export function NoMaskDemo() {
  const [value, setValue] = useState<string | null>(null)

  return (
    <div className="not-prose my-6 max-w-xs">
      <InputMask value={value} onChange={setValue} placeholder="พิมพ์อะไรก็ได้" isRequired={false} />
      <Note>ค่าที่ commit คือ {shown(value)}</Note>
    </div>
  )
}

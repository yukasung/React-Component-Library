'use client'

import { useState } from 'react'
import { MultiSelect } from '@yukasung/react-components'
import type { MultiSelectOption } from '@yukasung/react-components'

const countries: readonly MultiSelectOption[] = [
  { value: 'th', label: 'ไทย' },
  { value: 'jp', label: 'ญี่ปุ่น' },
  { value: 'sg', label: 'สิงคโปร์' },
  { value: 'vn', label: 'เวียดนาม' },
  { value: 'kh', label: 'กัมพูชา' },
  { value: 'la', label: 'ลาว' },
  { value: 'mm', label: 'เมียนมา' },
  { value: 'my', label: 'มาเลเซีย' },
]

const departments: readonly MultiSelectOption[] = [
  { value: 'litigation', label: 'คดีความ' },
  { value: 'corporate', label: 'กฎหมายธุรกิจ' },
  { value: 'ip', label: 'ทรัพย์สินทางปัญญา' },
  { value: 'tax', label: 'ภาษี' },
]

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{children}</p>
}

// The committed value, shown as an array so the gap between it and the header
// text is visible — the array is what a form submits.
function shown(value: readonly string[]) {
  return `[${value.join(', ')}]`
}

function Demo({
  children,
  note,
}: {
  children: React.ReactNode
  note?: React.ReactNode
}) {
  return (
    <div className="not-prose my-6 max-w-xs">
      {children}
      {note ? <Note>{note}</Note> : null}
    </div>
  )
}

export function DefaultDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <Demo note={<>ค่าที่ commit คือ {shown(value)}</>}>
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={setValue}
        placeholder="เลือกประเทศ"
      />
    </Demo>
  )
}

export function OptionsDemo() {
  const [value, setValue] = useState<readonly string[]>(['litigation'])

  return (
    <Demo note={<>label ที่แสดงคือ &quot;คดีความ&quot; แต่ค่าที่ commit คือ {shown(value)}</>}>
      <MultiSelect
        aria-label="แผนก"
        options={departments}
        value={value}
        onChange={setValue}
        placeholder="เลือกแผนก"
      />
    </Demo>
  )
}

export function ValueDemo() {
  const [value, setValue] = useState<readonly string[]>(['jp', 'th'])

  return (
    <Demo note={<>ส่งเข้าไปตามลำดับ jp, th แต่ค่าที่ commit เรียงตาม options คือ {shown(value)}</>}>
      <MultiSelect aria-label="ประเทศ" options={countries} value={value} onChange={setValue} />
    </Demo>
  )
}

export function DefaultValueDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <Demo note={<>ค่าที่ commit คือ {shown(value)}</>}>
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        defaultValue={['sg']}
        onChange={setValue}
      />
    </Demo>
  )
}

export function OnChangeDemo() {
  const [log, setLog] = useState<string[]>([])
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <Demo note={<>onChange ทำงาน {log.length} ครั้ง — ครั้งละหนึ่งการติ๊ก</>}>
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={(next) => {
          setValue(next)
          setLog((entries) => [...entries, shown(next)])
        }}
        placeholder="เลือกประเทศ"
      />
    </Demo>
  )
}

export function PlaceholderDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <Demo note="placeholder แสดงเมื่อยังไม่ได้เลือกอะไร">
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={setValue}
        placeholder="ยังไม่ได้เลือกประเทศ"
      />
    </Demo>
  )
}

export function HeaderFormatDemo() {
  const [value, setValue] = useState<readonly string[]>(['th', 'jp', 'sg'])

  return (
    <Demo note={<>ค่าที่ commit คือ {shown(value)}</>}>
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={setValue}
        headerFormat="เลือกไว้ {count} ประเทศ"
      />
    </Demo>
  )
}

export function MaxHeaderItemsDemo() {
  const [value, setValue] = useState<readonly string[]>(['th', 'jp', 'sg'])

  return (
    <Demo note="maxHeaderItems={3} จึงยังไล่ชื่อได้ถึงสามรายการ">
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={setValue}
        maxHeaderItems={3}
        headerFormat="เลือกไว้ {count} ประเทศ"
      />
    </Demo>
  )
}

export function HeaderFormatterDemo() {
  const [value, setValue] = useState<readonly string[]>(['th'])

  return (
    <Demo note={<>ค่าที่ commit คือ {shown(value)}</>}>
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={setValue}
        headerFormatter={(checked) =>
          checked.length === 0 ? 'ยังไม่ได้เลือก' : `${checked.map((item) => item.label).join(' / ')}`
        }
      />
    </Demo>
  )
}

export function ShowFilterInputDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <Demo note={<>ค่าที่ commit คือ {shown(value)}</>}>
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={setValue}
        showFilterInput
        placeholder="ค้นหาประเทศ"
      />
    </Demo>
  )
}

export function FilterInputPlaceholderDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <Demo note="เปิด dropdown แล้วดู placeholder ของช่องค้นหา">
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={setValue}
        showFilterInput
        filterInputPlaceholder="พิมพ์เพื่อค้นหา"
      />
    </Demo>
  )
}

export function CaseSensitiveSearchDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <Demo note="ลองพิมพ์ Thai กับ thai — ตัวพิมพ์ใหญ่เล็กมีผล">
      <MultiSelect
        aria-label="Countries"
        options={[
          { value: 'th', label: 'Thailand' },
          { value: 'tw', label: 'Taiwan' },
          { value: 'jp', label: 'Japan' },
        ]}
        value={value}
        onChange={setValue}
        showFilterInput
        caseSensitiveSearch
      />
    </Demo>
  )
}

export function CustomFilterDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <Demo note="ค้นหาด้วยรหัสประเทศ เช่น th หรือ jp แทนการค้นจาก label">
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={setValue}
        showFilterInput
        filterInputPlaceholder="ค้นหาด้วยรหัส"
        customFilter={(option, text) => option.value.startsWith(text.toLowerCase())}
      />
    </Demo>
  )
}

export function CheckOnFilterDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <Demo note={<>ค่าที่ commit คือ {shown(value)} — พิมพ์ให้แคบลงเรื่อย ๆ แล้วสังเกตว่าติ๊กให้เอง</>}>
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={setValue}
        showFilterInput
        checkOnFilter
        placeholder="ค้นหาประเทศ"
      />
    </Demo>
  )
}

export function ShowSelectAllCheckboxDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <Demo note={<>ค่าที่ commit คือ {shown(value)}</>}>
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={setValue}
        showSelectAllCheckbox
        showFilterInput
        placeholder="เลือกประเทศ"
      />
    </Demo>
  )
}

export function SelectAllLabelDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <Demo note={<>ค่าที่ commit คือ {shown(value)}</>}>
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={setValue}
        showSelectAllCheckbox
        selectAllLabel="เลือกทั้งหมด"
      />
    </Demo>
  )
}

export function ShowDropdownButtonDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <Demo note="ไม่มีปุ่ม dropdown — คลิกที่ field หรือกด ArrowDown เพื่อเปิด">
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={setValue}
        showDropdownButton={false}
        placeholder="เลือกประเทศ"
      />
    </Demo>
  )
}

export function MaxDropdownHeightDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <Demo note="รายการสูงไม่เกิน 120px ส่วนช่องค้นหาและ select all ไม่เลื่อนตาม">
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={setValue}
        showFilterInput
        showSelectAllCheckbox
        maxDropdownHeight={120}
        placeholder="เลือกประเทศ"
      />
    </Demo>
  )
}

export function IsRequiredDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <Demo
      note={
        value.length === 0
          ? 'ยังไม่ได้เลือก — form ต้องตรวจเอง control ไม่บังคับ'
          : `ค่าที่ commit คือ ${shown(value)}`
      }
    >
      <MultiSelect
        aria-label="ประเทศ"
        options={countries}
        value={value}
        onChange={setValue}
        isRequired
        placeholder="ต้องเลือกอย่างน้อยหนึ่งประเทศ"
      />
    </Demo>
  )
}

export function IsReadOnlyDemo() {
  return (
    <Demo note="ยัง focus ได้และยังส่งค่าไปกับ form แต่เปลี่ยนค่าไม่ได้">
      <MultiSelect aria-label="ประเทศ" options={countries} value={['th', 'jp']} isReadOnly />
    </Demo>
  )
}

export function IsDisabledDemo() {
  return (
    <Demo note="ใช้งานไม่ได้ และไม่ถูกส่งไปกับ form">
      <MultiSelect aria-label="ประเทศ" options={countries} value={['th']} isDisabled />
    </Demo>
  )
}

export function NameDemo() {
  const [value, setValue] = useState<readonly string[]>(['th', 'jp'])

  return (
    <Demo
      note={
        <>
          ส่งเป็น hidden input หนึ่งตัวต่อหนึ่งค่า — ไม่ใช่ข้อความสรุปใน field ค่าที่ commit คือ{' '}
          {shown(value)}
        </>
      }
    >
      <MultiSelect
        aria-label="ประเทศ"
        name="countries"
        options={countries}
        value={value}
        onChange={setValue}
      />
    </Demo>
  )
}

export function PortalDemo() {
  const [value, setValue] = useState<readonly string[]>([])

  return (
    <div className="not-prose my-6 max-w-xs">
      <div className="h-24 overflow-y-auto rounded-lg border border-gray-300 p-3 dark:border-gray-700">
        <div className="h-40">
          <MultiSelect
            aria-label="ประเทศ"
            options={countries}
            value={value}
            onChange={setValue}
            showFilterInput
            portal
            placeholder="เลือกประเทศ"
          />
        </div>
      </div>
      <Note>กล่องนี้ overflow อยู่ — portal ทำให้ dropdown ไม่ถูกตัด</Note>
    </div>
  )
}

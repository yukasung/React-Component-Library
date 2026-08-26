import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  InputDate,
  InputDateTime,
  InputNumber,
  InputTag,
  InputTime,
  formatTimeValue,
  parseDraft,
  parseFormattedInput,
  parseNumericFormat,
} from '@yukasung/react-components'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 first:mt-8">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h2>
      <div className="mt-4 flex flex-col gap-6">{children}</div>
    </section>
  )
}

function Field({
  label,
  htmlFor,
  note,
  children,
}: {
  label: string
  htmlFor: string
  note?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="max-w-xs">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
      </label>
      {children}
      {note && <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{note}</p>}
    </div>
  )
}

function formatCommitted(value: number | null) {
  return value === null ? 'null' : String(value)
}

function formatDateCommitted(value: Date | null) {
  return value === null ? 'null' : value.toDateString()
}

// Computed once at module load (not per-render) so the min/max Date objects
// passed to InputDate stay referentially stable across re-renders.
function currentWeekRange(): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  return { start, end }
}
const weekRange = currentWeekRange()

// Same reasoning as weekRange above: module-level so the min/max Dates
// handed to InputTime stay referentially stable across re-renders. Only the
// time-of-day part of these is read, so the date they carry is arbitrary.
const businessHours = { start: new Date(2026, 0, 1, 9, 0), end: new Date(2026, 0, 1, 17, 0) }

// Both halves of the committed value, in one fixed form regardless of the
// field's own `format` — the same reason the time note below fixes on 24-hour.
function formatDateTimeCommitted(value: Date | null) {
  return value === null ? 'null' : `${value.toDateString()} ${formatTimeValue(value, 'H:i')}`
}

// Always shown in 24-hour form, whatever the field's own `format` is — the
// note is reporting the underlying committed value, the same way the Thai
// date field's note reports its underlying Gregorian date.
function formatTimeCommitted(value: Date | null) {
  return value === null ? 'null' : formatTimeValue(value, 'H:i')
}

// InputNumber only fires onChange on commit (blur/Enter/spin/arrow) by
// design — these fields still want to show the plain underlying number as
// the user types, for immediate feedback, so they listen to the underlying
// native <input>'s own "input" event directly (passed straight through via
// InputNumber's ...rest spread) instead of relying on onChange.
//
// The "input" event fires with the raw, not-yet-reformatted display text —
// reading straight from event.currentTarget.value would flash intermediate,
// too-long text under a format. Deferring the read to the next animation
// frame lets InputNumber's own reformat land in the DOM first, then it's
// parsed back down to a plain number via the same parseFormattedInput/
// parseDraft the library uses internally.
function useLiveText(initialValue: number | null, format?: string) {
  const [liveText, setLiveText] = useState(formatCommitted(initialValue))
  const inputRef = useRef<HTMLInputElement>(null)
  const formatSpec = format ? parseNumericFormat(format) : undefined
  // Spin-button clicks and Arrow-key presses commit straight through React
  // state (stepBy -> commit -> onChange) without ever touching the native
  // <input>'s own "input" event — the resync above only covers typing. This
  // catches liveText up to the freshly committed value the moment it
  // changes for any other reason, same "compare during render" pattern the
  // library's own useSyncedState hook uses.
  const previousValue = useRef(initialValue)
  if (previousValue.current !== initialValue) {
    previousValue.current = initialValue
    setLiveText(formatCommitted(initialValue))
  }
  function onInput() {
    requestAnimationFrame(() => {
      if (!inputRef.current) return
      const raw = inputRef.current.value
      const parsed = formatSpec ? parseFormattedInput(raw, formatSpec) : parseDraft(raw)
      setLiveText(parsed === undefined ? raw : formatCommitted(parsed))
    })
  }
  return { liveText, inputRef, onInput }
}

export function App() {
  const [defaultVal, setDefaultVal] = useState<number | null>(0)
  const [quantity, setQuantity] = useState<number | null>(1)
  const [amount, setAmount] = useState<number | null>(null)
  const [optionalQty, setOptionalQty] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(9.5)
  const [wheelQty, setWheelQty] = useState<number | null>(5)
  const [truncatedPrice, setTruncatedPrice] = useState<number | null>(0)
  const [salary, setSalary] = useState<number | null>(1234.5)
  const [discount, setDiscount] = useState<number | null>(null)

  const [defaultDate, setDefaultDate] = useState<Date | null>(new Date())
  const [birthDate, setBirthDate] = useState<Date | null>(null)
  const [weekDate, setWeekDate] = useState<Date | null>(new Date())
  const [wheelDate, setWheelDate] = useState<Date | null>(new Date())
  const [thaiDate, setThaiDate] = useState<Date | null>(new Date())
  const [defaultTime, setDefaultTime] = useState<Date | null>(new Date())
  const [meetingTime, setMeetingTime] = useState<Date | null>(businessHours.start)
  const [alarmTime, setAlarmTime] = useState<Date | null>(new Date(2026, 0, 1, 6, 30))
  const [freeTime, setFreeTime] = useState<Date | null>(null)
  const [defaultDateTime, setDefaultDateTime] = useState<Date | null>(new Date())
  const [appointment, setAppointment] = useState<Date | null>(businessHours.start)
  const [deadline, setDeadline] = useState<Date | null>(new Date())
  const [thaiDateTime, setThaiDateTime] = useState<Date | null>(new Date())
  const [tags, setTags] = useState<readonly string[]>(['Important', 'VIP'])

  const liveDefault = useLiveText(defaultVal)
  const liveQuantity = useLiveText(quantity)
  const liveAmount = useLiveText(amount)
  const liveOptionalQty = useLiveText(optionalQty)
  const livePrice = useLiveText(price)
  const liveTruncatedPrice = useLiveText(truncatedPrice)
  const liveSalary = useLiveText(salary, 'C2')
  const liveDiscount = useLiveText(discount, 'p0')
  const liveWheelQty = useLiveText(wheelQty)

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
        React Component Library
      </h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Demo/Playground — components are added here as each is implemented.
        (Grid still to come.)
      </p>

      <Section title="Default">
        <Field
          label="Default InputNumber (required by default — try clearing it)"
          htmlFor="default-input-number"
          note={`The current value is ${liveDefault.liveText} (clearing the field snaps to 0 immediately, not just on blur)`}
        >
          <InputNumber
            id="default-input-number"
            value={51000}
            onChange={setDefaultVal}
            format="n2"
            step={1}
            ref={liveDefault.inputRef}
            onInput={liveDefault.onInput}
          />
        </Field>
      </Section>

      <Section title="Basic">
        <Field
          label="Quantity"
          htmlFor="quantity"
          note={`The current value is ${liveQuantity.liveText} (min 0, max 10)`}
        >
          <InputNumber
            id="quantity"
            value={quantity}
            onChange={setQuantity}
            ref={liveQuantity.inputRef}
            onInput={liveQuantity.onInput}
            min={0}
            max={10}
            step={1}
          />
        </Field>

        <Field
          label="Amount (placeholder)"
          htmlFor="amount"
          note={`The current value is ${liveAmount.liveText}`}
        >
          <InputNumber
            id="amount"
            value={amount}
            onChange={setAmount}
            ref={liveAmount.inputRef}
            onInput={liveAmount.onInput}
            isRequired={false}
            placeholder="e.g. 100"
            step={1}
          />
        </Field>
      </Section>

      <Section title="States">
        <Field label="Quantity (disabled)" htmlFor="quantity-disabled">
          <InputNumber id="quantity-disabled" value={5} onChange={() => {}} step={1} isDisabled />
        </Field>

        <Field label="Quantity (read-only)" htmlFor="quantity-readonly">
          <InputNumber id="quantity-readonly" value={5} onChange={() => {}} step={1} isReadOnly />
        </Field>

        <Field
          label="Quantity (isRequired={false} — can be left empty)"
          htmlFor="quantity-optional"
          note={`The current value is ${liveOptionalQty.liveText}`}
        >
          <InputNumber
            id="quantity-optional"
            value={optionalQty}
            onChange={setOptionalQty}
            ref={liveOptionalQty.inputRef}
            onInput={liveOptionalQty.onInput}
            isRequired={false}
            placeholder="Your age (optional)"
            step={1}
          />
        </Field>
      </Section>

      <Section title="Formatting">
        <Field
          label="Price (step 0.1, precision 2)"
          htmlFor="price"
          note={`The current value is ${livePrice.liveText}`}
        >
          <InputNumber
            id="price"
            value={price}
            onChange={setPrice}
            ref={livePrice.inputRef}
            onInput={livePrice.onInput}
            step={0.01}
          />
        </Field>

        <Field
          label="Price (truncate — type 2.999 with step 0.1)"
          htmlFor="truncated-price"
          note={`The current value is ${liveTruncatedPrice.liveText} (2.999 should become 2.9, not 3.0)`}
        >
          <InputNumber
            id="truncated-price"
            value={truncatedPrice}
            onChange={setTruncatedPrice}
            ref={liveTruncatedPrice.inputRef}
            onInput={liveTruncatedPrice.onInput}
            step={0.1}
            truncate
          />
        </Field>

        <Field
          label={'Salary (format="C2")'}
          htmlFor="salary"
          note={`The current value is ${liveSalary.liveText}`}
        >
          <InputNumber
            id="salary"
            value={salary}
            onChange={setSalary}
            ref={liveSalary.inputRef}
            onInput={liveSalary.onInput}
            format="C2"
            step={1}
          />
        </Field>

        <Field
          label={'Discount (format="p0")'}
          htmlFor="discount"
          note={`The current value is ${liveDiscount.liveText}`}
        >
          <InputNumber
            id="discount"
            value={discount}
            onChange={setDiscount}
            ref={liveDiscount.inputRef}
            onInput={liveDiscount.onInput}
            isRequired={false}
            format="p0"
            step={0.01}
          />
        </Field>
      </Section>

      <Section title="Interaction">
        <Field
          label="Quantity (handleWheel — focus, then scroll)"
          htmlFor="wheel-qty"
          note={`The current value is ${liveWheelQty.liveText}`}
        >
          <InputNumber
            id="wheel-qty"
            value={wheelQty}
            onChange={setWheelQty}
            ref={liveWheelQty.inputRef}
            onInput={liveWheelQty.onInput}
            step={1}
            handleWheel
          />
        </Field>
      </Section>

      <Section title="InputDate">
        <Field
          label="Default InputDate (required by default)"
          htmlFor="default-input-date"
          note={`The current value is ${formatDateCommitted(defaultDate)}`}
        >
          <InputDate id="default-input-date" value={defaultDate} onChange={setDefaultDate} />
        </Field>

        <Field
          label="Birth date (isRequired={false} — optional)"
          htmlFor="birth-date"
          note={`The current value is ${formatDateCommitted(birthDate)}`}
        >
          <InputDate
            id="birth-date"
            value={birthDate}
            onChange={setBirthDate}
            isRequired={false}
            placeholder="Your birth date (optional)"
          />
        </Field>

        <Field label="Fixed date (read-only, no dropdown button)" htmlFor="date-readonly">
          <InputDate
            id="date-readonly"
            value={new Date(2026, 0, 1)}
            onChange={() => {}}
            isReadOnly
            showDropdownButton={false}
          />
        </Field>

        <Field label="Fixed date (disabled)" htmlFor="date-disabled">
          <InputDate id="date-disabled" value={new Date(2026, 0, 1)} onChange={() => {}} isDisabled />
        </Field>

        <Field
          label="This week only (min/max)"
          htmlFor="week-date"
          note={`The current value is ${formatDateCommitted(weekDate)} — restricted to ${weekRange.start.toDateString()} through ${weekRange.end.toDateString()}`}
        >
          <InputDate id="week-date" value={weekDate} onChange={setWeekDate} min={weekRange.start} max={weekRange.end} />
        </Field>

        <Field
          label="Date (handleWheel — focus, then scroll)"
          htmlFor="wheel-date"
          note={`The current value is ${formatDateCommitted(wheelDate)}`}
        >
          <InputDate id="wheel-date" value={wheelDate} onChange={setWheelDate} handleWheel />
        </Field>

        <Field
          label={'Thai locale (locale="th") — Thai month/weekday names, พ.ศ. years'}
          htmlFor="thai-date"
          note={`The underlying (Gregorian) value is ${formatDateCommitted(thaiDate)} — the field itself, calendar popup, and its year spinner all display พ.ศ.`}
        >
          <InputDate id="thai-date" value={thaiDate} onChange={setThaiDate} locale="th" />
        </Field>
      </Section>

      <Section title="InputTime">
        <Field
          label="Default InputTime (24-hour, 15-minute steps)"
          htmlFor="default-input-time"
          note={`The current value is ${formatTimeCommitted(defaultTime)}`}
        >
          <InputTime id="default-input-time" value={defaultTime} onChange={setDefaultTime} />
        </Field>

        <Field
          label="Meeting slot (min/max 09:00-17:00, step 30, 12-hour format)"
          htmlFor="meeting-time"
          note={`The current value is ${formatTimeCommitted(meetingTime)}`}
        >
          <InputTime
            id="meeting-time"
            value={meetingTime}
            onChange={setMeetingTime}
            min={businessHours.start}
            max={businessHours.end}
            step={30}
            format="h:i K"
          />
        </Field>

        <Field
          label="Alarm (isEditable={false} — pick from the list only)"
          htmlFor="alarm-time"
          note={`The current value is ${formatTimeCommitted(alarmTime)}`}
        >
          <InputTime
            id="alarm-time"
            value={alarmTime}
            onChange={setAlarmTime}
            isEditable={false}
            step={15}
            maxDropdownHeight={160}
          />
        </Field>

        <Field
          label="Free-form time (step={null} — no dropdown, typing only)"
          htmlFor="free-time"
          note={`The current value is ${formatTimeCommitted(freeTime)}`}
        >
          <InputTime
            id="free-time"
            value={freeTime}
            onChange={setFreeTime}
            step={null}
            isRequired={false}
            placeholder="HH:MM"
          />
        </Field>

        <Field label="Fixed time (read-only)" htmlFor="time-readonly">
          <InputTime id="time-readonly" value={new Date(2026, 0, 1, 8, 0)} onChange={() => {}} isReadOnly />
        </Field>

        <Field label="Fixed time (disabled)" htmlFor="time-disabled">
          <InputTime id="time-disabled" value={new Date(2026, 0, 1, 8, 0)} onChange={() => {}} isDisabled />
        </Field>
      </Section>

      <Section title="InputDateTime">
        <Field
          label="Default InputDateTime (calendar + 15-minute time list)"
          htmlFor="default-input-date-time"
          note={`The current value is ${formatDateTimeCommitted(defaultDateTime)}`}
        >
          <InputDateTime
            id="default-input-date-time"
            value={defaultDateTime}
            onChange={setDefaultDateTime}
          />
        </Field>

        <Field
          label="Appointment (12-hour format, times 09:00-17:00 every 30 min)"
          htmlFor="appointment-date-time"
          note={`The current value is ${formatDateTimeCommitted(appointment)}`}
        >
          <InputDateTime
            id="appointment-date-time"
            value={appointment}
            onChange={setAppointment}
            format="d/m/Y h:i K"
            timeMin={businessHours.start}
            timeMax={businessHours.end}
            timeStep={30}
            timeFormat="h:i K"
          />
        </Field>

        <Field
          label="Deadline (this week only, wheel-steppable — day or time, whichever group you are in)"
          htmlFor="deadline-date-time"
          note={`The current value is ${formatDateTimeCommitted(deadline)}`}
        >
          <InputDateTime
            id="deadline-date-time"
            value={deadline}
            onChange={setDeadline}
            min={weekRange.start}
            max={weekRange.end}
            handleWheel
          />
        </Field>

        <Field
          label="Thai (พ.ศ. + Thai month names)"
          htmlFor="thai-date-time"
          note={`The current value is ${formatDateTimeCommitted(thaiDateTime)}`}
        >
          <InputDateTime
            id="thai-date-time"
            value={thaiDateTime}
            onChange={setThaiDateTime}
            locale="th"
          />
        </Field>

        <Field label="Fixed moment (read-only)" htmlFor="date-time-readonly">
          <InputDateTime
            id="date-time-readonly"
            value={new Date(2026, 0, 1, 8, 0)}
            onChange={() => {}}
            isReadOnly
          />
        </Field>

        <Field label="Fixed moment (disabled)" htmlFor="date-time-disabled">
          <InputDateTime
            id="date-time-disabled"
            value={new Date(2026, 0, 1, 8, 0)}
            onChange={() => {}}
            isDisabled
          />
        </Field>
      </Section>

      <Section title="InputTag">
        <Field
          label="Tags"
          htmlFor="input-tag"
          note={`The current value is ${tags.length > 0 ? tags.join(', ') : 'empty'}`}
        >
          <InputTag
            id="input-tag"
            ariaLabel="Tags"
            options={['Important', 'VIP', 'Monthly']}
            value={tags}
            onChange={setTags}
            placeholder="Select tags"
            removeLabel={(tag) => `Remove ${tag}`}
            addCustomTag={{
              ariaLabel: 'Add a custom tag',
              placeholder: 'Type a tag and press Enter',
            }}
          />
        </Field>
      </Section>
    </div>
  )
}

import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { InputNumber, parseDraft, parseFormattedInput, parseNumericFormat } from 'react-component-library'

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
        (InputDate, Grid still to come.)
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
            hint="Enter a whole number between 0 and 10"
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
          />
        </Field>
      </Section>

      <Section title="States">
        <Field label="Quantity (disabled)" htmlFor="quantity-disabled">
          <InputNumber id="quantity-disabled" value={5} onChange={() => {}} isDisabled />
        </Field>

        <Field label="Quantity (read-only)" htmlFor="quantity-readonly">
          <InputNumber id="quantity-readonly" value={5} onChange={() => {}} isReadOnly />
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
            step={0.1}
            precision={2}
          />
        </Field>

        <Field
          label="Price (truncate — type 2.999, precision 1)"
          htmlFor="truncated-price"
          note={`The current value is ${liveTruncatedPrice.liveText} (2.999 should become 2.9, not 3.0)`}
        >
          <InputNumber
            id="truncated-price"
            value={truncatedPrice}
            onChange={setTruncatedPrice}
            ref={liveTruncatedPrice.inputRef}
            onInput={liveTruncatedPrice.onInput}
            precision={1}
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
            handleWheel
          />
        </Field>
      </Section>
    </div>
  )
}

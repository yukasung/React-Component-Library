import { useState } from 'react'
import type { ReactNode } from 'react'
import { InputNumber } from 'react-component-library'

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

export function App() {
  const [defaultVal, setDefaultVal] = useState<number | null>(0)
  const [quantity, setQuantity] = useState<number | null>(1)
  const [amount, setAmount] = useState<number | null>(null)
  const [optionalQty, setOptionalQty] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(9.5)
  const [wheelQty, setWheelQty] = useState<number | null>(5)
  const [truncatedPrice, setTruncatedPrice] = useState<number | null>(0)

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
          note={`Committed value: ${defaultVal === null ? 'null' : defaultVal} (clearing the field snaps to 0 immediately, not just on blur)`}
        >
          <InputNumber id="default-input-number" value={defaultVal} onChange={setDefaultVal} />
        </Field>
      </Section>

      <Section title="Basic">
        <Field
          label="Quantity"
          htmlFor="quantity"
          note={`Committed value: ${quantity === null ? 'null' : quantity} (min 0, max 10)`}
        >
          <InputNumber
            id="quantity"
            value={quantity}
            onChange={setQuantity}
            min={0}
            max={10}
            hint="Enter a whole number between 0 and 10"
          />
        </Field>

        <Field
          label="Amount (placeholder)"
          htmlFor="amount"
          note={`Committed value: ${amount === null ? 'null' : amount}`}
        >
          <InputNumber
            id="amount"
            value={amount}
            onChange={setAmount}
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
          note={`Committed value: ${optionalQty === null ? 'null' : optionalQty}`}
        >
          <InputNumber
            id="quantity-optional"
            value={optionalQty}
            onChange={setOptionalQty}
            isRequired={false}
            placeholder="Your age (optional)"
          />
        </Field>
      </Section>

      <Section title="Formatting">
        <Field
          label="Price (step 0.1, precision 2)"
          htmlFor="price"
          note={`Committed value: ${price === null ? 'null' : price}`}
        >
          <InputNumber id="price" value={price} onChange={setPrice} step={0.1} precision={2} />
        </Field>

        <Field
          label="Price (truncate — type 2.999, precision 1)"
          htmlFor="truncated-price"
          note={`Committed value: ${truncatedPrice === null ? 'null' : truncatedPrice} (2.999 should become 2.9, not 3.0)`}
        >
          <InputNumber
            id="truncated-price"
            value={truncatedPrice}
            onChange={setTruncatedPrice}
            precision={1}
            truncate
          />
        </Field>
      </Section>

      <Section title="Interaction">
        <Field
          label="Quantity (handleWheel — focus, then scroll)"
          htmlFor="wheel-qty"
          note={`Committed value: ${wheelQty === null ? 'null' : wheelQty}`}
        >
          <InputNumber id="wheel-qty" value={wheelQty} onChange={setWheelQty} handleWheel />
        </Field>
      </Section>
    </div>
  )
}

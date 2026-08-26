import { PropertyIndex as SharedPropertyIndex } from '../_property-index'

export { PropertySignature } from '../_property-index'

const properties = [
  { name: 'value', href: '#value' },
  { name: 'placeholder', href: '#placeholder' },
  { name: 'isRequired', href: '#isrequired' },
  { name: 'min', href: '#min' },
  { name: 'max', href: '#max' },
  { name: 'step', href: '#step' },
  { name: 'showSpinButtons', href: '#showspinbuttons' },
  { name: 'format', href: '#format' },
  { name: 'truncate', href: '#truncate' },
  { name: 'repeatButtons', href: '#repeatbuttons' },
  { name: 'handleWheel', href: '#handlewheel' },
  { name: 'isReadOnly', href: '#isreadonly' },
  { name: 'isDisabled', href: '#isdisabled' },
]

export function PropertyIndex() {
  return <SharedPropertyIndex properties={properties} />
}

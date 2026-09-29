import { PropertyIndex as SharedPropertyIndex } from '../_property-index'

export { PropertySignature } from '../_property-index'

const properties = [
  { name: 'mask', href: '#mask' },
  { name: 'value', href: '#value' },
  { name: 'defaultValue', href: '#defaultvalue' },
  { name: 'onChange', href: '#onchange' },
  { name: 'promptChar', href: '#promptchar' },
  { name: 'placeholder', href: '#placeholder' },
  { name: 'overwriteMode', href: '#overwritemode' },
  { name: 'text', href: '#text' },
  { name: 'onInvalidInput', href: '#oninvalidinput' },
  { name: 'isRequired', href: '#isrequired' },
  { name: 'isReadOnly', href: '#isreadonly' },
  { name: 'isDisabled', href: '#isdisabled' },
]

export function PropertyIndex() {
  return <SharedPropertyIndex properties={properties} />
}

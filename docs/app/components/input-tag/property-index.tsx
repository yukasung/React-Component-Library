import { PropertyIndex as SharedPropertyIndex } from '../_property-index'

export { PropertySignature } from '../_property-index'

const properties = [
  { name: 'name', href: '#name' },
  { name: 'ref', href: '#ref' },
  { name: 'onBlur', href: '#onblur' },
  { name: 'isReadOnly', href: '#isreadonly' },
  { name: 'isRequired', href: '#isrequired' },
  { name: 'Validation ARIA', href: '#validation-aria' },
  { name: 'id', href: '#id' },
  { name: 'ariaLabel', href: '#arialabel' },
  { name: 'options', href: '#options' },
  { name: 'value', href: '#value' },
  { name: 'defaultValue', href: '#defaultvalue' },
  { name: 'onChange', href: '#onchange' },
  { name: 'placeholder', href: '#placeholder' },
  { name: 'isDisabled', href: '#isdisabled' },
  { name: 'portal', href: '#portal' },
  { name: 'className', href: '#classname' },
  { name: 'removeLabel', href: '#removelabel' },
  { name: 'addCustomTag', href: '#addcustomtag' },
]

export function PropertyIndex() {
  return <SharedPropertyIndex properties={properties} />
}

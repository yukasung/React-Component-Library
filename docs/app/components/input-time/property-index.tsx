import { PropertyIndex as SharedPropertyIndex } from '../_property-index'

export { PropertySignature } from '../_property-index'

const properties = [
  { name: 'portal', href: '#portal' },
  { name: 'portalZIndex', href: '#portalzindex' },
  { name: 'value', href: '#value' },
  { name: 'placeholder', href: '#placeholder' },
  { name: 'isRequired', href: '#isrequired' },
  { name: 'min', href: '#min' },
  { name: 'max', href: '#max' },
  { name: 'step', href: '#step' },
  { name: 'format', href: '#format' },
  { name: 'isEditable', href: '#iseditable' },
  { name: 'text', href: '#text' },
  { name: 'handleWheel', href: '#handlewheel' },
  { name: 'showDropdownButton', href: '#showdropdownbutton' },
  { name: 'maxDropdownHeight', href: '#maxdropdownheight' },
  { name: 'isReadOnly', href: '#isreadonly' },
  { name: 'isDisabled', href: '#isdisabled' },
]

export function PropertyIndex() {
  return <SharedPropertyIndex properties={properties} />
}

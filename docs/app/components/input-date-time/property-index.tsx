import { PropertyIndex as SharedPropertyIndex } from '../_property-index'

export { PropertySignature } from '../_property-index'

const properties = [
  { name: 'value', href: '#value' },
  { name: 'locale', href: '#locale' },
  { name: 'placeholder', href: '#placeholder' },
  { name: 'isRequired', href: '#isrequired' },
  { name: 'min', href: '#min' },
  { name: 'max', href: '#max' },
  { name: 'format', href: '#format' },
  { name: 'timeStep', href: '#timestep' },
  { name: 'timeMin', href: '#timemin' },
  { name: 'timeMax', href: '#timemax' },
  { name: 'timeFormat', href: '#timeformat' },
  { name: 'text', href: '#text' },
  { name: 'handleWheel', href: '#handlewheel' },
  { name: 'closeOnSelection', href: '#closeonselection' },
  { name: 'showDropdownButton', href: '#showdropdownbutton' },
  { name: 'monthCount', href: '#monthcount' },
  { name: 'maxDropdownHeight', href: '#maxdropdownheight' },
  { name: 'isReadOnly', href: '#isreadonly' },
  { name: 'isDisabled', href: '#isdisabled' },
]

export function PropertyIndex() {
  return <SharedPropertyIndex properties={properties} />
}

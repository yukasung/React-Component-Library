import { PropertyIndex as SharedPropertyIndex } from '../_property-index'

export { PropertySignature } from '../_property-index'

const properties = [
  { name: 'options', href: '#options' },
  { name: 'value', href: '#value' },
  { name: 'defaultValue', href: '#defaultvalue' },
  { name: 'onChange', href: '#onchange' },
  { name: 'placeholder', href: '#placeholder' },
  { name: 'headerFormat', href: '#headerformat' },
  { name: 'maxHeaderItems', href: '#maxheaderitems' },
  { name: 'headerFormatter', href: '#headerformatter' },
  { name: 'showFilterInput', href: '#showfilterinput' },
  { name: 'filterInputPlaceholder', href: '#filterinputplaceholder' },
  { name: 'caseSensitiveSearch', href: '#casesensitivesearch' },
  { name: 'customFilter', href: '#customfilter' },
  { name: 'checkOnFilter', href: '#checkonfilter' },
  { name: 'showSelectAllCheckbox', href: '#showselectallcheckbox' },
  { name: 'selectAllLabel', href: '#selectalllabel' },
  { name: 'showDropdownButton', href: '#showdropdownbutton' },
  { name: 'maxDropdownHeight', href: '#maxdropdownheight' },
  { name: 'isRequired', href: '#isrequired' },
  { name: 'isReadOnly', href: '#isreadonly' },
  { name: 'isDisabled', href: '#isdisabled' },
  { name: 'name', href: '#name' },
  { name: 'portal', href: '#portal' },
]

export function PropertyIndex() {
  return <SharedPropertyIndex properties={properties} />
}

const properties = [
  { name: 'value', href: '#value' },
  { name: 'locale', href: '#locale' },
  { name: 'isRequired', href: '#isrequired' },
  { name: 'min', href: '#min' },
  { name: 'max', href: '#max' },
  { name: 'format', href: '#format' },
  { name: 'hint', href: '#hint' },
  { name: 'text', href: '#text' },
  { name: 'handleWheel', href: '#handlewheel' },
  { name: 'isOpen', href: '#isopen' },
  { name: 'closeOnSelection', href: '#closeonselection' },
  { name: 'showDropdownButton', href: '#showdropdownbutton' },
  { name: 'monthCount', href: '#monthcount' },
  { name: 'isReadOnly', href: '#isreadonly' },
  { name: 'isDisabled', href: '#isdisabled' },
]

export function PropertySignature({ name, type }: { name: string; type: string }) {
  return (
    <div className="not-prose mt-3 flex items-center gap-2 font-mono text-sm text-gray-800 dark:text-gray-200">
      <span className="h-2 w-2 shrink-0 rounded-full bg-blue-400 dark:bg-blue-500" />
      <span>
        {name}: <em className="text-gray-600 italic dark:text-gray-400">{type}</em>
      </span>
    </div>
  )
}

export function PropertyIndex() {
  return (
    <div className="not-prose grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 md:grid-cols-3">
      {properties.map(({ name, href }) => (
        <a
          key={name}
          href={href}
          className="flex items-center gap-2 text-blue-600 hover:underline dark:text-blue-400"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-blue-400 dark:bg-blue-500" />
          {name}
        </a>
      ))}
    </div>
  )
}

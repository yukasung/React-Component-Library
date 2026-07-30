import {
  MASK_FILLER,
  acceptAmPmChar,
  acceptDigit,
  canFinalizeDigits,
  maskPlaceholderRanges,
  segmentWidth,
} from './inputMask'
import type { FillableSegment, MaskSegment } from './inputMask'

// How `InputTime` is edited: **fixed-width groups**, one per fillable
// segment, each occupying its slot from the start and holding fillers ("--")
// until typed into — a native time input's sub-fields, on a text input.
//
// This exists because the draft-based masker in inputMask.ts structurally
// cannot do it. A draft holds only what's been typed, in order: "09:3" is a
// representable state, "minutes 35, hour still empty" is not, because there's
// nothing to write in the hour's place. So clicking the minutes of an empty
// field and typing there — which a native time input does without ceremony —
// has no draft to land in. Groups that hold their slot have one.
//
// Everything about *which characters a group accepts* is still imported from
// inputMask.ts (`acceptDigit`, `acceptAmPmChar`, `canFinalizeDigits`): the
// rules stay single-sourced, and what differs is only storage and
// positioning, which is exactly the part that can't be shared. `InputDate`
// still uses the masker itself, unchanged — it isn't affected by any of this.
//
// Nothing here knows about hours or minutes: like the masker, every rule it
// applies comes from a segment's `{ width, min, max }`.

export interface TemplateSlot {
  // The digits (or the AM/PM designator) typed into this group so far.
  chars: string
  // Whether the group is finished, either by being filled to its width or by
  // being closed out early at a shorter-but-valid value (an hour "9"). It
  // isn't visible in the rendering — an unfinished "1" and a finished "01"
  // both read "01" — but it decides whether the next digit continues the group
  // or starts it over, and whether the entry can commit at all.
  done: boolean
}

export interface TemplateEntry {
  // One per fillable segment, in order.
  slots: TemplateSlot[]
  // Which slot the user is in. The whole slot is what gets highlighted, so
  // this is a group index, never a character offset.
  active: number
}

function fillableSegments(segments: MaskSegment[]): FillableSegment[] {
  return segments.filter((segment): segment is FillableSegment => segment.type !== 'literal')
}

export function emptyTemplateEntry(segments: MaskSegment[]): TemplateEntry {
  return { slots: fillableSegments(segments).map(() => ({ chars: '', done: false })), active: 0 }
}

// Typed characters sit right-aligned in their group, zero-padded — an hour
// reads "01" the moment "1" is typed, not "1-" waiting for a second digit.
// That's what a native time input does, and it's why `chars` (what was
// typed) is kept separately from the rendering: a group showing "01" may
// still be mid-entry, and typing "4" into it has to produce "14", which is
// only derivable from the digits, never from the padded text.
function renderSlot(segment: FillableSegment, slot: TemplateSlot): string {
  const width = segmentWidth(segment)
  if (slot.chars === '') return MASK_FILLER.repeat(width)
  return slot.chars.padStart(width, '0')
}

// The text the field shows: every group at full width, literals in between.
// Always the same length as maskPlaceholder's output, which is what keeps the
// position table below valid no matter what's been typed.
export function templateText(segments: MaskSegment[], entry: TemplateEntry): string {
  let slotIndex = 0
  return segments
    .map((segment) => {
      if (segment.type === 'literal') return segment.text
      return renderSlot(segment, entry.slots[slotIndex++])
    })
    .join('')
}

export function templateRanges(segments: MaskSegment[]): { start: number; end: number }[] {
  return maskPlaceholderRanges(segments)
}

// Which group an offset belongs to. A separator between two groups resolves
// to the one on its left (the offset is that group's own end), and anything
// past the last group clamps into it — a click never lands "nowhere".
export function templateSlotAt(segments: MaskSegment[], offset: number): number {
  const ranges = templateRanges(segments)
  for (let i = 0; i < ranges.length; i++) {
    if (offset <= ranges[i].end) return i
  }
  return ranges.length - 1
}

function withSlot(entry: TemplateEntry, index: number, slot: TemplateSlot, active: number): TemplateEntry {
  const slots = entry.slots.slice()
  slots[index] = slot
  return { slots, active }
}

// Which groups a character span touches — how a select-all-then-delete, or a
// drag across a separator, is turned back into whole groups.
function coveredSlots(segments: MaskSegment[], start: number, length: number): number[] {
  const end = start + length
  return templateRanges(segments)
    .map((range, index) => ({ range, index }))
    .filter(({ range }) => range.start < end && range.end > start)
    .map(({ index }) => index)
}

function clearSlots(entry: TemplateEntry, indexes: number[]): TemplateEntry {
  const slots = entry.slots.map((slot, index) => (indexes.includes(index) ? { chars: '', done: false } : slot))
  return { slots, active: indexes[0] ?? entry.active }
}

// Whether nothing at all is filled in — what the owning component needs to
// spot a field the user just emptied.
export function isTemplateEmpty(entry: TemplateEntry): boolean {
  return entry.slots.every((slot) => slot.chars === '')
}

// Where the highlight goes once a group is finished: the next group, or
// nowhere left to go, in which case it stays put (a completed last group
// remains highlighted, so one more keystroke retypes it).
function nextActive(entry: TemplateEntry, index: number): number {
  return Math.min(index + 1, entry.slots.length - 1)
}

// What a group being left behind should hold. Finishing it at its own digits
// is the usual answer (an hour "1" settles as "01"), but a group holding only
// a *prefix* — "0", for a group whose lowest value is 1 — has to be cleared
// rather than kept: padding would render it "00", which reads as filled while
// still being unfinished, and would then refuse to commit with nothing on
// screen explaining why. Clearing puts the fillers back, so an unfilled group
// always looks unfilled.
function settleSlot(segment: FillableSegment, slot: TemplateSlot): TemplateSlot {
  if (slot.done || slot.chars === '') return slot
  if (segment.type === 'ampm') return { ...slot, done: true }
  return canFinalizeDigits(segment, slot.chars) ? { chars: slot.chars, done: true } : { chars: '', done: false }
}

// Applies one edit — a keystroke, a Backspace, a paste — expressed the same
// way the masker takes it: the diff between the text on screen before and
// after. 'reject' means the edit can't lead anywhere valid and the entry
// should be left exactly as it is.
//
// Whether a digit continues a group or starts it over is decided by the
// group's own state, not by how the browser reported the edit: a finished
// group starts over ("14", then "5", gives "05"), an unfinished one takes the
// digit as its next ("1", then "4", gives "14"). It can't be read off the
// edit, because the group is highlighted as a whole either way, so every
// keystroke arrives looking like a replacement.
export function templateEdit(
  segments: MaskSegment[],
  entry: TemplateEntry,
  edit: { start: number; removedCount: number; inserted: string },
): TemplateEntry | 'reject' {
  const fillable = fillableSegments(segments)
  const index = templateSlotAt(segments, edit.start)
  const segment = fillable[index]
  if (!segment) return 'reject'

  // Deleting inside a template deletes typed characters, never the fillers
  // or separators holding the shape together: it empties the groups the
  // removal covered and leaves the highlight on the first of them, ready to
  // be retyped.
  if (edit.inserted === '') {
    const covered = coveredSlots(segments, edit.start, edit.removedCount)
    // More than one group only happens for a span (select-all-then-delete,
    // dragging across the separator) — a single Backspace over a highlighted
    // group covers just that one.
    if (covered.length > 1) return clearSlots(entry, covered)
    const slot = entry.slots[index]
    if (slot.chars !== '') return withSlot(entry, index, { chars: '', done: false }, index)
    // Backspacing an already-empty group steps back to the previous one and
    // empties that instead — the only way to walk backwards through a
    // half-filled template with the keyboard alone.
    if (index === 0) return { ...entry, active: 0 }
    return withSlot(entry, index - 1, { chars: '', done: false }, index - 1)
  }

  if (edit.inserted.length > 1) return templateFromRaw(segments, edit.inserted)

  const char = edit.inserted
  const slot = entry.slots[index]
  const existing = slot.done ? '' : slot.chars
  if (segment.type === 'ampm') {
    const outcome = acceptAmPmChar(char)
    if (outcome === 'reject') return 'reject'
    return withSlot(entry, index, { chars: outcome.digits, done: true }, nextActive(entry, index))
  }
  if (/\d/.test(char)) {
    const outcome = acceptDigit(segment, existing, '', char)
    if (outcome === 'reject') return 'reject'
    return withSlot(
      entry,
      index,
      { chars: outcome.digits, done: outcome.done },
      outcome.done ? nextActive(entry, index) : index,
    )
  }
  // Typing the separator means "I'm done with this group": the highlight moves
  // to the next one, ready for digits, and the group being left settles at
  // whatever it holds. It moves even from an empty group — the separator is
  // how you skip a group you don't want to fill yet, so refusing to move
  // would leave the key doing nothing at all.
  const nextLiteral = segments[segments.indexOf(segment) + 1]
  if (nextLiteral?.type === 'literal' && nextLiteral.text.startsWith(char)) {
    return withSlot(entry, index, settleSlot(segment, slot), nextActive(entry, index))
  }
  return 'reject'
}

// Settles the group the highlight is about to leave — an hour left as "1"
// becomes "01" when the user moves to the minutes, instead of staying
// unfinished and sinking the whole entry at commit time (see settleSlot for
// the one case that's cleared instead of finished).
//
// This is where the draft-based masker's ambiguous-digit *timeout* isn't
// needed: there, an unfinished group is invisible, so a pause has to resolve
// it; here the act of leaving the group resolves it — which is also what a
// native time input does.
export function templateFinalizeActive(segments: MaskSegment[], entry: TemplateEntry): TemplateEntry {
  const segment = fillableSegments(segments)[entry.active]
  if (!segment) return entry
  return withSlot(entry, entry.active, settleSlot(segment, entry.slots[entry.active]), entry.active)
}

// Moves the highlight to another group, finishing the one being left.
export function templateMoveTo(segments: MaskSegment[], entry: TemplateEntry, index: number): TemplateEntry {
  const active = Math.min(Math.max(index, 0), entry.slots.length - 1)
  return { ...templateFinalizeActive(segments, entry), active }
}

// Replays raw text (a paste, an autofill) through the slots — the same
// deliberately simple approach rebuildFromRaw takes for the masker: fill each
// group with the consecutive characters it can take, skipping anything in
// between, and leave the rest empty.
export function templateFromRaw(segments: MaskSegment[], raw: string): TemplateEntry {
  const entry = emptyTemplateEntry(segments)
  const fillable = fillableSegments(segments)
  let pos = 0
  let filled = -1
  for (let i = 0; i < fillable.length; i++) {
    const segment = fillable[i]
    if (segment.type === 'ampm') {
      const designator = /[ap]/i.exec(raw.slice(pos))
      if (!designator) break
      const outcome = acceptAmPmChar(designator[0])
      if (outcome === 'reject') break
      entry.slots[i] = { chars: outcome.digits, done: true }
      pos += designator.index + 1
      filled = i
      continue
    }
    while (pos < raw.length && !/\d/.test(raw[pos])) pos++
    let taken = ''
    while (pos < raw.length && taken.length < segment.width && /\d/.test(raw[pos])) {
      taken += raw[pos]
      pos++
    }
    if (taken === '') break
    // A pasted value out of its group's range is dropped rather than
    // silently corrected, exactly as a typed one would be.
    if (!canFinalizeDigits(segment, taken)) break
    entry.slots[i] = { chars: taken, done: true }
    filled = i
  }
  // Land on the group after the last one filled, or on the first when
  // nothing was: a raw string that fills nothing (an empty field) has to start
  // its entry at the leading group, not one past it.
  return { ...entry, active: filled < 0 ? 0 : nextActive(entry, filled) }
}

// The equivalent draft string for a fully filled template — what gets handed
// to the component's ordinary parse/clamp/commit path, so committing a
// template goes through exactly the same steps as committing typed text.
// Null while any group is still unfinished: a half-filled time isn't a time,
// and inventing the missing groups is not this module's call to make.
export function templateToDraft(segments: MaskSegment[], entry: TemplateEntry): string | null {
  let slotIndex = 0
  let draft = ''
  for (const segment of segments) {
    if (segment.type === 'literal') {
      draft += segment.text
      continue
    }
    const slot = entry.slots[slotIndex++]
    if (!slot.done || slot.chars === '') return null
    draft += segment.type === 'ampm' ? slot.chars : slot.chars.padStart(segmentWidth(segment), '0')
  }
  return draft
}

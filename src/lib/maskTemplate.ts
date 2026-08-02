import {
  MASK_FILLER,
  acceptAmPmChar,
  acceptDigit,
  canFinalizeDigits,
  maskPlaceholderRanges,
  segmentWidth,
} from './inputMask'
import type { FillableSegment, MaskSegment } from './inputMask'

// How `InputTime` and `InputDate` are edited: **fixed-width groups**, one per
// fillable segment, each occupying its slot from the start and holding
// fillers ("__") until typed into — a native date/time input's sub-fields, on
// a text input.
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
// positioning, which is exactly the part that can't be shared. The React half
// is deliberately *not* shared: each component keeps its own copy so it stays
// usable on its own, which is why the wiring in InputTime.tsx and
// InputDate.tsx reads alike. `InputDate` keeps the masker as well, for the
// alphabetic formats ("F j, Y") that have no fixed-width shape at all.
//
// Nothing here knows about hours, minutes or months: like the masker, every
// rule it applies comes from a segment's `{ width, min, max }`.

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
  // Whether the highlight arrived at `active` by the previous keystroke
  // filling the group before it, rather than by the user moving it. It only
  // affects the separator key: typing "2026-07-15" in full has to work, and
  // the "-" after "2026" arrives at a month the year already advanced into --
  // so that one is swallowed instead of skipping the month. A separator typed
  // any other time still moves on, which is how an unwanted group is skipped.
  autoAdvanced: boolean
}

function fillableSegments(segments: MaskSegment[]): FillableSegment[] {
  return segments.filter((segment): segment is FillableSegment => segment.type !== 'literal')
}

export function emptyTemplateEntry(segments: MaskSegment[]): TemplateEntry {
  return { slots: fillableSegments(segments).map(() => ({ chars: '', done: false })), active: 0, autoAdvanced: false }
}

// How a group's typed characters fill its width, from the direction its own
// segment declares (MaskSegment.fill, set by the tokenizers).
//
// Right-aligned by default, zero-padded straight away: a minute typed "3" is
// 03, and the zero is honest because it doesn't change the value it spells.
//
// A group read most-significant-first — a year — fills the other way, and
// there the padding character matters. A trailing *zero* would change the
// value rather than spell it (2 is not 2000), and worse, it is
// indistinguishable from a zero the user typed: filling "2" out to "2000"
// makes the next two keystrokes of "2006" look like nothing happened. So an
// unfinished left-filling group keeps fillers to its right — 2___, 20__,
// 200_, 2006 — and only turns them into zeros once the group is finished,
// which is also the form that commits.
function padSlot(segment: FillableSegment, chars: string, done: boolean): string {
  const width = segmentWidth(segment)
  if (segment.type !== 'token' || segment.fill !== 'end') return chars.padStart(width, '0')
  return done ? chars.padEnd(width, '0') : chars + MASK_FILLER.repeat(width - chars.length)
}

// Typed characters fill their group immediately — an hour reads "01" the
// moment "1" is typed, not "1_" waiting for a second digit. That's what a
// native date/time input does, and it's why `chars` (what was typed) is kept
// separately from the rendering: a group showing "01" may still be mid-entry,
// and typing "4" into it has to produce "14", which is only derivable from
// the digits, never from the padded text.
function renderSlot(segment: FillableSegment, slot: TemplateSlot): string {
  if (slot.chars === '') return MASK_FILLER.repeat(segmentWidth(segment))
  return padSlot(segment, slot.chars, slot.done)
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

// The position table, under the name the group editor's callers read in — the
// same function, not a wrapper around it.
export { maskPlaceholderRanges as templateRanges }

// Which group an offset belongs to. A separator between two groups resolves
// to the one on its left (the offset is that group's own end), and anything
// past the last group clamps into it — a click never lands "nowhere".
export function templateSlotAt(segments: MaskSegment[], offset: number): number {
  return slotAt(maskPlaceholderRanges(segments), offset)
}

function slotAt(ranges: { start: number; end: number }[], offset: number): number {
  for (let i = 0; i < ranges.length; i++) {
    if (offset <= ranges[i].end) return i
  }
  return ranges.length - 1
}

// Required rather than defaulted, deliberately: `autoAdvanced` is transient
// state whose correctness depends on every operation that isn't a fill
// clearing it, and a default would make "cleared" the answer nobody had to
// think about. Stating it at each call site is what makes the one place that
// sets it true visible as the exception it is.
function withSlot(
  entry: TemplateEntry,
  index: number,
  slot: TemplateSlot,
  active: number,
  autoAdvanced: boolean,
): TemplateEntry {
  const slots = entry.slots.slice()
  slots[index] = slot
  return { slots, active, autoAdvanced }
}

// Which groups a character span touches — how a select-all-then-delete, or a
// drag across a separator, is turned back into whole groups.
function coveredSlots(ranges: { start: number; end: number }[], start: number, length: number): number[] {
  const end = start + length
  const covered: number[] = []
  for (let i = 0; i < ranges.length; i++) {
    if (ranges[i].start < end && ranges[i].end > start) covered.push(i)
  }
  return covered
}

function clearSlots(entry: TemplateEntry, indexes: number[]): TemplateEntry {
  const slots = entry.slots.map((slot, index) => (indexes.includes(index) ? { chars: '', done: false } : slot))
  return { slots, active: indexes[0] ?? entry.active, autoAdvanced: false }
}

// Whether nothing at all is filled in — what the owning component needs to
// spot a field the user just emptied.
export function isTemplateEmpty(entry: TemplateEntry): boolean {
  return entry.slots.every((slot) => slot.chars === '')
}

// Whether an edit wiped the field rather than clearing one group: a deletion
// that emptied everything *and* spanned more than one group (select-all, then
// delete). The whole rule lives here rather than in the components, which only
// differ in what they snap back to — it is a pure function of the segments,
// the edit and the entry it produced, with nothing React about it.
export function templateWipedByEdit(
  segments: MaskSegment[],
  next: TemplateEntry,
  edit: { start: number; removedCount: number; inserted: string },
): boolean {
  if (edit.inserted !== '' || !isTemplateEmpty(next)) return false
  const ranges = maskPlaceholderRanges(segments)
  const end = edit.start + edit.removedCount
  let covered = 0
  for (const range of ranges) {
    if (range.start < end && range.end > edit.start && ++covered > 1) return true
  }
  return false
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

// Types one character into the group the user is in — the operation the
// keyboard actually performs, taking the group as a group rather than as a
// character span the module would only decode back.
//
// Whether a digit continues the group or starts it over is decided by the
// group's own state, not by anything about the keystroke: a finished group
// starts over ("14", then "5", gives "05"), an unfinished one takes the digit
// as its next ("1", then "4", gives "14"). 'reject' means the character can't
// lead anywhere valid and the entry should be left exactly as it is.
export function templateTypeIntoActive(
  segments: MaskSegment[],
  entry: TemplateEntry,
  char: string,
): TemplateEntry | 'reject' {
  return typeIntoSlot(segments, entry, entry.active, char)
}

// Clears the group the user is in. An already-empty group steps back and
// clears the one before it instead — the only way to walk backwards through a
// half-filled template with the keyboard alone.
export function templateClearActive(entry: TemplateEntry): TemplateEntry {
  return clearSlot(entry, entry.active)
}

// Applies an edit expressed as a character span: the diff between the text on
// screen before and after. Only for the two callers that genuinely hold
// offsets rather than a group — a selection dragged across groups, and the
// change event that carries a paste, an autofill or an IME commit. Typing goes
// through templateTypeIntoActive above, which is the same rules without the
// round trip through character positions.
export function templateEdit(
  segments: MaskSegment[],
  entry: TemplateEntry,
  edit: { start: number; removedCount: number; inserted: string },
): TemplateEntry | 'reject' {
  const ranges = maskPlaceholderRanges(segments)
  const index = slotAt(ranges, edit.start)
  if (index < 0) return 'reject'

  // Deleting inside a template deletes typed characters, never the fillers or
  // separators holding the shape together: it empties the groups the removal
  // covered and leaves the highlight on the first of them.
  if (edit.inserted === '') {
    const covered = coveredSlots(ranges, edit.start, edit.removedCount)
    // More than one group only happens for a span (select-all-then-delete,
    // dragging across a separator).
    return covered.length > 1 ? clearSlots(entry, covered) : clearSlot(entry, index)
  }
  if (edit.inserted.length > 1) return templateFromRaw(segments, edit.inserted)
  return typeIntoSlot(segments, entry, index, edit.inserted)
}

function clearSlot(entry: TemplateEntry, index: number): TemplateEntry {
  if (entry.slots[index]?.chars !== '') return withSlot(entry, index, { chars: '', done: false }, index, false)
  // Nothing to clear before the first group; the flag still goes, because a
  // deletion is never the fill that sets it.
  if (index === 0) return { ...entry, active: 0, autoAdvanced: false }
  return withSlot(entry, index - 1, { chars: '', done: false }, index - 1, false)
}

function typeIntoSlot(
  segments: MaskSegment[],
  entry: TemplateEntry,
  index: number,
  char: string,
): TemplateEntry | 'reject' {
  const segment = fillableSegments(segments)[index]
  const slot = entry.slots[index]
  if (!segment || !slot) return 'reject'

  if (segment.type === 'ampm') {
    const outcome = acceptAmPmChar(char)
    if (outcome === 'reject') return 'reject'
    return withSlot(entry, index, { chars: outcome.digits, done: true }, nextActive(entry, index), true)
  }
  if (/\d/.test(char)) {
    const outcome = acceptDigit(segment, slot.done ? '' : slot.chars, '', char)
    if (outcome === 'reject') return 'reject'
    return withSlot(
      entry,
      index,
      { chars: outcome.digits, done: outcome.done },
      outcome.done ? nextActive(entry, index) : index,
      outcome.done,
    )
  }
  // Typing the separator means "I'm done with this group": the highlight moves
  // to the next one, ready for digits, and the group being left settles at
  // whatever it holds. It moves even from an empty group — the separator is
  // how you skip a group you don't want to fill yet, so refusing to move
  // would leave the key doing nothing at all.
  const nextLiteral = segments[segments.indexOf(segment) + 1]
  if (nextLiteral?.type === 'literal' && nextLiteral.text.startsWith(char)) {
    // Already moved here by the digit that finished the group before this
    // one: the separator is the one the user would type next anyway, so it
    // confirms that move instead of making a second one.
    if (entry.autoAdvanced) return { ...entry, autoAdvanced: false }
    return withSlot(entry, index, settleSlot(segment, slot), nextActive(entry, index), false)
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
  return withSlot(entry, entry.active, settleSlot(segment, entry.slots[entry.active]), entry.active, false)
}

// Moves the highlight to another group, finishing the one being left.
export function templateMoveTo(segments: MaskSegment[], entry: TemplateEntry, index: number): TemplateEntry {
  const active = Math.min(Math.max(index, 0), entry.slots.length - 1)
  const settled = templateFinalizeActive(segments, entry)
  if (settled === entry && active === entry.active) return entry
  return { ...settled, active, autoAdvanced: false }
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
  return { ...entry, active: filled < 0 ? 0 : nextActive(entry, filled), autoAdvanced: false }
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
    // padSlot, not a padding of its own: what commits has to be exactly what
    // the field was showing, including which side the zeros went on. Every
    // group here is finished (the guard above), which is the state where a
    // left-filling group has already turned its fillers into zeros.
    draft += padSlot(segment, slot.chars, true)
  }
  return draft
}

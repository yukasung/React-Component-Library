// The mask vocabulary: a `mask` string turned into an ordered list of
// positions, plus the rules deciding which characters each position accepts.
//
// This is the *rules* module. How they get applied to a field — the template,
// the caret, insert/overwrite, paste — is src/lib/maskField.ts's job. The
// split mirrors the one between inputMask.ts and maskTemplate.ts, and exists
// for the same reason: the rules stay testable without a field.
//
// It deliberately shares nothing with inputMask.ts's `MaskSegment`, which is
// a multi-character group described by `{ width, min, max }`. A position here
// is a *single grapheme cluster* described by a *character class*, and the
// letter classes have no numeric range at all — so the two vocabularies
// cannot be merged without one of them losing what makes it work. See
// specs/components/input-mask/plan.md §0.2.

// The mask characters this control understands, from the reference API's
// vocabulary. Each one is a class of characters a position will accept:
//
//   0  digit                        required
//   9  digit or space               optional
//   #  digit, sign (+/-), or space  optional
//   L  letter                       required
//   l  letter or space              optional
//   A  letter or digit              required
//   a  letter or digit, or space    optional
//
// "Optional" means the position accepts a space, which is how a mask of fixed
// width expresses a value of variable length: `(999) 000-0000` is a phone
// number whose area code may be left blank.
export type MaskClass = '0' | '9' | '#' | 'L' | 'l' | 'A' | 'a'

const MASK_CLASSES = new Set<string>(['0', '9', '#', 'L', 'l', 'A', 'a'])

// The classes that must be filled before the field will commit (R3.7).
const REQUIRED_CLASSES = new Set<MaskClass>(['0', 'L', 'A'])

// Case conversion is a property of the *position*, applied to whatever is
// typed into it: `>` upper-cases everything after it, `<` lower-cases, `|`
// returns to leaving input alone. The three characters occupy no position of
// their own.
export type CaseMode = 'none' | 'upper' | 'lower'

export type MaskPosition =
  | { type: 'fillable'; maskClass: MaskClass; required: boolean; caseMode: CaseMode }
  // Literals are the control's, not the user's: a literal position always
  // renders its text, filled or not, and never contributes to the raw value.
  | { type: 'literal'; text: string }

export interface MaskPattern {
  positions: readonly MaskPosition[]
  // Rendered width in *clusters*, which is positions.length — every position
  // occupies exactly one. Never compare this against a string's `.length`:
  // one position holding "กิ๊" is three UTF-16 code units.
  renderedWidth: number
  fillableCount: number
  // Position indices of the fillable positions, in order. The bridge between
  // "the nth thing the user can type into" and "the nth position".
  fillableIndices: readonly number[]
}

// One segmenter for the module. Constructing one per call is measurably
// expensive and there is nothing per-call about it.
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

// Grapheme clusters, not code points and not UTF-16 units. Every length in
// this module and in maskField.ts is a count of these.
export function splitClusters(text: string): string[] {
  return Array.from(segmenter.segment(text), (entry) => entry.segment)
}

// The upper bound on how much one position may hold. Not a linguistic rule —
// Thai's longest ordinary cluster is a base plus two marks — but a guard
// against arbitrarily stacked marks rendering one position far wider than one
// character and pulling the template's positions out of line.
export const MAX_CLUSTER_CODE_POINTS = 8

const NONSPACING_MARK = /\p{Mn}/u
const LETTER = /\p{L}/u
// ASCII, while LETTER is not — deliberately. The letter classes exist to hold
// names and words, which have to work in any script. The digit classes exist
// to hold the numbers inside a formatted identifier, which are ASCII wherever
// they are stored, and which the numeric keypad this control asks for cannot
// produce in any other script.
const DIGIT = /[0-9]/

// Whether a cluster is one this control will store in a position at all,
// independently of any class.
//
// Nonspacing marks (`Mn`) are accepted without a count limit: they carry zero
// advance width and stack vertically, so they cannot break the fixed-width
// alignment. Ordinary Thai needs more than one of them — "กิ๊" is ก plus a
// vowel plus a tone mark, "ที่" likewise — so a cap of one would make the
// field unable to type Thai.
//
// Everything else trailing the base is refused. Spacing combining marks
// (`Mc`) and ZWJ sequences do add advance width, which is exactly the thing
// the template cannot absorb.
export function isStorableCluster(cluster: string): boolean {
  const codePoints = Array.from(cluster)
  if (codePoints.length === 0 || codePoints.length > MAX_CLUSTER_CODE_POINTS) return false
  for (let i = 1; i < codePoints.length; i++) {
    if (!NONSPACING_MARK.test(codePoints[i])) return false
  }
  return true
}

// A cluster's class is decided by its base character — the vowel and tone
// marks that follow ride along with it. Without this, `L` would refuse "กิ๊"
// outright, because a combining mark is not in a letter category.
function baseChar(cluster: string): string {
  return Array.from(cluster)[0] ?? ''
}

// Letters are Unicode, digits are ASCII — see the DIGIT/LETTER notes above.
export function acceptsCluster(position: MaskPosition, cluster: string): boolean {
  if (position.type !== 'fillable') return false
  if (!isStorableCluster(cluster)) return false
  const base = baseChar(cluster)
  const isSpace = cluster === ' '
  const isDigit = DIGIT.test(base)
  const isLetter = LETTER.test(base)
  const isSign = cluster === '+' || cluster === '-'
  switch (position.maskClass) {
    case '0':
      return isDigit
    case '9':
      return isDigit || isSpace
    case '#':
      return isDigit || isSign || isSpace
    case 'L':
      return isLetter
    case 'l':
      return isLetter || isSpace
    case 'A':
      return isLetter || isDigit
    case 'a':
      return isLetter || isDigit || isSpace
  }
}

// Applies a position's case conversion, skipping it when the result would no
// longer fit the position. "ß" upper-cases to "SS" and "ᾳ" to "ΑΙ" — two
// clusters for one position — so those are stored as typed instead of
// overflowing the position or being refused outright.
//
// The test is a count of *clusters*, not of code points, and the two genuinely
// disagree. "İ" lower-cases to "i̇": two code points, still one cluster, and
// it fits a position perfectly well. Counting code points would refuse a
// conversion that is fine, which is how this was first written.
export function applyCase(cluster: string, caseMode: CaseMode): string {
  if (caseMode === 'none') return cluster
  const converted = caseMode === 'upper' ? cluster.toUpperCase() : cluster.toLowerCase()
  if (splitClusters(converted).length !== splitClusters(cluster).length) return cluster
  return converted
}

// Splits a mask into positions. Returns undefined for a mask that cannot be
// read — a trailing backslash with nothing to escape — so the caller can fall
// back to an unmasked field rather than render something subtly wrong. It
// never throws.
//
// Any character that is not a class character, a case token or an escape is a
// literal. That includes `.` `,` `:` `/` `$`, which the reference API treats
// as culture-dependent separators: this library has no global culture, by the
// same deliberate choice that makes `locale` a per-control prop, so they are
// plain literals here. It also includes the reference's DBCS/SBCS tokens
// (J G K N Z H), which are out of scope.
export function tokenizeMask(mask: string): MaskPattern | undefined {
  const positions: MaskPosition[] = []
  const fillableIndices: number[] = []
  let caseMode: CaseMode = 'none'
  const clusters = splitClusters(mask)
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]
    if (cluster === '\\') {
      const escaped = clusters[i + 1]
      if (escaped === undefined) return undefined
      positions.push({ type: 'literal', text: escaped })
      i++
      continue
    }
    if (cluster === '>') {
      caseMode = 'upper'
      continue
    }
    if (cluster === '<') {
      caseMode = 'lower'
      continue
    }
    if (cluster === '|') {
      caseMode = 'none'
      continue
    }
    if (MASK_CLASSES.has(cluster)) {
      const maskClass = cluster as MaskClass
      fillableIndices.push(positions.length)
      positions.push({
        type: 'fillable',
        maskClass,
        required: REQUIRED_CLASSES.has(maskClass),
        caseMode,
      })
      continue
    }
    positions.push({ type: 'literal', text: cluster })
  }
  return {
    positions,
    renderedWidth: positions.length,
    fillableCount: fillableIndices.length,
    fillableIndices,
  }
}

// The pattern a field should use, or null for an unmasked field. Unmasked is
// represented as an explicit null rather than as a pattern with no positions:
// it is a separate contract (no rejection, no prompt characters, raw equals
// the text verbatim), and a caller that has to narrow a null cannot reach it
// by accident.
export function resolvePattern(mask: string | undefined): MaskPattern | null {
  if (!mask) return null
  const pattern = tokenizeMask(mask)
  if (!pattern || pattern.positions.length === 0) return null
  return pattern
}

// Whether a string is one cluster that *stays* one cluster next to whatever
// sits beside it. Being one cluster in isolation is not enough, because the
// prompt is rendered once per unfilled position and next to the mask's own
// literals.
//
// A lone combining mark is the case that proves it: "\u0E34" segments as one
// cluster on its own, so a length check passes it — but two of them in a row
// segment as *one* cluster, and on mask "00" an empty field would render two
// positions as a single cluster. Every width the template and the caret
// depend on would be off by one, and no offset could be mapped back to a
// position. A zero-width joiner does the same thing.
//
// Tested behaviourally rather than by Unicode category, because the property
// that matters here is exactly "does it merge", not "what is it".
function isStandaloneCluster(text: string): boolean {
  return (
    splitClusters(text).length === 1 &&
    splitClusters(text + text).length === 2 &&
    splitClusters(`a${text}`).length === 2
  )
}

export const DEFAULT_PROMPT_CHAR = '_'

// The character standing in for an unfilled position.
//
// It falls back to the default in two cases. One is shape: a prompt has to be
// exactly one cluster, because it occupies exactly one position.
//
// The other is a collision, and it is the load-bearing one. A prompt that one
// of the mask's own positions would accept as data makes the rendered text
// ambiguous: promptChar="0" on mask="00" renders an empty field as "00", and
// a field genuinely holding "10" can no longer be told apart from one holding
// nothing — so copying it and pasting it back loses the "0". Round-tripping
// only works while the prompt is a character no position can hold.
//
// The check is against this mask, not a fixed blocklist: "0" is a perfectly
// good prompt for mask="LL". A collision is a mistake in the consumer's code
// rather than user input, so it degrades quietly. The default "_" collides
// with nothing; " " collides with 9, #, l and a.
export function resolvePromptChar(pattern: MaskPattern | null, promptChar: string | undefined): string {
  if (promptChar === undefined) return DEFAULT_PROMPT_CHAR
  if (!isStandaloneCluster(promptChar)) return DEFAULT_PROMPT_CHAR
  if (pattern) {
    for (const position of pattern.positions) {
      if (acceptsCluster(position, promptChar)) return DEFAULT_PROMPT_CHAR
    }
  }
  return promptChar
}

// The mobile keyboard the mask implies. Numeric only when every fillable
// position takes digits and nothing else; `#` accepts + and -, which a
// numeric keypad does not offer, so a mask containing one is "text".
//
// A consumer's own inputMode always wins over this — the component applies it
// as a default underneath the prop spread, never on top of it.
export function deriveInputMode(pattern: MaskPattern | null): 'numeric' | 'text' {
  if (!pattern || pattern.fillableCount === 0) return 'text'
  for (const index of pattern.fillableIndices) {
    const position = pattern.positions[index]
    if (position.type !== 'fillable') continue
    if (position.maskClass !== '0' && position.maskClass !== '9') return 'text'
  }
  return 'numeric'
}

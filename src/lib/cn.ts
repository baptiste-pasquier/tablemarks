/**
 * Minimal variadic class-name joiner (KTD7). Accepts strings and falsy values, filters the
 * falsy ones out, and joins the rest with a single space.
 *
 * Deliberately not Tailwind-aware: it does not deduplicate or resolve conflicting utility
 * classes (e.g. `p-2` vs `p-4`), and it does not accept array/object argument forms. That kind
 * of merging is `tailwind-merge`'s job and is out of scope here (KD2) — the need behind this
 * helper is simple conditional concatenation for the new UI primitives, not class-aware merging.
 */

type ClassValue = string | false | null | undefined

export function cn(...classes: ClassValue[]): string {
  return classes.filter((value): value is string => Boolean(value)).join(' ')
}

"""Structural checks on `docs/`, so documentation cannot drift silently.

Documentation in this repo is written by humans and by coding agents. Agents
append; nothing prunes. The taxonomy in `docs/README.md` gives every paragraph
exactly one home, and this script is what makes that placement binding rather
than advisory.

Run via a Husky pre-commit hook (`.husky/pre-commit`) and by hand with
`npm run check:docs`. Exits non-zero on any failure, printing one line per
problem. Size and staleness are warnings only: a gate must depend on the
change under review, and neither of those does.

--------------------------------------------------------------------------------
PORTED FROM THE `docs-taxonomy` SKILL

This repo is pure npm/TypeScript with no other Python tooling (no
`pre-commit` framework, no PyYAML). Rather than adding either, this copy
parses frontmatter with `_parse_frontmatter` below: a stdlib-only parser for
the flat `key: value` (plus simple `[a, b]` lists) frontmatter every doc here
actually uses. It is not a YAML parser - a nested mapping or a block scalar
will not round-trip. If this repo's frontmatter ever needs that, switch back
to PyYAML and drop this function; do not extend it into one.

Every project-specific value is in the CONFIGURATION block below, and adapting
means editing a value there - never editing the code underneath.
--------------------------------------------------------------------------------
"""

from __future__ import annotations

import datetime as dt
import fnmatch
import re
import sys
import urllib.parse
from dataclasses import dataclass
from pathlib import Path

# ============================== CONFIGURATION ==============================

#: Where the repository root sits relative to this file. The default assumes
#: `scripts/check_docs.py`; change the `.parent` chain if it lives elsewhere.
REPO_ROOT = Path(__file__).resolve().parent.parent
#: The documentation tree's folder name, relative to the repository root.
DOCS_DIRNAME = "docs"
DOCS = REPO_ROOT / DOCS_DIRNAME

#: Maintained folders. `type` in a doc's frontmatter must equal its folder name.
MAINTAINED = ("explanation", "how-to", "reference", "conventions")
#: Dated, append-only records. Exempt from narration, size and staleness.
JOURNAL = "journal"
#: The journal subfolder holding decision records, whose filenames are numbered.
DECISIONS_SUBFOLDER = "decisions"

#: The name of a folder's own index file, at the root of `docs/` and inside a
#: journal category.
INDEX_NAME = "README.md"
#: The backlog mirror's filename, at the root of `docs/`. Whether it is tolerated
#: there is NOT configured separately - see `root_allowed()`.
BACKLOG_NAME = "BACKLOG.md"
#: Anything else the project keeps at the root of `docs/`, beyond the index and
#: the mirror. Empty here: this repo has no backlog mirror, and no other doc
#: without a folder has a home.
ROOT_ALLOWED_EXTRA: frozenset[str] = frozenset()

#: Extensions this gate knows how to read as a doc. `.html` is here for the
#: one standalone ideation export under `journal/ideation/` - it carries no
#: frontmatter and is checked for links and filename only.
DOC_SUFFIXES = (".md", ".html")
#: Extensions allowed under a maintained folder without being a doc - a
#: generated spec, a fixture. Checked for filename and links only.
DATA_SUFFIXES = (".yaml", ".yml", ".json")

#: Frontmatter every maintained doc carries. A key present but empty counts as
#: missing.
REQUIRED_KEYS = ("title", "type", "audience", "status", "stale_after")
VALID_AUDIENCE = {"human", "agent"}
VALID_STATUS = {"draft", "stable", "deprecated"}

#: Prose-line warning thresholds, per folder. Set PROSE_CAP_DEFAULT to None to
#: drop the size warning entirely.
PROSE_CAP = {"reference": 250}
PROSE_CAP_DEFAULT = 150

#: Past-tense incident narration. Belongs in `journal/solutions/`, never in a
#: maintained doc - see `docs/conventions/documentation.md`.
INCIDENT_MARKERS = (
    (
        r"\bused to (?:be|have|do|fire|return|inject|strip|pass|show|print|ask|"
        r"call|reorder|crash|hold|live|work|happen|contain|produce|move|wait)\b"
    ),
    r"\bpreviously,",
    r"\bwas tried\b",
    r"\bwe tried\b",
    r"\battempts? (?:failed|out of)\b",
    r"\bbefore this fix\b",
    r"\bearlier version\b",
    r"\b\d+ (?:attempts?|tries|runs?) out of \d+\b",
    r"\bturned out to be false\b",
)
#: Folders where incident narration fails the build. Set to () to disable.
NARRATION_FAILS = ("reference", "conventions", "how-to")
#: Folders where it is reported as a warning instead. `explanation/` narrates by
#: design; the warning only asks whether the write-up belongs in the journal.
NARRATION_WARNS = ("explanation",)

#: A heading that names its section as a list of unbuilt work. Matched on the
#: heading text alone, so a rule *about* backlogs ("Never write a backlog") is
#: not itself a backlog.
BACKLOG_HEADING = re.compile(
    r"^#{1,6}[ \t]+(todo|to do|backlog|future work|not yet implemented|roadmap|"
    r"open questions|wishlist|ideas)[ \t]*:?[ \t]*$",
    re.IGNORECASE | re.MULTILINE,
)

#: An unreplaced template placeholder. The skill's templates ship `{{...}}`
#: markers for an adopter to fill in or delete; one left behind means a doc is
#: shipping instructions to its own writer as if they were content. Set to None
#: if the project uses `{{ }}` for something legitimate in prose.
PLACEHOLDER = re.compile(r"\{\{.{0,80}?\}\}", re.DOTALL)

#: Filler openers banned by `conventions/documentation.md`.
FILLER = (
    r"it is worth mentioning that",
    r"it should be noted that",
    r"it is important to note that",
    r"as mentioned previously",
)

#: This repo has no second-language rule: every file under `docs/` is English.
#: Set to a compiled regex of the other language's function words to enable
#: one (see the skill's `scripts/check_docs.py` for the pattern).
SECOND_LANGUAGE_MARKERS: re.Pattern[str] | None = None
LANGUAGE_THRESHOLD = 4
LANGUAGE_NAME = "the other language"

#: How a `conventions/` file must open. The bolded and the plain form both pass,
#: so the templates and the gate cannot disagree about the asterisks.
SCOPE_LINE = re.compile(r"^\**Scope:", re.MULTILINE)
#: The folder whose files must open with that line. Set to None to disable.
SCOPE_FOLDER = "conventions"

#: Off: this repo's `category` frontmatter (in `journal/solutions/`) names a
#: sub-classification such as `architecture-patterns`, not the full path from
#: the repository root, so it cannot equal `path.parent` the way this check
#: requires. See `docs/conventions/documentation.md` for the reasoning.
CATEGORY_KEY: str | None = None

KEBAB = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z]+$")
ADR_NAME = re.compile(r"^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")
#: Off: this repo has no generated backlog mirror under `docs/`.
GENERATED_BACKLOG_HEADER: str | None = None

#: Paths whose failures are downgraded to warnings, as glob patterns relative to
#: the repository root. Empty: the full tree already moved in one pass.
ALLOWLIST: tuple[str, ...] = ()

# ============================ END CONFIGURATION ============================


@dataclass
class Problem:
    """One failure or warning, tied to a file."""

    path: Path
    message: str
    warning: bool = False

    def render(self) -> str:
        """Return the one-line report for this problem."""
        try:
            rel: Path | str = self.path.relative_to(REPO_ROOT)
        except ValueError:
            rel = self.path
        tag = "warn" if self.warning else "FAIL"
        return f"{tag}  {rel}: {self.message}"


def root_allowed() -> set[str]:
    """Return the filenames tolerated at the root of `docs/`.

    Derived, never configured. The mirror is allowed exactly when the gate has a
    header to hold it to: two constants describing one file could otherwise be
    set to disagree, and the half-configured state - no header to check, but the
    file still tolerated - accepts a hand-written mirror forever.
    """
    allowed = {INDEX_NAME, *ROOT_ALLOWED_EXTRA}
    if GENERATED_BACKLOG_HEADER is not None:
        allowed.add(BACKLOG_NAME)
    return allowed


def is_allowlisted(path: Path) -> bool:
    """Return whether this path's failures are downgraded to warnings."""
    if not ALLOWLIST:
        return False
    try:
        rel = path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        rel = path.as_posix()
    return any(fnmatch.fnmatch(rel, pattern) for pattern in ALLOWLIST)


def _parse_scalar(value: str) -> object:
    """Parse one YAML-ish scalar: quoted string, flow list, date, bool, bare word."""
    value = value.strip()
    if value == "" or value in ("~", "null", "Null", "NULL"):
        return None
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [_parse_scalar(item) for item in inner.split(",")]
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    if re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        return dt.date.fromisoformat(value)
    if value.lower() in ("true", "yes"):
        return True
    if value.lower() in ("false", "no"):
        return False
    return value


def _parse_frontmatter(raw: str) -> dict | None:
    """Parse flat `key: value` frontmatter without a YAML dependency.

    Handles exactly what this repo's docs use: scalar values, quoted strings,
    dates, booleans and single-line `[a, b]` lists. A line that looks nested
    (indented, or a `- item` list entry) is not supported and is skipped
    rather than mis-parsed, since no doc here relies on it.
    """
    result: dict[str, object] = {}
    for line in raw.splitlines():
        if not line.strip() or line.startswith("#") or line[0] in " \t-":
            continue
        key, sep, value = line.partition(":")
        if not sep:
            continue
        result[key.strip()] = _parse_scalar(value)
    return result or None


def split_frontmatter(text: str) -> tuple[dict | None, str]:
    """Return the parsed frontmatter and the body that follows it."""
    if not text.startswith("---\n"):
        return None, text
    end = text.find("\n---\n", 3)
    if end == -1:
        return None, text
    raw = text[4:end]
    body = text[end + 5 :]
    return _parse_frontmatter(raw), body


FENCE = re.compile(r"^[ \t]*(`{3,}|~{3,})")


def outside_fences(body: str) -> list[tuple[int, str]]:
    """Return the `(line number, text)` pairs that sit outside a code fence.

    One shared notion of "inside a fence", so every rule agrees. A fence closes
    only on the same character, repeated at least as many times as it opened
    with - which is what CommonMark says, and what lets a fenced block contain a
    shorter fence. An unclosed fence swallows the rest of the file, exactly as a
    markdown renderer would.
    """
    lines: list[tuple[int, str]] = []
    marker: str | None = None
    for number, raw in enumerate(body.splitlines(), start=1):
        if hit := FENCE.match(raw):
            found = hit.group(1)
            if marker is None:
                marker = found
            elif found[0] == marker[0] and len(found) >= len(marker):
                marker = None
            continue
        if marker is None:
            lines.append((number, raw))
    return lines


#: Inline code, so a rule scanning prose does not fire on a code span's
#: contents. Shared by every check that needs a line with code spans removed,
#: so the definition of "inline code" cannot drift between them.
INLINE_CODE = re.compile(r"`[^`\n]*`")


def strip_code(body: str) -> str:
    """Return the body with fenced blocks and inline code removed."""
    plain = "\n".join(text for _, text in outside_fences(body))
    return INLINE_CODE.sub("", plain)


def prose_lines(body: str) -> int:
    """Count body lines that are prose - not code, not a table, not a heading."""
    count = 0
    for _, line in outside_fences(body):
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "|", ">", "---")):
            continue
        count += 1
    return count


def missing(meta: dict, key: str) -> bool:
    """Return whether a frontmatter key is absent, or present but empty.

    `title:` with nothing after it parses to `None`, and an empty list is no more
    of a value than a missing key. Counting those as present is how a file with
    five bare keys passes a schema check.
    """
    value = meta.get(key)
    if value is None:
        return True
    if isinstance(value, str | list | dict | tuple | set):
        return not value
    return False


def check_frontmatter(path: Path, meta: dict | None, folder: str) -> list[Problem]:
    """Check a maintained doc's frontmatter against the documented schema."""
    if meta is None:
        return [Problem(path, "missing or unparseable frontmatter")]
    problems = [
        Problem(path, f"frontmatter missing `{key}`")
        for key in REQUIRED_KEYS
        if missing(meta, key)
    ]
    declared = meta.get("type")
    if declared is not None and declared != folder:
        problems.append(
            Problem(path, f"`type: {declared}` does not match its folder `{folder}/`")
        )
    problems.extend(check_enums(path, meta))
    problems.extend(check_expiry(path, meta.get("stale_after")))
    return problems


def check_enums(path: Path, meta: dict) -> list[Problem]:
    """Check the `audience` and `status` values against their vocabularies."""
    problems: list[Problem] = []
    audience = meta.get("audience")
    if audience is not None:
        values = audience if isinstance(audience, list) else [audience]
        if bad := {str(value) for value in values} - VALID_AUDIENCE:
            problems.append(Problem(path, f"invalid audience {sorted(bad)}"))
    status = meta.get("status")
    # `status: no` parses to the boolean False, so truthiness is not the test.
    if status is not None and status not in VALID_STATUS:
        problems.append(Problem(path, f"invalid status `{status}`"))
    return problems


def check_expiry(path: Path, expiry: object) -> list[Problem]:
    """Check that `stale_after` is an ISO date still in the future."""
    if expiry is None:
        return []
    if isinstance(expiry, dt.datetime):
        expiry = expiry.date()  # a datetime-shaped value normalises the same way
    elif not isinstance(expiry, dt.date):
        return [Problem(path, "`stale_after` is not an ISO date")]
    if expiry < dt.date.today():
        message = f"`stale_after: {expiry}` has passed - review or re-date it"
        return [Problem(path, message, warning=True)]
    return []


def check_prose(path: Path, body: str, folder: str, offset: int = 0) -> list[Problem]:
    """Check language, narration, filler, backlog sections and size.

    `offset` is the number of frontmatter lines above `body`, so reported line
    numbers match the file rather than the body.
    """
    plain = strip_code(body)
    return [
        *check_language(path, body, offset),
        *check_narration(path, body, folder, offset),
        *check_no_backlog_section(path, plain),
        *check_placeholders(path, plain),
        *check_filler(path, plain),
        *check_size(path, body, folder),
    ]


def check_narration(path: Path, body: str, folder: str, offset: int = 0) -> list[Problem]:
    """Report every incident narration, failing or warning according to the folder.

    One `Problem` per occurrence, not per marker: a second instance of the same
    phrase - or of a different one - must surface as its own line, or a coding
    agent that only clears the first hit can never see there is a second. Two
    markers overlapping the same span (e.g. "3 attempts out of 5" matching both
    the generic "attempts... out of" marker and the "N attempts out of N"
    marker) count as one occurrence, not two.
    """
    if folder not in NARRATION_FAILS and folder not in NARRATION_WARNS:
        return []
    problems: list[Problem] = []
    for number, raw in outside_fences(body):
        line = INLINE_CODE.sub("", raw)
        claimed: list[tuple[int, int]] = []
        for marker in INCIDENT_MARKERS:
            for hit in re.finditer(marker, line, re.IGNORECASE):
                span = hit.span()
                if any(span[0] < end and start < span[1] for start, end in claimed):
                    continue
                claimed.append(span)
                problems.append(
                    Problem(
                        path,
                        f"line {number + offset} incident narration {hit.group(0)!r} - "
                        f"move it to {JOURNAL}/solutions/ and leave the rule with a link",
                        warning=folder not in NARRATION_FAILS,
                    )
                )
    return problems


def check_no_backlog_section(path: Path, plain: str) -> list[Problem]:
    """Report a section whose heading names it as a list of unbuilt work."""
    if hit := BACKLOG_HEADING.search(plain):
        return [
            Problem(
                path,
                f"section {hit.group(1).strip()!r} is a backlog - open a tracker "
                "issue instead, and link it",
            )
        ]
    return []


def check_placeholders(path: Path, plain: str) -> list[Problem]:
    """Report a template placeholder nobody filled in or deleted."""
    if PLACEHOLDER is None:
        return []
    if hit := PLACEHOLDER.search(plain):
        excerpt = " ".join(hit.group(0).split())[:60]
        return [Problem(path, f"unresolved template placeholder {excerpt!r}")]
    return []


def check_filler(path: Path, plain: str) -> list[Problem]:
    """Report a banned filler opener."""
    return [
        Problem(path, f"filler phrase {hit.group(0)!r}")
        for marker in FILLER
        if (hit := re.search(marker, plain, re.IGNORECASE))
    ]


def check_size(path: Path, body: str, folder: str) -> list[Problem]:
    """Warn when a doc's prose has grown past its folder's guideline."""
    cap = PROSE_CAP.get(folder, PROSE_CAP_DEFAULT)
    if cap is None:
        return []
    if (count := prose_lines(body)) > cap:
        message = f"{count} prose lines, over the {cap} guideline"
        return [Problem(path, message, warning=True)]
    return []


def check_language(path: Path, body: str, offset: int) -> list[Problem]:
    """Report the first line outside a fence written in the wrong language."""
    if SECOND_LANGUAGE_MARKERS is None:
        return []
    for number, raw in outside_fences(body):
        line = INLINE_CODE.sub("", raw)
        hits = {hit.lower() for hit in SECOND_LANGUAGE_MARKERS.findall(line)}
        if len(hits) >= LANGUAGE_THRESHOLD:
            message = f"line {number + offset} is {LANGUAGE_NAME}: {sorted(hits)[:6]}"
            return [Problem(path, message)]
    return []


def check_journal_entry(path: Path, rel: Path) -> list[Problem]:
    """Check an append-only journal entry.

    A journal entry is exempt from the narration rule - recording what failed is
    its purpose - and from size and staleness. It is not exempt from resolving
    its links, naming its file, or declaring the folder it lives in.
    """
    problems = check_links(path)
    if not KEBAB.match(path.name) and path.name != INDEX_NAME:
        problems.append(Problem(path, "filename must be kebab-case"))

    is_decision = len(rel.parts) >= 2 and rel.parts[1] == DECISIONS_SUBFOLDER
    if is_decision and rel.name != INDEX_NAME and not ADR_NAME.match(rel.name):
        problems.append(Problem(path, "ADR name must be `NNNN-with-dashes.md`"))

    text = path.read_text(encoding="utf-8")
    meta, body = split_frontmatter(text)
    offset = len(text.splitlines()) - len(body.splitlines())
    problems.extend(check_language(path, body, offset))
    problems.extend(check_placeholders(path, strip_code(body)))
    problems.extend(check_category(path, meta))
    return problems


def check_category(path: Path, meta: dict | None) -> list[Problem]:
    """Check that an entry's declared category is the folder it sits in."""
    if CATEGORY_KEY is None or not isinstance(meta, dict):
        return []
    declared = meta.get(CATEGORY_KEY)
    if not declared or not path.parent.is_relative_to(REPO_ROOT):
        return []
    folder = path.parent.relative_to(REPO_ROOT).as_posix()
    if declared != folder:
        message = f"`{CATEGORY_KEY}: {declared}` is not its folder `{folder}`"
        return [Problem(path, message)]
    return []


def opens_with_scope(body: str) -> bool:
    """Return whether the body opens with a `Scope:` line, bolded or not."""
    blocks = [block for block in body.split("\n\n") if block.strip()]
    return any(SCOPE_LINE.search(block) for block in blocks[:2])


def anchor(heading: str) -> str:
    """Return the fragment id a markdown host derives from a heading's text."""
    text = re.sub(r"[`*~]", "", heading.strip())  # `_` is kept: it is in identifiers
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)  # a link keeps its label
    text = re.sub(r"[^\w\- ]", "", text, flags=re.UNICODE)
    return text.strip().lower().replace(" ", "-")


def anchors_of(path: Path) -> set[str]:
    """Return every fragment id a markdown file offers."""
    body = path.read_text(encoding="utf-8")
    found = {
        anchor(hit.group(1))
        for _, line in outside_fences(body)
        if (hit := re.match(r"#{1,6}[ \t]+(.*)", line))
    }
    # An explicit `<a id="...">` or a `{#custom-id}` suffix counts too.
    found |= set(re.findall(r"<a\s+(?:id|name)=[\"']([^\"']+)[\"']", body))
    found |= set(re.findall(r"\{#([\w-]+)\}", body))
    return found


#: A markdown link target. The angle-bracket form may contain spaces, so it
#: needs its own branch; both forms may carry a title after the target.
LINK = re.compile(r"\]\(\s*(?:<([^>]*)>|([^)\s]*))(?:\s+[\"'][^\"']*[\"'])?\s*\)")


def check_links(path: Path) -> list[Problem]:
    """Check that every relative link, and every fragment, resolves on disk.

    Every link shape is checked, not only the `.md` ones: a folder link, a link
    carrying a title, a percent-encoded space and an uppercase extension are all
    links that can rot.
    """
    problems: list[Problem] = []
    text = path.read_text(encoding="utf-8")
    for bracketed, bare in LINK.findall(text):
        target, _, fragment = (bracketed or bare).partition("#")
        target = urllib.parse.unquote(target)
        if target.startswith(("http://", "https://", "mailto:", "//", "/")):
            continue
        if not target and not fragment:
            continue
        resolved = (path.parent / target) if target else path
        if not resolved.exists():
            problems.append(Problem(path, f"broken link -> {target}"))
        elif (
            fragment
            and resolved.is_file()
            and resolved.suffix.lower() == ".md"
            and fragment not in anchors_of(resolved)
        ):
            problems.append(Problem(path, f"broken anchor -> {target}#{fragment}"))
    return problems


def check_index(index_text: str, maintained: list[Path]) -> list[Problem]:
    """Check that every maintained doc is listed in the index."""
    return [
        Problem(path, f"not listed in {DOCS_DIRNAME}/{INDEX_NAME}")
        for path in maintained
        # POSIX form, so the check behaves the same way on Windows.
        if path.relative_to(DOCS).as_posix() not in index_text
    ]


def check_backlog(path: Path) -> list[Problem]:
    """Check that the backlog mirror still carries its generated header."""
    if GENERATED_BACKLOG_HEADER is None or not path.exists():
        return []
    text = path.read_text(encoding="utf-8").lstrip()
    if not text.startswith(GENERATED_BACKLOG_HEADER):
        return [
            Problem(path, "missing the generated header - it must not be hand-edited")
        ]
    return []


def check_maintained_doc(path: Path, folder: str) -> list[Problem]:
    """Run every check that applies to one maintained markdown doc."""
    problems: list[Problem] = []
    if not KEBAB.match(path.name) and path.name != INDEX_NAME:
        problems.append(Problem(path, "filename must be kebab-case"))
    problems.extend(check_links(path))

    text = path.read_text(encoding="utf-8")
    meta, body = split_frontmatter(text)
    offset = len(text.splitlines()) - len(body.splitlines())
    problems.extend(check_frontmatter(path, meta, folder))
    problems.extend(check_prose(path, body, folder, offset))

    if SCOPE_FOLDER and folder == SCOPE_FOLDER and not opens_with_scope(body):
        problems.append(
            Problem(path, f"a {folder}/ file must open with a `Scope:` line")
        )
    return problems


def classify(path: Path, rel: Path) -> tuple[list[Problem], bool]:
    """Route one file to its checks, and say whether it is a maintained doc."""
    suffix = path.suffix.lower()
    if len(rel.parts) == 1:
        if rel.name not in root_allowed():
            message = f"loose file at the root of {DOCS_DIRNAME}/ - it needs a folder"
            return [Problem(path, message)], False
        return [], False

    folder = rel.parts[0]
    if folder == JOURNAL:
        if suffix not in DOC_SUFFIXES:
            return [Problem(path, f"unexpected `{suffix}` file in {JOURNAL}/")], False
        return check_journal_entry(path, rel), False
    if folder not in MAINTAINED:
        return [Problem(path, f"unknown folder `{folder}/`")], False
    if suffix in DATA_SUFFIXES:
        problems = check_links(path)
        if not KEBAB.match(path.name):
            problems.append(Problem(path, "filename must be kebab-case"))
        return problems, False
    if suffix not in DOC_SUFFIXES:
        return [Problem(path, f"unexpected `{suffix}` file under {folder}/")], False
    return check_maintained_doc(path, folder), True


def walk_docs() -> tuple[list[Path], list[Problem]]:
    """Return every file under `docs/`, and the problems the walk itself found.

    `rglob` does not descend into a symlinked directory, so a quadrant folder
    that is a symlink would hide its contents from every rule. That is reported
    rather than followed, because following one invites a cycle.
    """
    files: list[Path] = []
    problems: list[Problem] = []
    for path in sorted(DOCS.rglob("*")):
        # A hidden path is tooling, not documentation: `.DS_Store`, a cache dir.
        if any(part.startswith(".") for part in path.relative_to(DOCS).parts):
            continue
        if path.is_symlink():
            kind = "folder" if path.is_dir() else "file"
            problems.append(
                Problem(path, f"symlinked {kind} - the gate cannot see through it")
            )
        elif path.is_file():
            files.append(path)
    return files, problems


def check_docs() -> list[Problem]:
    """Run every documentation check and return the problems found."""
    if not DOCS.is_dir():
        return [Problem(DOCS, f"{DOCS_DIRNAME}/ does not exist")]

    files, problems = walk_docs()
    maintained: list[Path] = []
    for path in files:
        found, is_maintained = classify(path, path.relative_to(DOCS))
        problems.extend(found)
        if is_maintained:
            maintained.append(path)

    index = DOCS / INDEX_NAME
    if not index.exists():
        problems.append(Problem(DOCS, f"{DOCS_DIRNAME}/{INDEX_NAME} is missing"))
    else:
        problems.extend(check_index(index.read_text(encoding="utf-8"), maintained))
        problems.extend(check_links(index))

    problems.extend(check_backlog(DOCS / BACKLOG_NAME))
    return [
        Problem(problem.path, problem.message, warning=True)
        if not problem.warning and is_allowlisted(problem.path)
        else problem
        for problem in problems
    ]


def main() -> int:
    """Print every problem and return the process exit code."""
    problems = check_docs()
    for problem in sorted(problems, key=lambda p: (p.warning, str(p.path))):
        print(problem.render())
    failures = [problem for problem in problems if not problem.warning]
    if failures:
        where = f"{DOCS_DIRNAME}/{INDEX_NAME}"
        print(f"\n{len(failures)} documentation problem(s). See {where}.")
        return 1
    print(f"{DOCS_DIRNAME}/ structure OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

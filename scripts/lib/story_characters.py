"""The story cast: one registry of named characters, shared by every story.

A character is created by ONE story (its `first_story`). That story's first
picture is the character's reference: later stories that reuse the character
get the same name, the same look (from this registry) and that picture attached
to every illustration, so the character stays recognisable. A name is never given
to a second character.

The registry is data, not code: scripts/seeds/story-characters.json. The rules for
using it are in manual/story-characters.md; create-stories.py and
generate-story-images.py read it through this module.
"""
from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "scripts" / "seeds" / "story-characters.json"
CONTENT = ROOT / "content" / "stories"
MEDIA = ROOT / "media" / "stories"

#: Kinds a character can have. Animals also have a `species`.
KINDS = ("animal", "boy", "girl", "man", "woman", "elder", "being")

DOMESTIC = [
    "horse", "cow", "duck", "rabbit", "goat", "pig", "sheep", "hen", "donkey", "goose", "dog", "cat",
    "guinea pig", "turkey", "hamster", "pony", "calf", "lamb", "rooster", "ferret",
]
WILD = [
    "fox", "deer", "owl", "bear", "squirrel", "hedgehog", "wolf", "otter", "elephant", "giraffe", "penguin",
    "monkey", "lion", "tortoise", "badger", "raccoon", "kangaroo", "koala", "panda", "zebra", "hippo", "seal",
    "raven", "stork", "mole", "bat", "lynx", "beaver", "crocodile", "tiger", "dolphin", "eagle", "swan",
    "frog", "snake", "mouse", "crow", "turtle", "parrot", "bee", "butterfly", "ant", "beetle", "whale",
    "mongoose", "bird", "fish", "hare", "boar", "moose", "camel", "rhino", "flamingo", "pelican", "lizard", "robin",
]
SPECIES = DOMESTIC + WILD


#: Free names offered to the writer, so it does not fall back on the same few (Leo, Pip...).
NAME_POOL = (
    "Adam Alba Aria Arlo Aya Bela Beni Cleo Dara Dina Edda Elio Emil Enzo Eva Felix Fay Gaia Gita Hana Hugo Ida Ilya "
    "Ines Iris Isla Ivo Jana Jas Kai Kato Lara Lena Lior Lola Luca Lucy Mara Mina Moa Nadia Naomi Nora Oleg Omar Otis "
    "Paco Pia Quin Rosa Rudi Sana Tara Teo Tessa Timo Uma Vera Vito Wren Yara Yuri Zane Zoe Anika Bram Dario Elsa "
    "Fabio Greta Hedy Ilka Joni Kora Lenka Matei Nika Olek Petra Radu Sofi Tibor Vlad Zsuzsa"
).split()


def key(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().lower()


def load() -> list[dict[str, Any]]:
    if not REGISTRY.is_file():
        return []
    return json.loads(REGISTRY.read_text(encoding="utf-8")).get("characters", [])


def save(characters: list[dict[str, Any]]) -> None:
    REGISTRY.parent.mkdir(parents=True, exist_ok=True)
    body = {"_note": "First-appearance registry of story characters. Rules: manual/story-characters.md", "characters": characters}
    REGISTRY.write_text(json.dumps(body, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def story_contexts() -> list[tuple[str, dict[str, str]]]:
    """(topic:code, context) for every story, in curriculum order."""
    out = []
    for path in sorted(CONTENT.glob("*/S*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("context"):
            out.append((f"{path.parent.name}:{path.stem}", data["context"]))
    return out


def clean_name(raw: str) -> str | None:
    """A proper name from a context key ("Toby the tiger" -> "Toby"), or None for a role like "the wolf"."""
    raw = raw.strip()
    if not raw or not raw[0].isupper():
        return None
    first = raw.split(" the ")[0].strip()
    if first.split()[0] in {"The", "Mother", "Father", "Her", "His", "My", "Little"} or len(first.split()) > 2:
        return None
    return first


def taken_names() -> set[str]:
    """Every name any story or the registry already uses: no new character may take one."""
    names = {key(c["name"]) for c in load()}
    for _, context in story_contexts():
        for raw in context:
            name = clean_name(raw)
            if name:
                names.add(key(name))
    return names


def species_of(look: str) -> str | None:
    words = look.lower()
    for species in sorted(SPECIES, key=len, reverse=True):
        if re.search(rf"\b{species}s?\b", words):
            return species
    return None


def kind_of(look: str) -> str:
    words = look.lower()
    if species_of(look):
        return "animal"
    if re.search(r"\b(elderly|old man|old woman|grandmother|grandfather)\b", words):
        return "elder"
    if re.search(r"\b(boy|young man)\b", words):
        return "boy"
    if re.search(r"\b(girl|princess)\b", words):
        return "girl"
    if re.search(r"\b(woman|queen|nymph|mother)\b", words):
        return "woman"
    if re.search(r"\b(man|hero)\b", words):
        return "man"
    return "being"


def backfill() -> list[dict[str, Any]]:
    """Build the registry from the stories that already exist: each name belongs to the first story that uses it."""
    registry = {key(c["name"]): c for c in load()}
    for ref, context in story_contexts():
        for raw, look in context.items():
            name = clean_name(raw)
            if not name or key(name) in registry:
                continue
            registry[key(name)] = {
                "name": name,
                "kind": kind_of(look),
                "species": species_of(look),
                "look": look.strip(),
                "first_story": ref,
            }
    characters = list(registry.values())
    save(characters)
    return characters


def reference_path(entry: dict[str, Any]) -> Path:
    topic, code = entry["first_story"].split(":")
    return MEDIA / topic[:4] / topic / code / "images" / "0.jpg"


def register(
    new: dict[str, dict[str, Any]], context: dict[str, str], story_ref: str, main: str | None = None,
    origin: str | None = None,
) -> list[str]:
    """Add the story's new characters, with this story as their first appearance. Returns the names added."""
    characters = load()
    known = {key(c["name"]) for c in characters}
    added = []
    for name, info in new.items():
        if key(name) in known:
            continue
        characters.append({
            "name": name,
            "kind": info.get("kind"),
            "species": info.get("species") if info.get("kind") == "animal" else None,
            "look": context.get(name, "").strip(),
            "first_story": story_ref,
            **({"origin": origin} if origin and name == main else {}),
        })
        added.append(name)
    if added:
        save(characters)
    return added


def references(names: list[str], story_ref: str, limit: int = 3) -> list[tuple[str, bytes]]:
    """Reference pictures for the registered characters (created by an earlier story) a story uses."""
    found = []
    by_key = {key(c["name"]): c for c in load()}
    for name in names:
        entry = by_key.get(key(name))
        if not entry or entry["first_story"] == story_ref:
            continue
        path = reference_path(entry)
        if path.is_file():
            found.append((entry["name"], path.read_bytes()))
    return found[:limit]


def used_species(kind: str = "animal") -> set[str]:
    return {c["species"] for c in load() if c.get("kind") == kind and c.get("species")}


def pick_species(rng: random.Random | None = None) -> str:
    """A species no registered character has, alternating domestic and wild so both get used."""
    rng = rng or random.Random()
    used = used_species()
    domestic_used = len([c for c in load() if c.get("species") in DOMESTIC])
    wild_used = len([c for c in load() if c.get("species") in WILD])
    # Domestic animals are a small pool, so wild ones get picked more often; keep the mix near 1 : 2.
    pools = [DOMESTIC, WILD] if domestic_used * 2 <= wild_used else [WILD, DOMESTIC]
    for pool in pools:
        free = [s for s in pool if s not in used]
        if free:
            return rng.choice(free)
    return rng.choice(SPECIES)


#: Where heroes come from and how they look, so the cast is not one default child. Used when a story has no premise.
CULTURES = [
    "a Native American nation of the plains", "an Inuit family of the Arctic", "a West African village",
    "an East African savanna village", "a Southern African kingdom", "an ancient Egyptian town", "ancient Greece",
    "ancient Rome", "an ancient Chinese village", "a village in India", "a Polynesian island",
    "an Aboriginal Australian community", "a Mayan or Aztec city", "an Andean mountain village", "a Viking farm",
    "a medieval European village", "an Arab desert caravan", "a Japanese mountain village",
    "a Pacific Northwest coast village", "an Amazon rainforest village", "a Maori village in New Zealand",
    "a Sami reindeer camp in Lapland", "a Mongolian steppe camp", "a Tibetan mountain monastery village",
    "an Ottoman Turkish town", "ancient Persia", "ancient Mesopotamia", "a Phoenician port", "a Celtic hill fort",
    "a Slavic forest village", "an Inca mountain city", "a Taino island in the Caribbean", "a Hawaiian village",
    "an Ethiopian highland kingdom", "a Berber village in the Sahara", "a Maasai village", "a Zulu homestead",
    "a Yoruba city", "the medieval empire of Mali", "a Korean village", "a Vietnamese river delta village",
    "a Thai river village", "a Filipino island village", "a Stone Age hunter band", "a Bronze Age Nile farm",
    "a Carthaginian harbour", "a Cherokee village in the forests", "a Hopi village in the desert",
]
HAIR = [
    "long black braids", "tight black curls", "a short shaved head", "a long straight black ponytail", "two buns",
    "short grey hair", "a headscarf", "a wide-brimmed hat", "locs", "a neat dark bob", "red hair in a plait", "a topknot",
]


def casting(level: str, rng: random.Random | None = None) -> dict[str, str]:
    """A hero profile for a story with no premise: who (kind), where from, and the hair."""
    rng = rng or random.Random()
    kinds = ["boy", "girl", "girl", "boy", "man", "woman"] if level == "A2" else ["boy", "girl", "man", "woman", "elder"]
    # Prefer a culture no earlier hero came from; the registry remembers each hero's `origin`.
    seen = {c.get("origin") for c in load() if c.get("origin")}
    fresh = [c for c in CULTURES if c not in seen] or CULTURES
    return {"kind": rng.choice(kinds), "culture": rng.choice(fresh), "hair": rng.choice(HAIR)}


def rules(level: str, species: str | None, premise: str | None = None, cast: dict[str, str] | None = None) -> str:
    """The prompt block that tells the writer who the main character is, and who it may reuse."""
    registry = load()
    taken = sorted(c["name"] for c in registry)
    lines = [
        "CHARACTER RULES (this library keeps a cast; follow them exactly):",
        "- A name belongs to ONE character in the whole library. Never give a new character a name from the list "
        "of taken names below, and never use the same name for two characters in one story.",
    ]
    if level == "A1":
        lines.append(
            f"- The MAIN character is a NEW animal: {'a ' + species if species else 'a species no earlier hero has'}. "
            "It is the hero of the story, with an original name and a short description of its look "
            "(colours, size, one clear mark)."
        )
        lines.append("- Other characters are other animals, or very rarely one person. Keep to at most three characters.")
    elif level == "A2" and premise:
        lines.append(
            "- The MAIN character is the hero the PREMISE names (a boy, girl, man or woman), a NEW character. Give the "
            "hero a name that belongs to the culture and era; in a myth or legend, use the real names of its characters."
        )
    elif level == "A2" and cast:
        lines.append(
            f"- The MAIN character is a NEW {cast['kind']} from {cast['culture']}, with {cast['hair']} (or the hair "
            "that fits the place and time), and a name that belongs to that culture."
        )
    elif level == "A2":
        lines.append(
            "- The MAIN character is a NEW boy, girl, man or woman, with an original name and a description of the look. "
            "Secondary characters may be animals, boys, girls, adults or elders."
        )
    else:
        lines.append(
            "- The main character may be an adult or a child. Secondary characters may be anyone. "
            "Give every new character an original name and a description of the look."
        )
    lines.append(
        "- Describe every character's look with the skin tone, hair, clothes and tools that fit the place and the time of "
        "the story. Do not draw every hero alike: vary age, sex, skin and hair."
    )
    if level != "A1":
        lines.append(
            "- ANIMALS ARE ANIMALS in this story. They behave as real animals do: they do not speak, do not think in "
            "words, do not wear clothes, do not use tools or weapons, do not follow maps and do not search for treasure. "
            "Only humans do those things. An animal may help or threaten a human only in ways a real animal could: carry "
            "a load, guide by instinct, hunt prey, guard its young, flee, fight, be hunted or fished. Animals may have no "
            "name. A spirit or god may take an animal shape only if the premise says so."
        )
        lines.append(
            "- PLOT: an original story, or one inspired by a folk tale or legend of the culture. It has a real problem the "
            "hero must solve, a choice, and a consequence. Not a generic journey or treasure hunt."
        )
    reusable = [
        c for c in registry
        if (level == "A1" and c["kind"] == "animal") or level != "A1"
    ]
    # Most stories have a fresh cast. Only now and then a few existing characters are offered, picked at random.
    if reusable and random.random() < 0.25:
        listing = "; ".join(f"{c['name']} ({c['look']})" for c in random.sample(reusable, min(6, len(reusable))))
        lines.append(
            "- You may bring back ONE character that already exists, only if it fits the story. Use its exact "
            "name and keep the look given here: " + listing
        )
    else:
        lines.append("- Do not bring back any character from other stories: every character here is new.")
    if premise:
        lines.append("- PREMISE (follow it; it fixes the hero, the place, the time and what happens): " + premise)
    taken_keys = taken_names()
    free = [n for n in NAME_POOL if key(n) not in taken_keys]
    random.shuffle(free)
    lines.append("- Name the new characters from these free names: " + ", ".join(free[:8]) + " (or another original name).")
    lines.append("- Taken names (do not use for a new character): " + ", ".join(taken))
    lines.append(
        '- In the JSON add: "main" (the name of the main character) and "new_characters" (an object that maps the name '
        'of each NEW character to {"kind": one of animal, boy, girl, man, woman, elder, being; "species": the animal '
        'species or null}). Characters that already exist are NOT in "new_characters". "context" must describe every '
        "named character, new or existing."
    )
    return "\n".join(lines)


def check(
    story: dict[str, Any], level: str, species: str | None, premise: str | None = None,
    cast: dict[str, str] | None = None,
) -> list[str]:
    """Problems with the story's cast, or [] when it follows the rules."""
    registry = {key(c["name"]): c for c in load()}
    taken = taken_names()
    problems = []
    context, new, main = story.get("context"), story.get("new_characters"), story.get("main")
    if not isinstance(context, dict) or not context:
        return ["missing context"]
    if not isinstance(new, dict) or not new or not isinstance(main, str):
        return ['need "main" and a non-empty "new_characters"']
    seen = set()
    for name, info in new.items():
        if not isinstance(info, dict) or info.get("kind") not in KINDS:
            problems.append(f"{name}: kind must be one of {', '.join(KINDS)}")
        if key(name) in taken:
            problems.append(f"{name} is already a character's name; choose another")
        if clean_name(name) != name:
            problems.append(f"{name} is not a single proper name")
        if name not in context:
            problems.append(f"{name} is not described in context")
        if key(name) in seen:
            problems.append(f"{name} is used twice")
        seen.add(key(name))
    existing = 0
    for raw in context:
        if raw in new:
            continue
        name = clean_name(raw)
        if name is None:
            continue
        if key(name) in registry:
            existing += 1
        else:
            problems.append(f'{raw}: a named character that is neither in the registry nor in "new_characters"')
    if existing > 1:
        problems.append("at most one existing character may return")
    if main not in new:
        problems.append("the main character must be new")
    else:
        kind = new[main].get("kind") if isinstance(new[main], dict) else None
        if level == "A1" and (kind != "animal" or (species and new[main].get("species") != species)):
            problems.append(f"the main character must be a {species}")
        if level == "A2" and cast and not premise:
            if kind != cast["kind"]:
                problems.append(f"the main character must be a {cast['kind']}")
        elif level == "A2" and kind not in ("boy", "girl", "man", "woman"):
            problems.append("the main character must be a boy, girl, man or woman")
    if level != "A1":
        problems += humanised_animals(story, new)
    return problems


ANIMAL_TALK = (
    r"said|says|asked|asks|tells|told|speaks|spoke|replied|answered|shouted|whispered|wears|wore|reads|read|"
    r"thinks|thought|laughs|laughed|dreams of|wants to find"
)
TOOL_WORDS = r"bow|arrow|knife|spear|sword|map|treasure|backpack|hat|coat|glasses|boat|canoe|lamp|key|crown"
CLOTHES = r"wearing|wears|hat|coat|scarf|glasses|backpack|bow tie|clothes|dress|cloak"


def humanised_animals(story: dict[str, Any], new: dict[str, Any]) -> list[str]:
    """Problems where an animal speaks, wears clothes, or uses tools or weapons (A2 and above)."""
    registry = {key(c["name"]): c for c in load()}
    context = story.get("context") or {}
    animals = {}
    for name in context:
        info = new.get(name) if isinstance(new.get(name), dict) else None
        entry = registry.get(key(name))
        if (info and info.get("kind") == "animal") or (entry and entry.get("kind") == "animal"):
            animals[name] = (info or entry or {}).get("species")
    terms = {key(n) for n in animals} | {key(sp) for sp in animals.values() if sp}
    terms |= {key(sp) for sp in SPECIES if re.search(rf"\b{sp}s?\b", " ".join(story.get("paragraphs", [])).lower())}
    humans = [n for n in context if n not in animals]
    problems = []
    for name, look in context.items():
        if name in animals and re.search(rf"\b({CLOTHES})\b", str(look).lower()):
            problems.append(f"{name} is an animal and must not wear clothes ({look})")
    pattern = "|".join(re.escape(t) for t in sorted(terms, key=len, reverse=True))
    for paragraph in story.get("paragraphs", []):
        for sentence in re.split(r"(?<=[.!?])\s+", paragraph):
            low = sentence.lower()
            if pattern and re.search(rf"\b({pattern})\b\s+(?:\w+\s+){{0,2}}({ANIMAL_TALK})\b", low):
                problems.append(f"an animal talks or acts like a person: {sentence}")
            elif pattern and re.search(
                rf"\b({pattern})\b\s+(?:\w+\s+){{0,2}}(uses|holds|carries|takes|grabs|follows|reads|searches for|looks for)"
                rf"\b[^.]{{0,40}}\b({TOOL_WORDS})\b", low
            ):
                problems.append(f"an animal uses a human tool: {sentence}")
    return problems


def apply_registry_looks(story: dict[str, Any]) -> None:
    """An existing character keeps the look the registry gives it."""
    registry = {key(c["name"]): c for c in load()}
    for raw in list(story["context"]):
        name = clean_name(raw)
        if name and raw not in story["new_characters"] and key(name) in registry:
            story["context"][raw] = registry[key(name)]["look"]

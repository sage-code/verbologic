# Story characters

Every story belongs to one cast. The cast is the registry `scripts/seeds/story-characters.json`
(`name`, `kind`, `species`, `look`, `first_story`). It is the instruction set for new stories:
`scripts/lib/story_characters.py` turns it into prompt rules and checks the result.

## Rules

1. **A name belongs to one character in the whole library.** A new character never takes a taken name (any name in the
   registry or in any story's `context`), and no animal, hero or person ever shares a name with another.
2. **First story = reference.** The story that creates a character is its `first_story`. Its first picture
   (`media/stories/<ch>/<topic>/<code>/images/0.jpg`) is the character's reference picture. The registry records only
   that first story, not every story that reuses the character.
3. **Returning characters** (at most two per story) keep their name and their registry `look`. Every picture of the
   new story gets their reference pictures attached.
4. **Who the main character is, by level**
   - **A1**: a new animal. The script picks a species no earlier hero has, mixing domestic and wild
     (`DOMESTIC` / `WILD` in the library). Secondary characters are other animals.
   - **A2**: a new boy or girl. Secondary characters can be animals, boys, girls, adults or elders.
   - **B1 and above**: an adult or a child, new or from a retold classic.
5. **Pictures**: one per reading page. Realistic relative sizes (the hero is never bigger than the people around it,
   unless the text says giant). When a page holds several paragraphs that show different moments, the picture is one
   comic page with a panel per paragraph and clean straight dividers.

## Commands

- `./run.sh create story <topic> [n]` applies the rules and registers new characters.
- `python scripts/lib/story_characters.py` has no CLI; to rebuild the registry from existing stories call
  `story_characters.backfill()` (it keeps existing entries and adds the first story of each unregistered name).

Older stories (before this registry) reuse names such as Pip, Leo and Mia for different characters. The registry credits
each name to the first story that uses it; later reuses are legacy and are not rewritten.

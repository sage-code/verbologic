### System Architecture Map

```
                  ┌──────────────────────────────────────────────┐
                  │          Cloudflare CDN Edge Network         │
                  └──────┬──────────────────────────────┬────────┘
                         │                              │
                         ▼                              ▼
    ┌──────────────────────────┐             ┌──────────────────────────┐
    │  Cloudflare Workers      │             │   Cloudflare R2 Bucket   │
    │  Static Assets (SSG)     │             │  media.verbologic.com    │
    │  - Nuxt 3 / Vue 3 App    │             │  media.verbologic.com    │
    │  - Static HTML / WebP    │             │  - Short WebM/MP4 Videos │
    │  - Static JSON Indices   │             │  - Pronunciation MP3s    │
    │  - Orama/Fuse.js Engine  │             │  - High-Res Comic Images │
    └────────────┬─────────────┘             └──────────────────────────┘
                 │
                 │ Auth & User State
                 ▼
    ┌──────────────────────────┐
    │     Supabase Platform    │
    │  - Auth (OAuth / Magic)  │
    │  - Postgres DB (RLS)     │
    │  - Edge Functions        │
    └──────────────────────────┘

```

---

### Tech Stack & Component Responsibility

| Layer | Technology | Primary Function |
| --- | --- | --- |
| **SSG Framework** | **Nuxt 3 (Static)** or **VitePress** | Pre-renders static routes, executes SSG hydration, compiles Vue interactive widgets. |
| **Search Engine** | **Orama** or **Fuse.js** | Client-side memory index loaded over static JSON bundles; search <5ms without server calls. |
| **Media Hosting** | **Cloudflare R2** | Zero-egress object storage for MP3, MP4, and WebP media behind custom domain edge rules. |
| **User Data & Auth** | **Supabase** | Holds user profiles, active learning tracks, quiz scores, SRS intervals, and unlocked prizes. |
| **Deployment** | **Cloudflare Workers Static Assets** | Automated git builds, edge caching, global asset distribution. |

---

### Layout Standard — Responsive App Frame (content pages)

Every content page (Dictionary · Lectures · Stories — the RoadmapShell tracks)
follows ONE layout standard; **practice pages are excluded** (their layout is
designed later). All rules live in `src/assets/css/layout.css`; the shell is
`src/app.vue` (`.app-backdrop`) → `src/layouts/default.vue` (`.app-frame`:
header → `.app-main` → footer).

- **Frozen header and footer** — `AppHeader` is `sticky top-0`, `AppFooter` is
  `sticky bottom-0` (one compact row). The frame is at least one viewport
  tall, so the footer is always at the bottom of the screen; the page content
  scrolls between them (window scroll — sticky table heads and
  `scrollIntoView` keep working; `scroll-padding` keeps targets clear of the
  bars).
- **Page fills the frame** — `.app-main` is a flex column whose child grows;
  the content pages and the RoadmapShell grid are `flex-1`, so a page is never
  shorter than the space between header and footer.
- **Device / orientation matrix** (gutters are `--gutter-x` / `--gutter-y`,
  shared by header, page and footer):

  | Screen | Media query | Frame |
  | --- | --- | --- |
  | Mobile portrait | default (< 768px) | full width, no margins, 12px gutters |
  | Mobile landscape | `landscape and max-height: 540px` | full width, compact vertical rhythm |
  | Tablet portrait | `min-width: 768px and portrait` | full width, no margins, 16px gutters |
  | Tablet / laptop landscape | `min-width: 768px and landscape` | full width, 24px gutters |
  | Desktop portrait (27" target) | `min-width: 1200px and portrait` | full width, no margins, 24px gutters |
  | Desktop landscape (large) | `landscape and min-width: 1600px and min-height: 1000px` | **portrait-ratio frame** (`--frame-ratio: 3/4` of the screen height), centered; the side margins stay unused top to bottom; header and footer live **inside** the frame |

  Portrait never has outer margins — the frame runs edge to edge.
- **The sidebar (chapter rail) is exactly as tall as the page content** —
  `RoadmapSidePane.vue` + `src/lib/roadmapRail.ts` own the ONE height rule:
  the grid stretches the rail cell to the content column; the rail panel is
  absolutely positioned inside it (`lg:absolute lg:inset-0`), so the chapter
  list never drives the row height. Never shorter than the content; a list
  longer than the content scrolls inside the rail with its own scrollbar.
  Below `lg` the rail stacks above the content at its natural height.
- **Chapter fold** — clicking a chapter selects and expands it; double-clicking
  the selected chapter folds/unfolds its topics (`RoadmapSidebar.vue`).

---

### Project Repository Structure

```
verbologic/
├── content/                   # MD docs — lectures & stories (Nuxt Content)
│   └── lectures/<trackLang>/<TOPIC>/<ID>/<locale>.md   # EN canonical for lectures
├── media/                     # the media REPOSITORY (mp3/mp4/webp stay out of Git)
│   └── audio/<lang>/<TOPIC>/<ID>.mp3 + sibling <ID>.json manifest
│       (manifest = term/names/ipa + file facts; status 'pending' = no file yet)
├── public/data/               # decoupled static data (O(N))
│   ├── entities/              # legacy entities (transitional bridge)
│   ├── media/                 # GENERATED runtime payloads (scripts/media-index.mjs)
│   │   ├── index.json         # counts + progress ids per section/topic/lang
│   │   └── <section>/<TOPIC>.json + <section>/search.json
│   └── locales/               # UI translation dictionaries (en.json, ro.json)
├── src/
│   ├── components/roadmap/    # RoadmapShell + topic layouts (TopicTable/Article/Gallery)
│   ├── composables/           # useSidebars · useProgress · useAudioQueue · useMedia
│   ├── data/
│   │   ├── sidebars/**/       # STRUCTURE layer: sections → topics → item ids + layout
│   │   ├── media.config.json  # R2 root + section → repository path
│   │   └── navigation.json · language-names.json
│   ├── pages/                 # /learn/<locale>/<track> (+ prerendered lecture routes)
│   ├── stores/                # roadmapStore · userStore (Pinia)
│   └── types/                 # media.ts · sidebars.ts
├── scripts/                   # validate-data · media-index · media-sync · archive-topics · missing-content …
├── run                        # maintenance runner: build · validate · missing · media · release …
├── supabase/                  # schema.sql (RLS profiles/progress)
└── nuxt.config.ts
```

---

### Content Lifecycle — Structure-First Design (Publishing with Unresolved References)

The project is built **structure-first**: the design layer is authored before the
content it references, and the website is published while part of that content
does not exist yet. **Unresolved references are expected, by design — they are
"planned items", not bugs — and no build step, script or CI job may fail because
of them.** This is what makes it possible to plan the missing content and fill
it in incrementally.

**The three layers**

| Layer | Where | Who writes it |
| --- | --- | --- |
| Structure | `src/data/sidebars/**/sidebar.json` (+ per-topic `layout`, `topic-map.json.planned`) | hand-authored, build-inlined |
| Repository | `media/<sectionPath>/<lang>/<TOPIC>/<ID>.mp3` + sibling `<ID>.json` manifest | content work (on the go) |
| Payloads | `public/data/media/**` (index · per-topic · search) | generated by `scripts/media-index.mjs` before every build |

**How an unresolved reference manifests in the published site**

| Situation | What the user sees |
| --- | --- |
| Sidebar id with no manifest / entity / doc yet | no row — the topic counts only what exists |
| Pending manifest (`status: "pending"`, no file) | a **visible, disabled row** — "Audio coming soon" (`media.url: null`) |
| Empty topic / chapter (no records) | hidden from the sidebar & TOC (`populatedTopics` / `visibleChapters`), but deep links still resolve |
| Legacy-bridge row whose mp3 is not on R2 | the **only real broken link** (play → 404); `run media verify --remote` reports it — upload to fix |

**The on-the-go loop (fill missing content whenever you like)**

```
run missing                                  # what is missing, per topic (temp/missing-content.md)
# author a seed: [{ "term": "carte", "names": { "en": "book" } }, …]
run scaffold ro C9T01 temp/seed-c9t01.json   # pending manifests + sidebar items → visible "coming soon" rows
# drop the mp3s into media/audio/ro/C9T01/
run media manifest                           # promotes pending → published (key/sha1/bytes)
run media upload --apply                     # R2 sync
run build                                    # rows go live
```

**Validation contract** (`scripts/validate-data.mjs`, `scripts/media-index.mjs`)

- **Hard errors** (real corruption — must fail): duplicate ids, bad entity
  `type`/`lang`, malformed audio URLs, unknown `layout` value, manifest missing
  term/`names[lang]` or a `key` outside every configured section path,
  `config.sections` ↔ sidebar mismatches, nav/locale/prices/language-names
  inconsistencies, and content that EXISTS but is of the wrong kind for its
  topic's layout (`table` holding a doc or an image, `article` holding a
  non-video manifest, `gallery` holding a non-image manifest).
- **Never an error** (planned content): a referenced id with no manifest/entity/doc;
  a content doc whose sidebar topic/items have not landed; a pinned id without a
  manifest. These are inventoried by `run missing` and reported as an
  informational count (`planned: …` / `missing content: …`).

---

---

### Media Pipeline (Cloudflare R2)

Media files (mp3/mp4/webp) stay out of Git; the JSON manifests under `media/`
ARE committed. Sync to R2 with the differential uploader — `run media upload
--apply` (Cloudflare API; `run media verify --remote` reports missing/orphan
objects before you push).

```
Local repo:   media/audio/ro/C3T02/word_carte.mp3 + word_carte.json (manifest: key/bytes/sha1)
R2 Bucket:    verbologic-media/audio/ro/C3T02/word_carte.mp3
Public URL:   https://media.verbologic.com/audio/ro/C3T02/word_carte.mp3
```

---

### Expression Search Engine (Orama / Fuse.js)

Load search indices asynchronously in Vue to keep initial page weight minimal.

#### Data Schema (`public/data/expressions_es.json`)

```json
[
  {
    "id": "exp_001",
    "domain": "travel",
    "term": "Where is the station?",
    "target": "¿Dónde está la estación?",
    "ipa": "/ˈdon.de esˈta la es.taˈsjon/",
    "audio": "audio/es/exp_001.mp3",
    "tags": ["transport", "navigation"]
  }
]

```

#### Vue Component Implementation (`src/components/ExpressionSearch.vue`)

```vue
<script setup>
import { ref, onMounted, computed } from 'vue'
import Fuse from 'fuse.js'

const props = defineProps(['lang'])
const query = ref('')
const selectedDomain = ref('all')
const expressions = ref([])
let fuse = null

onMounted(async () => {
  const res = await fetch(`/data/expressions_${props.lang}.json`)
  expressions.value = await res.json()
  
  fuse = new Fuse(expressions.value, {
    keys: ['term', 'target', 'tags'],
    threshold: 0.3
  })
})

const filteredResults = computed(() => {
  let list = expressions.value
  if (selectedDomain.value !== 'all') {
    list = list.filter(item => item.domain === selectedDomain.value)
  }
  if (!query.value.trim()) return list
  return fuse ? fuse.search(query.value).map(r => r.item) : list
})

const playAudio = (path) => {
  new Audio(`https://media.verbologic.com/${path}`).play()
}
</script>

<template>
  <div class="search-container">
    <input v-model="query" placeholder="Search expressions, words, tags..." />
    <select v-model="selectedDomain">
      <option value="all">All Domains</option>
      <option value="travel">Travel</option>
      <option value="business">Business</option>
    </select>

    <ul class="results-list">
      <li v-for="item in filteredResults" :key="item.id">
        <span>{{ item.term }} ➔ {{ item.target }}</span>
        <button @click="playAudio(item.audio)">🔊 Play</button>
      </li>
    </ul>
  </div>
</template>

```

---

### Database Schema & Progress Tracking (Supabase)

Execute this script in the Supabase SQL Editor. Row Level Security (RLS) ensures users can only access their own scores and preferences.

```sql
-- 1. User Profile & Learning Domain Preferences
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  instruction_lang TEXT NOT NULL DEFAULT 'en',
  target_lang TEXT NOT NULL DEFAULT 'es',
  active_domains TEXT[] DEFAULT '{general}',
  xp INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles 
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles 
  FOR UPDATE USING (auth.uid() = id);

-- 2. Quiz Attempts & Milestone History
CREATE TABLE public.quiz_results (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own quiz results" ON public.quiz_results 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own quiz results" ON public.quiz_results 
  FOR SELECT USING (auth.uid() = user_id);

-- 3. Automatic Profile Creation Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

```

---

### Quiz State Sync Flow

To optimize user experience, quizzes operate completely in-memory using local state, syncing to Supabase asynchronously upon completion.

```
┌────────────────────────────────────────┐
│  <QuizEngine.vue> executes in browser   │
│  - Load quiz definition from static JSON│
│  - Render question state machine       │
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│   Quiz Completed (Score Calculated)    │
│   - Update UI immediately (Confetti)   │
│   - Save progress to localStorage      │
└──────────────────┬─────────────────────┘
                   │
        ┌──────────┴──────────┐
        │ Is user logged in?  │
        └────┬───────────┬────┘
          YES│           │NO
             │           └───────────┐
             ▼                       ▼
┌──────────────────────────┐  ┌───────────────────────────┐
│ Post score to Supabase   │  │ Prompt guest to save      │
│ `quiz_results` table     │  │ progress by signing up    │
└──────────────────────────┘  └───────────────────────────┘

```
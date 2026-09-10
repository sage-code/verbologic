### System Architecture Map

```
                  ┌──────────────────────────────────────────────┐
                  │          Cloudflare CDN Edge Network         │
                  └──────┬──────────────────────────────┬────────┘
                         │                              │
                         ▼                              ▼
    ┌──────────────────────────┐             ┌──────────────────────────┐
    │  Cloudflare Pages (SSG)  │             │   Cloudflare R2 Bucket   │
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
| **Deployment** | **Cloudflare Pages** | Automated git builds, edge caching, global asset distribution. |

---

### Project Repository Structure

```
verbologic/
├── .github/workflows/
│   └── deploy-media.yml       # Syncs local /media folder to R2 via Wrangler
├── content/                   # MD/MDX files for structured lessons & comics
│   ├── es/
│   │   ├── travel-basics.md
│   │   └── restaurant-ordering.md
│   └── ro/
├── public/
│   └── data/                  # Decoupled Static JSON Files (O(N))
│       ├── expressions_en.json
│       ├── expressions_es.json
│       ├── quizzes_es.json
│       └── locales/           # Translation dictionaries
│           ├── en.json
│           ├── es.json
│           └── ro.json
├── src/
│   ├── components/
│   │   ├── ExpressionSearch.vue  # Instant client filter & audio player
│   │   ├── QuizEngine.vue        # State machine for quizzes & milestones
│   │   ├── MediaViewer.vue       # R2 video/image/audio unified player
│   │   └── ContrastiveNote.vue   # L1-specific phonetics/grammar popup
│   ├── stores/
│   │   ├── userStore.ts          # Pinia store syncing LocalStorage <-> Supabase
│   │   └── searchStore.ts        # In-memory search index cache
│   └── lib/
│       ├── supabaseClient.ts     # Supabase init & helper methods
│       └── searchEngine.ts       # Orama/Fuse index builder
├── wrangler.toml              # Cloudflare configuration
└── nuxt.config.ts / vite.config.ts

```

---

### Media Pipeline (Cloudflare R2)

Do **not** commit media files into Git. Keep media in a dedicated local working directory and sync it to R2 during CI/CD.

```
Local Asset:  /media/audio/es/correr.mp3
R2 Bucket:    verbologic-media/audio/es/correr.mp3
Public URL:   https://media.verbologic.com/audio/es/correr.mp3

```

#### R2 Sync Deployment Command (`.github/workflows/deploy-media.yml`)

```yaml
name: Sync Media to R2
on:
  push:
    paths:
      - 'media/**'
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Publish to Cloudflare R2
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: r2 object sync ./media r2://verbologic-media --delete

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
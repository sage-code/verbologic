#!/usr/bin/env node
/**
 * seed-dictionary-words.mjs — add new dictionary words with W-codes.
 *
 *   node scripts/seed-dictionary-words.mjs --dry-run
 *   node scripts/seed-dictionary-words.mjs --apply
 *
 * `media-scaffold-topic.mjs` allocates `A`-codes, but the dictionary track is
 * 100% `W`-codes (895 manifests, zero `A`). This seeder keeps that convention:
 * it allocates above the current maximum so no existing code shifts.
 *
 * It also creates the Civilization & History chapter, which the scaffold tool
 * cannot do — that tool only fills an existing topic.
 *
 * Every word is checked against the Romanian term of every existing manifest,
 * so a re-run cannot introduce a duplicate.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOCALES } from './lib/locales.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MEDIA = join(ROOT, 'media', 'dictionary')
const SIDEBAR = join(ROOT, 'src', 'data', 'sidebars', 'library', 'dictionary', 'sidebar.json')

const apply = process.argv.includes('--apply')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'))

/**
 * The new chapter. Placed after CH12 so no existing code shifts.
 * `names` must cover all nine locales — the sidebar renders every one.
 */
const NEW_CHAPTER = {
  code: 'CH13',
  names: {
    en: 'Civilization & History',
    ro: 'Civilizație și istorie',
    de: 'Zivilisation & Geschichte',
    ru: 'Цивилизация и история',
    it: 'Civiltà e storia',
    es: 'Civilización e historia',
    fr: 'Civilisation et histoire',
    hu: 'Civilizáció és történelem',
    pt: 'Civilização e história'
  },
  topics: [
    {
      code: 'CH13T01',
      names: {
        en: 'Architecture', ro: 'Arhitectură', de: 'Architektur', ru: 'Архитектура',
        it: 'Architettura', es: 'Arquitectura', fr: 'Architecture', hu: 'Építészet', pt: 'Arquitetura'
      },
      words: [
        { ro: 'castel', en: 'castle', de: 'Burg', ru: 'замок', it: 'castello', es: 'castillo', fr: 'château', hu: 'kastély', pt: 'castelo' },
        { ro: 'biserică', en: 'church', de: 'Kirche', ru: 'церковь', it: 'chiesa', es: 'iglesia', fr: 'église', hu: 'templom', pt: 'igreja' },
        { ro: 'turn', en: 'tower', de: 'Turm', ru: 'башня', it: 'torre', es: 'torre', fr: 'tour', hu: 'torony', pt: 'torre' },
        { ro: 'zid', en: 'wall', de: 'Mauer', ru: 'стена', it: 'muro', es: 'muro', fr: 'mur', hu: 'fal', pt: 'muro' },
        { ro: 'pod', en: 'bridge', de: 'Brücke', ru: 'мост', it: 'ponte', es: 'puente', fr: 'pont', hu: 'híd', pt: 'ponte' },
        { ro: 'coloană', en: 'column', de: 'Säule', ru: 'колонна', it: 'colonna', es: 'columna', fr: 'colonne', hu: 'oszlop', pt: 'coluna' },
        { ro: 'arhitect', en: 'architect', de: 'Architekt', ru: 'архитектор', it: 'architetto', es: 'arquitecto', fr: 'architecte', hu: 'építész', pt: 'arquiteto' }
      ]
    },
    {
      code: 'CH13T02',
      names: {
        en: 'Medieval Times', ro: 'Evul Mediu', de: 'Mittelalter', ru: 'Средневековье',
        it: 'Medioevo', es: 'Edad Media', fr: 'Moyen Âge', hu: 'Középkor', pt: 'Idade Média'
      },
      words: [
        { ro: 'cavaler', en: 'knight', de: 'Ritter', ru: 'рыцарь', it: 'cavaliere', es: 'caballero', fr: 'chevalier', hu: 'lovag', pt: 'cavaleiro' },
        { ro: 'rege', en: 'king', de: 'König', ru: 'король', it: 're', es: 'rey', fr: 'roi', hu: 'király', pt: 'rei' },
        { ro: 'regină', en: 'queen', de: 'Königin', ru: 'королева', it: 'regina', es: 'reina', fr: 'reine', hu: 'királynő', pt: 'rainha' },
        { ro: 'război', en: 'war', de: 'Krieg', ru: 'война', it: 'guerra', es: 'guerra', fr: 'guerre', hu: 'háború', pt: 'guerra' },
        { ro: 'sabie', en: 'sword', de: 'Schwert', ru: 'меч', it: 'spada', es: 'espada', fr: 'épée', hu: 'kard', pt: 'espada' },
        { ro: 'scut', en: 'shield', de: 'Schild', ru: 'щит', it: 'scudo', es: 'escudo', fr: 'bouclier', hu: 'pajzs', pt: 'escudo' },
        { ro: 'cetate', en: 'fortress', de: 'Festung', ru: 'крепость', it: 'fortezza', es: 'fortaleza', fr: 'forteresse', hu: 'erőd', pt: 'fortaleza' },
        { ro: 'armură', en: 'armour', de: 'Rüstung', ru: 'доспехи', it: 'armatura', es: 'armadura', fr: 'armure', hu: 'páncél', pt: 'armadura' },
        { ro: 'arc', en: 'bow', de: 'Bogen', ru: 'лук', it: 'arco', es: 'arco', fr: 'arc', hu: 'íj', pt: 'arco' },
        { ro: 'săgeată', en: 'arrow', de: 'Pfeil', ru: 'стрела', it: 'freccia', es: 'flecha', fr: 'flèche', hu: 'nyíl', pt: 'flecha' },
        { ro: 'asediu', en: 'siege', de: 'Belagerung', ru: 'осада', it: 'assedio', es: 'asedio', fr: 'siège', hu: 'ostrom', pt: 'cerco' },
        { ro: 'tron', en: 'throne', de: 'Thron', ru: 'трон', it: 'trono', es: 'trono', fr: 'trône', hu: 'trón', pt: 'trono' },
        { ro: 'nobil', en: 'noble', de: 'Adliger', ru: 'дворянин', it: 'nobile', es: 'noble', fr: 'noble', hu: 'nemes', pt: 'nobre' },
        { ro: 'cronică', en: 'chronicle', de: 'Chronik', ru: 'хроника', it: 'cronaca', es: 'crónica', fr: 'chronique', hu: 'krónika', pt: 'crônica' }
      ]
    },
    {
      code: 'CH13T03',
      names: {
        en: 'Ancient Times', ro: 'Antichitate', de: 'Antike', ru: 'Античность',
        it: 'Antichità', es: 'Antigüedad', fr: 'Antiquité', hu: 'Ókor', pt: 'Antiguidade'
      },
      words: [
        { ro: 'imperiu', en: 'empire', de: 'Reich', ru: 'империя', it: 'impero', es: 'imperio', fr: 'empire', hu: 'birodalom', pt: 'império' },
        { ro: 'împărat', en: 'emperor', de: 'Kaiser', ru: 'император', it: 'imperatore', es: 'emperador', fr: 'empereur', hu: 'császár', pt: 'imperador' },
        { ro: 'templu', en: 'temple', de: 'Tempel', ru: 'храм', it: 'tempio', es: 'templo', fr: 'temple', hu: 'templom', pt: 'templo' },
        { ro: 'filozof', en: 'philosopher', de: 'Philosoph', ru: 'философ', it: 'filosofo', es: 'filósofo', fr: 'philosophe', hu: 'filozófus', pt: 'filósofo' },
        { ro: 'amfiteatru', en: 'amphitheatre', de: 'Amphitheater', ru: 'амфитеатр', it: 'anfiteatro', es: 'anfiteatro', fr: 'amphithéâtre', hu: 'amfiteátrum', pt: 'anfiteatro' },
        { ro: 'papirus', en: 'papyrus', de: 'Papyrus', ru: 'папирус', it: 'papiro', es: 'papiro', fr: 'papyrus', hu: 'papirusz', pt: 'papiro' },
        { ro: 'legiune', en: 'legion', de: 'Legion', ru: 'легион', it: 'legione', es: 'legión', fr: 'légion', hu: 'légió', pt: 'legião' }
      ]
    },
    {
      code: 'CH13T04',
      names: {
        en: 'Modern History', ro: 'Istorie modernă', de: 'Neuzeit', ru: 'Новое время',
        it: 'Storia moderna', es: 'Historia moderna', fr: 'Histoire moderne', hu: 'Újkor', pt: 'História moderna'
      },
      words: [
        { ro: 'revoluție', en: 'revolution', de: 'Revolution', ru: 'революция', it: 'rivoluzione', es: 'revolución', fr: 'révolution', hu: 'forradalom', pt: 'revolução' },
        { ro: 'republică', en: 'republic', de: 'Republik', ru: 'республика', it: 'repubblica', es: 'república', fr: 'république', hu: 'köztársaság', pt: 'república' },
        { ro: 'constituție', en: 'constitution', de: 'Verfassung', ru: 'конституция', it: 'costituzione', es: 'constitución', fr: 'constitution', hu: 'alkotmány', pt: 'constituição' },
        { ro: 'independență', en: 'independence', de: 'Unabhängigkeit', ru: 'независимость', it: 'indipendenza', es: 'independencia', fr: 'indépendance', hu: 'függetlenség', pt: 'independência' },
        { ro: 'tratat', en: 'treaty', de: 'Vertrag', ru: 'договор', it: 'trattato', es: 'tratado', fr: 'traité', hu: 'szerződés', pt: 'tratado' },
        { ro: 'alianță', en: 'alliance', de: 'Bündnis', ru: 'союз', it: 'alleanza', es: 'alianza', fr: 'alliance', hu: 'szövetség', pt: 'aliança' },
        { ro: 'democrație', en: 'democracy', de: 'Demokratie', ru: 'демократия', it: 'democrazia', es: 'democracia', fr: 'démocratie', hu: 'demokrácia', pt: 'democracia' },
        { ro: 'parlament', en: 'parliament', de: 'Parlament', ru: 'парламент', it: 'parlamento', es: 'parlamento', fr: 'parlement', hu: 'parlament', pt: 'parlamento' },
        { ro: 'președinte', en: 'president', de: 'Präsident', ru: 'президент', it: 'presidente', es: 'presidente', fr: 'président', hu: 'elnök', pt: 'presidente' },
        { ro: 'alegeri', en: 'elections', de: 'Wahlen', ru: 'выборы', it: 'elezioni', es: 'elecciones', fr: 'élections', hu: 'választások', pt: 'eleições' },
        { ro: 'reformă', en: 'reform', de: 'Reform', ru: 'реформа', it: 'riforma', es: 'reforma', fr: 'réforme', hu: 'reform', pt: 'reforma' },
        { ro: 'progres', en: 'progress', de: 'Fortschritt', ru: 'прогресс', it: 'progresso', es: 'progreso', fr: 'progrès', hu: 'haladás', pt: 'progresso' }
      ]
    },
    {
      code: 'CH13T05',
      names: {
        en: 'Traditions & Folklore', ro: 'Tradiții și folclor', de: 'Traditionen & Folklore', ru: 'Традиции и фольклор',
        it: 'Tradizioni e folclore', es: 'Tradiciones y folclore', fr: 'Traditions et folklore', hu: 'Hagyományok és folklór', pt: 'Tradições e folclore'
      },
      words: [
        { ro: 'legendă', en: 'legend', de: 'Legende', ru: 'легенда', it: 'leggenda', es: 'leyenda', fr: 'légende', hu: 'legenda', pt: 'lenda' },
        { ro: 'obicei', en: 'custom', de: 'Brauch', ru: 'обычай', it: 'usanza', es: 'costumbre', fr: 'coutume', hu: 'szokás', pt: 'costume' },
        { ro: 'sărbătoare', en: 'festival', de: 'Fest', ru: 'праздник', it: 'festa', es: 'fiesta', fr: 'fête', hu: 'ünnep', pt: 'festa' },
        { ro: 'port popular', en: 'folk costume', de: 'Tracht', ru: 'народный костюм', it: 'costume popolare', es: 'traje típico', fr: 'costume traditionnel', hu: 'népviselet', pt: 'traje típico' },
        { ro: 'colind', en: 'carol', de: 'Weihnachtslied', ru: 'колядка', it: 'canto natalizio', es: 'villancico', fr: 'chant de Noël', hu: 'karácsonyi ének', pt: 'canção de Natal' },
        { ro: 'poveste', en: 'tale', de: 'Märchen', ru: 'сказка', it: 'racconto', es: 'cuento', fr: 'conte', hu: 'mese', pt: 'conto' },
        { ro: 'dans popular', en: 'folk dance', de: 'Volkstanz', ru: 'народный танец', it: 'danza popolare', es: 'danza folclórica', fr: 'danse folklorique', hu: 'néptánc', pt: 'dança folclórica' },
        { ro: 'muzică populară', en: 'folk music', de: 'Volksmusik', ru: 'народная музыка', it: 'musica popolare', es: 'música folclórica', fr: 'musique folklorique', hu: 'népzene', pt: 'música folclórica' },
        { ro: 'mit', en: 'myth', de: 'Mythos', ru: 'миф', it: 'mito', es: 'mito', fr: 'mythe', hu: 'mítosz', pt: 'mito' },
        { ro: 'ritual', en: 'ritual', de: 'Ritual', ru: 'ритуал', it: 'rituale', es: 'ritual', fr: 'rituel', hu: 'rituálé', pt: 'ritual' },
        { ro: 'superstiție', en: 'superstition', de: 'Aberglaube', ru: 'суеверие', it: 'superstizione', es: 'superstición', fr: 'superstition', hu: 'babona', pt: 'superstição' },
        { ro: 'proverb', en: 'proverb', de: 'Sprichwort', ru: 'пословица', it: 'proverbio', es: 'refrán', fr: 'proverbe', hu: 'közmondás', pt: 'provérbio' }
      ]
    }
  ]
}

/** Words added to the three thin topics. */
const THIN_TOPIC_WORDS = {
  CH01T01: [
    { ro: 'noapte bună', en: 'good night', de: 'gute Nacht', ru: 'спокойной ночи', it: 'buonanotte', es: 'buenas noches', fr: 'bonne nuit', hu: 'jó éjszakát', pt: 'boa noite' },
    { ro: 'pe curând', en: 'see you soon', de: 'bis bald', ru: 'до скорого', it: 'a presto', es: 'hasta pronto', fr: 'à bientôt', hu: 'hamarosan találkozunk', pt: 'até breve' },
    { ro: 'bine ați venit', en: 'welcome', de: 'willkommen', ru: 'добро пожаловать', it: 'benvenuto', es: 'bienvenido', fr: 'bienvenue', hu: 'üdvözöllek', pt: 'bem-vindo' }
  ],
  CH01T02: [
    { ro: 'scuzați-mă', en: 'excuse me', de: 'entschuldigen Sie', ru: 'извините', it: 'mi scusi', es: 'disculpe', fr: 'excusez-moi', hu: 'elnézést', pt: 'com licença' },
    { ro: 'felicitări', en: 'congratulations', de: 'herzlichen Glückwunsch', ru: 'поздравляю', it: 'congratulazioni', es: 'felicidades', fr: 'félicitations', hu: 'gratulálok', pt: 'parabéns' },
    { ro: 'mult noroc', en: 'good luck', de: 'viel Glück', ru: 'удачи', it: 'buona fortuna', es: 'buena suerte', fr: 'bonne chance', hu: 'sok szerencsét', pt: 'boa sorte' }
  ],
  CH01T04: [
    { ro: 'poate', en: 'maybe', de: 'vielleicht', ru: 'может быть', it: 'forse', es: 'quizás', fr: 'peut-être', hu: 'talán', pt: 'talvez' },
    { ro: 'desigur', en: 'of course', de: 'natürlich', ru: 'конечно', it: 'certo', es: 'por supuesto', fr: 'bien sûr', hu: 'természetesen', pt: 'claro' },
    { ro: 'adevărat', en: 'true', de: 'wahr', ru: 'правда', it: 'vero', es: 'verdadero', fr: 'vrai', hu: 'igaz', pt: 'verdadeiro' },
    { ro: 'fals', en: 'false', de: 'falsch', ru: 'ложь', it: 'falso', es: 'falso', fr: 'faux', hu: 'hamis', pt: 'falso' },
    { ro: 'ce', en: 'what', de: 'was', ru: 'что', it: 'che', es: 'qué', fr: 'quoi', hu: 'mi', pt: 'o que' },
    { ro: 'unde', en: 'where', de: 'wo', ru: 'где', it: 'dove', es: 'dónde', fr: 'où', hu: 'hol', pt: 'onde' },
    { ro: 'când', en: 'when', de: 'wann', ru: 'когда', it: 'quando', es: 'cuándo', fr: 'quand', hu: 'mikor', pt: 'quando' },
    { ro: 'pentru că', en: 'because', de: 'weil', ru: 'потому что', it: 'perché', es: 'porque', fr: 'parce que', hu: 'mert', pt: 'porque' }
  ]
}

/** Every manifest under a topic folder. */
function topicManifests(chapter, topic) {
  const dir = join(MEDIA, chapter, topic)
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'sound') continue
    const file = join(dir, entry.name, 'item.json')
    if (existsSync(file)) out.push(readJson(file))
  }
  return out
}

function main() {
  const sidebar = readJson(SIDEBAR)

  // Highest W code anywhere, so new codes never collide.
  let highest = 0
  for (const section of sidebar.sections) {
    for (const topic of section.topics) {
      for (const id of topic.items ?? []) {
        const m = /^W(\d+)$/.exec(id)
        if (m) highest = Math.max(highest, Number(m[1]))
      }
      for (const manifest of topicManifests(section.code, topic.code)) {
        const m = /^W(\d+)$/.exec(manifest.code ?? '')
        if (m) highest = Math.max(highest, Number(m[1]))
      }
    }
  }

  // Romanian term → owning code, so a re-run cannot duplicate a word.
  const existingRo = new Map()
  for (const section of sidebar.sections) {
    for (const topic of section.topics) {
      for (const manifest of topicManifests(section.code, topic.code)) {
        const ro = manifest.locales?.ro?.name?.toLowerCase()
        if (ro) existingRo.set(ro, `${topic.code}/${manifest.code}`)
      }
    }
  }

  const created = []
  const skipped = []

  /** Write one word's manifest and append its code to the topic. */
  const addWord = (chapterCode, topicEntry, word) => {
    const ro = word.ro.toLowerCase()
    if (existingRo.has(ro)) {
      skipped.push(`${word.ro} (already ${existingRo.get(ro)})`)
      return
    }
    highest += 1
    const code = `W${String(highest).padStart(3, '0')}`
    const locales = {}
    for (const locale of LOCALES) {
      const name = word[locale]
      if (name) locales[locale] = { name }
    }
    const manifest = {
      code,
      track: 'dictionary',
      chapter: chapterCode,
      topic: topicEntry.code,
      kind: 'word',
      entity_id: `${topicEntry.code}:${code}`,
      cefr: topicEntry.level ?? 'A1',
      tags: [`vocabulary#${topicEntry.code}`],
      locales
    }
    const dir = join(MEDIA, chapterCode, topicEntry.code, code)
    if (apply) {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'item.json'), JSON.stringify(manifest, null, 2) + '\n')
    }
    topicEntry.items.push(code)
    existingRo.set(ro, `${topicEntry.code}/${code}`)
    created.push(`${code} ${word.ro} → ${topicEntry.code}`)
  }

  // 1. The new chapter.
  let chapter = sidebar.sections.find((s) => s.code === NEW_CHAPTER.code)
  if (!chapter) {
    chapter = { code: NEW_CHAPTER.code, names: NEW_CHAPTER.names, topics: [] }
    sidebar.sections.push(chapter)
  }
  for (const spec of NEW_CHAPTER.topics) {
    let topic = chapter.topics.find((t) => t.code === spec.code)
    if (!topic) {
      topic = { code: spec.code, names: spec.names, layout: 'table', level: 'B1', items: [] }
      chapter.topics.push(topic)
    }
    for (const word of spec.words) addWord(NEW_CHAPTER.code, topic, word)
  }

  // 2. The three thin topics.
  for (const [topicCode, words] of Object.entries(THIN_TOPIC_WORDS)) {
    const section = sidebar.sections.find((s) => s.topics.some((t) => t.code === topicCode))
    const topic = section?.topics.find((t) => t.code === topicCode)
    if (!topic) continue
    for (const word of words) addWord(section.code, topic, word)
  }

  console.log(`seed: ${created.length} word(s) created`)
  for (const line of created) console.log('  +', line)
  if (skipped.length) {
    console.log(`seed: ${skipped.length} skipped (already present)`)
    for (const line of skipped) console.log('  =', line)
  }

  if (!apply) {
    console.log('seed: dry run — nothing written')
    return
  }
  writeFileSync(SIDEBAR, JSON.stringify(sidebar, null, 2) + '\n')
  console.log('seed: sidebar written')
}

main()

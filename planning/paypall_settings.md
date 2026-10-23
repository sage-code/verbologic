# PayPal + Supabase secrets — setup guide

Data: 22 octombrie 2026 · Stare: **de făcut de tine, mai târziu** · Fără cod scris încă

Scopul acestui document: să obții **Client ID** și **Secret** de la PayPal, să le
pui în siguranță ca secrete Supabase, și să pornești faza de implementare cu un
prompt gata de copiat.

> De ce e nevoie de un server: site-ul e un bundle **static** (`wrangler.toml`
> are doar `[assets]`, fără `main`, fără folder `server/`). Secretul PayPal nu
> poate ajunge în browser, iar confirmarea plății trebuie verificată pe server.
> Serverul va fi o **Supabase Edge Function** (ai deja Supabase Auth + RLS).

---

## 0. Ce există deja în cod

| Loc | Ce face azi |
| --- | --- |
| `src/components/AddCreditsDialog.vue` | Pachete hardcodate `100 credite / $9.99` și `500 / $39.99`; butonul Buy apelează `store.addCredits()` — **fără plată reală** |
| `src/stores/libraryStore.ts` | Pool-ul de credite stă **doar în `localStorage`** (`verbologic-credit-pool`) |
| `src/pages/pricing/index.vue` | Tier plătit = **stub** (`console.info('[pricing] checkout', …)`) |
| `supabase/schema.sql` | `credit_ledger` (append-only), `enrollments`, `enrollments_overview` |
| `.env` | `NUXT_PUBLIC_SUPABASE_URL` + `NUXT_PUBLIC_SUPABASE_ANON_KEY` (proiect `vmxkimcdtluoghcaxqht`) |

**Blocaje de rezolvat în faza următoare** (nu țin de PayPal, țin de cod):

1. Pool-ul de credite e local → un utilizator îl poate edita din DevTools.
2. Politica RLS `"Users can insert own credit topups"` permite oricui e logat să
   insereze `delta: 100000` cu cheia publică.
3. Politicile `enrollments` insert/update permit utilizatorului să-și scrie
   singur `credits_total`.
4. `credit_ledger.locale` e `not null` — un top-up în pool nu are limbă.

---

## 1. Înainte să începi

- [ ] Cont **PayPal Business** (nu personal). Doar conturile Business pot primi
      plăți prin REST API. Dacă ai cont personal, îl poți converti din
      *paypal.com → Settings → Upgrade to a Business account*.
- [ ] Cont **Supabase** cu acces la proiectul `vmxkimcdtluoghcaxqht`
      (rol Owner sau Administrator — Developer nu poate scrie secrete).
- [ ] **Supabase CLI** instalat local (`supabase --version`). Nu e instalat acum.
- [ ] Decis: moneda (`USD` — deja în `public/data/prices.json`) și prețurile
      (vezi §5).

---

## 2. Cum obții Client ID + Secret de la PayPal

> Interfața PayPal Developer se schimbă din când în când. Pașii de mai jos
> descriu fluxul actual; dacă un buton are alt nume, caută echivalentul
> (**Apps & Credentials**, **Create App**, **Secret → Show**).

### 2.1 Intră în Developer Dashboard

1. Deschide <https://developer.paypal.com/>.
2. Click **Log in to Dashboard** (dreapta sus).
3. Autentifică-te cu contul **Business** (același cont cu care vrei să încasezi).

### 2.2 Alege mediul: Sandbox sau Live

Sus în dashboard există un comutator **Sandbox / Live**.

- **Sandbox** = bani falși, pentru teste. Începe întotdeauna aici.
- **Live** = bani reali. Treci aici doar după ce fluxul complet funcționează.

Aplicațiile și credențialele sunt **separate** pentru cele două medii: o aplicație
creată în Sandbox nu există în Live.

### 2.3 Creează aplicația (Sandbox)

1. Comută pe **Sandbox**.
2. Meniu stânga → **Apps & Credentials** → tab **Sandbox**.
3. Click **Create App**.
4. **App Name**: `Verbologic` (orice nume; îl vezi doar tu).
5. **App Type**: **Merchant**.
6. Click **Create App**.
7. Se deschide pagina aplicației. Ai două valori:
   - **Client ID** — lung, vizibil direct. **Public-safe** (poate sta în bundle).
   - **Secret** — ascuns. Click **Show** (sau `Secret: Show`) ca să-l vezi.
8. Copiază ambele într-un loc sigur (password manager). **Nu le pune în Git.**

> Secretul din Sandbox poate fi regenerat oricând din același ecran
> (**Secret → Regenerate**). Regenerarea îl invalidează pe cel vechi.

### 2.4 Creează aplicația (Live) — doar la final

1. Comută pe **Live**.
2. **Apps & Credentials** → tab **Live** → **Create App** → tip **Merchant**.
3. Copiază **Client ID** și **Secret**.
4. Secretul Live se afișează **o singură dată** la creare. Dacă îl pierzi,
   trebuie regenerat (și actualizat în Supabase).

### 2.5 Conturi de test pentru Sandbox (opțional, dar util)

1. **Sandbox** → **Accounts** (sau *Testing Tools → Sandbox Accounts*).
2. PayPal creează automat două conturi: unul **Personal** (cumpărător) și unul
   **Business** (vânzător).
3. Click pe contul Personal → **View/Edit account** → vezi e-mailul și parola
   de test. Cu ele te loghezi în fereastra PayPal la testare.
4. Poți crea conturi noi cu **Create account** și sold preîncărcat
   (**Set balance**), ca să testezi și refuzul plății.

### 2.6 Webhook ID (pentru creditarea autoritativă)

Plata se creditează **din webhook**, nu din pagina de retur (returul poate fi
falsificat).

1. Pe pagina aplicației → secțiunea **Webhooks** → **Add Webhook**.
2. **Webhook URL** (se completează după ce funcția e deployată):
   `https://vmxkimcdtluoghcaxqht.supabase.co/functions/v1/paypal-webhook`
3. **Event types**: bifează
   - `PAYMENT.CAPTURE.COMPLETED` (obligatoriu)
   - `PAYMENT.CAPTURE.DENIED`
   - `PAYMENT.CAPTURE.REFUNDED`
   - `CHECKOUT.ORDER.APPROVED` (opțional, doar pentru log)
4. **Save** → PayPal afișează un **Webhook ID** (ex. `8PT597110X687430LKGECATA`).
   Copiază-l — funcția îl folosește la verificarea semnăturii.

### 2.7 Endpoint-uri API (pentru referință)

| Mediu | Base URL |
| --- | --- |
| Sandbox | `https://api-m.sandbox.paypal.com` |
| Live | `https://api-m.paypal.com` |

Autentificare: `POST /v1/oauth2/token` cu `grant_type=client_credentials`,
Basic auth din `Client ID:Secret`.

---

## 3. Cum pui secretele în Supabase

Patru variabile, toate **secrete de Edge Function** (nu `NUXT_PUBLIC_*`):

| Nume | Valoare |
| --- | --- |
| `PAYPAL_CLIENT_ID` | Client ID din §2.3 sau §2.4 |
| `PAYPAL_CLIENT_SECRET` | Secret din §2.3 sau §2.4 |
| `PAYPAL_ENV` | `sandbox` sau `live` |
| `PAYPAL_WEBHOOK_ID` | Webhook ID din §2.6 |

> Numele **nu** pot începe cu `SUPABASE_` — prefixul e rezervat de Supabase.

### 3.1 Varianta Dashboard (fără CLI)

1. Deschide <https://supabase.com/dashboard/project/vmxkimcdtluoghcaxqht/functions/secrets>.
2. În cardul **Add new secrets**, scrie **Key** = `PAYPAL_CLIENT_ID`,
   **Value** = valoarea copiată.
3. **Add another** pentru fiecare dintre cele patru.
4. **Save**.
5. Funcțiile citesc secretele imediat — nu e nevoie de redeploy.

### 3.2 Varianta CLI (recomandată, reproductibilă)

```bash
# o singură dată, în rădăcina repo-ului
supabase login
supabase link --project-ref vmxkimcdtluoghcaxqht

# pornește de la template-ul comis în repo
cp supabase/functions/.env.example supabase/functions/.env
# apoi completează cele patru valori în supabase/functions/.env

# urcă toate secretele în proiectul remote
supabase secrets set --env-file supabase/functions/.env

# verifică (arată numele, nu valorile)
supabase secrets list
```

Sau individual:

```bash
supabase secrets set PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... PAYPAL_ENV=sandbox
```

### 3.3 Local (doar dacă rulezi funcțiile cu `supabase start`)

Funcțiile locale citesc `supabase/functions/.env` (fișierul de mai sus). Dacă
pornești doar o funcție:

```bash
supabase functions serve paypal-create-order --env-file supabase/functions/.env
```

Template-ul comis în repo este
[`supabase/functions/.env.example`](../supabase/functions/.env.example) — copiază-l
în `supabase/functions/.env` și completează valorile. Fișierul `.env` propriu-zis
e gitignorat (`.gitignore` → `.env`), deci nu ajunge niciodată în Git.

### 3.4 Verifică fără să expui valorile

O funcție de test care întoarce doar un boolean:

```ts
Deno.serve(() => Response.json({
  clientId: Boolean(Deno.env.get('PAYPAL_CLIENT_ID')),
  secret: Boolean(Deno.env.get('PAYPAL_CLIENT_SECRET')),
  env: Deno.env.get('PAYPAL_ENV') ?? null
}))
```

Dacă toate sunt `true`, secretele au ajuns în runtime.

---

## 4. Ce să **nu** faci

- ❌ Nu pune `PAYPAL_CLIENT_SECRET` în `.env` la rădăcină — acela e citit de
  build-ul Nuxt și **se coace în bundle-ul public**.
- ❌ Nu adăuga secrete în `nuxt.config.ts` → `runtimeConfig.public`.
- ❌ Nu comite `supabase/functions/.env` (e deja acoperit de regula `.env.*`
  din `.gitignore`, dar verifică).
- ❌ Nu te baza pe pagina de retur (`?token=…`) ca să creditezi — folosește
  webhook-ul.
- ❌ Nu porni în Live înainte ca fluxul Sandbox să treacă integral.

---

## 5. Decizii de luat înainte de implementare

- [ ] **Modelul de preț.** Acum există două, contradictorii:
      - `AddCreditsDialog.vue`: 100 credite = `$9.99`, 500 = `$39.99`
      - `public/data/prices.json` → tier `prepaid_credit`: `$35–60` **per limbă**
      Alege unul. Recomandare: pachetele din dialog (un pool, fără limbă).
- [ ] **Ce înseamnă 1 credit** în bani (ex. 1 credit = $0.10).
- [ ] **Rambursări**: creditele se retrag la refund sau rămân?
- [ ] **Expirare**: pool-ul expiră? (recomandare: nu)
- [ ] **TVA / facturare**: PayPal poate colecta taxe; altfel le calculezi tu.

---

## 6. Prompt pentru faza următoare

Când ai terminat §2 și §3, lipește asta în chat:

```text
PayPal e configurat. Începe faza de plăți, în SANDBOX.

Secrete deja setate în Supabase (Edge Function secrets):
PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV=sandbox, PAYPAL_WEBHOOK_ID.
Proiect Supabase: vmxkimcdtluoghcaxqht.

Ce vreau:
1. Edge Functions: paypal-create-order, paypal-capture-order, paypal-webhook.
   - create-order: validează pachetul pe server (nu acceptă suma din client),
     creează order PayPal, întoarce approval link.
   - capture-order: capturează, verifică suma și valuta, scrie creditul.
   - webhook: verifică semnătura cu PAYPAL_WEBHOOK_ID, idempotent pe capture id.
2. Migrare SQL: tabel `payments` (order_id, capture_id, user_id, amount,
   currency, credits, status, created_at) + `credit_ledger.locale` devine
   nullable (sau sentinel '*') pentru top-up în pool.
3. Închide găurile de securitate: `credit_ledger` și `enrollments` devin
   read-only pentru client (scriere doar din Edge Function cu service role).
   Pool-ul de credite se mută pe server; `localStorage` rămâne doar cache.
4. Client: AddCreditsDialog redirect la PayPal, apoi re-citește soldul din
   server. Fără `store.addCredits()` local.
5. Testează în sandbox cu contul Personal de test și confirmă că webhook-ul
   creditează o singură dată la retry.

Nu face commit, push sau deploy. Doar build local + verificare.
```

---

## 7. Checklist final

- [ ] Cont PayPal Business activ
- [ ] Aplicație Sandbox creată → Client ID + Secret salvate
- [ ] Cont Personal de test găsit (e-mail + parolă)
- [ ] Webhook creat → Webhook ID salvat
- [ ] Cele 4 secrete setate în Supabase (`supabase secrets list` le arată)
- [ ] Funcție de test întoarce `true` pentru toate
- [ ] Decizii din §5 luate
- [ ] Prompt din §6 trimis
- [ ] (La final) Aplicație Live creată → secretele Live înlocuite → un test de $1 real
